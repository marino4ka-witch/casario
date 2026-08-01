-- Casario — Supabase schema (run once in Supabase → SQL Editor)
-- Makes the app real: accounts, cloud profiles, shared listings, live chat, search briefs.

-- 1) PROFILES (1 row per auth user)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  country text,
  city text,
  about text,
  avatar_url text,
  is_pro boolean default false,
  balance int default 0,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "profiles are readable by everyone" on public.profiles for select using (true);
create policy "users edit own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);

-- 2) LISTINGS (ads: buy/sell + services)
create table if not exists public.listings (
  id bigint generated always as identity primary key,
  owner uuid references auth.users(id) on delete cascade,
  cat text check (cat in ('buy','svc')) default 'buy',
  title text not null,
  loc text,
  price text,
  descr text,
  contact text,
  country text,
  photos int default 0,
  status text check (status in ('active','sold','gone')) default 'active',
  featured boolean default false,
  created_at timestamptz default now()
);
alter table public.listings enable row level security;
create policy "listings readable by everyone" on public.listings for select using (true);
create policy "users insert own listings" on public.listings for insert with check (auth.uid() = owner);
create policy "owners update own listings" on public.listings for update using (auth.uid() = owner);
create policy "owners delete own listings" on public.listings for delete using (auth.uid() = owner);

-- 3) CHAT MESSAGES (per-country community chat, realtime)
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  author uuid references auth.users(id) on delete set null,
  author_name text,
  country text,
  body text not null,
  created_at timestamptz default now()
);
alter table public.messages enable row level security;
create policy "messages readable by everyone" on public.messages for select using (true);
create policy "auth users post messages" on public.messages for insert with check (auth.uid() = author);

-- 4) SEARCH BRIEFS (the concierge MVP: user's housing request)
create table if not exists public.briefs (
  id bigint generated always as identity primary key,
  owner uuid references auth.users(id) on delete set null,
  payload jsonb not null,           -- country, city, districts, budget, filters…
  status text default 'new',        -- new | in_progress | delivered
  created_at timestamptz default now()
);
alter table public.briefs enable row level security;
create policy "owners read own briefs" on public.briefs for select using (auth.uid() = owner);
create policy "auth users create briefs" on public.briefs for insert with check (auth.uid() = owner);

-- 5) Realtime for chat + listings
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.listings;

-- 6) Storage bucket for avatars/listing photos (create in Dashboard → Storage: "media", public read)
