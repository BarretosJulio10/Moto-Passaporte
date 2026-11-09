# PRD 2.2 — Controle de Gastos da Moto

**Data:** 08/11/2026 · **Status:** aprovado em 08/11/2026 ("crie"), com as recomendações da seção 12 · **Complementa:** PRD 2.0 (base) e PRD 2.1 (Oficina), sem mudar regras deles.
Documento de aprovação (edição colaborativa): https://claude.ai/artifact/HVSrU4brJjyySq2snhovEY

## 1. Resumo e situação atual

O PRD 2.2 cria o **Controle de Gastos**: o dono vê quanto gastou com cada moto (total, por mês, por categoria, por oficina e por km rodado), usando os valores que já registra nos serviços e, opcionalmente, despesas que não são manutenção (combustível, seguro, IPVA).

**Objetivo:** responder em segundos "quanto essa moto me custa?" e "onde vai o dinheiro?", sem planilha.

**O que já existe (v0.50.0):**

- Cada serviço do histórico tem o campo opcional **Valor** (`service_value_cents`), preenchido pelo dono ou pela oficina ao publicar a OS.
- A linha do tempo filtra por categoria, origem, oficina e período, mas só **conta registros**; não soma valores.
- O relatório PDF (Premium) pode mostrar o valor de cada serviço, sem total.
- Não existe lugar para despesas fora da manutenção.

O histórico técnico continua permanente e imutável.

## 2. Escopo

**Dentro desta versão**

- Painel de gastos por moto e de todas as motos juntas.
- Totais com os mesmos filtros da linha do tempo (período, categoria, oficina, origem).
- Visão mês a mês e comparação com o ano anterior.
- Gasto por categoria e por oficina.
- Custo por km e média mensal; projeção do ano.
- Despesas avulsas (fora da manutenção), separadas do histórico técnico.
- Exportação em planilha (CSV) e total no relatório PDF.

**Fora desta versão**

- Ligação com banco, cartão ou leitura automática de nota fiscal.
- Consumo de combustível (km por litro) e alertas de gasto acima de uma meta.
- Gastos da oficina com a moto do cliente: isso é o financeiro da oficina (PRD 2.1 §15).
- Qualquer valor visível para oficina, comprador ou público sem o dono escolher.

## 3. Público e casos de uso

O público é o **dono da moto** (titular), no celular e no computador.

| Quem | Pergunta que responde | Onde |
| --- | --- | --- |
| Dono com uma moto | Quanto gastei este ano? Em quê? | Painel de gastos da moto |
| Dono com várias motos | Qual moto custa mais por mês? | Painel de todas as motos |
| Quem vai vender | Quanto investi em manutenção desde que comprei? | Total "desde a compra" + relatório PDF |
| Quem roda muito (trabalho, entrega) | Quanto custa cada km rodado? | Custo por km |
| Quem controla o orçamento | Este mês estou gastando mais que o normal? | Mês atual × média mensal |

## 4. Requisitos funcionais

