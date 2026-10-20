# Al Qamar Threads — website design mock-up

A clickable static mock-up of the Al Qamar Threads shop (Home, Shop, product pages, Bag, Checkout, Order confirmation, Our Story, Contact, Shipping & Returns, Terms, Privacy, My Account), styled after the quiet-luxury feel of the brief.

It is for approval before the WordPress / WooCommerce build. Photos are free-licence samples from Unsplash, to be swapped for Al Qamar's own product shots. Prices, company number and address are placeholders.

## Live shop (Cloudflare Pages + Supabase + Stripe)

The site runs in two modes:

- **Demo mode** (`assets/js/config.js` empty): data lives in each visitor's browser. Admin login `admin` / `admin`.
- **Live mode** (Supabase URL and anon key in `config.js`): products, orders and sign-ups are stored in Supabase, payment goes through Stripe Checkout, and the admin uses a secure Supabase login.

Server code lives in `functions/api/` (Cloudflare Pages Functions) and `lib/shop.js`. The database schema and security rules are in `supabase/schema.sql`.

**Live at https://al-qamar-threads.pages.dev** (Stripe test mode). Deploy changes with `npm run deploy`. Setup details and what is left: [SETUP.md](SETUP.md).

## Edit and rebuild

Pages are generated from `build.py` (shared header and footer):

```bash
python build.py
```

Styles live in `assets/css/style.css`, cart and gallery behaviour in `assets/js/main.js`.

Run the server tests and the site with its API locally:

```bash
npm install
npm test
npm run dev
```
