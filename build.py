"""Builds the static Al Qamar Threads mock-up. Run: python build.py"""
from pathlib import Path

ROOT = Path(__file__).parent
SITE = "Al Qamar Threads"
TM = "™"

MOON_SVG = ('<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M20.5 4.5a12 12 0 1 0 7 21.2A13 13 0 0 1 20.5 4.5z" '
            'fill="none" stroke="currentColor" stroke-width="1.1"/></svg>')
ICON_USER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4"/><path d="M4 21c1.2-4.2 4.3-6.3 8-6.3s6.8 2.1 8 6.3"/></svg>'
ICON_BAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 13H6L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>'


# Sample photography (Unsplash licence) until Al Qamar's own product photos are ready.
PHOTOS = {
    "hero": "1781344334947-60c704bafd51",        # calm bathroom, freestanding tub
    "moon_stack": "1760722974657-f64bce2f9cc5",  # stack of white towels
    "dune_stack": "1664227431098-1289c13695c1",  # warm folded towels
    "cloud_bed": "1777506549593-c3c5ff0e581e",   # white bed in morning light
    "texture": "1684248655527-46bee8e79029",     # rolled towels, close texture
    "rail": "1583294619228-f44cd1590d39",        # towels on a bathroom shelf
    "marble": "1765745518673-b562b7304a53",      # marble bathroom
    "draped": "1766727923658-ae4d4d837239",      # cream towel draped over a basket
    "weave": "1619263719761-165c773ee5df",       # white towel close-up
    "tub": "1616663717839-2fea42e1a1f6",         # towel on a bathtub
}


def img_url(pid, w):
    return f"https://images.unsplash.com/photo-{pid}?auto=format&fit=crop&w={w}&q=72"


def pic(pid, ratio, alt, sizes="100vw", eager=False, extra=""):
    """A responsive photo in a fixed-ratio frame."""
    srcset = ", ".join(f"{img_url(pid, w)} {w}w" for w in (480, 800, 1200, 1800, 2400))
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    return (f'<div class="pic {ratio} {extra}"><img src="{img_url(pid, 1200)}" srcset="{srcset}" sizes="{sizes}" '
            f'alt="{alt}" {load} decoding="async" data-photo="{pid}"></div>')


def header(active):
    links = [("shop.html", "Shop"), ("our-story.html", "Our Story"), ("contact.html", "Contact")]
    cur = ' aria-current="page"'
    nav = "".join(f'<li><a href="{h}"{cur if active == h else ""}>{t}</a></li>' for h, t in links)
    return f'''<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="header-inner">
    <button class="menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="main-nav"><span></span><span></span></button>
    <a class="logo" href="index.html" aria-label="{SITE} home">{MOON_SVG}<span class="logo-text">AL QAMAR THREADS</span></a>
    <nav class="main-nav" id="main-nav" aria-label="Main"><ul>{nav}</ul></nav>
    <div class="header-tools">
      <a href="account.html" aria-label="My account">{ICON_USER}<span class="tool-label">Account</span></a>
      <a href="cart.html" aria-label="Bag">{ICON_BAG}<span class="tool-label">Bag</span><span class="cart-count" data-cart-count></span></a>
    </div>
  </div>
</header>'''


def signup(id_):
    source = "Footer" if id_.startswith("footer") else "Home page"
    return f'''<form class="signup-form" novalidate data-source="{source}">
      <label class="sr-only" for="{id_}">Email address</label>
      <input id="{id_}" type="email" name="email" placeholder="Your email address" autocomplete="email" required>
      <button type="submit">Sign up</button>
    </form>
    <p class="form-msg" role="status"></p>'''