1. **RF-01 Painel de gastos da moto** (`/painel/motos/:id/gastos`): total do período, quantidade de lançamentos, média mensal e aviso de quantos serviços estão sem valor.
2. **RF-02 Filtros:** período (este mês, últimos 3, 6 e 12 meses, este ano, ano anterior, desde a compra, tudo, ou datas livres), categoria, oficina, origem (dono, comprovante, oficina) e tipo (manutenção ou despesa avulsa). Os filtros ficam no endereço da página.
3. **RF-03 Mês a mês:** gráfico de barras por mês do período; com "comparar com o ano anterior", a barra do mesmo mês do ano anterior aparece ao lado, em cinza.
4. **RF-04 Por categoria:** total e percentual de cada categoria, do maior para o menor.
5. **RF-05 Por oficina:** total gasto em cada oficina, com a quantidade de serviços; serviços do dono sem oficina aparecem como "Feito por mim / sem oficina".
6. **RF-06 Custo por km:** gasto do período dividido pelos km rodados no período, com a fórmula explicada na tela.
7. **RF-07 Despesas avulsas:** lançar despesa com data, categoria, valor, descrição, km opcional e foto do comprovante opcional. Pode editar e apagar.
8. **RF-08 Todas as motos** (`/painel/gastos`): total geral, total por moto e os mesmos gráficos.
9. **RF-09 Total na linha do tempo:** com filtros, "N registros · R$ X" e atalho para o painel com o mesmo recorte.
10. **RF-10 Resumo no painel e na moto:** cartão "Gastos este ano" na página da moto e no painel inicial.
11. **RF-11 Exportar CSV:** lançamentos do recorte (data, tipo, categoria, descrição, oficina, km, valor), com `;` e acentos certos para o Excel.
12. **RF-12 Relatório PDF:** "Valores dos serviços" passa a incluir o total e o total por categoria. Despesas avulsas **não** entram no relatório.

## 5. Regras de cálculo

1. **O que soma:** serviços do histórico com valor informado e não anulados, mais despesas avulsas não apagadas. Serviço corrigido: vale só o valor da correção mais recente.
2. **Data que conta:** a data do serviço ou da despesa. Mês e ano no horário de Brasília.
3. **Serviço sem valor:** fora da soma; aparece no aviso "N serviços sem valor neste período", com atalho.
4. **Moto comprada de outra pessoa:** por padrão, só **desde a compra**. "Todo o histórico da moto" soma também os serviços anteriores; despesas avulsas do dono anterior nunca aparecem.
5. **Km rodados:** maior leitura do período menos a última leitura antes do início (ou a primeira do período). Leituras corrigidas ou abaixo da anterior são ignoradas. Menos de duas leituras ou menos de 100 km → "dados insuficientes".
6. **Média mensal:** total ÷ meses do período (mês atual só até hoje). "Desde a compra" e "Tudo" contam do primeiro lançamento.
7. **Projeção do ano:** gasto do ano ÷ dias passados × dias do ano; só com 90 dias de dados no ano, marcada como estimativa.
8. **Dinheiro:** centavos inteiros no banco; exibição em reais.
9. **Várias motos:** soma das motos ativas; moto transferida sai do total a partir da transferência.

## 6. Gratuito × Premium

| Função | Gratuito | Premium |
| --- | --- | --- |
| Total do ano e do mês na moto (RF-10) | Sim | Sim |
| Total na linha do tempo filtrada (RF-09) | Sim | Sim |
| Lançar despesas avulsas (RF-07) | Até 10 por mês | Sem limite |
| Painel completo: mês a mês, categorias, oficinas (RF-01 a RF-05) | — | Sim |
| Custo por km e projeção (RF-06) | — | Sim |
| Todas as motos juntas (RF-08) | — | Sim |
| Exportar CSV (RF-11) e total no PDF (RF-12) | — | Sim |

Quando o Premium acaba, nada é apagado. Benefício novo `spending_insights` na lista de benefícios dos planos, editável pelo admin. Vale também no Premium de boas-vindas.

## 7. Privacidade, segurança e LGPD

- Só o dono vê seus gastos. Oficina, comprador, link compartilhado e passaporte público nunca veem totais nem despesas avulsas.
- Valores de serviços para terceiros: só com "mostrar valores" ligado (regra atual).
- Despesas avulsas são pessoais: não entram no histórico, não passam na transferência, não aparecem no PDF.
- Banco com RLS e funções que conferem o dono; nenhuma chave secreta no site.
- LGPD: despesas na exportação "Meus dados" e apagadas com a conta. Despesa avulsa pode ser apagada; o histórico técnico segue imutável.
- Comprovante de despesa: mesmo envio conferido dos anexos, conta na cota do plano.
- É controle pessoal, não comprovação fiscal ou contábil.

## 8. Dados e banco (alto nível)

