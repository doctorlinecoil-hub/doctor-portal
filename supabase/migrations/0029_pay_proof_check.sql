-- The system reads the transfer confirmation (amount, date, account) and compares it with what is owed;
-- the result helps the doctor decide. Additive.
alter table public.appointments add column if not exists pay_proof_check jsonb;
