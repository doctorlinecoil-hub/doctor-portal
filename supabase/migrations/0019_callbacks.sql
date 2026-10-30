-- "Call me back" requests from the public site (marketing pages)
create table if not exists public.callbacks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  phone text not null check (length(phone) between 7 and 30),
  kind text not null default '' check (length(kind) <= 40),
  note text not null default '' check (length(note) <= 1000),
  source text not null default '' check (length(source) <= 200),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists callbacks_created_idx on public.callbacks (created_at desc);
alter table public.callbacks enable row level security;
revoke all on public.callbacks from anon;
drop policy if exists callbacks_staff_read on public.callbacks;
create policy callbacks_staff_read on public.callbacks for select to authenticated using (public.is_staff());
drop policy if exists callbacks_staff_update on public.callbacks;
create policy callbacks_staff_update on public.callbacks for update to authenticated using (public.is_staff()) with check (public.is_staff());
