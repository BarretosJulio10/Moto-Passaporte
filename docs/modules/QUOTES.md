# Orçamentos (PRD 2.1 §6)

## Ciclo

```
rascunho ──enviar──▶ enviado ──cliente abre──▶ visualizado ──▶ aprovado | aprovado em parte | recusado
    ▲                    │                          │
    └──nova versão◀──────┴──── (enviado, visualizado, recusado, vencido)
enviado/visualizado ──validade passou──▶ vencido        qualquer um (menos aprovado) ──▶ cancelado
aprovado/aprovado em parte ──▶ orçamento complementar (novo número, aponta o original, motivo obrigatório)
```

Situação da **versão**: rascunho → enviada → respondida | substituída por nova versão | cancelada.

## Regras

- Número único por oficina (`workshop_counters`), nunca reaproveitado.
- Só o rascunho é editável. Enviado = registro fixo (gatilho no banco). Mudança = nova versão com motivo; a anterior fica preservada e o link antigo deixa de valer.
- Itens: mão de obra, peça, produto, material, serviço terceirizado, outros. Subtotal = quantidade × unitário. Total = soma − desconto (% ou R$), sempre recalculado no servidor; quem mudou o desconto fica registrado.
- Validade padrão de 7 dias (configurável em `system_settings.workshop_quote_valid_days`, 1–90). Não aceita validade no passado.
- Reenviar gera um link novo e revoga o anterior; o conteúdo não muda.
- Complementar só depois de aprovado; a aprovação anterior não vale para itens novos (§7.6).

## Eventos registrados (`workshop_quote_events`)

criado, complementar criado, nova versão, desconto alterado, link criado/desativado, mensagem de WhatsApp preparada, impresso, cliente abriu, aprovado, aprovado em parte, recusado, vencido, cancelado — com autor (nome) e data. Imutáveis.

## Documento

Mesmo layout na tela, no PDF (impressão do navegador, A4) e no link do cliente: oficina (logo, CNPJ, endereço, contatos), número, versão, emissão, validade, cliente, moto, km, problema, diagnóstico, itens, subtotal, desconto, total, condições, prazo, observações, autor e QR Code do link. No celular, itens em lista; no computador e no PDF, em tabela.
