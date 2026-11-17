-- Passage en multi-pays.
-- products       : une ligne par variante CJ (données fournisseur, communes à tous les pays)
-- market_listings: une annonce eBay (à variantes) par produit CJ et par pays
-- market_offers  : une offre par variante et par pays (SKU propre à chaque pays)

drop table if exists products cascade;

create table products (
  id uuid primary key default gen_random_uuid(),
  cj_pid text not null,
  cj_vid text not null unique,
  cj_variant_sku text not null,
  name_en text not null,
  variant_key text,              -- ex "Black-XL"
  option_names text[] not null default '{}', -- ex {Color,Size}
  description_html text not null default '',
  image_urls text[] not null default '{}',
  cost_usd numeric(10,2) not null,
  weight_g numeric(10,1),
  stock_by_country jsonb not null default '{}', -- {"CN": 900, "US": 12}
  cj_listed_num int,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index products_pid_idx on products (cj_pid);

create table market_listings (
  id uuid primary key default gen_random_uuid(),
  cj_pid text not null,
  marketplace text not null,
  ship_from text not null,
  logistic_name text not null,
  delivery_days text,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'listed', 'paused', 'error', 'skipped')),
  title text,
  description_html text,
  aspects jsonb not null default '{}',
  category_id text,
  group_key text unique,
  ebay_listing_id text,
  last_error text,
  ai_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cj_pid, marketplace)
);
create index market_listings_status_idx on market_listings (status);

create table market_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references market_listings (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  sku text not null unique,       -- SKU eBay : <sku CJ>-<pays>
  currency text not null,
  shipping_cost numeric(10,2) not null,
  cost numeric(10,2) not null,    -- coût produit converti en devise locale
  price numeric(10,2) not null,
  quantity int not null default 0,
  ebay_offer_id text,
  unique (listing_id, product_id)
);

-- Lieux d'expédition eBay créés automatiquement, un par entrepôt CJ
create table if not exists ebay_locations (
  country text primary key,
  merchant_location_key text not null unique,
  created_at timestamptz not null default now()
);

alter table orders rename column total_eur to total;
alter table orders add column if not exists marketplace text;
alter table orders add column if not exists currency text;

alter table market_listings enable row level security;
alter table market_offers enable row level security;
alter table ebay_locations enable row level security;
alter table products enable row level security;
