# Al Qamar Threads — website design mock-up

A clickable static mock-up of the Al Qamar Threads shop (Home, Shop, product pages, Bag, Checkout, Order confirmation, Our Story, Contact, Shipping & Returns, Terms, Privacy, My Account), styled after the quiet-luxury feel of the brief.

It is for approval before the WordPress / WooCommerce build. Photos are free-licence samples from Unsplash, to be swapped for Al Qamar's own product shots. Prices, company number and address are placeholders.

## Admin demo

`admin.html` (link in the footer) is a demo dashboard: orders, products (name, prices, visibility, sold out), email sign-ups and store settings, with sample data.

- Login: `admin` / `admin` (set in `assets/js/admin-config.js`)
- This is not real security. The site is static, so the login and all data live in the visitor's own browser. On the live site, the WooCommerce admin does this job.

## Edit and rebuild

Pages are generated from `build.py` (shared header and footer):

```bash
python build.py
```

Styles live in `assets/css/style.css`, cart and gallery behaviour in `assets/js/main.js`.
