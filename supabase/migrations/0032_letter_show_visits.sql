-- The "follow-up visit" line (dates of earlier visits) appears in a document only when the doctor chooses it.
alter table public.letters add column if not exists show_visits boolean not null default false;

-- the final letter also says whether to print that line
drop function if exists public.final_letter(uuid);
create function public.final_letter(p_id uuid)
returns table (letter_type public.referral_type, recipient text, subject text, body text, letter_date date, finalized_at timestamptz, show_visits boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(l.final_letter_type, l.letter_type), coalesce(l.final_recipient, ''), coalesce(l.final_doc_title, ''),
         coalesce(l.final_body, ''), l.letter_date, l.finalized_at, l.show_visits
  from public.letters l join public.appointments a on a.id = l.appointment_id
  where l.appointment_id = p_id and l.is_final and l.final_body is not null and a.status <> 'cancelled'
    and (public.is_staff() or (a.firm_id = public.my_firm() and public.letter_released(a.id)))
$$;
revoke execute on function public.final_letter(uuid) from anon, public;
grant execute on function public.final_letter(uuid) to authenticated, service_role;