FOOTER = f'''<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <a class="logo" href="index.html" aria-label="{SITE} home">{MOON_SVG}<span class="logo-text">AL QAMAR THREADS</span></a>
        <p class="footer-tag">Hotel Luxury, Made for Home</p>
      </div>
      <div>
        <h4>Explore</h4>
        <ul><li><a href="shop.html">Shop</a></li><li><a href="our-story.html">Our Story</a></li><li><a href="contact.html">Contact</a></li></ul>
      </div>
      <div>
        <h4>Help</h4>
        <ul><li><a href="shipping-returns.html">Shipping &amp; Returns</a></li><li><a href="terms.html">Terms</a></li><li><a href="privacy.html">Privacy</a></li>
        <li><a href="https://www.instagram.com/" rel="noopener">Instagram</a></li><li><a href="https://www.tiktok.com/" rel="noopener">TikTok</a></li></ul>
      </div>
      <div class="footer-signup">
        <h4>Letters from Al Qamar</h4>
        <p style="color:var(--muted)">New colours and quiet news. Rarely.</p>
        {signup("footer-email")}
      </div>
    </div>
    <div class="footer-legal">
      <p>&copy; 2026 Al Qamar Threads Ltd. Registered in England &amp; Wales, company no. 00000000.<br>Registered office: [Registered address, City, Postcode], United Kingdom.</p>
      <p>Design mock-up &middot; sample photography from <a href="https://unsplash.com" rel="noopener">Unsplash</a>, to be replaced with our own &middot; <a href="admin.html">Admin</a></p>
    </div>
  </div>
</footer>'''


def page(filename, title, desc, body, active=""):
    full = f"{title} | {SITE}" if title != SITE else f"{SITE} | Hotel Luxury, Made for Home"
    html = f'''<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{full}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#F8F6F2">
<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
{header(active)}
<main id="main">
{body}
</main>
{FOOTER}
<script src="assets/js/config.js" defer></script>
<script src="assets/js/catalog.js" defer></script>
<script src="assets/js/main.js" defer></script>
</body>
</html>
'''
    (ROOT / filename).write_text(html, encoding="utf-8")
    print("built", filename)


# ---------- Products ----------
PRODUCTS = [
    dict(slug="moon-bath-towel", col="moon", name=f"Moon{TM} Bath Towel", price="From £14", colour="White", hex="#FBFAF7",
         desc="Dense, soft cotton in clean hotel white. Heavy in the hand, quick to dry.",
         sizes=["Hand towel 50 × 90 cm", "Bath towel 70 × 140 cm", "Bath sheet 90 × 160 cm"], set=None,
         photos=["1527986654082-0b5b3fef2632", "1619263719761-165c773ee5df", "1620000190821-abd8f262b86f", "1760722974657-f64bce2f9cc5"]),
    dict(slug="moon-towel-set", col="moon", name=f"Moon{TM} 3-Piece Towel Set", price="£42", colour="White", hex="#FBFAF7",
         desc="Everything a guest bathroom needs, in hotel white. Folded and ready to give.",
         sizes=["3-piece set"], set=["1 face cloth, 30 × 30 cm", "1 hand towel, 50 × 90 cm", "1 bath towel, 70 × 140 cm"],
         photos=["1760722974657-f64bce2f9cc5", "1787168295699-03aed18d17d4", "1616663717839-2fea42e1a1f6", "1684248655527-46bee8e79029"]),
    dict(slug="dune-bath-towel", col="dune", name=f"Dune{TM} Bath Towel", price="From £14", colour="Apricot", hex="#EFC6A4",
         desc="The same deep pile in a warm apricot. Soft colour for calm rooms.",
         sizes=["Hand towel 50 × 90 cm", "Bath towel 70 × 140 cm", "Bath sheet 90 × 160 cm"], set=None,
         photos=["1664227431098-1289c13695c1", "1625479969471-c0a79753d2d3", "1583294506577-7f1217aca9fb", "1766727923658-ae4d4d837239"]),
    dict(slug="dune-towel-set", col="dune", name=f"Dune{TM} 3-Piece Towel Set", price="£42", colour="Apricot", hex="#EFC6A4",
         desc="Three warm apricot pieces, chosen to sit together. A considered gift.",
         sizes=["3-piece set"], set=["1 face cloth, 30 × 30 cm", "1 hand towel, 50 × 90 cm", "1 bath towel, 70 × 140 cm"],
         photos=["1625479969471-c0a79753d2d3", "1664227431098-1289c13695c1", "1583294506577-7f1217aca9fb", "1603400522537-35e25a14bc1e"]),
]
CARD_SIZES = "(max-width: 560px) 50vw, (max-width: 1320px) 45vw, 600px"
COLL = {"moon": f"Moon{TM}", "dune": f"Dune{TM}"}


