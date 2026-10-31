-- Reset fix: the database's safe-update guard rejects a DELETE without WHERE ("DELETE requires a WHERE clause").
-- Every delete now states its condition explicitly.
create or replace function public.reset_test_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n_cases int;
  n_firms int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select count(*) into n_cases from public.appointments;
  select count(*) into n_firms from public.firms where kind <> 'private';
  truncate table
    public.appointments, public.case_notes, public.documents, public.letters, public.payments,
    public.case_intake, public.email_log, public.reschedule_requests, public.notifications,
    public.prescriptions, public.case_diagnoses, public.callbacks, public.audit_log, public.password_resets
  restart identity cascade;
  delete from public.profiles where role = 'firm';
  delete from public.firm_prices where true;
  delete from public.firms where kind <> 'private';
  return jsonb_build_object('cases', n_cases, 'referrers', n_firms);
end $$;
revoke execute on function public.reset_test_data() from anon, public;
grant execute on function public.reset_test_data() to authenticated;

-- The system map (settings → מפת המערכת): the admin's own notes per service (plan, renewal date, account),
-- and a heartbeat of the scheduler so the page can tell it is running.
alter table public.settings add column if not exists infra jsonb not null default '{}'::jsonb;
alter table public.settings add column if not exists last_tick timestamptz;

-- The admin's service notes live in their own table that only the admin can read (settings is readable by every signed-in user).
alter table public.settings drop column if exists infra;
create table if not exists public.admin_notes (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.admin_notes enable row level security;
drop policy if exists admin_notes_admin on public.admin_notes;
create policy admin_notes_admin on public.admin_notes for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.admin_notes to authenticated;

-- a stored file path never climbs out of its folder
alter table public.documents drop constraint if exists documents_path_no_dots;
alter table public.documents add constraint documents_path_no_dots check (storage_path !~ '\.\./|/\.\.') not valid;
