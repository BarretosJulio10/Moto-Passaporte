# PRD_CHECKLIST — Moto Passaporte

Conferência item a item do PRD v2.0 (`docs/PRD.md`). **Atualizar a cada entrega.**
Estados (PRD 17.2): `planejado` · `em desenvolvimento` · `implementado` · `testado` · `homologado` · `publicado`.
"(banco)" = só a parte de banco de dados; interface ainda pendente.

**Última conferência:** 09/11/2026 — v0.57.1
**Item atual na ordem:** Fase 6 → homologação e publicação (6.6)

## Progresso

Conta: item concluído = 1, parcial = 0,5, planejado = 0. Total de 40 itens nas 6 fases.
**Informar este quadro ao responsável a cada entrega** (protocolo, `PROJECT_MEMORY.md` §8).

| Fase | Itens | Feito | % |
|---|---|---|---|
| 1 — Fundação SaaS e site | 11 | 11 | 100% |
| 2 — Histórico e arquivos | 6 | 6 | 100% |
| 3 — Oficinas e autorizações | 7 | 7 | 100% |
| 4 — Transferência e compartilhamento | 5 | 5 | 100% |
| 5 — Monetização e Mercado Pago | 5 | 5 | 100% |
| 6 — Administração, segurança e lançamento | 6 | 5 | 83% |
| **Total** | **40** | **39** | **97,5%** |

Histórico: 0.7.0 = 45% · 0.8.0 = 47,5% · 0.9.0 = 48,8% · 0.10.0 = 53,8% · 0.11.0 = 56,3% · 0.12.0 = 58,8% · 0.13.0 = 62,5% · 0.14.0 = 67,5% · 0.15.0 = 72,5% · 0.16.0 = 75% · 0.17.0 = 76,3% · 0.18.0 = 82,5% · 0.19.0 = 83,8% · 0.20.0 = 85% · 0.21.0 = 86,3% · 0.22.0 = 87,5%.

**Fase 1: concluída (base)** em 06/11/2026. Pendências que não bloqueiam a Fase 2: ambientes de homologação/produção (KI-007), revisão jurídica de termos/privacidade, MFA para administradores (KI-014), criptografia do chassi (KI-002).

---

## Fase 1 — Fundação SaaS e site (PRD 22)

| # | Item | Seção PRD | Estado | Evidência |
|---|---|---|---|---|
| 1.1 | Estrutura do projeto, Git e ambientes | 16, 18, 20 | `implementado` (só dev) | Repositório; Supabase dev; Vercel publicando a `main` em https://moto-passaporte.vercel.app. Homologação/produção: KI-007 |
| 1.2 | Memória técnica e documentação inicial | 17 | `implementado` | `docs/` |
| 1.3 | Banco inicial, RLS e auditoria | 14, 15 | `testado` (Supabase dev) | 6 migrações; 71 testes no Supabase, 73 local |
| 1.4 | Papéis, organizações e controle de acesso | 2.3, 15.2 | `testado` (banco) | `user_roles`, `organizations`, `organization_members` |
| 1.5 | Cadastro de motocicleta, ID permanente | 5.2, 9 | `implementado` (banco testado no Supabase; tela com testes de componente) | `register_motorcycle`; tela `/painel/motos/nova` com tratamento de placa duplicada e limite do plano |
| 1.6 | QR Code e página pública com campos padrão | 9, ADR-008 | `implementado` | QR na página da moto (baixar PNG, copiar link); `/p/:publicId` sem placa/chassi/dono, `noindex` |
| 1.7 | Cadastro, login e recuperação de senha | 5.1, 15.1 | `implementado` (testes unitários e de tela OK) | Telas `/criar-conta`, `/entrar`, `/recuperar-senha`, `/redefinir-senha`. Falta: teste ponta a ponta com o Supabase real (KI-009) e URLs do Auth no Supabase (KI-012) |
| 1.8a | Identidade visual | 3.2 | `implementado` | `docs/DESIGN.md`, `src/index.css` |
| 1.8b | Site público: início, perguntas frequentes, contato (canais configuráveis), termos e privacidade (rascunho) | 3.3 | `implementado` | `/perguntas-frequentes`, `/contato` (`support_email`/`support_whatsapp` em `system_settings`). Termos/privacidade aguardam revisão jurídica |
| 1.9a | Painel do proprietário | 5.3 | `implementado` | "Minhas motos", página da moto (dados, placa e histórico, troca de placa, chassi mascarado, quilometragem, QR Code). Próximos registros e lembretes vêm na Fase 2 |
| 1.9b | Painéis base de oficina e admin | 6.1, 6.3, 7.1 | `implementado` (base) | Oficina: cadastro gratuito, painel, edição de perfil, perfil público `/oficinas/:slug`, troca de contexto. Admin: `/admin` com indicadores e atividade recente da auditoria |

