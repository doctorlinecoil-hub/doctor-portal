-- A referrer kind for people who come directly (a patient, a family member, an insurer): the clinic books for them.
alter type public.referrer_kind add value if not exists 'private';
