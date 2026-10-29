-- Appointments by phone: the doctor calls the patient at the booked time (no visit to the clinic).
alter table public.appointments add column if not exists mode text not null default 'clinic' check (mode in ('clinic', 'phone'));
alter table public.settings add column if not exists phone_appointments boolean not null default true;
