-- Casario — таблица покупок (Telegram Stars ⭐). Источник правды по оплатам.
-- Пишется ТОЛЬКО серверным вебхуком (service_role); публичный доступ закрыт.

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  tg_user_id  bigint,
  tg_username text,
  sku         text,               -- 'pro' | 'search' | 'bump' | ...
  stars       int,                -- сумма в Telegram Stars
  charge_id   text unique,        -- telegram_payment_charge_id (для рефандов, антидубль)
  payload     text,               -- сырой invoice_payload
  created_at  timestamptz default now()
);

alter table public.purchases enable row level security;
-- Никаких публичных политик: писать может только service_role (вебхук),
-- клиенты доступ не имеют. RLS без политик = всё запрещено для anon/auth.

create index if not exists purchases_tg_user_idx on public.purchases (tg_user_id);
