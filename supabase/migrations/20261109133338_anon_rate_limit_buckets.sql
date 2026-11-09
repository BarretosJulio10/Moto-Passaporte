-- Corrige o controle de acessos anônimos (KI-047): as funções de orçamento, OS, vínculo do
-- cliente, página pública da oficina e agendamento usam categorias que a tabela recusava,
-- e todo acesso com cabeçalho de requisição (o site real) falhava com 23514.
alter table public.anon_rate_limits drop constraint anon_rate_limits_bucket_check;
alter table public.anon_rate_limits add constraint anon_rate_limits_bucket_check
  check (bucket in ('public_passport', 'shared_passport', 'quote_link', 'public_workshop', 'public_booking'));
