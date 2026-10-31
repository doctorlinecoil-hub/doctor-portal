-- WhatsApp bot: where each conversation stands, and who answers (the bot or the clinic).
create table if not exists public.wa_sessions (
  phone text primary key,
  step text not null default '',
  data jsonb not null default '{}'::jsonb,
  mode text not null default 'bot' check (mode in ('bot', 'human')),
  human_until timestamptz,
  done_at timestamptz,                 -- the clinic marked the conversation as handled
  updated_at timestamptz not null default now()
);
alter table public.wa_sessions enable row level security;
drop policy if exists wa_sessions_staff_read on public.wa_sessions;
create policy wa_sessions_staff_read on public.wa_sessions for select to authenticated using (public.is_staff());
drop policy if exists wa_sessions_staff_write on public.wa_sessions;
create policy wa_sessions_staff_write on public.wa_sessions for update to authenticated using (public.is_staff()) with check (public.is_staff());
revoke insert, delete on public.wa_sessions from anon, authenticated;

alter table public.wa_messages add column if not exists bot boolean not null default false;
alter table public.settings add column if not exists whatsapp_bot boolean not null default true;

-- appointments booked by the bot
alter table public.appointments drop constraint if exists appointments_source_check;
alter table public.appointments add constraint appointments_source_check check (source in ('', 'public', 'whatsapp'));
