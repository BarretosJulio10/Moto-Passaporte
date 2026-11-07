# CHANGELOG — Moto Passaporte

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versionamento semântico (`MAJOR.MINOR.PATCH`).

## [Não publicado]

### Operação
- Conta do responsável pelo produto recebeu o papel `admin` (inserção interna em `user_roles`, auditada).
- `support_whatsapp` configurado; a página de contato passa a exibir o WhatsApp.
- Primeiro cadastro real em produção confirmado de ponta a ponta (e-mail, perfil, aceite dos termos, papel).

## [0.15.0] — 07/11/2026 — Fase 4 concluída: compartilhamento controlado

### Adicionado
- Migração `passport_shares` (ADR-017): `passport_shares` (código de 192 bits, opções fixas, validade, revogação, contagem de acessos, auditada), `passport_settings` (página básica desativável), `create_passport_share`, `revoke_passport_share`, `get_motorcycle_shares`, `get_shared_passport` (sem cadastro; nunca expõe dados pessoais, chassi, observações, funcionários ou ids; vale só enquanto quem criou é o titular), `get_passport_settings`, `set_public_page_enabled`; `get_public_passport` respeita a página desativada.
- Página da moto: "Compartilhar com comprador" (criar link com nome, validade e o que mostrar; copiar, QR Code, ver como o comprador, revogar, links encerrados). QR Code da página básica com ativar/desativar.
- Página do comprador `/c/:código`: identificação, Oficina de Origem, resumo de evidências, quilometragem documentada, histórico com selos de origem, valores, tipos de comprovante e diário conforme escolhido; aviso de que não é laudo nem documento oficial.
- Perguntas frequentes atualizadas.
- Testes: banco 36 (local) + 17 (Supabase, transação desfeita); interface 120 no total (8 novos).

## [0.14.0] — 07/11/2026 — Fase 4: transferência do passaporte

### Adicionado
- Migração `transfers` (ADR-016): `transfer_requests` (imutável após a decisão, auditada), `create_transfer_request`, `cancel_transfer_request`, `reject_transfer_request`, `accept_transfer_request` (transação única: troca de titularidade ligada ao pedido, encerramento de todas as autorizações de oficina inclusive Origem, cancelamento de pedidos pendentes, limite do plano de quem recebe), `get_motorcycle_transfers`, `get_my_incoming_transfers`, `get_my_previous_motorcycles`. FK de `motorcycle_ownerships.transfer_id`.
- Página da moto: seção "Vendeu a moto?" com explicação do que acontece, confirmação, pedido em aberto e cancelamento.
- Painel: "Um passaporte foi transferido para você" (dados da moto, quem envia, data da compra, aceitar ou recusar) e "Motos anteriores", com acesso só de leitura ao próprio diário (resolve KI-019).
- Testes: banco 42 (local) + 19 (Supabase, transação desfeita); interface 112 no total (7 novos).

### Alterado
- Perguntas frequentes: resposta sobre venda da moto reflete a transferência disponível.

## [0.13.0] — 07/11/2026 — Fase 3 concluída: serviços registrados pela oficina

### Adicionado
- Migração `workshop_services` (ADR-015): `create_workshop_service` (origem "Confirmado por oficina", oficina e funcionário identificados, km como leitura da oficina, correção só pela própria oficina), `get_workshop_timeline` (histórico técnico; valor, observações, comprovantes e funcionário só dos próprios registros), `register_workshop_attachment` e `get_workshop_storage_usage` (cota de 500 MB por oficina), `maintenance_records.recorded_by_name`, `attachments.organization_id`. Envio e leitura de arquivos pela oficina autorizada; cota do titular não conta comprovantes da oficina.
- Interface da oficina: página da moto autorizada (`/oficina/:orgId/motos/:motoId`) com placa, última leitura e histórico; formulário "Registrar serviço" e correção; anexar comprovante nos próprios registros. Link "Abrir histórico" nas motos autorizadas.
- Titular vê "Registrado por" nos serviços da oficina.
- Textos do site atualizados (perguntas frequentes e painel da oficina) para o que já existe.

### Alterado
- Formulário de registro reaproveitado para a oficina (sem o campo de oficina em texto livre).
- Painel da oficina: seção "Chegando em breve" removida (tudo já disponível).
- Testes: banco 32 (local) + 15 (Supabase, transação desfeita); interface 105 no total (5 novos).

## [0.12.0] — 07/11/2026 — Fase 3: equipe da oficina

