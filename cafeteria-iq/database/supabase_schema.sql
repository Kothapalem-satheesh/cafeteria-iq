-- CafeteriaIQ Supabase schema for unsupervised ML showcase

create extension if not exists "pgcrypto";

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  item_code text unique not null,
  name text not null,
  category text not null,
  price numeric(10,2) not null check (price >= 0),
  is_vegetarian boolean not null default true,
  calories integer,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions_raw (
  id uuid primary key default gen_random_uuid(),
  transaction_id text unique not null,
  customer_id text not null,
  customer_age integer,
  customer_gender text,
  transaction_ts timestamptz not null,
  day_of_week text,
  time_slot text,
  payment_method text,
  total_amount numeric(10,2) not null check (total_amount >= 0),
  items_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_raw_customer_id on public.transactions_raw (customer_id);
create index if not exists idx_transactions_raw_transaction_ts on public.transactions_raw (transaction_ts);

create table if not exists public.customer_features (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null unique,
  recency_days numeric(10,2),
  frequency_count integer,
  monetary_total numeric(12,2),
  avg_order_value numeric(12,2),
  beverage_ratio numeric(10,4),
  veg_ratio numeric(10,4),
  weekend_ratio numeric(10,4),
  lunch_ratio numeric(10,4),
  nights_ratio numeric(10,4),
  created_at timestamptz not null default now()
);

create table if not exists public.model_runs (
  id uuid primary key default gen_random_uuid(),
  run_name text not null,
  model_type text not null,
  feature_version text,
  params_json jsonb,
  metrics_json jsonb,
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.cluster_assignments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.model_runs(id) on delete cascade,
  customer_id text not null,
  cluster_label integer not null,
  confidence_score numeric(10,4),
  x_2d numeric(14,6),
  y_2d numeric(14,6),
  z_3d numeric(14,6),
  created_at timestamptz not null default now(),
  unique (run_id, customer_id)
);

create index if not exists idx_cluster_assignments_run_id on public.cluster_assignments (run_id);
create index if not exists idx_cluster_assignments_customer_id on public.cluster_assignments (customer_id);

create table if not exists public.anomaly_scores (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.model_runs(id) on delete cascade,
  customer_id text not null,
  anomaly_score numeric(14,6) not null,
  is_anomaly boolean not null default false,
  reason text,
  created_at timestamptz not null default now(),
  unique (run_id, customer_id)
);

create table if not exists public.association_rules (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.model_runs(id) on delete cascade,
  antecedents text[] not null,
  consequents text[] not null,
  support numeric(10,6) not null,
  confidence numeric(10,6) not null,
  lift numeric(10,6) not null,
  conviction numeric(10,6),
  created_at timestamptz not null default now()
);

-- Optional: enable row level security and add policies later.