## Fase 2 — Histórico e arquivos

| # | Item | Seção PRD | Estado |
|---|---|---|---|
| 2.1 | Linha do tempo | 5.4 | `implementado` — aba Histórico com filtros por categoria, origem, oficina e período; agrupada por ano |
| 2.2 | Registros de manutenção (`maintenance_records`, `maintenance_items`) | 5.4, 14.3 | `implementado` — banco testado (local 29, Supabase 26); tela de registro com peças, correção e anulação |
| 2.3 | Quilometragem | 5.6 | `implementado` — banco testado; tela com registro, alerta de leitura menor e correção documentada (antecipado na Fase 1) |
| 2.4 | Anexos e cotas (`attachments`, Storage privado) | 13 | `implementado` — bucket privado, cota de 100 MB e 10 MB por arquivo (configuráveis), registro só por RPC, links temporários; banco testado (local 22, Supabase 21); tela de envio no formulário e no cartão, com conferência do tipo real e redução de fotos |
| 2.5 | Origem dos registros | 5.5 | `implementado` — "informado pelo dono", "com comprovante" e "confirmado por oficina" (serviço registrado pela oficina autorizada, item 3.7) |
| 2.6 | Auditoria e diário básico (`motorcycle_diary`) | 5.7, 15.5 | `implementado` — auditoria `testado`; diário com privado/compartilhável, fotos, edição e exclusão pelo autor (ADR-013); banco testado (local 44, Supabase 27) e aba Diário |

**Fase 2: concluída** em 07/11/2026 (selo "confirmado por oficina" entregue com o item 3.7).

## Fase 3 — Oficinas e autorizações

| # | Item | Seção PRD | Estado |
|---|---|---|---|
| 3.1 | Cadastro gratuito de oficina | 6.1 | `implementado` — banco testado + tela (antecipado na Fase 1) |
| 3.2 | Perfil público da oficina | 6.1 | `implementado` — edição e página pública `/oficinas/:slug` |
| 3.3 | Pesquisa protegida por placa | 6.4 | `implementado` — antes da autorização revela só marca, modelo e ano; limite de 30 pesquisas/hora por pessoa e 100 por oficina; registro só com hash da placa; banco testado |
| 3.4 | Solicitação, aprovação e revogação (`motorcycle_workshop_access`) | 6.4, 6.6 | `implementado` — pedido pela placa, aprovação/recusa/revogação pelo titular, cancelamento pela oficina, histórico imutável, revogação imediata; aviso de pedido no painel do dono (notificação por e-mail e central: KI-020); banco testado (local 46, Supabase 22) |
| 3.5 | Oficina de Origem | 6.5 | `implementado` — pedido pela oficina ou definição pelo titular nos primeiros 30 dias, só com consentimento, uma por moto, revogável, título removível sem cortar acesso (ADR-014); banco testado (local 20, Supabase 13) |
| 3.6 | Membros da oficina e permissões | 6.2 | `implementado` — convite por link de uso único para o e-mail convidado (7 dias, só hash guardado), permissões por funcionário (pedir acesso; registrar serviços), promoção, remoção, saída; ninguém altera o próprio acesso; sempre um responsável; banco testado (local 44, Supabase 19) |
| 3.7 | Registro de serviços pela oficina | 6.7 | `implementado` — oficina autorizada com permissão registra serviço com peças, km, valor, observações e comprovantes; oficina e funcionário identificados; correção só pela própria oficina; histórico técnico visível à oficina, dados privados só dos próprios registros (ADR-015); banco testado (local 32, Supabase 15) |

