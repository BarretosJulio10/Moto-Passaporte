# Controle de Gastos (PRD 2.2) — Fases A e B

Decisões: ADR-050 (Fase A), ADR-051 (Fase B). PRD: `docs/PRD_v2.2_GASTOS.md`.

## O que existe
- **Página** `/painel/motos/:id/gastos`: filtros (período, categoria, oficina, origem, "incluir antes da compra", comparar com o ano anterior) gravados no endereço; total, média por mês, nº de serviços com valor; aviso dos serviços sem valor com link para "Corrigir".
- **Premium** (benefício `spending_insights`): mês a mês com comparação, por categoria e por oficina (clicar filtra). **Gratuito**: só total, média e contagem + painel de convite ao Premium.
- **Cartões**: "Gastos" na página da moto (ano e mês) e "Gastos com as motos" no painel (some se não há nada no ano).
- **Linha do tempo**: "N registros · R$ X" com os filtros escolhidos e link "Ver gastos" com o mesmo recorte.

## Fase B
- **Despesas avulsas** (`owner_expenses`): categorias combustível, seguro, IPVA e licenciamento, multa, estacionamento e pedágio, acessórios e equipamentos, lavagem e estética, financiamento e consórcio, outras. Data, valor, descrição, km e comprovante opcionais. Editar/apagar na lista de lançamentos.
- Pessoais: só quem lançou vê; fora do histórico, da transferência, do PDF e do link público. Comprovante em `expense-receipts/<usuário>/<uuid>.<ext>`, conta na cota.
- Gratuito: 10 despesas criadas por mês (`free_expenses_per_month`). Premium: sem limite.
- Premium: custo por km, projeção do ano (≥ 90 dias no ano), `/painel/gastos` com total por moto.
- Filtro "Tipo" (`tipo=servicos|despesas`). Oficina e origem só filtram serviços.

## Regras de cálculo (iguais na linha do tempo e no banco)
- Conta o serviço **vigente**: não anulado e sem correção posterior. Correção de valor substitui o original.
- Sem valor (`service_value_cents` nulo) fica **fora da soma** e é contado à parte.
- Data = data do serviço. "Hoje" = maior entre a data de Brasília e a do servidor.
- **Desde a compra** (padrão): só corta quando a moto teve dono anterior; a data é `acquisition_date` ou o início da posse. Primeiro dono vê tudo.
- **Origem** segue a evidência da linha do tempo: oficina > com comprovante (tipo documento **ou com anexo**) > informado pelo dono.
- Média por mês = total × 30,4375 ÷ dias do período.

## Contrato (RPC, só `authenticated`)
- `get_spending_summary(p_motorcycle | null, p_from, p_to, p_scope 'ownership'|'all', p_category, p_workshop ('' = sem oficina), p_source, p_compare, p_kind 'service'|'expense')` — Premium recebe também `km`, `cost_per_km_cents`, `year_projection_cents`, `year_to_date_cents`, `by_motorcycle` (sem moto); todos recebem `service_cents` e `expense_cents` → `{entitled, scope, ownership_start, from, to, total_cents, entries, missing_values, monthly_average_cents, filters{categories, workshops}}` e, se Premium, `months[{month, cents, count, previous_cents}]`, `by_category`, `by_workshop`, `missing[≤20]`.
- `get_spending_snapshot(p_motorcycle | null)` → `{month_cents, year_cents, year_entries, year_missing, entitled, expenses_left_this_month}`.
- `get_spending_entries(...mesmos filtros, p_kind, p_limit ≤ 2000)` → lançamentos (serviços e despesas) do recorte.
- `save_owner_expense(p_id | null, p_motorcycle, p_category, p_expense_date, p_value_cents, p_description, p_mileage, p_receipt_path, p_receipt_name, p_remove_receipt)` → `{id, remove_path}`; `delete_owner_expense(p_id)` → `{remove_path}`. O site apaga o arquivo indicado em `remove_path`.
- Internas (sem acesso direto): `sp_records`, `sp_ownership_start`, `sp_entries`, `sp_km`.

## Testes
`tests/security/phase8b_spending_test.sql`, `phase8c_spending_b_test.sql`; `src/modules/spending/spending.test.ts`, `Expenses.test.tsx`.
