-- A moved appointment gets its reminders again (3 days and 2 hours before the new time).
create or replace function public.decide_reschedule(p_id uuid, p_approve boolean, p_response text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.reschedule_requests;
  a public.appointments;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into r from public.reschedule_requests where id = p_id and status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_approve then
    select * into a from public.appointments where id = r.appointment_id;
    perform public.slot_check_len(r.requested_starts_at, greatest(1, (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int));
    update public.appointments set starts_at = r.requested_starts_at,
      ends_at = r.requested_starts_at + (a.ends_at - a.starts_at),
      reminder_sent_at = null, remind_3d_at = null, remind_2h_at = null
      where id = r.appointment_id and status in ('pending', 'booked', 'draft');
    if not found then raise exception 'CANNOT_RESCHEDULE'; end if;
  end if;
  update public.reschedule_requests set status = case when p_approve then 'approved' else 'declined' end,
    response = left(coalesce(trim(p_response), ''), 500), decided_at = now() where id = p_id;
  return r.appointment_id;
end $$;
revoke execute on function public.decide_reschedule(uuid, boolean, text) from anon, public;
grant execute on function public.decide_reschedule(uuid, boolean, text) to authenticated, service_role;

-- the same when the clinic moves an appointment in the calendar
create or replace function public.reset_reminders_on_move() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.starts_at is distinct from old.starts_at then
    new.reminder_sent_at := null; new.remind_3d_at := null; new.remind_2h_at := null;
  end if;
  return new;
end $$;
drop trigger if exists appointments_reset_reminders on public.appointments;
create trigger appointments_reset_reminders before update of starts_at on public.appointments
  for each row execute function public.reset_reminders_on_move();