def product_card(p):
    c = p["col"]
    return f'''<a class="product-card reveal" href="product-{p["slug"]}.html" data-collection="{c}" data-slug="{p["slug"]}">
        <div style="position:relative">
          {pic(p["photos"][0], "ratio-45", p["name"], CARD_SIZES)}
          <div class="ph-alt">{pic(p["photos"][2], "ratio-45", "", CARD_SIZES)}</div>
        </div>
        <h3>{p["name"]}</h3><p class="price">{p["price"]}</p>
      </a>'''


# ---------- Home ----------
home = f'''<section class="hero">
  {pic(PHOTOS["hero"], "ratio-hero", "A calm, light-filled bathroom with a freestanding bath", eager=True)}
  <div class="hero-content">
    <h1>Hotel luxury, made for home.</h1>
    <a class="btn btn--light" href="shop.html">Shop the collection</a>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="center reveal" style="margin-bottom:clamp(48px,6vw,88px)">
      <span class="eyebrow">The collections</span>
      <h2>Three quiet ideas.</h2>
    </div>
    <div class="collections">
      <a class="collection-card reveal" href="shop.html#moon">
        {pic(PHOTOS["moon_stack"], "ratio-34", "A stack of soft white Moon towels", "(max-width: 800px) 100vw, 33vw")}
        <h3>Moon{TM}</h3><p>Hotel white, deep and soft.</p><span class="link-underline">Discover</span>
      </a>
      <a class="collection-card reveal" href="shop.html#dune">
        {pic(PHOTOS["dune_stack"], "ratio-34", "Warm-toned Dune towels, folded", "(max-width: 800px) 100vw, 33vw")}
        <h3>Dune{TM}</h3><p>A warm apricot, softly sunlit.</p><span class="link-underline">Discover</span>
      </a>
      <div class="collection-card reveal">
        {pic(PHOTOS["cloud_bed"], "ratio-34", "A white bed in soft morning light", "(max-width: 800px) 100vw, 33vw")}
        <h3>Cloud{TM}</h3><p>Bedding, for slow mornings.</p><span class="soon">Coming soon</span>
      </div>
    </div>
  </div>
</section>

<section class="section" style="padding-top:0">
  <div class="wrap split">
    {pic(PHOTOS["texture"], "ratio-45", "Close-up of rolled cotton towels", "(max-width: 800px) 100vw, 50vw")}
    <div class="reveal">
      <span class="eyebrow">Our story</span>
      <h2>Made the way the best hotels do it.</h2>
      <p class="lede">Heavy cotton, careful stitching and nothing you don&rsquo;t need.</p>
      <p style="margin-top:32px"><a class="link-underline" href="our-story.html">Read our story</a></p>
    </div>
  </div>
</section>

<section class="promise">
  <div class="wrap promise-grid">
    <div><h4>Free UK delivery</h4><p>On orders over &pound;50</p></div>
    <div><h4>30-day returns</h4><p>Plus your 14-day right to cancel</p></div>
    <div><h4>Gift ready</h4><p>Folded and wrapped with care</p></div>
  </div>
</section>

<section class="section">
  <div class="wrap">{pic(PHOTOS["rail"], "ratio-169", "Folded towels on a bathroom shelf")}</div>
</section>

<section class="section" style="padding-top:0">
  <div class="narrow center reveal">
    <span class="eyebrow">Stay in touch</span>
    <h2>Letters from Al Qamar.</h2>
    <p class="lede">New colours and quiet news. Rarely.</p>
    {signup("home-email")}
  </div>
</section>'''
page("index.html", SITE, "Hotel-quality bath towels, towel sets and bedding for UK homes. Free UK delivery over £50 and 30-day returns.", home)

