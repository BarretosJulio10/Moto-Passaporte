-- Índices das colunas de autoria das autorizações (aviso de desempenho do Supabase).
create index motorcycle_workshop_access_decided_by_idx on public.motorcycle_workshop_access (decided_by);
create index motorcycle_workshop_access_ended_by_idx   on public.motorcycle_workshop_access (ended_by);
