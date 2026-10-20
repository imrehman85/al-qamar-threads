/* Al Qamar Threads — mock-up behaviour: nav, cart, gallery, forms. Needs catalog.js. */
(function () {
  "use strict";

  var A = window.AQT, money = A.money;
  var CART = "aqt-cart";

  function getCart() { return A.get(CART, []); }
  function setCart(c) { A.set(CART, c); updateCount(); }
  function cartTotals(cart) {
    var sub = cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    var ship = sub === 0 || sub >= A.FREE_OVER ? 0 : A.SHIPPING;
    return { sub: sub, ship: ship, total: sub + ship };
  }
  function updateCount() {
    var n = getCart().reduce(function (s, i) { return s + i.qty; }, 0);
    document.querySelectorAll("[data-cart-count]").forEach(function (el) { el.textContent = n ? "(" + n + ")" : ""; });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function thumb(id, alt) { return '<div class="pic ratio-45"><img src="' + A.imgUrl(id, 240) + '" alt="' + esc(alt || "") + '" loading="lazy"></div>'; }

  // Header
  var header = document.querySelector(".site-header");
  window.addEventListener("scroll", function () { header && header.classList.toggle("scrolled", window.scrollY > 8); }, { passive: true });
  var toggle = document.querySelector(".menu-toggle");
  if (toggle) toggle.addEventListener("click", function () {
    var open = document.body.classList.toggle("nav-open");
    toggle.setAttribute("aria-expanded", open);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { document.body.classList.remove("nav-open"); toggle && toggle.setAttribute("aria-expanded", "false"); closeLightbox(); }
  });

  // Reveal on scroll
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  // Email sign-up — stored so it shows in the admin
  document.querySelectorAll(".signup-form").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = f.parentNode.querySelector(".form-msg");
      var email = (f.email.value || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (msg) msg.textContent = "Please enter a valid email address."; return; }
      var subs = A.get("aqt-subscribers", []);
      if (!subs.some(function (s) { return s.email.toLowerCase() === email.toLowerCase(); })) {
        subs.unshift({ email: email, date: new Date().toISOString(), source: f.getAttribute("data-source") || "Website" });
        A.set("aqt-subscribers", subs);
      }
      if (msg) msg.textContent = "Thank you. We’ll be in touch, quietly.";
      f.reset();
    });
  });

  // Shop — apply admin edits, then filter
  document.querySelectorAll(".product-card[data-slug]").forEach(function (card) {
    var p = A.bySlug(card.getAttribute("data-slug"));
    if (!p) return;
    card.querySelector("h3").textContent = p.name;
    card.querySelector(".price").textContent = p.soldOut ? fromSold(p) : A.fromPrice(p);
    if (p.hidden) card.setAttribute("data-hidden", "");
    card.hidden = p.hidden;
  });
  function fromSold(p) { return A.fromPrice(p) + " · Sold out"; }
  var filters = document.querySelectorAll(".filters button");
  filters.forEach(function (b) {
    b.addEventListener("click", function () {
      var f = b.getAttribute("data-filter");
      filters.forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      document.querySelectorAll(".product-card").forEach(function (c) {
        c.hidden = c.hasAttribute("data-hidden") || (f !== "all" && c.getAttribute("data-collection") !== f);
      });
    });
  });

  // Product page
  var pp = document.querySelector("[data-product]");
  if (pp) {
    var id = pp.getAttribute("data-product"), product = A.bySlug(id), sizeIdx = product.sizes.length > 1 ? 1 : 0;
    var priceEl = document.querySelector("[data-price]"), sizeName = document.querySelector("[data-size-name]");
    var addBtn = document.querySelector("[data-add]");
    document.querySelector(".product-info h1").textContent = product.name;
    if (product.hidden) {
      document.querySelector(".product-info .product-desc").insertAdjacentHTML("afterend", '<p class="sum-note">This piece is not currently available.</p>');
    }
    if (product.soldOut || product.hidden) { addBtn.disabled = true; addBtn.textContent = product.hidden ? "Unavailable" : "Sold out"; }
    function showPrice() {
      priceEl.textContent = money(product.prices[sizeIdx]);
      if (sizeName) sizeName.textContent = product.sizes[sizeIdx];
    }
    document.querySelectorAll(".size-btn").forEach(function (b, i) {
      b.addEventListener("click", function () {
        sizeIdx = i;
        document.querySelectorAll(".size-btn").forEach(function (x, j) { x.setAttribute("aria-checked", j === i); });
        showPrice();
      });
    });
    showPrice();

    var qtyInput = document.querySelector(".qty input");
    document.querySelectorAll("[data-qty]").forEach(function (b) {
      b.addEventListener("click", function () {
        qtyInput.value = Math.max(1, Math.min(10, (parseInt(qtyInput.value, 10) || 1) + parseInt(b.getAttribute("data-qty"), 10)));
      });
    });

    addBtn.addEventListener("click", function () {
      if (addBtn.disabled) return;
      var qty = Math.max(1, Math.min(10, parseInt(qtyInput.value, 10) || 1));
      var size = product.sizes[sizeIdx], price = product.prices[sizeIdx];
      var cart = getCart();
      var line = cart.filter(function (l) { return l.id === id && l.size === size; })[0];
      if (line) { line.qty = Math.min(10, line.qty + qty); line.price = price; }
      else cart.push({ id: id, name: product.name, colour: product.colour, size: size, price: price, qty: qty, img: product.img, url: product.url });
      setCart(cart);
      document.querySelector(".added-msg").innerHTML = "Added to your bag. <a class=\"text-link\" href=\"cart.html\">View bag</a>";
    });

    // Gallery
    var mainImg = document.querySelector(".gallery-main img");
    document.querySelectorAll(".gallery-thumbs button").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".gallery-thumbs button").forEach(function (x) { x.setAttribute("aria-current", x === b); });
        var src = b.getAttribute("data-photo");
        mainImg.src = A.imgUrl(src, 1200);
        mainImg.srcset = A.imgUrl(src, 700) + " 700w, " + A.imgUrl(src, 1200) + " 1200w, " + A.imgUrl(src, 1800) + " 1800w";
        mainImg.alt = b.querySelector("img").alt;
        mainImg.setAttribute("data-photo", src);
      });
    });
  }

  // Lightbox (zoom)
  var lb = document.querySelector(".lightbox");
  function closeLightbox() { if (lb) lb.classList.remove("open"); }
  var gm = document.querySelector(".gallery-main");
  if (gm && lb) {
    function openLb() {
      var src = gm.querySelector("img");
      var big = lb.querySelector("img");
      big.src = A.imgUrl(src.getAttribute("data-photo"), 2000);
      big.alt = src.alt;
      lb.classList.add("open");
      lb.querySelector(".lightbox-close").focus();
    }
    gm.addEventListener("click", openLb);
    gm.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLb(); } });
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target.classList.contains("lightbox-close")) closeLightbox(); });
  }

  // Cart page
  var cartRoot = document.querySelector("[data-cart]");
  function renderCart() {
    var cart = getCart();
    if (!cart.length) {
      cartRoot.innerHTML = '<div class="empty"><p class="lede" style="margin:0 auto 32px">Your bag is empty.</p><a class="btn" href="shop.html">Shop the collection</a></div>';
      return;
    }
    var t = cartTotals(cart);
    var left = Math.max(0, A.FREE_OVER - t.sub);
    var items = cart.map(function (l, i) {
      return '<div class="cart-item">' +
        '<a href="' + esc(l.url) + '" aria-hidden="true" tabindex="-1">' + thumb(l.img, "") + '</a>' +
        '<div><h3><a href="' + esc(l.url) + '">' + esc(l.name) + '</a></h3>' +
        '<p class="meta">' + esc(l.colour) + ' · ' + esc(l.size) + ' · ' + money(l.price) + '</p>' +
        '<div class="qty" role="group" aria-label="Quantity for ' + esc(l.name) + '"><button type="button" data-line="' + i + '" data-d="-1" aria-label="Decrease">−</button>' +
        '<input type="text" value="' + l.qty + '" readonly aria-label="Quantity"><button type="button" data-line="' + i + '" data-d="1" aria-label="Increase">+</button></div>' +
        '<button type="button" class="remove" data-remove="' + i + '">Remove</button></div>' +
        '<div class="line-total">' + money(l.price * l.qty) + '</div></div>';
    }).join("");
    cartRoot.innerHTML =
      '<div class="cart-layout"><div class="cart-items">' + items + '</div>' +
      '<aside class="summary" aria-label="Order summary"><h2>Summary</h2>' +
      '<div class="free-bar">' + (left > 0 ? "You are " + money(left) + " away from free UK delivery." : "Your order qualifies for free UK delivery.") +
      '<div class="track"><div class="fill" style="width:' + Math.min(100, t.sub / A.FREE_OVER * 100) + '%"></div></div></div>' +
      '<div class="sum-row"><span>Subtotal</span><span>' + money(t.sub) + '</span></div>' +
      '<div class="sum-row"><span>Delivery <small>(Royal Mail Tracked 48)</small></span><span>' + (t.ship ? money(t.ship) : "Free") + '</span></div>' +
      '<div class="sum-row total"><span>Total</span><span>' + money(t.total) + '</span></div>' +
      '<p class="sum-note">No VAT is charged. We are not VAT-registered.</p>' +
      '<a class="btn btn--block" href="checkout.html">Checkout</a>' +
      '<p class="legal-links">30-day returns and your 14-day right to cancel. <a href="shipping-returns.html">Shipping &amp; Returns</a></p></aside></div>';
  }
  if (cartRoot) {
    renderCart();
    cartRoot.addEventListener("click", function (e) {
      var cart = getCart(), b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-remove")) cart.splice(+b.getAttribute("data-remove"), 1);
      else if (b.hasAttribute("data-line")) {
        var l = cart[+b.getAttribute("data-line")];
        l.qty = Math.max(1, Math.min(10, l.qty + +b.getAttribute("data-d")));
      } else return;
      setCart(cart); renderCart();
    });
  }

  // Checkout summary — product name only
  var co = document.querySelector("[data-checkout-summary]");
  if (co) {
    var cart = getCart(), t = cartTotals(cart);
    if (!cart.length) {
      co.innerHTML = '<p class="sum-note">Your bag is empty. <a class="text-link" href="shop.html">Shop the collection</a></p>';
    } else {
      co.innerHTML = cart.map(function (l) {
        return '<div class="mini-item"><span>' + esc(l.name) + (l.qty > 1 ? " × " + l.qty : "") + '</span><span>' + money(l.price * l.qty) + '</span></div>';
      }).join("") +
        '<div class="sum-row" style="border-top:1px solid var(--line);margin-top:12px;padding-top:18px"><span>Subtotal</span><span>' + money(t.sub) + '</span></div>' +
        '<div class="sum-row"><span>Delivery</span><span>' + (t.ship ? money(t.ship) : "Free") + '</span></div>' +
        '<div class="sum-row total"><span>Total</span><span>' + money(t.total) + '</span></div>';
    }
    var form = document.querySelector(".checkout-form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var items = getCart();
      if (!items.length) { window.location.href = "shop.html"; return; }
      var order = {
        no: "AQT-" + String(Math.floor(10000 + Math.random() * 89999)),
        date: new Date().toISOString(), status: "Processing",
        email: form.email.value, name: (form.fname.value + " " + form.lname.value).trim(), fname: form.fname.value,
        address: [form.address1.value, form.city.value, form.postcode.value].filter(Boolean).join(", "),
        items: items.map(function (l) { return { id: l.id, name: l.name, size: l.size, price: l.price, qty: l.qty }; }),
        totals: cartTotals(items)
      };
      var orders = A.get("aqt-orders", []);
      orders.unshift(order);
      A.set("aqt-orders", orders);
      try { sessionStorage.setItem("aqt-order", JSON.stringify(order)); } catch (err) {}
      setCart([]);
      window.location.href = "order-confirmation.html";
    });
    document.querySelectorAll(".pay-btn").forEach(function (b) {
      b.addEventListener("click", function () { form.requestSubmit ? form.requestSubmit() : form.submit(); });
    });
  }

  // Confirmation
  var conf = document.querySelector("[data-confirmation]");
  if (conf) {
    var o = null;
    try { o = JSON.parse(sessionStorage.getItem("aqt-order") || "null"); } catch (e) {}
    if (o) {
      conf.innerHTML =
        '<p class="eyebrow">Order ' + esc(o.no) + '</p>' +
        '<h1>Thank you, ' + esc(o.fname || o.name || "") + '.</h1>' +
        '<p class="lede">Your order is confirmed. A receipt is on its way to ' + esc(o.email) + '.</p>' +
        '<div class="summary" style="text-align:left;margin:48px 0">' +
        o.items.map(function (l) { return '<div class="mini-item"><span>' + esc(l.name) + (l.qty > 1 ? " × " + l.qty : "") + '</span><span>' + money(l.price * l.qty) + '</span></div>'; }).join("") +
        '<div class="sum-row"><span>Delivery</span><span>' + (o.totals.ship ? money(o.totals.ship) : "Free") + '</span></div>' +
        '<div class="sum-row total"><span>Total paid</span><span>' + money(o.totals.total) + '</span></div>' +
        (o.address ? '<p class="sum-note" style="margin-bottom:0">Delivering to ' + esc(o.address) + '</p>' : "") + '</div>';
    }
  }

  updateCount();
})();
