-- HydroVigie — schéma initial (Sprint 6).
-- À exécuter dans le SQL Editor de Supabase (une seule fois).
-- Modèle : 1 utilisateur → 1 organisation (créée automatiquement à l'inscription),
-- sites serveur = abonnements aux alertes ; les sites du navigateur restent locaux.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mon organisation',
  alert_email text,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner',
  primary key (org_id, user_id)
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  label text not null,
  lat double precision not null,
  lon double precision not null,
  citycode text,
  profil text not null default 'entreprise',
  last_worst_level text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, lat, lon)
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  label text not null default 'default',
  key_prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  old_level text,
  new_level text,
  email_status text,
  created_at timestamptz not null default now()
);

create index sites_org_idx on public.sites (org_id);
create index alert_events_site_idx on public.alert_events (site_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.sites enable row level security;
alter table public.api_keys enable row level security;
alter table public.alert_events enable row level security;

create or replace function public.is_org_member(org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_members
    where org_id = org and user_id = auth.uid()
  );
$$;

create policy "org read" on public.organizations
  for select using (public.is_org_member(id));
create policy "org update" on public.organizations
  for update using (public.is_org_member(id));

create policy "members read own" on public.org_members
  for select using (user_id = auth.uid() or public.is_org_member(org_id));

create policy "sites all" on public.sites
  for all using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy "api keys all" on public.api_keys
  for all using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy "alert events read" on public.alert_events
  for select using (
    public.is_org_member((select org_id from public.sites where id = site_id))
  );

-- ---------------------------------------------------------------------------
-- Auto-création d'une organisation à l'inscription
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  new_org uuid;
begin
  insert into public.organizations (name, alert_email)
  values ('Mon organisation', new.email)
  returning id into new_org;
  insert into public.org_members (org_id, user_id) values (new_org, new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
