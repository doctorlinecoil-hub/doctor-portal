-- The payer (patient or referrer) sends the transfer confirmation for a ready document: by email reply,
-- or through a personal link (no sign-in) that uploads it into the case. Additive.

alter table public.appointments add column if not exists pay_key_hash text;
alter table public.appointments add column if not exists pay_key_expires timestamptz;
alter table public.appointments add column if not exists pay_proof_at timestamptz;

-- a confirmation arrived: mark the case and tell the doctor (staff, the case's own referrer, or the server after its key check)
create or replace function public.payment_proof_sent(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.appointments;
begin
  select * into a from public.appointments where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_staff() or coalesce(a.firm_id = public.my_firm(), false) or auth.uid() is null) then raise exception 'NOT_ALLOWED'; end if;
  update public.appointments set pay_proof_at = now() where id = p_id;
  perform public.notify(true, null, p_id, 'payment_proof', 'התקבל אישור העברה לתשלום',
    coalesce(nullif(a.patient_name, ''), 'מטופל') || ' · תיק ' || a.case_no || ' · אפשר לאשר את התשלום');
end $$;
revoke execute on function public.payment_proof_sent(uuid) from anon, public;
grant execute on function public.payment_proof_sent(uuid) to authenticated, service_role;
