-- The owner chose password-only sign-in for now. Two-step sign-in can be turned back on in Settings.
update public.settings set require_staff_mfa = false where id = 1;
