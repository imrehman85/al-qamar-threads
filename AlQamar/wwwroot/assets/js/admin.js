/* Al Qamar Threads — admin dashboard. Signs in and reads/writes through the ASP.NET backend (/api/admin). */
(function () {
  "use strict";

  var A = window.AQT, money = A.money;
  var STATUSES = ["Awaiting payment", "Processing", "Shipped", "Completed", "Refunded", "Cancelled"];
  var TITLES = { overview: "Overview", orders: "Orders", products: "Products", subscribers: "Subscribers", settings: "Settings" };
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
  function counts(o) { return ["Awaiting payment", "Refunded", "Cancelled"].indexOf(o.status) === -1; }
  function shapeProduct(p) {
    return { slug: p.slug, collection: p.collection, colour: p.colour, sizes: p.sizes, img: p.img, url: "product-" + p.slug + ".html",
      name: p.name, prices: p.prices.map(Number), hidden: !!p.hidden, soldOut: !!p.sold_out };
  }

  // ======================= Data (backend API) =======================
  var DB = {
    signIn: function (user, pass) { return A.api("admin/login", { method: "POST", body: { username: user, password: pass } }); },
    session: function () { return A.api("admin/me").then(function () { return true; }, function () { return false; }); },
    signOut: function () { return A.api("admin/logout", { method: "POST", body: {} }); },
    orders: function () { return A.api("admin/orders"); },
    updateOrder: function (no, status) { return A.api("admin/orders/" + encodeURIComponent(no), { method: "PATCH", body: { status: status } }); },
    deleteOrder: function (no) { return A.api("admin/orders/" + encodeURIComponent(no), { method: "DELETE" }); },
    products: function () { return A.api("admin/products").then(function (rows) { return rows.map(shapeProduct); }); },
    saveProduct: function (slug, v) {
      return A.api("admin/products/" + encodeURIComponent(slug), { method: "PUT", body: { name: v.name, prices: v.prices, hidden: v.hidden, soldOut: v.soldOut } });
    },
    subscribers: function () { return A.api("admin/subscribers"); },
    deleteSubscriber: function (id) { return A.api("admin/subscribers/" + id, { method: "DELETE" }); },
    changePassword: function (current, next) { return A.api("admin/password", { method: "POST", body: { current: current, next: next } }); }
  };

  // ======================= Auth =======================
  var loginEl = document.getElementById("login"), appEl = document.getElementById("app");
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
      var open = r[0].filter(function (o) { return o.status === "Awaiting payment" || o.status === "Processing"; }).length;
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
        return '<tr class="clickable" data-order="' + esc(o.no) + '" tabindex="0"><td>' + esc(o.no) + "" + '</td>' +
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
      '<dt>Payment</dt><dd>Bank transfer</dd></dl>' +
      '<div class="line-items">' + o.items.map(function (l) {
        return '<div><span>' + esc(l.name) + '<br><small style="color:var(--muted)">' + esc(l.size) + ' × ' + l.qty + '</small></span><span>' + money(l.price * l.qty) + '</span></div>';
      }).join("") +
      '<div><span>Delivery</span><span>' + (o.totals.ship ? money(o.totals.ship) : "Free") + '</span></div>' +
      '<div class="total"><span>Total</span><span>' + money(o.totals.total) + '</span></div></div>' +
      '<div class="field"><label for="d-status">Status</label><select id="d-status">' +
      STATUSES.map(function (s) { return '<option' + (s === o.status ? " selected" : "") + '>' + s + '</option>'; }).join("") + '</select></div>' +
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
        "Changes go live in the shop straight away." + '</p><div class="products">' +
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
            '<div class="btns">' + '<button class="btn btn--sm" type="submit">Save</button></div></div></div></form>';
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
          return '<tr><td>' + esc(s.email) + "" + '</td><td>' + fmtDate(s.date) + '</td><td>' + esc(s.source || "Website") +
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
      '<section class="card"><h2>Payments</h2><p class="hint">Customers pay by bank transfer after ordering.</p><dl class="kv">' +
      '<dt>Method</dt><dd>Bank transfer</dd><dt>New orders</dt><dd>Start as “Awaiting payment”. Set them to Processing once the money arrives.</dd></dl></section>' +
      '<section class="card"><h2>Admin password</h2><p class="hint">Change the default password before sharing the site.</p>' +
      '<form id="pw-form"><div class="field"><label for="pw-cur">Current password</label><input id="pw-cur" type="password" autocomplete="current-password" required></div>' +
      '<div class="field"><label for="pw-new">New password (8+ characters)</label><input id="pw-new" type="password" autocomplete="new-password" minlength="8" required></div>' +
      '<button class="btn" type="submit">Change password</button></form></section>' +
      '</div>';
    document.getElementById("pw-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = this;
      DB.changePassword(f.querySelector("#pw-cur").value, f.querySelector("#pw-new").value)
        .then(function () { f.reset(); toast("Password changed"); }, fail);
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
