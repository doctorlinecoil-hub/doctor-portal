-- An optional title the doctor types for the document (instead of the one that follows the letter type).
alter table public.letters add column if not exists doc_title text not null default '' check (length(doc_title) <= 200);
alter table public.letters add column if not exists final_doc_title text;

-- the final letter's "subject" column now carries that title (the old subject line is no longer printed)
create or replace function public.final_letter(p_id uuid)
returns table (letter_type public.referral_type, recipient text, subject text, body text, letter_date date, finalized_at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(l.final_letter_type, l.letter_type), coalesce(l.final_recipient, ''), coalesce(l.final_doc_title, ''),
         coalesce(l.final_body, ''), l.letter_date, l.finalized_at
  from public.letters l join public.appointments a on a.id = l.appointment_id
  where l.appointment_id = p_id and l.is_final and l.final_body is not null and a.status <> 'cancelled'
    and (public.is_staff() or (a.firm_id = public.my_firm() and public.letter_released(a.id)))
$$;
