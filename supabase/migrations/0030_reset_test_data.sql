-- A button for the clinic admin: wipe the trial data (cases, patients, documents, payments, referrers and their accounts)
-- and start case numbers again from 1001. Settings, services, templates and staff accounts stay.
-- Defines the function only; nothing is deleted until an admin (with two-step sign-in) runs it from the settings page.
create or replace function public.reset_test_data() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
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
  delete from auth.users where id in (select id from public.profiles where role = 'firm');
  delete from public.firm_prices;
  delete from public.firms where kind <> 'private';
  return jsonb_build_object('cases', n_cases, 'referrers', n_firms);
end $$;
revoke execute on function public.reset_test_data() from anon, public;
grant execute on function public.reset_test_data() to authenticated;
