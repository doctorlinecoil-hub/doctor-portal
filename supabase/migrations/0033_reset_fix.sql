-- Reset: referrer sign-in accounts are removed by the app through the Auth admin API (the database role may not
-- write to the auth schema); the function clears the data and the referrers' profiles.
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
  delete from public.firm_prices;
  delete from public.firms where kind <> 'private';
  return jsonb_build_object('cases', n_cases, 'referrers', n_firms);
end $$;
revoke execute on function public.reset_test_data() from anon, public;
grant execute on function public.reset_test_data() to authenticated;