**Fase 3: concluída** em 07/11/2026.

## Fase 4 — Transferência e compartilhamento

| # | Item | Seção PRD | Estado |
|---|---|---|---|
| 4.1 | Solicitação e aceite de transferência (`transfer_requests`) | 10 | `implementado` — pedido para o e-mail do comprador (7 dias), aceite/recusa pelo comprador, cancelamento pelo titular, aceite em uma transação, limite do plano de quem recebe (ADR-016); banco testado (local 42, Supabase 19) |
| 4.2 | Preservação do histórico | 10 | `testado` (banco) — triggers de imutabilidade |
| 4.3 | Encerramento de acessos anteriores | 10 | `implementado` — aceite encerra todas as autorizações (inclusive Origem) e cancela pedidos pendentes; antigo titular perde acesso; "Motos anteriores" para o próprio diário |
| 4.4 | Página pública controlada (`passport_shares`) | 11 | `implementado` — o titular escolhe o que mostrar; página `/c/:código` sem cadastro, fora de buscadores; página básica desativável (ADR-017); banco testado (local 36, Supabase 17) |
| 4.5 | Link e QR Code compartilhável e revogável | 11 | `implementado` — código de 192 bits, QR Code por link, validade opcional, revogação imediata, contagem de acessos, links do antigo dono encerrados na venda |

**Fase 4: concluída** em 07/11/2026.

## Fase 5 — Monetização e Mercado Pago

| # | Item | Seção PRD | Estado |
|---|---|---|---|
| 5.1 | Planos e preços configuráveis | 4, 7.4 | `implementado` — catálogo `subscription_plans` com histórico de versões; tela `/admin/planos`; site e "Meu plano" lendo do cadastro; limites de motos e espaço vêm do plano (ADR-018); banco testado (local 35, Supabase 19). Valores do Premium provisórios (P-1) |
| 5.2 | Integração Mercado Pago, assinaturas, Webhooks | 8 | `implementado` — conta no admin (ADR-019); assinatura avulsa pelo checkout do Mercado Pago, Webhook com assinatura HMAC e consulta à API, idempotência, conciliação manual (ADR-020). Testado com respostas simuladas (local 52, Supabase 17); **validação ponta a ponta com credenciais de teste pendente** (PRD 8.7, entra na homologação 6.6) |
| 5.3 | Histórico de pagamentos e faturas | 8.6 | `implementado` — faturas por ciclo com número, vencimento, tentativas e estado; recibo imprimível; histórico de tentativas; admin consulta (ADR-022); banco testado (local 20, Supabase 11) |

**Fase 5: concluída** em 07/11/2026 (validação ponta a ponta com o Mercado Pago pendente — KI-026).
| 5.4 | Cotas e benefícios Premium | 4.3, 13 | `implementado` — limites de motos, espaço e links seguem a assinatura; recursos configuráveis por plano; lembretes de manutenção (PRD 5.8) e relatório imprimível/PDF (PRD 5.9) (ADR-021); banco testado (local 48, Supabase 13). Valores provisórios (P-1) |
| 5.5 | Atraso, cancelamento, reativação | 8.5 | `implementado` — atraso com tolerância configurável, pausa, cancelamento com acesso até o fim do período, reativação por pagamento ou nova assinatura, reembolso/contestação encerram (políticas provisórias P-3/P-4) |

