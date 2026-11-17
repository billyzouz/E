-- Schéma initial. Toutes les tables sont accédées côté serveur uniquement (clé service_role).
-- RLS activée sans policy : rien n'est lisible avec la clé publique.

create table if not exists ebay_accounts (
  id uuid primary key default gen_random_uuid(),
  ebay_user text unique,
  environment text not null check (environment in ('sandbox', 'production')),
  access_token text not null,
  access_token_expires_at timestamptz not null,
  refresh_token text not null,
  refresh_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  cj_pid text not null,
  cj_vid text not null unique,
  sku text not null unique,
  title text not null,
  description_html text not null default '',
  image_urls text[] not null default '{}',
  aspects jsonb not null default '{}',
  category_id text,
  cost_eur numeric(10,2) not null,
  shipping_eur numeric(10,2) not null,
  logistic_name text,
  price_eur numeric(10,2) not null,
  stock int not null default 0,
  status text not null default 'draft' check (status in ('draft', 'listed', 'paused', 'error')),
  ebay_offer_id text,
  ebay_listing_id text,
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  ebay_order_id text not null unique,
  buyer text,
  total_eur numeric(10,2),
  status text not null default 'new'
    check (status in ('new', 'ordered_cj', 'shipped', 'error', 'manual')),
  cj_order_id text,
  tracking_number text,
  carrier text,
  raw jsonb not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_status_idx on orders (status);
create index if not exists products_status_idx on products (status);

alter table ebay_accounts enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