| Item | O que é |
| --- | --- |
| `owner_expenses` (nova) | Despesa avulsa: dono, moto, categoria, descrição, valor em centavos, data, km opcional, comprovante opcional, apagado em. RLS: só o próprio dono |
| Categorias de despesa | Combustível, seguro, IPVA e licenciamento, multa, estacionamento e pedágio, acessórios e equipamentos, lavagem e estética, financiamento e consórcio, outros |
| `get_spending_summary(...)` | Total, por mês, por categoria, por oficina, km rodados, custo por km, média, projeção, serviços sem valor; respeita o plano |
| `get_spending_entries(...)` | Lançamentos do recorte (tela e CSV) |
| `save_owner_expense` / `delete_owner_expense` | Grava e apaga despesa, conferindo dono, moto ativa e limite do gratuito |
| Benefício `spending_insights` | Novo item da lista de benefícios (ADR-037) |

Sem coluna nova em `maintenance_records`.

## 9. Telas e fluxos

| Tela | Endereço | Conteúdo |
| --- | --- | --- |
| Gastos da moto | `/painel/motos/:id/gastos` | Filtros; cartões Total, Média mensal, Custo por km; mês a mês; por categoria; por oficina; lançamentos; "Lançar despesa"; "Exportar CSV" |
| Gastos de todas as motos | `/painel/gastos` | O mesmo, com total por moto |
| Lançar ou editar despesa | formulário na tela | Data, categoria, valor, descrição, km, comprovante |
| Página da moto | `/painel/motos/:id` | "Gastos este ano: R$ X" |
| Painel inicial | `/painel` | "Gastos este mês / este ano" |
| Linha do tempo | `/painel/motos/:id/historico` | "N registros · R$ X" filtrada |

Fluxos: ver gastos pela moto; lançar despesa; completar valores pelo aviso de serviços sem valor (correção registrada); da linha do tempo filtrada ao painel; no gratuito, análise bloqueada com convite ao Premium. No celular, gráficos na largura toda e tabelas como listas.

## 10. Critérios de aceite e testes

- Total = soma manual em pelo menos 3 recortes; correção conta uma vez; anulado não conta; sem valor só no aviso.
- "Desde a compra" respeita a transferência; despesas do dono anterior nunca aparecem.
- Custo por km com "dados insuficientes" nos casos da regra 5.
- Ninguém além do dono vê totais ou despesas (teste de banco).
- Gratuito: totais simples, 10 despesas/mês, análise bloqueada no banco e na tela.
- Despesa apagada sai dos totais e fica na auditoria.
- CSV abre no Excel; total do CSV = total da tela.
- PDF com total e categorias só com "Valores dos serviços", nunca despesas avulsas.
- Telas no celular e no computador; gráficos com título para leitor de tela.
- Testes de banco, de tela e fumaça em produção desfeita.

## 11. Fases de entrega

| Fase | Entrega | Requisitos |
| --- | --- | --- |
| A — Ver gastos | Cálculo no banco sobre o histórico; painel da moto com filtros, mês a mês, categorias e oficinas; total na linha do tempo; cartões; gratuito × Premium | RF-01 a RF-05, RF-09, RF-10 |
| B — Despesas e custo por km | Despesas avulsas com comprovante; custo por km, média e projeção; todas as motos | RF-06 a RF-08 |
| C — Levar para fora | CSV; total e categorias no PDF; exportação LGPD | RF-11, RF-12 |

Validação do responsável ("continue") entre as fases.

## 12. Decisões (aprovadas com as recomendações)

1. Despesas fora da manutenção: **sim, na Fase B**.
2. Gratuito × Premium: como na seção 6.
3. Limite no gratuito: **10 despesas por mês**.
4. Moto comprada de outra pessoa: padrão **"desde a compra"**, com opção "todo o histórico".
5. Categorias de despesa: a lista da seção 8.
6. Ordem: **A → B → C**.
