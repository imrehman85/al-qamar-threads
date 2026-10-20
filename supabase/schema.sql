-- Al Qamar Threads — Supabase schema.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run: it creates what is missing and refreshes the policies.

-- ---------- Tables ----------
create table if not exists public.products (
  slug        text primary key,
  collection  text not null,
  name        text not null,
  colour      text not null,
  sizes       text[] not null,
  prices      numeric(10,2)[] not null,
  img         text,
  hidden      boolean not null default false,
  sold_out    boolean not null default false,
  sort        int not null default 0,
  updated_at  timestamptz not null default now(),
  constraint prices_match_sizes check (cardinality(prices) = cardinality(sizes))
);

create sequence if not exists public.order_no_seq start 10001;

create table if not exists public.orders (
  id                     bigint generated always as identity primary key,
  no                     text not null unique default ('AQT-' || nextval('public.order_no_seq')::text),
  created_at             timestamptz not null default now(),
  status                 text not null default 'Processing'
                         check (status in ('Processing', 'Shipped', 'Completed', 'Refunded', 'Cancelled')),
  name                   text,
  email                  text,
  address                text,
  items                  jsonb not null,
  subtotal               numeric(10,2) not null,
  shipping               numeric(10,2) not null,
  total                  numeric(10,2) not null,
  stripe_session_id      text unique,
  stripe_payment_intent  text
);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

create table if not exists public.subscribers (
  id          bigint generated always as identity primary key,
  email       text not null unique,
  source      text,
  created_at  timestamptz not null default now(),
  constraint email_lowercase check (email = lower(email)),
  constraint email_shape check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254)
);

-- People allowed into the admin dashboard (Supabase Auth users).
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- Row level security ----------
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.subscribers enable row level security;
alter table public.admins      enable row level security;

-- Products: anyone can read; only admins can change.
drop policy if exists "products are public" on public.products;
create policy "products are public" on public.products
  for select to anon, authenticated using (true);
drop policy if exists "admins update products" on public.products;
create policy "admins update products" on public.products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Orders: written only by the server (service role, from the Stripe webhook); admins read and manage.
drop policy if exists "admins read orders" on public.orders;
create policy "admins read orders" on public.orders
  for select to authenticated using (public.is_admin());
drop policy if exists "admins update orders" on public.orders;
create policy "admins update orders" on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete orders" on public.orders;
create policy "admins delete orders" on public.orders
  for delete to authenticated using (public.is_admin());

-- Subscribers: anyone can sign up (insert only); admins read and remove.
drop policy if exists "anyone can subscribe" on public.subscribers;
create policy "anyone can subscribe" on public.subscribers
  for insert to anon, authenticated with check (true);
drop policy if exists "admins read subscribers" on public.subscribers;
create policy "admins read subscribers" on public.subscribers
  for select to authenticated using (public.is_admin());
drop policy if exists "admins delete subscribers" on public.subscribers;
create policy "admins delete subscribers" on public.subscribers
  for delete to authenticated using (public.is_admin());

-- Admins table: a signed-in user may only see their own row.
drop policy if exists "see own admin row" on public.admins;
create policy "see own admin row" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Only the columns the shop needs are writable from the browser.
revoke update on public.products from anon, authenticated;
grant update (name, prices, hidden, sold_out, updated_at) on public.products to authenticated;
revoke update on public.orders from anon, authenticated;
grant update (status) on public.orders to authenticated;

-- ---------- Starting catalogue (edit prices in the admin later) ----------
insert into public.products (slug, collection, name, colour, sizes, prices, img, sort) values
  ('moon-bath-towel', 'moon', 'Moon™ Bath Towel', 'White',
    array['Hand towel 50 × 90 cm', 'Bath towel 70 × 140 cm', 'Bath sheet 90 × 160 cm'], array[14, 24, 32]::numeric(10,2)[],
    '1527986654082-0b5b3fef2632', 1),
  ('moon-towel-set', 'moon', 'Moon™ 3-Piece Towel Set', 'White',
    array['3-piece set'], array[42]::numeric(10,2)[], '1760722974657-f64bce2f9cc5', 2),
  ('dune-bath-towel', 'dune', 'Dune™ Bath Towel', 'Apricot',
    array['Hand towel 50 × 90 cm', 'Bath towel 70 × 140 cm', 'Bath sheet 90 × 160 cm'], array[14, 24, 32]::numeric(10,2)[],
    '1664227431098-1289c13695c1', 3),
  ('dune-towel-set', 'dune', 'Dune™ 3-Piece Towel Set', 'Apricot',
    array['3-piece set'], array[42]::numeric(10,2)[], '1625479969471-c0a79753d2d3', 4)
on conflict (slug) do nothing;

-- ---------- Make yourself an admin ----------
-- 1. Dashboard → Authentication → Users → Add user (your email + a strong password, tick "Auto confirm").
-- 2. Then run this, with your email:
--    insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