# ---------- Shop ----------
shop = f'''<section class="page-intro"><div class="narrow"><h1>The collection</h1><p class="lede">Towels made to hotel standard.</p></div></section>
<section class="section" style="padding-top:0">
  <div class="wrap">
    <div class="filters" role="group" aria-label="Filter by collection">
      <button type="button" data-filter="all" aria-pressed="true">All</button>
      <button type="button" data-filter="moon" aria-pressed="false">Moon{TM}</button>
      <button type="button" data-filter="dune" aria-pressed="false">Dune{TM}</button>
    </div>
    <div class="product-grid">
      {"".join(product_card(p) for p in PRODUCTS)}
    </div>
  </div>
</section>
<script>
  // Pre-select a collection from the URL hash (e.g. shop.html#dune)
  document.addEventListener("DOMContentLoaded", function () {{
    var h = location.hash.slice(1), b = document.querySelector('.filters [data-filter="' + h + '"]');
    if (b) b.click();
  }});
</script>'''
page("shop.html", "Shop", "Shop Moon and Dune bath towels and 3-piece towel sets. Hotel quality, delivered across the UK.", shop, "shop.html")


# ---------- Product pages ----------
def product_page(p):
    c = p["col"]
    alts = [f"{p['name']}, folded", "Close-up of the pile", "In a bathroom", "Detail"]
    shots = list(zip(p["photos"], alts))
    thumbs = "".join(
        f'<button type="button" data-photo="{pid}" aria-label="Show image {i + 1}: {t}" aria-current="{"true" if i == 0 else "false"}">'
        f'<div class="pic ratio-11"><img src="{img_url(pid, 300)}" alt="{t}" loading="lazy"></div></button>'
        for i, (pid, t) in enumerate(shots))
    multi = len(p["sizes"]) > 1
    sizes = "".join(
        f'<button type="button" class="size-btn" role="radio" aria-checked="{"true" if (i == 1 if multi else i == 0) else "false"}">{s}</button>'
        for i, s in enumerate(p["sizes"]))
    set_block = ""
    if p["set"]:
        set_block = ('<details><summary>What is in the set</summary><div class="acc-body"><ul>'
                     + "".join(f"<li>{x}</li>" for x in p["set"]) + "</ul></div></details>")
    size_row = ("<tr><th>Sizes</th><td>Hand towel 50 × 90 cm<br>Bath towel 70 × 140 cm<br>Bath sheet 90 × 160 cm</td></tr>"
                if not p["set"] else "<tr><th>Pieces</th><td>Face cloth, hand towel, bath towel</td></tr>")
    body = f'''<div class="wrap">
  <div class="product" data-product="{p["slug"]}">
    <div class="gallery">
      <div class="gallery-main" tabindex="0" role="button" aria-label="Zoom image">
        <span class="zoom-hint">Click to zoom</span>
        {pic(shots[0][0], "ratio-45", shots[0][1], "(max-width: 900px) 100vw, 58vw", eager=True)}
      </div>
      <div class="gallery-thumbs">{thumbs}</div>
    </div>
    <div class="product-info">
      <p class="breadcrumb"><a href="shop.html">Shop</a> / <a href="shop.html#{c}">{COLL[c]}</a></p>
      <h1>{p["name"]}</h1>
      <p class="product-price" data-price>{p["price"]}</p>
      <p class="product-desc">{p["desc"]}</p>

      <span class="option-label">Colour <span>{p["colour"]}</span></span>
      <div class="swatches" role="radiogroup" aria-label="Colour">
        <button type="button" class="swatch" role="radio" aria-checked="true" aria-label="{p["colour"]}" style="background:{p["hex"]}"></button>
      </div>

      <span class="option-label">Size <span data-size-name></span></span>
      <div class="sizes" role="radiogroup" aria-label="Size">{sizes}</div>

      <div class="qty-row">
        <div class="qty" role="group" aria-label="Quantity">
          <button type="button" data-qty="-1" aria-label="Decrease quantity">&minus;</button>
          <input type="number" value="1" min="1" max="10" aria-label="Quantity">
          <button type="button" data-qty="1" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="btn" data-add>Add to bag</button>
      </div>
      <p class="added-msg" role="status"></p>
      <p class="delivery-note">Free UK delivery over &pound;50. 30-day returns.</p>

      <div class="accordion">
        <details open><summary>Details</summary><div class="acc-body"><table class="spec">
          {size_row}
          <tr><th>Weight</th><td>600 gsm</td></tr>
          <tr><th>Material</th><td>100% cotton, zero-twist pile</td></tr>
          <tr><th>Colour</th><td>{p["colour"]}</td></tr>
        </table></div></details>
        {set_block}
        <details><summary>Care</summary><div class="acc-body"><ul>
          <li>Machine wash at 40&deg;C with similar colours</li><li>Do not bleach</li>
          <li>Tumble dry low</li><li>Do not iron</li><li>No fabric softener, for best absorbency</li>
        </ul><p style="margin:12px 0 0;font-size:14px">Exact wording from the supplier label to follow.</p></div></details>
        <details><summary>Delivery &amp; returns</summary><div class="acc-body">
          <p>UK only. Royal Mail Tracked 48, &pound;3.99, or free over &pound;50.</p>
          <p style="margin:0">30-day returns, plus your 14-day right to cancel. <a class="text-link" href="shipping-returns.html">Full details</a></p>
        </div></details>
      </div>
    </div>
  </div>
</div>

<section class="section">
  <div class="wrap detail-band">
    {pic(PHOTOS["weave"], "ratio-11", "Close-up of the towel weave", "(max-width: 700px) 100vw, 50vw")}
    {pic(PHOTOS["tub"], "ratio-11", "A towel resting on the edge of a bath", "(max-width: 700px) 100vw, 50vw")}
  </div>
  <div class="narrow center reveal" style="margin-top:clamp(64px,8vw,120px)">
    <h2>Soft from the first wash.</h2>
    <p class="lede">Long cotton fibres, woven densely, finished by hand.</p>
  </div>
</section>

<div class="lightbox" role="dialog" aria-modal="true" aria-label="Image zoom">
  <button class="lightbox-close" aria-label="Close zoom">&times;</button>
  <img alt="">
</div>'''
    page(f"product-{p['slug']}.html", p["name"].replace(TM, ""), p["desc"], body, "shop.html")


