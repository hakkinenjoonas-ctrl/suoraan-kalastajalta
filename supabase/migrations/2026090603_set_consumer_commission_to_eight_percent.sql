-- Consumer sales use an 8% platform commission calculated from the VAT-free
-- trade value. Existing orders retain the rate agreed when they were reserved.
alter table public.consumer_orders
  alter column commission_rate set default 0.08;

create or replace function public.apply_consumer_order_commission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.commission_rate := 0.08;
  else
    new.commission_rate := old.commission_rate;
  end if;
  new.commission_amount := round(new.net_trade_value * new.commission_rate, 2);
  return new;
end;
$$;

drop trigger if exists consumer_orders_apply_commission on public.consumer_orders;
create trigger consumer_orders_apply_commission
before insert or update of net_trade_value, commission_rate, commission_amount
on public.consumer_orders
for each row execute function public.apply_consumer_order_commission();
