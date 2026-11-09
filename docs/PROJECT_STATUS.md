# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.64.1
**Data:** 09/11/2026
**Fase:** Fases 1 a 4 concluídas. Fases 1 a 5 concluídas (Mercado Pago aguardando teste ponta a ponta). Fase 6 em andamento: painel administrativo
**Progresso geral:** PRD 2.0: 97,5% (39 de 40 itens — `PRD_CHECKLIST.md`). PRD 2.1 (módulo Oficina): Fases 1 a 5 e acabamento 5.1 concluídos (100%). PRD 2.2 (Gastos): Fases A, B e C concluídas (100%). PRD 2.3 (todos os veículos): guardado, não iniciado (0%). PRD 2.4 (modelo cofre): Fases A a C no ar (100%; falta revisão jurídica, KI-044). PRD 2.5 (App da Pista): no ar (100%, com conta da pista v0.58.0)

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | https://www.motopassaporte.com.br (Vercel, deploy automático da `main`) | Supabase `ripgenhykaajcnzdxoid` (MOTO_Passaporte, us-east-1, PG 17) | migrações até `admin_mfa_switch` aplicadas; Edge Functions `mercadopago-check`, `mercadopago-billing`, `mercadopago-webhook`, `storage-cleanup`, `scheduled-jobs`, `attachment-check`, `shared-file` e `push-send` publicadas; rotinas agendadas no pg_cron |
| Homologação | — | — | não configurado |
| Produção | — | — | não configurado |

## Andamento por fase

| Fase | Situação |
|---|---|
| 1 — Fundação SaaS e site | concluída (base) |
| 2 — Histórico e arquivos | concluída |
| 3 — Oficinas e autorizações | concluída: cadastro, perfil, pesquisa por placa, autorizações, Oficina de Origem, equipe e serviços da oficina |
| 4 — Transferência e compartilhamento | concluída: transferência, motos anteriores, compartilhamento controlado e revogável |
| 5 — Monetização | concluída: planos, conta do Mercado Pago, assinaturas, Webhook, conciliação, atraso, cancelamento, benefícios Premium e faturas (falta teste real com o Mercado Pago, KI-026) |
| PRD 2.1 — Oficina, Fase 1 (atendimento e orçamento) | concluída (v0.44.0): clientes, motos da oficina, catálogo, tabelas de preço, orçamentos com versões, WhatsApp, PDF, aprovação integral/parcial por link. validada pelo responsável em 08/11/2026 |
| PRD 2.1 — Oficina, Fase 2 (ordem de serviço) | concluída (v0.45.0): OS só com itens autorizados, status, mecânico, checklists, ciência do cliente, fotos, conclusão, comprovante e entrega |
| PRD 2.1 — Oficina, Fase 3 (histórico permanente) | concluída (v0.46.0): OS concluída gera registro no passaporte autorizado, fotos, correções |
| PRD 2.1 — Oficina, Fase 4 (gestão) | concluída (v0.47.0): agenda, peças, financeiro com permissão própria, lembretes e recuperação, relatórios |
| PRD 2.1 — Oficina, Fase 5 (crescimento comercial) | concluída (v0.48.0): perfil público avançado, avaliações com moderação, agendamento pelo site, campanhas; WhatsApp oficial preparado |
| PRD 2.1 — Oficina, Fase 5.1 (acabamento) | concluída (v0.49.0): cliente com conta ligada por link seguro, Meus atendimentos, avisos do §23, logotipo nos documentos |
| PRD 2.4 — Planos: modelo cofre | concluída (v0.56.0, ADR-056): 2 registros abertos por moto no gratuito, cofre por moto, exportação grátis, Termos 0.2 com aceite; `vault_enabled` ligado em produção e 7 contas avisadas |
| PRD 2.5 — App da Pista | concluída (v0.57.0, ADR-057): PWA `/pista` do mecânico, link no menu da oficina, áudio apagado em 90 dias; v0.57.1: janela de pedido de acesso de oficina |
| 6 — Administração e lançamento | em andamento: painel administrativo completo, verificação de placa, armazenamento, testes/regressão e backup/restauração; falta homologação e lançamento |

## Próximos passos (em ordem)

0. **Responsável:** validar o fluxo da oficina completo (Fases A a D, v0.59.0 a v0.61.0). Testar a conta da pista (criar um mecânico em Equipe e entrar pelo link `/pista/<código>`). Domínio `www.motopassaporte.com.br` no ar (v0.64.1). Próximo: login por digital (passkeys); religar MFA do admin (KI-043); PRD 2.3 quando pedido.
1. **Responsável:** percorrer o roteiro do `HOMOLOGATION.md` com contas reais (proprietário, oficina, comprador) e fazer uma assinatura real do plano mais barato (KI-026); o Claude acompanha pelo banco e corrige o que aparecer.
2. **Responsável:** cadastrar os segredos do backup no GitHub (OPERATIONS.md §2), ligar a proteção contra senhas vazadas (KI-021, exige plano Pro) e decidir sobre repositório privado (KI-031).
3. **Decisões antes de vender em escala:** nota fiscal de serviço (KI-027), revisão jurídica de Termos/Privacidade/LGPD, ambiente de produção separado (KI-007).
4. Depois do lançamento: ideias para oficinas (backlog de produto).

Feito em 08/11/2026: MFA do admin, e-mail de atendimento, contratação liberada com conexão testada, direitos do titular (v0.35.0), Premium por cortesia (v0.36.0), alerta ativo (v0.37.0) e homologação técnica.

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.
- Arquivos órfãos de envios que falharam — KI-017 (parcial).
- Pedidos de acesso avisados só no painel; sem CAPTCHA na pesquisa — KI-020.

## Último backup confirmado

Não aplicável — banco sem dados de usuários além da conta do responsável.
