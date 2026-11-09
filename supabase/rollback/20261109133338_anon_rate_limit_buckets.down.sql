-- Desfaz 20261109133338_anon_rate_limit_buckets (volta às 2 categorias originais).
delete from public.anon_rate_limits where bucket not in ('public_passport', 'shared_passport');
alter table public.anon_rate_limits drop constraint anon_rate_limits_bucket_check;
alter table public.anon_rate_limits add constraint anon_rate_limits_bucket_check
  check (bucket in ('public_passport', 'shared_passport'));