### Adicionado
- Migração `workshop_team`: permissões por membro (`can_request_access`, `can_register_services`), `has_org_permission`, convites (`organization_invites`: link de uso único para o e-mail convidado, 7 dias, só hash guardado, até 20 em aberto), `create_org_invite`, `revoke_org_invite`, `get_invite_preview`, `accept_org_invite`, `get_org_members`, `get_org_invites`, `update_org_member`, `remove_org_member`, `leave_organization`. Ninguém altera o próprio papel ou permissões; a oficina sempre mantém um responsável; membros não são excluídos (só removidos). Pesquisa e pedido de acesso passam a exigir a permissão.
- Interface: página **Equipe** da oficina (convidar com permissões, link para copiar ou enviar pelo WhatsApp, alterar papel e permissões, remover, convites em aberto, sair da oficina) e página de aceite do convite (`/convite/:token`). Painel da oficina esconde a pesquisa de quem não tem permissão.
- Testes: banco 44 (local) + 19 (Supabase, transação desfeita); interface 100 no total (8 novos).

## [0.11.0] — 07/11/2026 — Fase 3: Oficina de Origem

### Adicionado
- Migração `origin_workshop` (ADR-014): Oficina de Origem como autorização `origin`, uma ativa por moto, só nos primeiros 30 dias do passaporte (configurável); `request_workshop_access(..., p_origin)`, `decide_workshop_access(..., p_as_origin)`, `set_origin_workshop`; pesquisa e leitura do titular informam se a moto ainda aceita Origem.
- Oficina: opção "Ajudamos a criar este passaporte" ao pedir acesso; selo "Oficina de Origem" nas motos autorizadas.
- Titular: autorizar como Oficina de Origem, autorizar só o acesso ou recusar; definir ou tirar o título de uma oficina autorizada.
- Testes: banco 20 (local) + 13 (Supabase, transação desfeita); interface 92 no total (6 novos).

## [0.10.0] — 07/11/2026 — Fase 3: pesquisa por placa e autorizações

### Adicionado
- Migração `workshop_access`: `plate_search_log` (só hash da placa), `motorcycle_workshop_access` (pendente → autorizada/recusada/cancelada; autorizada → revogada/encerrada; nunca apagada; auditada), `search_motorcycle_by_plate`, `request_workshop_access`, `cancel_workshop_access_request`, `decide_workshop_access`, `revoke_workshop_access`, `get_motorcycle_workshop_access`, `get_my_pending_access_requests`, `get_workshop_access_list`, `workshop_has_access`. Limites configuráveis: 30 pesquisas/hora por pessoa, 100 por oficina, 20 pedidos/dia por oficina, 7 dias de espera após recusa.
- Migração `workshop_access_indexes` (aviso de desempenho do Supabase).
- Painel da oficina: pesquisa por placa (antes da autorização só marca, modelo e ano), pedido com mensagem, cancelamento, motos autorizadas com placa e última quilometragem, pedidos aguardando e histórico.
- Página da moto: seção "Oficinas com acesso" com autorizar, recusar, revogar (com confirmação) e histórico. Painel do dono avisa pedidos pendentes.
- Testes: banco 46 (local) + 22 (Supabase, transação desfeita); interface 86 no total (9 novos). Verificação visual em 360 e 1280 px.

## [0.9.0] — 07/11/2026 — Fase 2 concluída: diário da moto

### Adicionado
- Migração `diary`: `motorcycle_diary` (viagem, primeiro passeio, encontro, acessório, personalização, fotos, outro), privado ou compartilhável (ADR-013), `create_diary_entry`, `update_diary_entry`, `delete_diary_entry`, `delete_diary_photo`, view `motorcycle_diary_feed` (com fotos e `is_mine`, sem expor o autor). Auditoria só com metadados.
- Fotos do diário em `attachments` (`diary_entry_id`): só imagens, até 10 por entrada; leitura segue a visibilidade da entrada; apagadas de fato ao excluir.
- Storage: política de exclusão só para arquivo próprio sem registro (fotos removidas do diário e envios que falharam — reduz KI-017); envio e leitura com regras separadas.
- Cota não conta fotos de diário de outros autores.
- Interface: aba **Diário** da moto com filtro (todas, privadas, compartilháveis), entradas por ano, fotos, editar e excluir com confirmação; formulário com escolha de visibilidade explicada e fotos.
- Testes: banco 44 (local, com venda simulada) + 27 (Supabase, transação desfeita); interface 77 no total (10 novos). Verificação visual em 360 e 1280 px.

