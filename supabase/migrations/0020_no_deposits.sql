-- Booking without deposits or payments: the doctor sends the cost himself.
alter table public.settings alter column deposit_amount set default 0;
update public.settings set deposit_amount = 0 where id = 1;
-- open requests that were waiting for a deposit: no longer (the doctor can approve them, nothing expires them)
update public.appointments set deposit_amount = 0
  where status = 'pending' and coalesce(deposit_amount, 0) > 0 and deposit_paid_at is null;
