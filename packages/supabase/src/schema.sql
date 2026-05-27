create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  device_key text unique not null,
  name text not null,
  status text not null default 'offline',
  last_seen_at timestamptz null,
  created_at timestamptz not null default now()
);

create table public.device_modules (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.devices(id) on delete cascade,
  module_id text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.command_logs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.devices(id) on delete cascade,
  command_id text not null,
  command_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'created',
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);