## Fase 6 — Administração, segurança e lançamento

| # | Item | Seção PRD | Estado |
|---|---|---|---|
| 6.1 | Dashboard e gestão administrativa | 7 | `implementado` — indicadores (7.1), usuários (7.2), oficinas (7.3), planos (7.4), pagamentos (7.5), auditoria com filtros (7.7) e configurações (7.8), com motivo e auditoria (ADR-023, ADR-024). Identidade visual e textos do site seguem no código (KI-028) |
| 6.2 | Resolução de pedidos de duplicidade | ADR-007 | `implementado` — solicitante acompanha, complementa e cancela o pedido sem ver a moto existente; admin analisa com contexto (moto, titular, idade da conta), responde, aprova/recusa com motivo auditado e pode avisar o titular atual de forma anônima para transferir (ADR-025). Sem transferência forçada (P-7); banco testado (local 23, Supabase 10) |
| 6.3 | Monitoramento de armazenamento | 7.6 | `implementado` — consumo total, por categoria, por origem, por conta (com cota), por moto e por oficina; envios em andamento × sem vínculo; alertas de limite configuráveis; limpeza só de arquivos sem registro fora da retenção, com motivo, histórico e auditoria, pela Edge Function `storage-cleanup` (ADR-026); banco testado (local 22, Supabase 10). Limpeza automática agendada pendente (KI-029) |
| 6.4 | Testes de segurança, integração, regressão, E2E | 19 | `testado` — 20 suítes de banco (regras, RLS, IDOR, arquivos, pagamentos) + varredura de segurança por catálogo (local e Supabase real: 0 violações); 174 testes de tela; 7 cenários ponta a ponta no navegador (visitante, proprietário, comprador, oficina, admin, bloqueios); `run_all.sh` para regressão (ADR-027). Fluxos com Supabase e Mercado Pago reais: roteiro em `HOMOLOGATION.md` (6.6, KI-009) |
| 6.5 | Backup, restauração e rollback testados | 18.4, 20 | `testado` — backup diário criptografado (age, chave privada só com o responsável) de dados, contas, metadados e arquivos pelo GitHub Actions; restauração "estrutura do Git + dados do backup" e rollback das migrações da Fase 6 testados de ponta a ponta em banco de teste (`restore_check.sh`, 13 verificações); manual em `OPERATIONS.md` (ADR-028). **Ativação** depende dos segredos no GitHub (responsável) |
| 6.6 | Homologação e publicação | 22 | `em homologação` — parte técnica feita em 08/11/2026 (tipos, 187 testes de tela, 9 cenários ponta a ponta, varredura de segurança no Supabase real sem violações, monitor ativo). Falta: roteiro do `HOMOLOGATION.md` com contas reais (proprietário, oficina, comprador, admin) e uma assinatura real de ponta a ponta (KI-026) |

## Complementos do PRD

| Complemento | Estado |
|---|---|
| 2.1 — Módulo Oficina | `publicado` — Fases 1 a 5.1 (100%) |
| 2.2 — Controle de Gastos | `publicado` — Fases A a C (100%) |
| 2.3 — Todos os veículos | `planejado` — guardado, só iniciar quando pedido (0%) |
| 2.4 — Planos: modelo cofre | `publicado` — Fases A a C (100%); revisão jurídica pendente (KI-044) |
| 2.5 — App da Pista | `publicado` (100% do plano); "conta da pista" em estudo |

## Pendências transversais

| Item | Referência |
|---|---|
| Teste ponta a ponta com Supabase real a partir do ambiente do Claude | KI-009 |
| MFA obrigatório para administradores | KI-014 |
| Criptografia do chassi | D-T3 / KI-002 |
| Ambientes de homologação e produção | KI-007 |
| Decisões de produto P-1 a P-11 (restantes) | `DECISIONS.md` |
