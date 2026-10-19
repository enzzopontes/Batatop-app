-- Leituras de notificação por usuário (sistema de visto/não visto)
--
-- notifications.read_at funciona pra notificação ESPECÍFICA do usuário
-- (user_id preenchido). Notificação "broadcast" (user_id null) é
-- compartilhada entre todos os usuários — marcar read_at nela marcaria
-- como lida pra todo mundo (e a policy de update nem deixa atualizar).
-- notification_reads resolve isso: leitura é (user_id, notification_id),
-- então cada usuário tem o próprio visto mesmo em broadcast.

create table if not exists public.notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);

create index if not exists notification_reads_user_id_idx on public.notification_reads (user_id);
create index if not exists notification_reads_notification_id_idx on public.notification_reads (notification_id);

alter table public.notification_reads enable row level security;

create policy "Usuario gerencia propria leitura"
  on public.notification_reads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);