-- The doctor's document reaches the referrer only after the doctor approved the payment.
alter table public.appointments add column if not exists payment_ok_at timestamptz;
update public.settings set letter_requires_payment = true where id = 1;

-- released: the doctor approved the payment, or the full price was recorded as paid
create or replace function public.letter_released(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select not letter_requires_payment from public.settings where id = 1), false)
      or exists (select 1 from public.appointments a where a.id = p_id and (
           a.payment_ok_at is not null
           or (a.price > 0 and coalesce((select sum(p.amount) from public.payments p where p.appointment_id = a.id), 0) >= a.price)))
$$;
revoke execute on function public.letter_released(uuid) from anon, public;
grant execute on function public.letter_released(uuid) to authenticated, service_role;

create or replace function public.final_letter(p_id uuid)
returns table (letter_type public.referral_type, recipient text, subject text, body text, letter_date date, finalized_at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(l.final_letter_type, l.letter_type), coalesce(l.final_recipient, ''), coalesce(l.final_subject, ''),
         coalesce(l.final_body, ''), l.letter_date, l.finalized_at
  from public.letters l join public.appointments a on a.id = l.appointment_id
  where l.appointment_id = p_id and l.is_final and l.final_body is not null and a.status <> 'cancelled'
    and (public.is_staff() or (a.firm_id = public.my_firm() and public.letter_released(a.id)))
$$;

-- staff: approve (or take back) the payment of a case
create or replace function public.set_payment_ok(p_id uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  update public.appointments set payment_ok_at = case when p_ok then coalesce(payment_ok_at, now()) else null end where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke execute on function public.set_payment_ok(uuid, boolean) from anon, public;
grant execute on function public.set_payment_ok(uuid, boolean) to authenticated;

-- a signed-in office or patient can never set it when booking
create or replace function public.appt_payment_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() and auth.uid() is not null then new.payment_ok_at := null; end if;
  return new;
end $$;
revoke execute on function public.appt_payment_guard() from anon, authenticated, public;
drop trigger if exists appointments_y_pay_guard on public.appointments;
create trigger appointments_y_pay_guard before insert on public.appointments for each row execute function public.appt_payment_guard();
