-- Tokens Expo Push dos admins (notificações de novo pedido)
create table if not exists public.admin_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  device_name text,
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create index if not exists admin_push_tokens_user_id_idx on public.admin_push_tokens (user_id);

alter table public.admin_push_tokens enable row level security;

create policy "Admin gerencia proprio token"
  on public.admin_push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
