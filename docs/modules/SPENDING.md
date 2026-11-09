# Controle de Gastos (PRD 2.2) — Fase A "Ver gastos"

Decisões: ADR-050. PRD: `docs/PRD_v2.2_GASTOS.md`.

## O que existe
- **Página** `/painel/motos/:id/gastos`: filtros (período, categoria, oficina, origem, "incluir antes da compra", comparar com o ano anterior) gravados no endereço; total, média por mês, nº de serviços com valor; aviso dos serviços sem valor com link para "Corrigir".
- **Premium** (benefício `spending_insights`): mês a mês com comparação, por categoria e por oficina (clicar filtra). **Gratuito**: só total, média e contagem + painel de convite ao Premium.
- **Cartões**: "Gastos" na página da moto (ano e mês) e "Gastos com as motos" no painel (some se não há nada no ano).
- **Linha do tempo**: "N registros · R$ X" com os filtros escolhidos e link "Ver gastos" com o mesmo recorte.

## Regras de cálculo (iguais na linha do tempo e no banco)
- Conta o serviço **vigente**: não anulado e sem correção posterior. Correção de valor substitui o original.
- Sem valor (`service_value_cents` nulo) fica **fora da soma** e é contado à parte.
- Data = data do serviço. "Hoje" = maior entre a data de Brasília e a do servidor.
- **Desde a compra** (padrão): só corta quando a moto teve dono anterior; a data é `acquisition_date` ou o início da posse. Primeiro dono vê tudo.
- **Origem** segue a evidência da linha do tempo: oficina > com comprovante (tipo documento **ou com anexo**) > informado pelo dono.
- Média por mês = total × 30,4375 ÷ dias do período.

## Contrato (RPC, só `authenticated`)
- `get_spending_summary(p_motorcycle, p_from, p_to, p_scope 'ownership'|'all', p_category, p_workshop ('' = sem oficina), p_source, p_compare)` → `{entitled, scope, ownership_start, from, to, total_cents, entries, missing_values, monthly_average_cents, filters{categories, workshops}}` e, se Premium, `months[{month, cents, count, previous_cents}]`, `by_category`, `by_workshop`, `missing[≤20]`.
- `get_spending_snapshot(p_motorcycle | null)` → `{month_cents, year_cents, year_entries, year_missing, entitled}`.
- Internas (sem acesso direto): `sp_records`, `sp_ownership_start`.

## Testes
`tests/security/phase8b_spending_test.sql` (18 verificações); `src/modules/spending/spending.test.ts`.