for p in PRODUCTS:
    product_page(p)

# ---------- Our Story ----------
story = f'''<section class="page-intro"><div class="narrow"><span class="eyebrow">Our story</span><h1>The feeling of a good hotel, kept.</h1></div></section>
<div class="wrap">{pic(PHOTOS["marble"], "ratio-169", "A quiet marble bathroom", eager=True)}</div>
<section class="section">
  <div class="narrow prose reveal">
    <p class="lede" style="max-width:none">We started Al Qamar Threads with one simple thought: the towels in the best hotels shouldn&rsquo;t stay in the hotel.</p>
    <p>[Brand story text, already written, goes here. Two or three short paragraphs. The layout gives each paragraph room to breathe.]</p>
    <p>We choose heavy cotton, weave it densely and finish every edge with care. Then we keep the range small, so each piece is worth keeping.</p>
  </div>
</section>
<section class="section" style="padding-top:0">
  <div class="wrap split split--reverse">
    {pic(PHOTOS["draped"], "ratio-45", "A soft cream towel draped over a basket", "(max-width: 800px) 100vw, 50vw")}
    <div class="reveal"><h2>Fewer things, made well.</h2><p class="lede">One weight. Honest materials. Colours that stay calm.</p></div>
  </div>
</section>'''
page("our-story.html", "Our Story", "Al Qamar Threads brings the comfort of a good hotel home, with a small range of hotel-quality towels and bedding.", story, "our-story.html")

