/* Al Qamar Threads — admin dashboard.
   Live mode: Supabase sign-in (email + password, must be listed in the admins table) and the shared database.
   Demo mode: login from admin-config.js, data kept in this browser. */
(function () {
  "use strict";

  var A = window.AQT, money = A.money;
  var STATUSES = ["Processing", "Shipped", "Completed", "Refunded", "Cancelled"];
  var TITLES = { overview: "Overview", orders: "Orders", products: "Products", subscribers: "Subscribers", settings: "Settings" };
  var SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  var view = document.getElementById("view");

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtDate(iso, withTime) {
    var opts = { day: "numeric", month: "short", year: "numeric" };
    if (withTime) { opts.hour = "2-digit"; opts.minute = "2-digit"; }
    return new Date(iso).toLocaleDateString("en-GB", opts);
  }
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function fail(err) { console.error(err); toast(err && err.message ? err.message : "Something went wrong"); }
  function counts(o) { return o.status !== "Refunded" && o.status !== "Cancelled"; }
  function shapeProduct(p) {
    return { slug: p.slug, collection: p.collection, colour: p.colour, sizes: p.sizes, img: p.img, url: "product-" + p.slug + ".html",
      name: p.name, prices: p.prices.map(Number), hidden: !!p.hidden, soldOut: !!p.sold_out };
  }

  // ======================= Data: demo (this browser) =======================
  var demoDB = {
    live: false,
    signIn: function (user, pass) {
      var cfg = window.AQT_ADMIN || {};
      if (user === cfg.username && pass === cfg.password) {
        try { sessionStorage.setItem("aqt-admin-session", "1"); } catch (e) {}
        return Promise.resolve();
      }
      return Promise.reject(new Error("That username and password don’t match."));
    },
    session: function () { try { return Promise.resolve(sessionStorage.getItem("aqt-admin-session") === "1"); } catch (e) { return Promise.resolve(false); } },
    signOut: function () { try { sessionStorage.removeItem("aqt-admin-session"); } catch (e) {} return Promise.resolve(); },
    orders: function () { seed(); return Promise.resolve(A.get("aqt-orders", [])); },
    updateOrder: function (no, status) {
      var all = A.get("aqt-orders", []);
      all.forEach(function (o) { if (o.no === no) o.status = status; });
      A.set("aqt-orders", all); return Promise.resolve();
    },
    deleteOrder: function (no) { A.set("aqt-orders", A.get("aqt-orders", []).filter(function (o) { return o.no !== no; })); return Promise.resolve(); },
    products: function () { return Promise.resolve(A.demoCatalog()); },
    edited: function (slug) { return !!A.get("aqt-products", {})[slug]; },
    saveProduct: function (slug, v) { var all = A.get("aqt-products", {}); all[slug] = v; A.set("aqt-products", all); return Promise.resolve(); },
    resetProduct: function (slug) { var all = A.get("aqt-products", {}); delete all[slug]; A.set("aqt-products", all); return Promise.resolve(); },
    subscribers: function () {
      seed();
      return Promise.resolve(A.get("aqt-subscribers", []).map(function (s, i) { return { id: i, email: s.email, date: s.date, source: s.source, demo: s.demo }; }));
    },
    deleteSubscriber: function (id) { var l = A.get("aqt-subscribers", []); l.splice(id, 1); A.set("aqt-subscribers", l); return Promise.resolve(); }
  };

  // Sample orders and sign-ups, seeded once and marked as demo.
  function seed() {
    if (A.get("aqt-seeded", false)) return;
    var cat = A.demoCatalog(), rnd = mulberry(7);
    var names = ["Amelia Hart", "Oliver Bennett", "Sophie Clarke", "James Whitaker", "Isla Morgan", "Harry Fletcher",
      "Grace Holloway", "Thomas Reid", "Emily Shaw", "Jack Turner", "Lucy Ward", "George Ellis", "Freya Bell", "Henry Cole"];
    var towns = ["London", "Manchester", "Bristol", "Leeds", "Edinburgh", "York", "Bath", "Brighton", "Oxford", "Cardiff"];
    var list = [], now = Date.now();
    for (var i = 0; i < 22; i++) {
      var daysAgo = Math.floor(rnd() * 28), n = names[Math.floor(rnd() * names.length)];
      var items = [], lines = 1 + Math.floor(rnd() * 2);
      for (var j = 0; j < lines; j++) {
        var p = cat[Math.floor(rnd() * cat.length)], si = Math.floor(rnd() * p.sizes.length);
        items.push({ id: p.slug, name: p.name, size: p.sizes[si], price: p.prices[si], qty: 1 + Math.floor(rnd() * 2) });
      }
      var sub = items.reduce(function (s, l) { return s + l.price * l.qty; }, 0);
      var ship = sub >= A.FREE_OVER ? 0 : A.SHIPPING;
      var status = daysAgo > 6 ? (rnd() < 0.9 ? "Completed" : "Refunded") : daysAgo > 2 ? "Shipped" : "Processing";
      list.push({
        no: "AQT-" + (10240 + i), demo: true,
        date: new Date(now - daysAgo * 864e5 - Math.floor(rnd() * 864e5 * 0.6)).toISOString(),
        status: status, name: n, email: n.toLowerCase().replace(" ", ".") + "@example.com",
        address: (10 + Math.floor(rnd() * 90)) + " High Street, " + towns[Math.floor(rnd() * towns.length)],
        items: items, totals: { sub: sub, ship: ship, total: sub + ship }
      });
    }
    list.sort(function (a, b) { return b.date < a.date ? -1 : 1; });
    A.set("aqt-orders", A.get("aqt-orders", []).concat(list));
    var subs = A.get("aqt-subscribers", []);
    ["hello.amelia@example.com", "o.bennett@example.com", "sophie.c@example.com", "isla.m@example.com", "freya.bell@example.com"].forEach(function (e, k) {
      subs.push({ email: e, date: new Date(now - (k * 4 + 1) * 864e5).toISOString(), source: k % 2 ? "Footer" : "Home page", demo: true });
    });
    A.set("aqt-subscribers", subs);
    A.set("aqt-seeded", true);
  }
  function mulberry(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ======================= Data: live (Supabase) =======================
  function liveDB() {
    var sb = null;
    function client() {
      if (sb) return Promise.resolve(sb);
      return new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = SUPABASE_JS;
        s.onload = function () { sb = window.supabase.createClient(A.CONFIG.supabaseUrl, A.CONFIG.supabaseAnonKey); resolve(sb); };
        s.onerror = function () { reject(new Error("Could not load the sign-in service.")); };
        document.head.appendChild(s);
      });
    }
    function q(build) {
      return client().then(build).then(function (r) { if (r.error) throw new Error(r.error.message); return r.data; });
    }
    function isAdmin() { return q(function (c) { return c.rpc("is_admin"); }); }
    return {
      live: true,
      signIn: function (email, pass) {
        return q(function (c) { return c.auth.signInWithPassword({ email: email, password: pass }); })
          .catch(function () { throw new Error("That email and password don’t match."); })
          .then(isAdmin).then(function (ok) {
            if (!ok) return client().then(function (c) { return c.auth.signOut(); }).then(function () { throw new Error("This account is not an admin."); });
          });
      },
      session: function () {
        return client().then(function (c) { return c.auth.getSession(); }).then(function (r) {
          return r.data && r.data.session ? isAdmin().catch(function () { return false; }) : false;
        });
      },
      signOut: function () { return client().then(function (c) { return c.auth.signOut(); }); },
      orders: function () {
        return q(function (c) { return c.from("orders").select("*").order("created_at", { ascending: false }).limit(1000); }).then(function (rows) {
          return rows.map(function (o) {
            return { no: o.no, date: o.created_at, status: o.status, name: o.name, email: o.email, address: o.address, items: o.items || [],
              totals: { sub: Number(o.subtotal), ship: Number(o.shipping), total: Number(o.total) }, payment: o.stripe_payment_intent };
          });
        });
      },
      updateOrder: function (no, status) { return q(function (c) { return c.from("orders").update({ status: status }).eq("no", no); }); },
      deleteOrder: function (no) { return q(function (c) { return c.from("orders").delete().eq("no", no); }); },
      products: function () {
        return q(function (c) { return c.from("products").select("*").order("sort"); }).then(function (rows) { return rows.map(shapeProduct); });
      },
      edited: function () { return false; },
      saveProduct: function (slug, v) {
        return q(function (c) {
          return c.from("products").update({ name: v.name, prices: v.prices, hidden: v.hidden, sold_out: v.soldOut, updated_at: new Date().toISOString() }).eq("slug", slug);
        });
      },
      subscribers: function () {
        return q(function (c) { return c.from("subscribers").select("*").order("created_at", { ascending: false }).limit(5000); }).then(function (rows) {
          return rows.map(function (s) { return { id: s.id, email: s.email, date: s.created_at, source: s.source }; });
        });
      },
      deleteSubscriber: function (id) { return q(function (c) { return c.from("subscribers").delete().eq("id", id); }); }
    };
  }

  var DB = A.LIVE ? liveDB() : demoDB;

  // ======================= Auth =======================
  var loginEl = document.getElementById("login"), appEl = document.getElementById("app");
  if (DB.live) {
    document.querySelector('label[for="user"]').textContent = "Email";
    document.getElementById("user").type = "email";
    document.getElementById("user").autocomplete = "email";
    document.querySelector(".demo-note").textContent = "Sign in with your admin account. Orders and products are shared with the live shop.";
    document.querySelector(".side-foot").textContent = "Connected to the live shop";
  }
  function showApp() {
    loginEl.hidden = true; appEl.hidden = false;
    go((location.hash || "#overview").slice(1));
  }
  function showLogin() { appEl.hidden = true; loginEl.hidden = false; document.getElementById("user").focus(); }

  document.getElementById("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = this, err = document.getElementById("login-error"), btn = f.querySelector("button");
    btn.disabled = true; err.textContent = "";
    DB.signIn(f.user.value.trim(), f.pass.value).then(function () { f.reset(); showApp(); }, function (x) {
      err.textContent = x.message; f.pass.value = ""; f.pass.focus();
    }).then(function () { btn.disabled = false; });
  });
  document.getElementById("logout").addEventListener("click", function () {
    DB.signOut().then(function () { history.replaceState(null, "", location.pathname); showLogin(); });
  });

  // ======================= Router =======================
  var current = null;
  document.querySelectorAll(".side-nav button").forEach(function (b) {
    b.addEventListener("click", function () { go(b.getAttribute("data-view")); });
  });
  window.addEventListener("hashchange", function () { if (!appEl.hidden) go(location.hash.slice(1)); });

  function go(name) {
    if (!TITLES[name]) name = "overview";
    current = name;
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    document.querySelectorAll(".side-nav button").forEach(function (b) {
      if (b.getAttribute("data-view") === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    document.getElementById("view-title").textContent = TITLES[name];
    document.title = TITLES[name] + " | Admin | Al Qamar Threads";
    view.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    var render = { overview: renderOverview, orders: renderOrders, products: renderProducts, subscribers: renderSubscribers, settings: renderSettings }[name];
    Promise.resolve(render()).catch(function (err) {
      view.innerHTML = '<div class="card"><h2>Couldn’t load this page</h2><p class="hint">' + esc(err.message) + '</p></div>';
    });
    updateCounts();
  }
  function refresh() { go(current); }
  function updateCounts() {
    Promise.all([DB.orders(), DB.products(), DB.subscribers()]).then(function (r) {
      var open = r[0].filter(function (o) { return o.status === "Processing"; }).length;
      setCount("orders", open ? open + " new" : "");
      setCount("products", r[1].length);
      setCount("subscribers", r[2].length);
    }).catch(function () {});
  }
  function setCount(k, v) { var el = document.querySelector('[data-count="' + k + '"]'); if (el) el.textContent = v; }

  // ======================= Overview =======================
  function renderOverview() {
    return Promise.all([DB.orders(), DB.products(), DB.subscribers()]).then(function (r) {
      var all = r[0], cat = r[1], subs = r[2], since = Date.now() - 30 * 864e5;
      var recent = all.filter(function (o) { return counts(o) && new Date(o.date) >= since; });
      var revenue = recent.reduce(function (s, o) { return s + o.totals.total; }, 0);
      var processing = all.filter(function (o) { return o.status === "Processing"; }).length;
      var newSubs = subs.filter(function (s) { return new Date(s.date) >= since; }).length;
      var units = {};
      all.filter(counts).forEach(function (o) { o.items.forEach(function (l) { units[l.id] = (units[l.id] || 0) + l.qty; }); });
      var top = cat.map(function (p) { return { p: p, n: units[p.slug] || 0 }; }).sort(function (a, b) { return b.n - a.n; });

      view.innerHTML =
        '<div class="kpis">' +
        kpi("Revenue", money(revenue), "Last 30 days, paid orders") +
        kpi("Orders", recent.length, "Last 30 days") +
        kpi("Average order", recent.length ? money(revenue / recent.length) : "—", "Last 30 days") +
        kpi("Subscribers", subs.length, newSubs + " new in 30 days") +
        '</div>' +
        '<div class="grid-2">' +
        '<section class="card"><h2>Revenue, last 14 days</h2><p class="hint">Paid orders by day. Hover a bar for the figure.</p><div class="chart-wrap" id="chart"></div></section>' +
        '<section class="card"><h2>Best sellers</h2><p class="hint">Units sold, all time</p><ol class="rank">' +
        top.map(function (t) {
          return '<li><img src="' + A.imgUrl(t.p.img, 120) + '" alt=""><div>' + esc(t.p.name) + '<div class="meta">' + esc(t.p.colour) + (t.p.hidden ? " · hidden" : "") + (t.p.soldOut ? " · sold out" : "") + '</div></div><div>' + t.n + '</div></li>';
        }).join("") + '</ol></section>' +
        '</div>' +
        '<section class="card"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><div><h2>Recent orders</h2><p class="hint">' +
        (processing ? processing + " waiting to be packed" : "Nothing waiting to be packed") + '</p></div>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-goto="orders">All orders</button></div>' +
        '<div class="table-wrap" style="border:0">' + ordersTable(all.slice(0, 6), true) + '</div></section>';

      drawChart(document.getElementById("chart"), all);
      view.querySelector("[data-goto]").addEventListener("click", function () { go("orders"); });
      bindOrderRows(all);
    });
  }
  function kpi(label, value, note) {
    return '<div class="card kpi"><div class="label">' + label + '</div><div class="value">' + value + '</div><div class="note">' + note + '</div></div>';
  }

  // Single-series bar chart: one hue, recessive grid, hover tooltip.
  function drawChart(host, all) {
    var days = [], today = new Date(); today.setHours(0, 0, 0, 0);
    for (var i = 13; i >= 0; i--) { var d = new Date(today - i * 864e5); days.push({ d: d, v: 0, n: 0 }); }
    all.filter(counts).forEach(function (o) {
      var od = new Date(o.date); od.setHours(0, 0, 0, 0);
      var idx = Math.round((od - days[0].d) / 864e5);
      if (idx >= 0 && idx < 14) { days[idx].v += o.totals.total; days[idx].n++; }
    });
    var W = 640, H = 240, padL = 44, padB = 26, padT = 10, plotW = W - padL, plotH = H - padB - padT;
    var max = Math.max.apply(null, days.map(function (x) { return x.v; }));
    var step = max <= 50 ? 10 : max <= 150 ? 25 : max <= 300 ? 50 : max <= 1000 ? 100 : 500;
    var top = Math.max(step, Math.ceil(max / step) * step);
    var slot = plotW / days.length, bw = Math.min(28, slot - 6);
    var y = function (v) { return padT + plotH - (v / top) * plotH; };
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Revenue by day for the last 14 days"><g class="grid axis">';
    for (var t = 0; t <= top; t += step) {
      svg += '<line x1="' + padL + '" x2="' + W + '" y1="' + y(t) + '" y2="' + y(t) + '"></line><text x="' + (padL - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end">£' + t + '</text>';
    }
    svg += '</g><g class="axis">';
    days.forEach(function (x, i) {
      if (i % 2 === 1) svg += '<text x="' + (padL + slot * i + slot / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + x.d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + '</text>';
    });
    svg += '</g>';
    days.forEach(function (x, i) {
      var cx = padL + slot * i + slot / 2, h = Math.max(0, plotH - (y(x.v) - padT)), yy = y(x.v), r = Math.min(4, h);
      var path = h > 0 ? 'M' + (cx - bw / 2) + ',' + (padT + plotH) + 'V' + (yy + r) + 'Q' + (cx - bw / 2) + ',' + yy + ' ' + (cx - bw / 2 + r) + ',' + yy +
        'H' + (cx + bw / 2 - r) + 'Q' + (cx + bw / 2) + ',' + yy + ' ' + (cx + bw / 2) + ',' + (yy + r) + 'V' + (padT + plotH) + 'Z' : "";
      svg += '<g class="col" data-i="' + i + '"><rect class="hit" x="' + (padL + slot * i) + '" y="' + padT + '" width="' + slot + '" height="' + plotH + '"></rect>' +
        (path ? '<path class="bar" d="' + path + '"></path>' : "") + '</g>';
    });
    svg += '</svg><div class="tooltip" role="presentation"></div>';
    host.innerHTML = svg;

    var tip = host.querySelector(".tooltip"), svgEl = host.querySelector("svg");
    host.querySelectorAll("g.col").forEach(function (g) {
      g.addEventListener("mouseenter", function () {
        var i = +g.getAttribute("data-i"), x = days[i];
        var box = svgEl.getBoundingClientRect(), sx = box.width / W, sy = box.height / H;
        tip.innerHTML = '<b>' + money(x.v) + '</b>' + x.d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + ' · ' + x.n + (x.n === 1 ? " order" : " orders");
        tip.style.left = ((padL + slot * i + slot / 2) * sx) + "px";
        tip.style.top = (y(x.v) * sy) + "px";
        tip.classList.add("show");
      });
      g.addEventListener("mouseleave", function () { tip.classList.remove("show"); });
    });
  }

  // ======================= Orders =======================
  var orderFilter = { q: "", status: "" }, orderCache = [];
  function renderOrders() {
    return DB.orders().then(function (all) {
      orderCache = all;
      view.innerHTML =
        '<div class="toolbar">' +
        '<label class="sr-only" for="o-q">Search orders</label><input id="o-q" type="search" placeholder="Search order, name or email" value="' + esc(orderFilter.q) + '">' +
        '<label class="sr-only" for="o-s">Status</label><select id="o-s"><option value="">All statuses</option>' +
        STATUSES.map(function (s) { return '<option' + (orderFilter.status === s ? " selected" : "") + '>' + s + '</option>'; }).join("") + '</select>' +
        '<span class="spacer"></span><button class="btn btn--ghost btn--sm" type="button" id="o-export">Export CSV</button></div>' +
        '<div class="table-wrap" id="o-table"></div>';
      var q = document.getElementById("o-q"), s = document.getElementById("o-s");
      q.addEventListener("input", function () { orderFilter.q = q.value; drawOrders(); });
      s.addEventListener("change", function () { orderFilter.status = s.value; drawOrders(); });
      document.getElementById("o-export").addEventListener("click", function () {
        csv("orders.csv", [["Order", "Date", "Customer", "Email", "Address", "Status", "Items", "Total"]].concat(filteredOrders().map(function (o) {
          return [o.no, fmtDate(o.date), o.name, o.email, o.address, o.status, o.items.map(function (l) { return l.name + " (" + l.size + ") x" + l.qty; }).join("; "), o.totals.total.toFixed(2)];
        })));
      });
      drawOrders();
    });
  }
  function filteredOrders() {
    var q = orderFilter.q.trim().toLowerCase();
    return orderCache.filter(function (o) {
      return (!orderFilter.status || o.status === orderFilter.status) &&
        (!q || (o.no + " " + o.name + " " + o.email).toLowerCase().indexOf(q) > -1);
    });
  }
  function drawOrders() {
    document.getElementById("o-table").innerHTML = ordersTable(filteredOrders(), false);
    bindOrderRows(orderCache);
  }
  function ordersTable(list, compact) {
    if (!list.length) return '<table class="data"><tbody><tr><td class="empty-row">No orders yet.</td></tr></tbody></table>';
    return '<table class="data"><thead><tr><th>Order</th><th>Date</th><th>Customer</th>' + (compact ? "" : "<th>Items</th>") +
      '<th>Status</th><th class="num">Total</th></tr></thead><tbody>' +
      list.map(function (o) {
        var n = o.items.reduce(function (s, l) { return s + l.qty; }, 0);
        return '<tr class="clickable" data-order="' + esc(o.no) + '" tabindex="0"><td>' + esc(o.no) + (o.demo ? '<span class="demo-badge">demo</span>' : "") + '</td>' +
          '<td>' + fmtDate(o.date) + '</td><td>' + esc(o.name) + '</td>' + (compact ? "" : '<td>' + n + (n === 1 ? " item" : " items") + '</td>') +
          '<td><span class="tag ' + esc(o.status) + '">' + esc(o.status) + '</span></td><td class="num">' + money(o.totals.total) + '</td></tr>';
      }).join("") + '</tbody></table>';
  }
  function bindOrderRows(all) {
    view.querySelectorAll("tr[data-order]").forEach(function (tr) {
      var open = function () { openOrder(all.filter(function (x) { return x.no === tr.getAttribute("data-order"); })[0]); };
      tr.addEventListener("click", open);
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter") open(); });
    });
  }
  function openOrder(o) {
    if (!o) return;
    var bg = document.createElement("div"), dr = document.createElement("aside");
    bg.className = "drawer-bg"; dr.className = "drawer";
    dr.setAttribute("role", "dialog"); dr.setAttribute("aria-modal", "true"); dr.setAttribute("aria-label", "Order " + o.no);
    dr.innerHTML =
      '<div class="drawer-head"><div><p style="margin:0 0 4px;color:var(--muted);font-size:13px">' + fmtDate(o.date, true) + '</p><h2>' + esc(o.no) + '</h2></div>' +
      '<button class="close" type="button" aria-label="Close">&times;</button></div>' +
      '<dl class="dl"><dt>Customer</dt><dd>' + esc(o.name) + '</dd><dt>Email</dt><dd><a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a></dd>' +
      '<dt>Deliver to</dt><dd>' + esc(o.address || "—") + '</dd><dt>Delivery</dt><dd>Royal Mail Tracked 48</dd>' +
      (o.payment ? '<dt>Payment</dt><dd><a href="https://dashboard.stripe.com/payments/' + esc(o.payment) + '" target="_blank" rel="noopener">View in Stripe</a></dd>' : "") + '</dl>' +
      '<div class="line-items">' + o.items.map(function (l) {
        return '<div><span>' + esc(l.name) + '<br><small style="color:var(--muted)">' + esc(l.size) + ' × ' + l.qty + '</small></span><span>' + money(l.price * l.qty) + '</span></div>';
      }).join("") +
      '<div><span>Delivery</span><span>' + (o.totals.ship ? money(o.totals.ship) : "Free") + '</span></div>' +
      '<div class="total"><span>Total</span><span>' + money(o.totals.total) + '</span></div></div>' +
      '<div class="field"><label for="d-status">Status</label><select id="d-status">' +
      STATUSES.map(function (s) { return '<option' + (s === o.status ? " selected" : "") + '>' + s + '</option>'; }).join("") + '</select></div>' +
      (DB.live ? '<p style="font-size:13px;color:var(--muted);margin:-6px 0 18px">Marking an order Refunded here does not refund the card. Refund it in Stripe first.</p>' : "") +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="button" id="d-save">Update status</button>' +
      '<button class="btn btn--danger" type="button" id="d-del">Delete order</button></div>';
    document.body.appendChild(bg); document.body.appendChild(dr);
    var close = function () { bg.remove(); dr.remove(); document.removeEventListener("keydown", onKey); };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    bg.addEventListener("click", close);
    dr.querySelector(".close").addEventListener("click", close);
    dr.querySelector(".close").focus();
    dr.querySelector("#d-save").addEventListener("click", function () {
      var st = dr.querySelector("#d-status").value;
      DB.updateOrder(o.no, st).then(function () { close(); toast("Order " + o.no + " marked " + st.toLowerCase()); refresh(); }, fail);
    });
    dr.querySelector("#d-del").addEventListener("click", function () {
      if (!confirm("Delete order " + o.no + "? This can’t be undone.")) return;
      DB.deleteOrder(o.no).then(function () { close(); toast("Order deleted"); refresh(); }, fail);
    });
  }

  // ======================= Products =======================
  function renderProducts() {
    return DB.products().then(function (cat) {
      view.innerHTML = '<p style="color:var(--muted);margin:0 0 18px">' +
        (DB.live ? "Changes go live in the shop straight away." : "Changes show on the shop straight away in this browser.") + '</p><div class="products">' +
        cat.map(function (p) {
          return '<form class="card prod" data-slug="' + p.slug + '">' +
            '<img src="' + A.imgUrl(p.img, 260) + '" alt="">' +
            '<div><div class="prod-head"><div><h2>' + esc(p.name) + '</h2><span class="slug">' + esc(p.colour) + ' · ' + p.slug + '</span></div>' +
            '<a class="btn btn--ghost btn--sm" href="' + p.url + '" target="_blank" rel="noopener">View</a></div>' +
            '<div class="field"><label for="n-' + p.slug + '">Product name</label><input id="n-' + p.slug + '" name="name" value="' + esc(p.name) + '" required></div>' +
            '<div class="price-grid">' + p.sizes.map(function (s, i) {
              return '<div class="field"><label for="p-' + p.slug + '-' + i + '">' + esc(s) + '</label><div class="money-input"><span>£</span>' +
                '<input id="p-' + p.slug + '-' + i + '" name="price" type="number" min="0" step="0.01" inputmode="decimal" value="' + p.prices[i] + '" required></div></div>';
            }).join("") + '</div>' +
            '<div class="prod-foot">' +
            '<label class="switch"><input type="checkbox" name="visible"' + (p.hidden ? "" : " checked") + '> Visible in shop</label>' +
            '<label class="switch"><input type="checkbox" name="soldOut"' + (p.soldOut ? " checked" : "") + '> Sold out</label>' +
            '<div class="btns">' + (DB.edited(p.slug) ? '<button class="btn btn--ghost btn--sm" type="button" data-reset>Reset</button>' : "") +
            '<button class="btn btn--sm" type="submit">Save</button></div></div></div></form>';
        }).join("") + '</div>';

      view.querySelectorAll("form.prod").forEach(function (f) {
        var slug = f.getAttribute("data-slug");
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var prices = [].map.call(f.querySelectorAll('[name="price"]'), function (i) { return Math.round(parseFloat(i.value) * 100) / 100; });
          var name = f.elements.namedItem("name").value.trim();
          if (prices.some(function (n) { return !(n > 0); }) || !name) { toast("Please check the name and prices"); return; }
          DB.saveProduct(slug, { name: name, prices: prices, hidden: !f.elements.namedItem("visible").checked, soldOut: f.elements.namedItem("soldOut").checked })
            .then(function () { toast("Saved " + name); renderProducts(); }, fail);
        });
        var r = f.querySelector("[data-reset]");
        if (r) r.addEventListener("click", function () { DB.resetProduct(slug).then(function () { toast("Product reset"); renderProducts(); }); });
      });
    });
  }

  // ======================= Subscribers =======================
  function renderSubscribers() {
    return DB.subscribers().then(function (subs) {
      view.innerHTML =
        '<div class="toolbar"><p style="margin:0;color:var(--muted)">' + subs.length + (subs.length === 1 ? " person" : " people") + ' signed up for emails.</p><span class="spacer"></span>' +
        '<button class="btn btn--ghost btn--sm" type="button" id="s-export"' + (subs.length ? "" : " disabled") + '>Export CSV</button></div>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>Email</th><th>Signed up</th><th>Where</th><th class="num"><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
        (subs.length ? subs.map(function (s) {
          return '<tr><td>' + esc(s.email) + (s.demo ? '<span class="demo-badge">demo</span>' : "") + '</td><td>' + fmtDate(s.date) + '</td><td>' + esc(s.source || "Website") +
            '</td><td class="num"><button class="btn btn--danger btn--sm" type="button" data-del="' + esc(s.id) + '">Remove</button></td></tr>';
        }).join("") : '<tr><td colspan="4" class="empty-row">No sign-ups yet.</td></tr>') +
        '</tbody></table></div>';
      document.getElementById("s-export").addEventListener("click", function () {
        csv("subscribers.csv", [["Email", "Signed up", "Where"]].concat(subs.map(function (s) { return [s.email, fmtDate(s.date), s.source || "Website"]; })));
      });
      view.querySelectorAll("[data-del]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!confirm("Remove this subscriber?")) return;
          DB.deleteSubscriber(+b.getAttribute("data-del")).then(function () { toast("Subscriber removed"); refresh(); }, fail);
        });
      });
    });
  }

  // ======================= Settings =======================
  function renderSettings() {
    view.innerHTML = '<div class="settings">' +
      '<section class="card"><h2>Store</h2><p class="hint">Business details shown in the footer.</p><dl class="kv">' +
      '<dt>Business</dt><dd>Al Qamar Threads Ltd</dd><dt>Contact email</dt><dd>hello@alqamarthreads.com</dd>' +
      '<dt>Currency</dt><dd>GBP (£)</dd><dt>VAT</dt><dd>Not VAT-registered, tax off</dd><dt>Selling to</dt><dd>United Kingdom only</dd></dl></section>' +
      '<section class="card"><h2>Shipping</h2><p class="hint">Agreed rates. Change them in the code with the team.</p><dl class="kv">' +
      '<dt>Method</dt><dd>Royal Mail Tracked 48</dd><dt>Flat rate</dt><dd>' + money(A.SHIPPING) + '</dd><dt>Free over</dt><dd>' + money(A.FREE_OVER) + '</dd>' +
      '<dt>Returns</dt><dd>30 days, plus 14-day right to cancel</dd></dl></section>' +
      '<section class="card"><h2>Payments</h2><p class="hint">' + (DB.live ? "Card payments, refunds and payouts are managed in Stripe." : "Not connected yet (demo mode).") + '</p><dl class="kv">' +
      '<dt>Provider</dt><dd>Stripe Checkout</dd><dt>Express</dt><dd>Apple Pay, Google Pay</dd>' +
      '<dt>Dashboard</dt><dd><a href="https://dashboard.stripe.com" target="_blank" rel="noopener">dashboard.stripe.com</a></dd></dl></section>' +
      (DB.live
        ? '<section class="card"><h2>Database</h2><p class="hint">Orders, products and sign-ups are stored in Supabase.</p><dl class="kv">' +
          '<dt>Project</dt><dd>' + esc(A.CONFIG.supabaseUrl.replace(/^https?:\/\//, "")) + '</dd>' +
          '<dt>Dashboard</dt><dd><a href="https://supabase.com/dashboard" target="_blank" rel="noopener">supabase.com/dashboard</a></dd>' +
          '<dt>Admins</dt><dd>Add people in Supabase (see SETUP.md)</dd></dl></section>'
        : '<section class="card"><h2>Demo data</h2><p class="hint">Everything here is stored in this browser only.</p>' +
          '<p style="margin:0 0 16px;font-size:14px">Reset brings back the sample orders and sign-ups. Clear removes everything, including product edits.</p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn--ghost" type="button" id="reset-demo">Reset demo data</button>' +
          '<button class="btn btn--danger" type="button" id="clear-all">Clear all data</button></div></section>') +
      '</div>';
    if (DB.live) return;
    document.getElementById("reset-demo").addEventListener("click", function () {
      A.set("aqt-orders", A.get("aqt-orders", []).filter(function (o) { return !o.demo; }));
      A.set("aqt-subscribers", A.get("aqt-subscribers", []).filter(function (s) { return !s.demo; }));
      A.set("aqt-seeded", false); seed(); toast("Demo data reset"); updateCounts();
    });
    document.getElementById("clear-all").addEventListener("click", function () {
      if (!confirm("Clear all orders, sign-ups and product edits from this browser?")) return;
      ["aqt-orders", "aqt-subscribers", "aqt-products", "aqt-cart"].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
      A.set("aqt-seeded", true); toast("All data cleared"); updateCounts();
    });
  }

  function csv(name, rows) {
    // Prefix cells that a spreadsheet would read as a formula.
    var cell = function (c) { c = String(c == null ? "" : c); if (/^[=+\-@]/.test(c)) c = "'" + c; return '"' + c.replace(/"/g, '""') + '"'; };
    var text = rows.map(function (r) { return r.map(cell).join(","); }).join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  DB.session().then(function (ok) { if (ok) showApp(); else showLogin(); }, showLogin);
})();
