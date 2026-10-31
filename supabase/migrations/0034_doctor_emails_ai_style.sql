-- Several addresses may get the clinic's notifications (comma separated), and the doctor's own
-- writing instructions for the AI, per document type ("all", "legal", "nii", "summary", "referral").
alter table public.settings drop constraint if exists settings_notify_email_check;
alter table public.settings add constraint settings_notify_email_check check (
  notify_email = '' or notify_email ~* '^[^@\s,]+@[^@\s,]+\.[^@\s,]+(\s*,\s*[^@\s,]+@[^@\s,]+\.[^@\s,]+)*$'
);
alter table public.settings add column if not exists ai_style jsonb not null default '{}'::jsonb;