# ---------- Contact ----------
contact = '''<section class="page-intro" style="padding-bottom:var(--section)"><div class="narrow">
  <span class="eyebrow">Contact</span>
  <h1>We&rsquo;d love to hear from you.</h1>
  <p class="lede">Questions about an order, a gift or a fabric. We reply within one working day.</p>
  <p style="margin-top:48px"><a class="btn btn--ghost" href="mailto:hello@alqamarthreads.com">hello@alqamarthreads.com</a></p>
</div></section>'''
page("contact.html", "Contact", "Email Al Qamar Threads at hello@alqamarthreads.com.", contact, "contact.html")

# ---------- Shipping & returns ----------
shipping = '''<section class="page-intro"><div class="narrow"><h1>Shipping &amp; Returns</h1><p class="lede">Simple, and on your side.</p></div></section>
<section class="section" style="padding-top:0"><div class="narrow prose">
  <p class="note">Your existing Shipping &amp; Returns text drops in here. This page shows how headings and spacing will look.</p>
  <h2>Delivery</h2>
  <ul><li>UK only.</li><li>Royal Mail Tracked 48: &pound;3.99.</li><li>Free on orders over &pound;50.</li></ul>
  <h2>Returns</h2>
  <p>Return unused items within 30 days of delivery for a full refund.</p>
  <h2>Your right to cancel</h2>
  <p>Under UK consumer law you may cancel within 14 days of receiving your order, without giving a reason. This sits alongside our 30-day returns.</p>
  <h2>How to return</h2>
  <p>Email <a href="mailto:hello@alqamarthreads.com">hello@alqamarthreads.com</a> with your order number and we will guide you.</p>
</div></section>'''
page("shipping-returns.html", "Shipping & Returns", "UK delivery, 30-day returns and your 14-day right to cancel.", shipping)

for fn, title in [("terms.html", "Terms and Conditions"), ("privacy.html", "Privacy Policy")]:
    page(fn, title, f"{title} for Al Qamar Threads Ltd.", f'''<section class="page-intro"><div class="narrow"><h1>{title}</h1><p class="lede">Last updated [date].</p></div></section>
<section class="section" style="padding-top:0"><div class="narrow prose">
  <p class="note">Your existing {title} text drops in here, styled to match the rest of the site.</p>
  <h2>1. Section heading</h2><p>Body text at 17px with generous line height, so long legal text stays readable on a phone.</p>
  <h2>2. Section heading</h2><p>Body text continues here.</p>
</div></section>''')

# ---------- Cart ----------
page("cart.html", "Your Bag", "Your shopping bag.", '''<section class="page-intro"><div class="narrow"><h1>Your bag</h1></div></section>
<section class="section" style="padding-top:0"><div class="wrap" data-cart></div></section>''')

