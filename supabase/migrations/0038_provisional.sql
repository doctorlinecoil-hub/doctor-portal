-- A document the doctor opened without an appointment counts only once it is issued:
-- the letter was finalized ("preview before sending") or a prescription was saved.
alter table public.appointments add column if not exists provisional boolean not null default false;
create index if not exists appointments_provisional on public.appointments (created_at) where provisional;

create or replace function public.issue_appointment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.appointments set provisional = false where id = new.appointment_id and provisional;
  return new;
end $$;

drop trigger if exists letters_issue on public.letters;
create trigger letters_issue after insert or update of is_final on public.letters
  for each row when (new.is_final) execute function public.issue_appointment();
drop trigger if exists prescriptions_issue on public.prescriptions;
create trigger prescriptions_issue after insert on public.prescriptions
  for each row execute function public.issue_appointment();

-- documents opened without an appointment that were never issued (and nothing was paid)
update public.appointments a set provisional = true
  where a.walk_in and a.status <> 'cancelled' and not a.provisional
    and not exists (select 1 from public.letters l where l.appointment_id = a.id and l.is_final)
    and not exists (select 1 from public.prescriptions r where r.appointment_id = a.id)
    and not exists (select 1 from public.payments p where p.appointment_id = a.id);
