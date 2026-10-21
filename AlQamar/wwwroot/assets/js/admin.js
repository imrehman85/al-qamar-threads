/* Al Qamar Threads — admin dashboard. Signs in and reads/writes through the ASP.NET backend (/api/admin). */
(function () {
  "use strict";

  var A = window.AQT, money = A.money;
  var STATUSES = ["Awaiting payment", "Processing", "Shipped", "Completed", "Refunded", "Cancelled"];
  var TITLES = { overview: "Overview", orders: "Orders", products: "Products", subscribers: "Subscribers",
    reviews: "Reviews", discounts: "Discount codes", reports: "Reports", settings: "Settings" };
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
      name: p.name, prices: p.prices.map(Number), hidden: !!p.hidden, soldOut: !!p.soldOut,
      manualSoldOut: !!p.manualSoldOut, stock: p.stock || p.sizes.map(function () { return null; }) };
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
      return A.api("admin/products/" + encodeURIComponent(slug), { method: "PUT", body: { name: v.name, prices: v.prices, hidden: v.hidden, soldOut: v.soldOut, stock: v.stock } });
    },
    subscribers: function () { return A.api("admin/subscribers"); },
    deleteSubscriber: function (id) { return A.api("admin/subscribers/" + id, { method: "DELETE" }); },
    changePassword: function (current, next) { return A.api("admin/password", { method: "POST", body: { current: current, next: next } }); },
    setTracking: function (no, status, tracking) { return A.api("admin/orders/" + encodeURIComponent(no), { method: "PATCH", body: { status: status, tracking: tracking } }); },
    discounts: function () { return A.api("admin/discounts"); },
    saveDiscount: function (d) { return A.api("admin/discounts", { method: "POST", body: d }); },
    deleteDiscount: function (code) { return A.api("admin/discounts/" + encodeURIComponent(code), { method: "DELETE" }); },
    reviews: function () { return A.api("admin/reviews"); },
    approveReview: function (id, ok) { return A.api("admin/reviews/" + id, { method: "PATCH", body: { approved: ok } }); },
    deleteReview: function (id) { return A.api("admin/reviews/" + id, { method: "DELETE" }); }
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
    var render = { overview: renderOverview, orders: renderOrders, products: renderProducts, subscribers: renderSubscribers,
      reviews: renderReviews, discounts: renderDiscounts, reports: renderReports, settings: renderSettings }[name];
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
    DB.reviews().then(function (rv) {
      var waiting = rv.filter(function (x) { return !x.approved; }).length;
      setCount("reviews", waiting ? waiting + " new" : "");
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

      var low = [];
      cat.forEach(function (p) {
        (p.stock || []).forEach(function (n, i) { if (n != null && n <= 3) low.push({ p: p, size: p.sizes[i], n: n }); });
      });
      view.innerHTML =
        (low.length ? '<section class="card low-stock"><h2>Low stock</h2><p class="hint">Sizes with 3 or fewer left.</p><ul>' +
          low.map(function (x) { return '<li><span>' + esc(x.p.name) + ' \u00b7 ' + esc(x.size) + '</span><strong>' + (x.n === 0 ? "Sold out" : x.n + " left") + '</strong></li>'; }).join("") +
          '</ul><button class="btn btn--ghost btn--sm" type="button" data-goto-products>Update stock</button></section>' : "") +
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
      var gp = view.querySelector("[data-goto-products]");
      if (gp) gp.addEventListener("click", function () { go("products"); });
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
      '<dt>Payment</dt><dd>Bank transfer</dd>' +
      (o.giftWrap ? '<dt>Gift</dt><dd>Gift wrap' + (o.giftMessage ? '<br><em>\u201c' + esc(o.giftMessage) + '\u201d</em>' : "") + '</dd>' : "") + '</dl>' +
      '<div class="line-items">' + o.items.map(function (l) {
        return '<div><span>' + esc(l.name) + '<br><small style="color:var(--muted)">' + esc(l.size) + ' × ' + l.qty + '</small></span><span>' + money(l.price * l.qty) + '</span></div>';
      }).join("") +
      (o.totals.discount ? '<div><span>Discount' + (o.discountCode ? " (" + esc(o.discountCode) + ")" : "") + '</span><span>\u2212' + money(o.totals.discount) + '</span></div>' : "") +
      '<div><span>Delivery</span><span>' + (o.totals.ship ? money(o.totals.ship) : "Free") + '</span></div>' +
      '<div class="total"><span>Total</span><span>' + money(o.totals.total) + '</span></div></div>' +
      '<div class="field"><label for="d-status">Status</label><select id="d-status">' +
      STATUSES.map(function (s) { return '<option' + (s === o.status ? " selected" : "") + '>' + s + '</option>'; }).join("") + '</select></div>' +
      '<div class="field"><label for="d-track">Royal Mail tracking number</label><input id="d-track" maxlength="60" value="' + esc(o.tracking || "") + '" placeholder="e.g. AB123456789GB"></div>' +
      '<p class="hint" style="margin:-8px 0 18px;font-size:13px;color:var(--muted)">Customers see the status and tracking on the Track order page. Cancelling puts the items back in stock.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px"><button class="btn" type="button" id="d-save">Save</button>' +
      '<button class="btn btn--ghost" type="button" id="d-slip">Packing slip</button>' +
      '<button class="btn btn--ghost" type="button" id="d-inv">Invoice</button></div>' +
      '<button class="btn btn--danger btn--sm" type="button" id="d-del">Delete order</button>';
    document.body.appendChild(bg); document.body.appendChild(dr);
    var close = function () { bg.remove(); dr.remove(); document.removeEventListener("keydown", onKey); };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    bg.addEventListener("click", close);
    dr.querySelector(".close").addEventListener("click", close);
    dr.querySelector(".close").focus();
    dr.querySelector("#d-save").addEventListener("click", function () {
      var st = dr.querySelector("#d-status").value;
      DB.setTracking(o.no, st, dr.querySelector("#d-track").value).then(function () { close(); toast("Order " + o.no + " saved"); refresh(); }, fail);
    });
    dr.querySelector("#d-slip").addEventListener("click", function () { printDoc(o, false); });
    dr.querySelector("#d-inv").addEventListener("click", function () { printDoc(o, true); });
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
            '<p class="stock-head">Stock <span>(leave blank to not track)</span></p>' +
            '<div class="price-grid">' + p.sizes.map(function (s, i) {
              var n = p.stock ? p.stock[i] : null;
              return '<div class="field"><label for="s-' + p.slug + '-' + i + '">' + esc(s) + (n === 0 ? ' <b class="out">sold out</b>' : n != null && n <= 3 ? ' <b class="out">low</b>' : "") + '</label>' +
                '<input id="s-' + p.slug + '-' + i + '" name="stock" type="number" min="0" step="1" inputmode="numeric" value="' + (n == null ? "" : n) + '" placeholder="Not tracked"></div>';
            }).join("") + '</div>' +
            '<div class="prod-foot">' +
            '<label class="switch"><input type="checkbox" name="visible"' + (p.hidden ? "" : " checked") + '> Visible in shop</label>' +
            '<label class="switch"><input type="checkbox" name="soldOut"' + (p.manualSoldOut ? " checked" : "") + '> Mark sold out</label>' +
            '<div class="btns">' + '<button class="btn btn--sm" type="submit">Save</button></div></div></div></form>';
        }).join("") + '</div>';

      view.querySelectorAll("form.prod").forEach(function (f) {
        var slug = f.getAttribute("data-slug");
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var prices = [].map.call(f.querySelectorAll('[name="price"]'), function (i) { return Math.round(parseFloat(i.value) * 100) / 100; });
          var name = f.elements.namedItem("name").value.trim();
          if (prices.some(function (n) { return !(n > 0); }) || !name) { toast("Please check the name and prices"); return; }
          var stock = [].map.call(f.querySelectorAll('[name="stock"]'), function (i) { return i.value === "" ? null : Math.max(0, parseInt(i.value, 10) || 0); });
          DB.saveProduct(slug, { name: name, prices: prices, hidden: !f.elements.namedItem("visible").checked, soldOut: f.elements.namedItem("soldOut").checked, stock: stock })
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

  // ======================= Reviews =======================
  function renderReviews() {
    return Promise.all([DB.reviews(), DB.products()]).then(function (r) {
      var list = r[0], names = {};
      r[1].forEach(function (p) { names[p.slug] = p.name; });
      var stars = function (n) { var s = ""; for (var i = 1; i <= 5; i++) s += i <= n ? "\u2605" : "\u2606"; return s; };
      view.innerHTML = '<p style="color:var(--muted);margin:0 0 18px">New reviews wait here until you approve them. Only approved reviews show in the shop.</p>' +
        (list.length ? '<div class="products">' + list.map(function (v) {
          return '<article class="card review-card' + (v.approved ? "" : " pending") + '"><div class="review-top"><div><span class="stars">' + stars(v.rating) + '</span> <strong>' + esc(v.name) + '</strong>' +
            (v.verified ? ' <span class="tag Completed">Verified buyer</span>' : "") + (v.approved ? ' <span class="tag Shipped">Live</span>' : ' <span class="tag Awaiting">Waiting</span>') +
            '<div class="meta">' + esc(names[v.slug] || v.slug) + ' \u00b7 ' + fmtDate(v.date) + '</div></div>' +
            '<div class="btns">' + (v.approved ? '<button class="btn btn--ghost btn--sm" data-hide="' + v.id + '">Hide</button>' : '<button class="btn btn--sm" data-approve="' + v.id + '">Approve</button>') +
            '<button class="btn btn--danger btn--sm" data-delrev="' + v.id + '">Delete</button></div></div><p>' + esc(v.text) + '</p></article>';
        }).join("") + '</div>' : '<div class="card"><p class="hint" style="margin:0">No reviews yet.</p></div>');
      view.querySelectorAll("[data-approve],[data-hide]").forEach(function (b) {
        b.addEventListener("click", function () {
          var ok = b.hasAttribute("data-approve");
          DB.approveReview(+(b.getAttribute("data-approve") || b.getAttribute("data-hide")), ok).then(function () { toast(ok ? "Review is live" : "Review hidden"); refresh(); }, fail);
        });
      });
      view.querySelectorAll("[data-delrev]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!confirm("Delete this review?")) return;
          DB.deleteReview(+b.getAttribute("data-delrev")).then(function () { toast("Review deleted"); refresh(); }, fail);
        });
      });
    });
  }

  // ======================= Discount codes =======================
  function describe(d) {
    var what = d.kind === "percent" ? (+d.value) + "% off" : d.kind === "amount" ? money(d.value) + " off" : "Free delivery";
    return what + (d.minSubtotal > 0 ? " on bags over " + money(d.minSubtotal) : "");
  }
  function renderDiscounts() {
    return DB.discounts().then(function (list) {
      view.innerHTML =
        '<section class="card" style="margin-bottom:16px"><h2>New code</h2><p class="hint">Customers type it at checkout. Codes are not case-sensitive.</p>' +
        '<form id="dc-form" class="dc-form">' +
        '<div class="field"><label for="dc-code">Code</label><input id="dc-code" required maxlength="40" placeholder="WELCOME10" style="text-transform:uppercase"></div>' +
        '<div class="field"><label for="dc-kind">Type</label><select id="dc-kind"><option value="percent">% off</option><option value="amount">\u00a3 off</option><option value="freeship">Free delivery</option></select></div>' +
        '<div class="field" id="dc-value-wrap"><label for="dc-value">Amount</label><input id="dc-value" type="number" min="0" step="0.01" value="10"></div>' +
        '<div class="field"><label for="dc-min">Minimum bag (\u00a3)</label><input id="dc-min" type="number" min="0" step="0.01" value="0"></div>' +
        '<div class="field"><label for="dc-max">Max uses (blank = no limit)</label><input id="dc-max" type="number" min="1" step="1"></div>' +
        '<div class="field dc-btn"><button class="btn" type="submit">Create code</button></div></form></section>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>Code</th><th>Gives</th><th>Used</th><th>Status</th><th class="num"><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
        (list.length ? list.map(function (d) {
          return '<tr><td><strong>' + esc(d.code) + '</strong></td><td>' + esc(describe(d)) + '</td><td>' + d.usedCount + (d.maxUses ? " / " + d.maxUses : "") + '</td>' +
            '<td><span class="tag ' + (d.active ? "Completed" : "Cancelled") + '">' + (d.active ? "Active" : "Paused") + '</span></td>' +
            '<td class="num"><button class="btn btn--ghost btn--sm" data-toggle="' + esc(d.code) + '">' + (d.active ? "Pause" : "Resume") + '</button> ' +
            '<button class="btn btn--danger btn--sm" data-deldc="' + esc(d.code) + '">Delete</button></td></tr>';
        }).join("") : '<tr><td colspan="5" class="empty-row">No codes yet.</td></tr>') + '</tbody></table></div>';

      var kind = document.getElementById("dc-kind"), valWrap = document.getElementById("dc-value-wrap");
      kind.addEventListener("change", function () { valWrap.hidden = kind.value === "freeship"; });
      document.getElementById("dc-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var max = document.getElementById("dc-max").value;
        DB.saveDiscount({
          code: document.getElementById("dc-code").value, kind: kind.value,
          value: parseFloat(document.getElementById("dc-value").value) || 0,
          minSubtotal: parseFloat(document.getElementById("dc-min").value) || 0,
          maxUses: max === "" ? null : parseInt(max, 10), active: true
        }).then(function (d) { toast("Code " + d.code + " created"); refresh(); }, fail);
      });
      view.querySelectorAll("[data-toggle]").forEach(function (b) {
        b.addEventListener("click", function () {
          var d = list.filter(function (x) { return x.code === b.getAttribute("data-toggle"); })[0];
          DB.saveDiscount({ code: d.code, kind: d.kind, value: d.value, minSubtotal: d.minSubtotal, maxUses: d.maxUses, active: !d.active })
            .then(function () { toast(d.active ? "Code paused" : "Code active"); refresh(); }, fail);
        });
      });
      view.querySelectorAll("[data-deldc]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!confirm("Delete code " + b.getAttribute("data-deldc") + "?")) return;
          DB.deleteDiscount(b.getAttribute("data-deldc")).then(function () { toast("Code deleted"); refresh(); }, fail);
        });
      });
    });
  }

  // ======================= Reports =======================
  function renderReports() {
    return Promise.all([DB.orders(), DB.products()]).then(function (r) {
      var paid = r[0].filter(counts), months = {}, byProduct = {};
      paid.forEach(function (o) {
        var d = new Date(o.date), key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        var m = months[key] || (months[key] = { orders: 0, units: 0, sales: 0, discount: 0, delivery: 0 });
        m.orders++; m.sales += o.totals.total; m.discount += o.totals.discount || 0; m.delivery += o.totals.ship;
        o.items.forEach(function (l) {
          m.units += l.qty;
          var p = byProduct[l.name + " \u00b7 " + l.size] || (byProduct[l.name + " \u00b7 " + l.size] = { units: 0, sales: 0 });
          p.units += l.qty; p.sales += l.price * l.qty;
        });
      });
      var keys = Object.keys(months).sort().reverse();
      var label = function (k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }); };
      var prods = Object.keys(byProduct).sort(function (a, b) { return byProduct[b].sales - byProduct[a].sales; });
      view.innerHTML =
        '<p style="color:var(--muted);margin:0 0 18px">Paid orders only (not awaiting payment, refunded or cancelled).</p>' +
        '<section class="card" style="margin-bottom:16px"><div class="report-head"><h2>By month</h2><button class="btn btn--ghost btn--sm" id="rp-csv"' + (keys.length ? "" : " disabled") + '>Export CSV</button></div>' +
        '<div class="table-wrap" style="border:0"><table class="data"><thead><tr><th>Month</th><th class="num">Orders</th><th class="num">Units</th><th class="num">Discounts</th><th class="num">Delivery</th><th class="num">Takings</th></tr></thead><tbody>' +
        (keys.length ? keys.map(function (k) {
          var m = months[k];
          return '<tr><td>' + label(k) + '</td><td class="num">' + m.orders + '</td><td class="num">' + m.units + '</td><td class="num">' + money(m.discount) + '</td><td class="num">' + money(m.delivery) + '</td><td class="num"><strong>' + money(m.sales) + '</strong></td></tr>';
        }).join("") : '<tr><td colspan="6" class="empty-row">No paid orders yet.</td></tr>') + '</tbody></table></div></section>' +
        '<section class="card"><h2>By product</h2><p class="hint">All time</p><div class="table-wrap" style="border:0"><table class="data"><thead><tr><th>Product</th><th class="num">Units</th><th class="num">Sales</th></tr></thead><tbody>' +
        (prods.length ? prods.map(function (k) { return '<tr><td>' + esc(k) + '</td><td class="num">' + byProduct[k].units + '</td><td class="num">' + money(byProduct[k].sales) + '</td></tr>'; }).join("")
          : '<tr><td colspan="3" class="empty-row">No sales yet.</td></tr>') + '</tbody></table></div></section>';
      var b = document.getElementById("rp-csv");
      if (b) b.addEventListener("click", function () {
        csv("monthly-sales.csv", [["Month", "Orders", "Units", "Discounts", "Delivery", "Takings"]].concat(keys.map(function (k) {
          var m = months[k]; return [label(k), m.orders, m.units, m.discount.toFixed(2), m.delivery.toFixed(2), m.sales.toFixed(2)];
        })));
      });
    });
  }

  // ======================= Packing slip / invoice =======================
  function printDoc(o, invoice) {
    var gift = o.giftWrap, showPrices = invoice || !gift;
    var rows = o.items.map(function (l) {
      return '<tr><td>' + esc(l.name) + '<br><small>' + esc(l.size) + '</small></td><td class="r">' + l.qty + '</td>' +
        (showPrices ? '<td class="r">' + money(l.price) + '</td><td class="r">' + money(l.price * l.qty) + '</td>' : "") + '</tr>';
    }).join("");
    var totals = showPrices ? '<tr><td colspan="3" class="r">Subtotal</td><td class="r">' + money(o.totals.sub) + '</td></tr>' +
      (o.totals.discount ? '<tr><td colspan="3" class="r">Discount' + (o.discountCode ? " (" + esc(o.discountCode) + ")" : "") + '</td><td class="r">\u2212' + money(o.totals.discount) + '</td></tr>' : "") +
      '<tr><td colspan="3" class="r">Delivery</td><td class="r">' + (o.totals.ship ? money(o.totals.ship) : "Free") + '</td></tr>' +
      '<tr class="t"><td colspan="3" class="r">Total</td><td class="r">' + money(o.totals.total) + '</td></tr>' : "";
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + (invoice ? "Invoice " : "Packing slip ") + esc(o.no) + '</title><style>' +
      'body{font-family:Georgia,serif;color:#3F3A35;margin:40px;font-size:14px}h1{font-weight:400;font-size:28px;margin:0 0 4px}' +
      '.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #ccc;padding-bottom:18px;margin-bottom:24px}' +
      'table{width:100%;border-collapse:collapse;margin-top:18px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #e5e0d8;vertical-align:top}' +
      '.r{text-align:right}.t td{font-weight:bold;border-top:2px solid #3F3A35}small{color:#6E665E}.gift{border:1px dashed #8A6A45;padding:14px;margin-top:24px}' +
      '.foot{margin-top:40px;font-size:12px;color:#6E665E}@media print{button{display:none}}</style></head><body>' +
      '<button onclick="print()" style="float:right">Print</button>' +
      '<div class="top"><div><h1>AL QAMAR THREADS</h1><div>' + (invoice ? "Invoice" : "Packing slip") + '</div></div>' +
      '<div class="r"><strong>' + esc(o.no) + '</strong><br>' + fmtDate(o.date) + '</div></div>' +
      '<p><strong>Deliver to</strong><br>' + esc(o.name) + '<br>' + esc(o.address).replace(/, /g, "<br>") + '</p>' +
      (invoice ? '<p><strong>Billed to</strong><br>' + esc(o.name) + '<br>' + esc(o.email) + '</p>' : "") +
      '<table><thead><tr><th>Item</th><th class="r">Qty</th>' + (showPrices ? '<th class="r">Price</th><th class="r">Amount</th>' : "") + '</tr></thead><tbody>' + rows + totals + '</tbody></table>' +
      (gift ? '<div class="gift"><strong>Gift wrap</strong>' + (o.giftMessage ? '<p>' + esc(o.giftMessage) + '</p>' : "") + '</div>' : "") +
      (invoice ? '<p style="margin-top:18px">Payment: bank transfer. No VAT charged: Al Qamar Threads Ltd is not VAT-registered.</p>' : "") +
      '<div class="foot">Al Qamar Threads Ltd \u00b7 hello@alqamarthreads.com \u00b7 30-day returns, plus your 14-day right to cancel.</div></body></html>';
    var w = window.open("", "_blank");
    if (!w) { toast("Allow pop-ups to print"); return; }
    w.document.write(html); w.document.close();
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