# ---------- Checkout ----------
checkout = '''<section class="page-intro" style="padding-bottom:40px"><div class="narrow"><h1>Checkout</h1><p class="lede">No account needed.</p></div></section>
<section class="section" style="padding-top:0"><div class="wrap cart-layout">
  <form class="checkout-form">
    <div data-live-only>
      <p class="lede" style="margin-bottom:28px">You&rsquo;ll add your delivery address and pay on the next page, secured by Stripe. Apple Pay and Google Pay are available there.</p>
    </div>
    <div data-demo-only>
    <div class="express" aria-label="Express checkout">
      <button type="button" class="pay-btn" aria-label="Pay with Apple Pay">Apple Pay</button>
      <button type="button" class="pay-btn" aria-label="Pay with Google Pay">Google Pay</button>
    </div>
    <p class="sum-note" style="margin:0">Shown where your device supports them.</p>
    <div class="divider">or</div>
    <fieldset><legend>Contact</legend>
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
      <label class="check"><input type="checkbox"> Email me about new colours (optional)</label>
    </fieldset>
    <fieldset><legend>Delivery</legend>
      <div class="field-row">
        <div class="field"><label for="fname">First name</label><input id="fname" name="fname" autocomplete="given-name" required></div>
        <div class="field"><label for="lname">Last name</label><input id="lname" name="lname" autocomplete="family-name" required></div>
      </div>
      <div class="field"><label for="address1">Address</label><input id="address1" name="address1" autocomplete="address-line1" required></div>
      <div class="field-row">
        <div class="field"><label for="city">Town or city</label><input id="city" name="city" autocomplete="address-level2" required></div>
        <div class="field"><label for="postcode">Postcode</label><input id="postcode" name="postcode" autocomplete="postal-code" required></div>
      </div>
      <div class="field"><label for="country">Country</label><select id="country" disabled><option>United Kingdom</option></select></div>
      <div class="radio-card"><span>Royal Mail Tracked 48</span><span>&pound;3.99 &middot; free over &pound;50</span></div>
    </fieldset>
    <fieldset><legend>Payment</legend>
      <div class="card-mock">Card details field (WooPayments / Stripe) appears here. Test mode until launch.</div>
    </fieldset>
    </div>
    <label class="check"><input type="checkbox" required> I have read the <a href="terms.html">Terms</a>, <a href="privacy.html">Privacy Policy</a> and <a href="shipping-returns.html">Shipping &amp; Returns</a>, including my 14-day right to cancel.</label>
    <label class="check" data-demo-only><input type="checkbox"> Create an account for faster checkout next time (optional)</label>
    <button type="submit" class="btn btn--block" style="margin-top:20px" data-demo-only>Place order</button>
    <button type="submit" class="btn btn--block" style="margin-top:20px" data-live-only>Continue to payment</button>
    <p class="form-msg" data-checkout-error role="alert"></p>
  </form>
  <aside class="summary" aria-label="Order summary">
    <h2>Your order</h2>
    <div data-checkout-summary></div>
    <p class="sum-note">Prices include no VAT. We are not VAT-registered.</p>
  </aside>
</div></section>'''
page("checkout.html", "Checkout", "Secure guest checkout.", checkout)

# ---------- Confirmation ----------
page("order-confirmation.html", "Thank You", "Your order is confirmed.", '''<section class="section"><div class="narrow center">
  <div data-confirmation>
    <span class="eyebrow">Order confirmed</span><h1>Thank you.</h1>
    <p class="lede">Your order is confirmed. A receipt is on its way to your inbox.</p>
  </div>
  <h3 style="margin-top:24px">What happens next</h3>
  <p class="lede">We pack your order within one working day. Royal Mail Tracked 48 usually arrives two to three working days later, and we&rsquo;ll email your tracking link.</p>
  <p style="margin-top:40px"><a class="btn" href="shop.html">Continue shopping</a></p>
</div></section>''')

# ---------- Account ----------
page("account.html", "My Account", "Sign in to your Al Qamar Threads account.", '''<section class="page-intro"><div class="narrow"><h1>My account</h1><p class="lede">Track orders and save your details.</p></div></section>
<section class="section" style="padding-top:0"><div class="wrap account-grid">
  <form onsubmit="event.preventDefault()">
    <h2 style="font-size:30px">Sign in</h2>
    <div class="field"><label for="li-email">Email</label><input id="li-email" type="email" autocomplete="email"></div>
    <div class="field"><label for="li-pass">Password</label><input id="li-pass" type="password" autocomplete="current-password"></div>
    <button class="btn" type="submit">Sign in</button>
    <p style="margin-top:18px"><a class="text-link" href="#">Forgotten your password?</a></p>
  </form>
  <form onsubmit="event.preventDefault()">
    <h2 style="font-size:30px">New here?</h2>
    <p class="lede">You can always check out as a guest. An account simply keeps your orders in one place.</p>
    <div class="field"><label for="reg-email">Email</label><input id="reg-email" type="email" autocomplete="email"></div>
    <button class="btn btn--ghost" type="submit">Create account</button>
  </form>
</div></section>''')

# ---------- 404 ----------
page("404.html", "Page Not Found", "This page could not be found.", '''<section class="section"><div class="narrow center">
  <h1>This page has drifted.</h1><p class="lede">Let&rsquo;s take you somewhere calmer.</p>
  <p style="margin-top:36px"><a class="btn" href="index.html">Back to home</a></p></div></section>''')
