-- ROLLBACK de 20261108162247_system_health (v0.37.0, ADR-038). Desligar também .github/workflows/monitor.yml.
begin;
drop function if exists public.system_health();
commit;
