-- Reversão do Premium de boas-vindas (ADR-049). Não tira o bônus de quem já recebeu (os registros em premium_grants
-- ficam e vencem sozinhos); só para de dar a contas novas. Para desligar sem reverter, ponha welcome_premium_days = 0.
drop trigger if exists profiles_welcome_premium on public.profiles;
drop function if exists public.profiles_welcome_premium(), public.grant_welcome_premium(uuid), public.welcome_premium_plan();
-- Recriar user_plan(uuid) e get_my_plan() como em 20261108165626_premium_passes.sql e setting_spec(text) como em
-- 20261107212126_storage_monitoring.sql; só então (sem bônus 'welcome' em vigor):
-- alter table public.premium_grants drop column source;
delete from public.system_settings where key = 'welcome_premium_days';