## [0.8.0] — 06/11/2026 — Fase 2: anexos e comprovantes

### Adicionado
- Migração `attachments`: bucket privado `attachments` (10 MB, JPG/PNG/WEBP/PDF), tabela `attachments` imutável e auditada, políticas do Storage por pasta da moto (só o dono atual envia e lê; sem troca nem exclusão), `register_attachment` (confere dono, pasta, arquivo enviado pelo próprio usuário, tipo, tamanho e cota), `get_storage_usage`. Cota gratuita de 100 MB e limite por arquivo em `system_settings`.
- `maintenance_timeline` passa a trazer os anexos e o `evidence_level` (oficina > comprovante > dono). O filtro "Origem" usa esse nível.
- Interface: comprovantes no formulário de registro e "Anexar comprovante" em cada registro; até 5 por registro; tipo sugerido pelo nome (nota fiscal, ordem de serviço, recibo, foto). Tipo real conferido pelos primeiros bytes; fotos reduzidas para até 2000 px em JPEG; espaço usado exibido. Miniaturas e abertura por links temporários de 10 minutos.
- Testes: banco 22 (local) + 21 (Supabase, transação desfeita); interface 67 no total (9 novos). Verificação visual em 360 e 1280 px.

### Alterado
- Testes de segurança renomeados com prefixo de ordem (`phase2a_`, `phase2b_`).

## [0.7.0] — 06/11/2026 — Fase 2: linha do tempo e manutenção

### Adicionado
- Migração `maintenance`: `maintenance_records`, `maintenance_items`, 17 categorias do PRD 5.4, `create_maintenance_record`, `void_maintenance_record`, view `maintenance_timeline`. Registros imutáveis com correção e anulação rastreáveis; km do serviço entra no histórico de quilometragem.
- Aba **Histórico** da moto: linha do tempo por ano, selos de origem, peças, valor, oficina, filtros (categoria, origem, oficina, período, versões antigas), corrigir e anular.
- Formulário de registro com sugestão de título pela categoria, peças dinâmicas (até 50) e valor em reais.
- Resumo da moto mostra os últimos registros; abas Resumo/Histórico.
- Testes: banco 29 (local) + 26 (Supabase, transação desfeita); interface 58 no total (11 novos). Verificação visual em 360 e 1280 px.

## [0.6.0] — 06/11/2026 — Fase 1 concluída (base)

### Adicionado
- Perguntas frequentes (`/perguntas-frequentes`), com recursos futuros indicados como "em breve".
- Contato (`/contato`) com canais vindos de `system_settings` (migração `contact_settings`).
- Área logada com troca de contexto: Minhas motos, Minha oficina, Administração (só para admin).
- Oficina: cadastro gratuito (`create_workshop`), painel, edição de perfil (especialidades, horário, descrição, visibilidade), perfil público `/oficinas/:slug`, botão de cadastro na página inicial.
- Administração (`/admin`): indicadores (usuários, motos, oficinas) e atividade recente da auditoria, protegido no banco por RLS.
- Validações: endereço público (slug), CNPJ com dígitos verificadores, telefone com DDD, UF.
- Testes: 47 no total (10 novos). Verificação visual com Supabase simulado, sem erros nem rolagem horizontal.

### Corrigido
- KI-012 (URLs de autenticação) configurado no Supabase.

## [0.5.0] — 06/11/2026

### Adicionado
- Painel do proprietário: cadastro de moto (`/painel/motos/nova`) com validação, placa duplicada → pedido de verificação, limite do plano.
- Página da moto (`/painel/motos/:id`): dados, placa atual e anteriores, troca de placa, chassi mascarado (mostrar/editar), quilometragem com alerta de leitura menor e correção documentada.
- QR Code do passaporte: baixar PNG, copiar link, abrir página pública.
- Passaporte público (`/p/:publicId`): só os campos padrão (ADR-008), aviso de não certificação, `noindex`.
- Módulos `motorcycles` (api, schemas, seções) e `sharing`; utilitários `core/shared` (formatação pt-BR, erros do banco).
- Testes: 37 no total (21 novos) — formatação, validações, erros do banco, tela de cadastro, página pública. Verificação visual com Supabase simulado em 360/390/1280 px, sem erros de console nem rolagem horizontal.
- KI-013 (página pública ainda não revogável — Fase 4).

