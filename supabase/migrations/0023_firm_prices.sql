-- A price list per referrer: the doctor can agree on a different price for each service with each referrer.
create table if not exists public.firm_prices (
  firm_id uuid not null references public.firms(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  price numeric(10,2) not null check (price >= 0 and price < 1000000),
  updated_at timestamptz not null default now(),
  primary key (firm_id, service_id)
);
alter table public.firm_prices enable row level security;
drop policy if exists firm_prices_staff on public.firm_prices;
create policy firm_prices_staff on public.firm_prices for all to authenticated using (public.is_staff()) with check (public.is_staff());
revoke all on public.firm_prices from anon;
grant select, insert, update, delete on public.firm_prices to authenticated;

-- runs after the other "before" triggers (name order): when the price is the service's list price,
-- the referrer's own price replaces it. A price the clinic typed by hand is kept.
create or replace function public.appt_firm_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare fp numeric; lp numeric;
begin
  if new.service_id is null or new.firm_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.service_id is not distinct from old.service_id and new.firm_id is not distinct from old.firm_id then return new; end if;
  select price into fp from public.firm_prices where firm_id = new.firm_id and service_id = new.service_id;
  if fp is null then return new; end if;
  select price into lp from public.services where id = new.service_id;
  if not public.is_staff() or coalesce(new.price, 0) = 0 or new.price = coalesce(lp, -1) then
    new.price := fp;
  end if;
  return new;
end $$;
drop trigger if exists appointments_zz_firm_price on public.appointments;
create trigger appointments_zz_firm_price before insert or update of service_id, firm_id on public.appointments
  for each row execute function public.appt_firm_price();
