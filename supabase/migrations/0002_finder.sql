-- Petites valeurs persistantes (ex : token CJ, valable plusieurs jours, CJ limite les demandes)
create table if not exists app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Pays de l'entrepôt CJ d'où part chaque produit (CN, FR, DE…)
alter table products add column if not exists ship_from text not null default 'CN';
alter table products add column if not exists delivery_days text;
alter table products add column if not exists cj_listed_num int;

-- Imports automatiques lancés depuis la recherche
create table if not exists import_jobs (
  id uuid primary key default gen_random_uuid(),
  params jsonb not null,
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  total int not null default 0,
  imported int not null default 0,
  failed int not null default 0,
  log text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_state enable row level security;
alter table import_jobs enable row level security;
