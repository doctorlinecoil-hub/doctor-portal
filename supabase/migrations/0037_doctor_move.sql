-- The doctor moves an appointment to another time (any time he chooses; the overlap constraint still applies).
-- Returns the previous start time, for the update email.
create or replace function public.doctor_move_appointment(p_id uuid, p_starts timestamptz) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  a public.appointments;
begin
  if not public.is_staff() then raise exception 'FORBIDDEN'; end if;
  select * into a from public.appointments where id = p_id for update;
  if not found or a.status not in ('pending', 'booked', 'draft') then raise exception 'CANNOT_RESCHEDULE'; end if;
  if p_starts < now() - interval '5 minutes' then raise exception 'MOVE_IN_PAST'; end if;
  if p_starts = a.starts_at then raise exception 'MOVE_SAME_TIME'; end if;
  update public.appointments set starts_at = p_starts, ends_at = p_starts + (a.ends_at - a.starts_at),
    reminder_sent_at = null, remind_3d_at = null, remind_2h_at = null
    where id = p_id;
  -- an open request from the referrer is answered by the move
  update public.reschedule_requests set status = 'declined', response = 'המרפאה קבעה מועד חדש', decided_at = now()
    where appointment_id = p_id and status = 'pending';
  return a.starts_at;
end $$;
revoke execute on function public.doctor_move_appointment(uuid, timestamptz) from anon, public;
grant execute on function public.doctor_move_appointment(uuid, timestamptz) to authenticated, service_role;
