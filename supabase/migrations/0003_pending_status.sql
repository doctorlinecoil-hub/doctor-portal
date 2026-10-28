-- New appointment status: a referrer's request waits for the doctor's approval.
-- (A new enum value must be committed before it is used, so it lives in its own migration.)
alter type public.appt_status add value if not exists 'pending' before 'booked';
