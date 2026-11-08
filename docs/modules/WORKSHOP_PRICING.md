# Serviços e preços (PRD 2.1 §10)

- **Catálogo** por oficina: nome, categoria (motor, lubrificação, transmissão, freios, pneus, suspensão, elétrica, injeção eletrônica, arrefecimento, embreagem, revisões, acessórios, estética, outros), descrição, tempo estimado, valor padrão, tipo de cobrança (valor fechado, por hora, a partir de), ativo/inativo, observações.
- **Tabelas**: várias por oficina (padrão, promocional, clientes especiais…); uma é a padrão. O orçamento pode escolher outra.
- **Preços**: por serviço numa tabela, com critérios opcionais — marca, modelo (exige marca), ano de/até, cilindrada de/até, complexidade (simples, média, alta). Campo vazio vale para todos.

## Sugestão automática (`workshop_suggest_price`)

1. Tabela escolhida no orçamento, ou a padrão da oficina.
2. Regras do serviço nessa tabela cujos critérios preenchidos batem com a moto do orçamento.
3. A mais específica vence (pontos: modelo 2, ano 2, marca 1, cilindrada 1, complexidade 1; empate: maior preço). Na prática: marca+modelo+ano > marca+modelo > faixa de cilindrada > só marca.
4. Sem regra: valor padrão do serviço. Sem padrão: em branco ("sem preço cadastrado").

A sugestão nunca trava a edição. O Moto Passaporte não define preços; a oficina é responsável pelos valores.

Permissão para mexer: responsável ou funcionário com "Serviços e preços" (`can_manage_prices`, padrão desligado). Todos da equipe consultam.
