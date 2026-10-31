-- WhatsApp (Meta Cloud API): every message in and out, for the conversations screen.
create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete set null,
  phone text not null,                       -- digits only, 9725XXXXXXXX
  name text not null default '',             -- the WhatsApp profile name (incoming)
  direction text not null check (direction in ('in', 'out')),
  kind text not null default 'text',         -- template name, 'text', 'image', ...
  body text not null default '',
  wa_id text unique,
  status text not null default 'sent',       -- sent / delivered / read / failed / received
  error text not null default '',
  seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_phone on public.wa_messages (phone, created_at desc);
create index if not exists wa_messages_unseen on public.wa_messages (created_at) where direction = 'in' and seen_at is null;
alter table public.wa_messages enable row level security;
drop policy if exists wa_messages_staff_read on public.wa_messages;
create policy wa_messages_staff_read on public.wa_messages for select to authenticated using (public.is_staff());
drop policy if exists wa_messages_staff_seen on public.wa_messages;
create policy wa_messages_staff_seen on public.wa_messages for update to authenticated using (public.is_staff()) with check (public.is_staff());
revoke insert, delete on public.wa_messages from anon, authenticated;

-- a personal link to the final document, opened with the last 4 digits of the ID number
alter table public.appointments
  add column if not exists doc_key_hash text,
  add column if not exists doc_key_expires timestamptz,
  add column if not exists doc_key_fails int not null default 0;

alter table public.settings add column if not exists whatsapp_on boolean not null default true;