### Infraestrutura
- Site publicado pela Vercel em https://moto-passaporte.vercel.app (deploy automático da `main`), conectado ao Supabase dev.

## [0.4.0] — 06/11/2026

### Adicionado
- Frontend (Fase 1): Vite + React 19 + TypeScript strict, Tailwind 4, React Router 7, TanStack Query, supabase-js tipado.
- Identidade visual (`docs/DESIGN.md`): paleta de passaporte, Archivo variável, peça central "passaporte de exemplo" com carimbos por origem do registro.
- Site público: página inicial, termos de uso e política de privacidade (rascunhos v0.1, revisão jurídica pendente), página 404.
- Autenticação: criar conta (com aceite de termos e metadados do banco), entrar, recuperar e redefinir senha; mensagens de erro em português; rota protegida.
- Painel do proprietário (base): saudação e lista "Minhas motos" a partir da view `my_motorcycles`.
- `vercel.json` (SPA, cabeçalhos de segurança).
- Testes: 16 (Vitest + Testing Library) — validações, tradução de erros, cadastro com Supabase simulado, página inicial. Verificação visual com Playwright em 360, 390 e 1366 px.
- ADR-011 (interface no repositório) e ADR-012 (Vercel).

### Corrigido
- KI-008 resolvido (instalação de pacotes liberada).
- Plano ordenado da interface da Fase 1 em `PROJECT_STATUS.md`.

## [0.3.1] — 06/11/2026

### Adicionado
- `docs/PRD_CHECKLIST.md`: conferência item a item do PRD por fase.
- Protocolo de trabalho obrigatório em `PROJECT_MEMORY.md` (seção 8): conferir o feito, seguir em ordem, sempre a partir do PRD.
- `docs/API_DOCUMENTATION.md`: contrato frontend ↔ Supabase (Auth, RPCs, view, erros, mensagens).
- `src/types/supabase.ts`: tipos TypeScript gerados do banco (verificados com `tsc --strict`).

## [0.3.0] — 06/11/2026

### Adicionado
- Migrações da Fase 1 aplicadas no Supabase dev (`ripgenhykaajcnzdxoid`).
- Migração `20261107003512_phase1_hardening.sql`: EXECUTE revogado das funções de trigger, políticas RLS com `(select auth.uid())`, 10 índices de chaves estrangeiras.
- Teste para Supabase real em transação desfeita: `tests/security/supabase/phase1_rls_test_rollback.sql` (71 verificações aprovadas).
- Decisões ADR-009 (região us-east-1) e ADR-010 (nomes de migração = versão no Supabase).

### Alterado
- Arquivos de migração renomeados para as versões registradas no Supabase.
- `tests/db/supabase_stub.sql`: colunas `aud` e `role` em `auth.users`.

### Rollback
- Banco sem dados de usuários: reverter = remover os objetos das migrações na ordem inversa. Nenhum dado a restaurar.

## [0.2.0] — 06/11/2026

### Adicionado
- Migrações da Fase 1 (`supabase/migrations/20261106000100` a `000500`): auditoria imutável, perfis e papéis, configurações do sistema, organizações e oficinas, motocicletas com ID permanente, histórico de placas, titularidade, chassi protegido, quilometragem com alerta de inconsistência, pedidos de verificação de duplicidade e passaporte público com campos padrão.
- Funções `register_motorcycle`, `change_motorcycle_plate`, `record_mileage`, `create_workshop`, `get_public_passport`.
- Testes de segurança `tests/security/phase1_rls_test.sql` (73 verificações aprovadas) e simulação do Supabase `tests/db/supabase_stub.sql`.
- Script `scripts/validation/run_db_tests.sh`.
- `docs/DATABASE.md` e `docs/SECURITY.md`.
- Decisões ADR-005 a ADR-008 (Git direto na main, 1 moto no gratuito, duplicidade por placa, campos públicos padrão).

### Rollback
- Banco ainda não aplicado em nenhum ambiente: nenhum rollback de dados necessário.

## [0.1.0] — 06/11/2026

### Adicionado
- PRD v2.0 em `docs/PRD.md`.
- Memória técnica `docs/PROJECT_MEMORY.md`.
- Registro de decisões `docs/DECISIONS.md` (ADR-001 a ADR-004 e decisões pendentes).
- `docs/PROJECT_STATUS.md` e `docs/KNOWN_ISSUES.md`.
- `README.md`, `.gitignore` e `.env.example` iniciais.
