# Going live — Cloudflare Pages + Supabase + Stripe

## Current status (20 Oct 2026)

Already done:
- **Site:** https://al-qamar-threads.pages.dev (Cloudflare Pages project `al-qamar-threads`). Deploy with `npm run deploy`.
- **Supabase:** project `al-qamar-threads` (ref `pfvnswwrfdxvnffspizd`, London). Schema applied from `supabase/migrations/`, public sign-ups off.
- **Stripe:** Clevera sandbox (test mode). Webhook `we_1USezE0XRz2PLDUFSKiK73Tz` → `/api/stripe-webhook`.
- **Cloudflare secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`.
- **Tested:** a full test-card order (AQT-10001) was paid, saved by the webhook and shown on the thank-you page.

Still to do:
1. **Admin user:** Supabase → Authentication → Users → Add user (your email + password, Auto confirm), then make it an admin (step 1.3 below).
2. **Before launch:** roll the Stripe test key (it was shared in chat), then follow step 7 for live keys.

The steps below are the full guide, for reference or for setting up again.

---

About 30–40 minutes, all on free plans. Do the steps in order.

> **Keep secret keys secret.** Only the Supabase **URL** and **anon public key** go in the code (they are safe to publish).
> The Supabase **service_role** key and every Stripe **secret** key go only into Cloudflare (step 4). Never commit them or paste them in chat.

---

## 1. Supabase (database + admin login)

1. Sign up at <https://supabase.com> → **New project**. Region: **London (eu-west-2)**. Save the database password somewhere safe.
2. **SQL Editor** → New query → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   This creates the products, orders and subscribers tables, the security rules, and the 4 starting products.
3. Create your admin login:
   - **Authentication → Users → Add user → Create new user**: your email and a strong password, tick **Auto confirm user**.
   - **SQL Editor**, run (with your email):
     ```sql
     insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
     ```
4. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". Only people you add can log in.
5. **Project Settings → API**: copy
   - **Project URL** and **anon public** key → put both in [`assets/js/config.js`](assets/js/config.js) (or send them to Claude).
   - **service_role** key → keep for step 4 only.

## 2. Stripe (payments)

1. Sign up at <https://stripe.com>. Stay in **Test mode** (toggle top right) until launch day.
2. **Developers → API keys**: copy the **Secret key** (`sk_test_…`) for step 4.
3. **Settings → Payment methods**: make sure **Cards**, **Apple Pay** and **Google Pay** are on.
4. **Settings → Business → Customer emails**: turn on **Successful payments** (Stripe sends the receipt).
5. **Settings → Branding**: add the logo and the colour `#3F3A35` so the payment page matches the shop.
6. The webhook is added in step 5, once the site has its address.

## 3. Cloudflare Pages (hosting)

1. `npx wrangler login`, then `npx wrangler pages project create al-qamar-threads --production-branch main`.
2. `npm run deploy` builds a clean `dist/` folder (public files only) and uploads it with the API functions.
   You get an address like `https://al-qamar-threads.pages.dev`. Run `npm run deploy` again after every change.

## 4. Secrets in Cloudflare

Pages project → **Settings → Variables and Secrets** → add for **Production** (type **Secret** for the keys):

| Name | Value |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
| `STRIPE_SECRET_KEY` | Stripe `sk_test_…` (later `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | from step 5 (`whsec_…`) |
| `ADMIN_EMAIL` *(optional)* | where new-order alerts go |
| `RESEND_API_KEY`, `ORDER_EMAIL_FROM` *(optional)* | branded order emails via <https://resend.com> (needs the domain verified), e.g. `Al Qamar Threads <orders@alqamarthreads.com>` |

Then **Deployments → Retry deployment** so the new values are picked up.

## 5. Stripe webhook (saves paid orders)

Stripe → **Developers → Webhooks → Add endpoint**:
- URL: `https://<your-site>.pages.dev/api/stripe-webhook`
- Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
- Copy the **Signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET` (step 4) and redeploy.

## 6. Test it

1. Open the site, add a towel to the bag, check out.
2. Pay with Stripe's test card **4242 4242 4242 4242**, any future date, any CVC, any UK postcode.
3. You land on the thank-you page with the order number.
4. Open `/admin`, sign in with your Supabase admin account: the order is there. Change a price in **Products** and check the shop.
5. Sign up for emails in the footer → it appears under **Subscribers**.

If the order does not appear: Stripe → Webhooks → your endpoint → check the delivery shows **200**.

## 7. Launch day

1. Stripe: finish account activation (company details, bank account), switch to **Live mode**, copy the live secret key and create the webhook again in live mode.
2. Cloudflare: replace `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` with the live values, redeploy.
3. Optional: **Custom domains** → add `alqamarthreads.com` (or `shop.alqamarthreads.com`).
4. Turn off the old GitHub Pages copy: GitHub repo → **Settings → Pages → Unpublish**.

## Good to know

- **Free limits**: Supabase pauses a project after 7 days with no activity (resume with one click in the dashboard); 500 MB database. Cloudflare Pages: unlimited visitors. Stripe: no monthly fee, a fee per sale.
- **Refunds** are made in Stripe. Then set the order to *Refunded* in the admin.
- **Prices** are always re-checked on the server from the database, so a changed price in the browser can't be paid.
- **Demo mode**: with `config.js` empty the site runs as before, with data kept in the browser and the demo login `admin` / `admin`.
