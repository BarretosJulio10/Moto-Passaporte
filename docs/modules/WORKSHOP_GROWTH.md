# Oficina — Fase 5: crescimento comercial (PRD 2.1 §13, §18, §25)

Decisão: ADR-047. Migração `20261108201102_workshop_growth.sql` (reversão em `supabase/rollback/`). Testes: `tests/security/phase7e_workshop_growth_test.sql` (37 verificações) e `src/modules/workshop/growth/growth.test.tsx`.

## Telas

| Tela | Endereço | Quem |
|---|---|---|
| Perfil público (logo, fotos, marcas, serviços, horário, agendar, avaliações) | `/oficinas/:slug` | qualquer pessoa |
| Configuração do perfil público (logo e até 12 fotos, marcas, site, serviços/preços, horário por dia, agendamento) | `/oficina/:org/perfil` | responsável |
| Avaliações (resumo, responder, denunciar) | `/oficina/:org/avaliacoes` | membros veem; atendente responde; responsável denuncia |
| Campanhas (público, mensagem, lista de clientes com WhatsApp pronto, "Não quer receber") | `/oficina/:org/campanhas` | membros veem; atendente cria e contata |
| Avaliar o serviço | comprovante `/os/:token` | cliente com o link do comprovante |
| Moderação de avaliações | `/admin/avaliacoes` | admin |
| Agenda: pedidos "Pelo site" com confirmação pelo WhatsApp | `/oficina/:org/agenda` | atendente |
| Ficha do cliente: "Não quer receber campanhas" | `/oficina/:org/clientes/:id` | atendente |

## Regras

- **Perfil público** só com dados comerciais (`get_public_workshop`): nunca CNPJ, razão social, responsável, funcionários ou clientes. Preço do serviço só se a oficina ligar "mostrar valor" e o serviço for de preço fixo.
- **Fotos do perfil** no bucket privado `workshop-files`, conferidas pela Edge Function `attachment-check`; leitura sem conta liberada só para arquivos registrados em `workshop_public_photos` de oficina pública e ativa (política `workshop_files_select_public`). Fotos de OS nunca ficam públicas.
- **Avaliação**: só pelo link do comprovante (finalidade `receipt`, ativo) de OS concluída; uma por OS; nota 1–5, comentário opcional, autorização de publicação obrigatória; nome exibido "Primeiro I."; nota e comentário imutáveis. A oficina responde em público e o responsável pode denunciar; a denúncia **não esconde** a avaliação. Só o admin oculta ou mantém, com motivo na auditoria.
- **Agendamento público**: exige horário por dia e o agendamento ligado. Horários livres calculados pelo intervalo (30/60/90/120 min), capacidade por horário, antecedência mínima e máxima, no fuso de São Paulo. Pedido com nome, WhatsApp e consentimento; entra na Agenda como "Solicitado" (`source = 'publico'`) e avisa a equipe. Limites: 10 pedidos por conexão/hora, 3 pedidos em aberto por WhatsApp na mesma oficina.
- **Campanha**: público calculado na hora (sem voltar há N dias, com lembrete aberto, marca da moto, todos), só clientes ativos com WhatsApp e **sem** pedido de não receber; até 500 por campanha. Mensagem com `{nome}`, `{oficina}`, `{moto}` e o rodapé fixo de saída. A equipe abre o WhatsApp de cada cliente (não há envio em massa); contato fica em `workshop_contact_log` (motivo `campaign`).
- **WhatsApp oficial (preparação)**: `workshop_contact_log` ganhou `delivery_status` (`prepared` hoje; `queued/sent/delivered/read/failed` reservados), `provider` e `provider_message_id`, e o canal `whatsapp_api`. Nenhum envio automático existe; ver ADR-047.

## Funções (RPC)

| Função | Quem |
|---|---|
| `get_public_workshop(slug)` / `get_public_booking_slots(slug, dia)` / `request_public_appointment(slug, dia, hora, nome, whatsapp, moto, serviço, consentimento)` | qualquer pessoa (limite por conexão) |
| `submit_workshop_review(token, nota, comentário, nome, consentimento)` | quem tem o link do comprovante |
| `workshop_register_public_photo(org, caminho, logo|photo, legenda)` / `workshop_remove_public_photo` / `workshop_list_public_photos` | responsável / responsável / membro |
| `workshop_list_reviews(org)` / `workshop_reply_review` / `workshop_report_review` | membro / atendente / responsável |
| `admin_list_reviews(só_denunciadas)` / `admin_moderate_review(id, hide|keep|restore, motivo)` | admin |
| `workshop_save_campaign` / `workshop_close_campaign` / `workshop_list_campaigns` / `workshop_campaign_recipients` / `workshop_set_marketing_opt_out` | atendente (listar: membro) |

Avisos novos: `appointment_requested` (obrigatório para a equipe de atendimento) e `workshop_review` (opcional).
