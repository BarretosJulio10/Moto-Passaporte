# MOTO PASSAPORTE
# PRD COMPLEMENTAR — EVOLUÇÃO DO MÓDULO OFICINA

**Versão:** 2.1  
**Data:** 08/11/2026  
**Documento-base:** PRD_Moto_Passaporte_SaaS_v2.0.docx  
**Tipo:** Evolução incremental do produto  
**Módulo principal:** Moto Passaporte Oficina  
**Plataforma:** Lovable + React + TypeScript + Supabase + PostgreSQL  
**Modelo comercial:** Oficinas participantes gratuitas

---

# 1. OBJETIVO DESTA EVOLUÇÃO

Expandir o painel da oficina do Moto Passaporte, transformando-o em uma ferramenta completa de atendimento, organização e gestão operacional de oficinas de motocicletas.

O objetivo é fazer com que a oficina utilize o Moto Passaporte diariamente, não apenas para registrar manutenções no histórico das motocicletas, mas também para administrar seus clientes, elaborar orçamentos, obter aprovações, organizar ordens de serviço e acompanhar os trabalhos realizados.

O sistema deverá integrar todas essas operações ao conceito original do Moto Passaporte: construir um histórico permanente, organizado e documentado para cada motocicleta.

**Esta evolução NÃO deverá criar um novo sistema independente.**

Deverá ampliar a aplicação existente, reutilizando autenticação, banco de dados, organizações, motocicletas, autorizações, notificações, armazenamento e demais estruturas já implementadas.

## 1.1 Princípios obrigatórios

1. Preservar integralmente as funcionalidades existentes.
2. Manter as oficinas participantes gratuitas.
3. Não cobrar por orçamento, ordem de serviço ou registro de manutenção.
4. Cada oficina terá seus próprios clientes, funcionários, preços, serviços e atendimentos.
5. O proprietário continuará controlando o acesso à sua motocicleta.
6. Somente serviços efetivamente executados poderão ser registrados como manutenção concluída.
7. Todo aceite, alteração e conclusão deverá possuir rastreabilidade.
8. Nenhuma oficina poderá visualizar dados privados de outra oficina.
9. Toda funcionalidade deverá respeitar as regras de segurança e RLS do Supabase.
10. Toda alteração deverá ser documentada e versionada.

---

# 2. VISÃO GERAL DO NOVO MÓDULO

Criar uma área chamada:

**MOTO PASSAPORTE OFICINA**

O módulo deverá oferecer os seguintes recursos:

1. Dashboard da oficina.
2. Gestão de clientes.
3. Cadastro e identificação de motocicletas.
4. Solicitação e gestão de autorizações.
5. Orçamentos digitais.
6. Aprovação digital de orçamentos.
7. Ordens de serviço.
8. Catálogo de serviços.
9. Tabela de preços personalizada.
10. Catálogo de peças e produtos.
11. Agenda de atendimentos.
12. Checklist de entrada e saída.
13. Registro fotográfico.
14. Acompanhamento dos serviços.
15. Histórico de atendimentos.
16. Comunicação com clientes.
17. Envio de orçamentos e documentos por WhatsApp.
18. Lembretes de manutenção.
19. Controle básico de recebimentos.
20. Gestão de funcionários e permissões.
21. Perfil público da oficina.

Os módulos deverão ser independentes na implementação, mas integrados quando houver relacionamento entre as informações.

---

# 3. DASHBOARD DA OFICINA

Criar um painel inicial que apresente a situação operacional da oficina.

## 3.1 Indicadores principais

Exibir:

- Atendimentos do dia.
- Motocicletas aguardando diagnóstico.
- Orçamentos aguardando aprovação.
- Orçamentos aprovados.
- Ordens de serviço em execução.
- Serviços finalizados.
- Motocicletas aguardando retirada.
- Agendamentos futuros.
- Orçamentos vencidos ou sem resposta.
- Total de serviços realizados no período.

## 3.2 Atalhos rápidos

Disponibilizar:

- Novo atendimento.
- Pesquisar placa.
- Cadastrar cliente.
- Criar orçamento.
- Abrir ordem de serviço.
- Consultar agenda.
- Registrar manutenção.

## 3.3 Indicadores financeiros

Disponibilizar informações gerenciais:

- Valor total orçado.
- Valor aprovado.
- Valor em execução.
- Valor concluído.
- Valores recebidos.
- Valores pendentes.

Não confundir valor orçado com faturamento efetivamente recebido.

Permitir filtros por dia, semana, mês e período personalizado.

---

# 4. GESTÃO DE CLIENTES

Criar um módulo próprio para administrar os clientes da oficina.

## 4.1 Cadastro

Campos:

- Nome completo.
- Telefone.
- WhatsApp.
- E-mail.
- CPF, opcional e protegido.
- Endereço, opcional.
- Data de nascimento, opcional.
- Observações internas.
- Data do primeiro atendimento.
- Origem do cadastro.

## 4.2 Relacionamentos

Um cliente poderá possuir várias motocicletas.

Uma motocicleta poderá ter vários registros de atendimento ao longo do tempo.

O sistema deverá permitir:

- Consultar motocicletas relacionadas.
- Consultar orçamentos.
- Consultar ordens de serviço.
- Consultar pagamentos registrados.
- Consultar histórico de atendimentos.
- Registrar observações internas.
- Consultar serviços pendentes.
- Consultar últimos contatos.

## 4.3 Clientes sem Moto Passaporte

A oficina deverá poder utilizar o módulo de gestão mesmo quando o cliente ainda não possuir cadastro no Moto Passaporte.

Nesse caso:

1. A oficina cadastra o cliente.
2. Cadastra ou identifica a motocicleta.
3. Cria orçamento normalmente.
4. Envia o orçamento.
5. Pode convidar o cliente para criar sua conta no Moto Passaporte.

O sistema não deverá obrigar a criação de conta para receber ou aprovar um orçamento.

Quando o cliente criar sua conta, deverá existir um fluxo seguro para vincular o atendimento à motocicleta e ao proprietário correto.

Não permitir vinculação automática apenas por coincidência de placa ou telefone.

---

# 5. IDENTIFICAÇÃO E CADASTRO DE MOTOCICLETAS

Preservar o fluxo original de pesquisa por placa.

## 5.1 Pesquisa

A oficina informa a placa.

O sistema verifica se existe uma motocicleta correspondente, respeitando as proteções de privacidade e contra enumeração.

Se existir:

- Permitir solicitar autorização.
- Não revelar dados privados antes da autorização.
- Notificar o proprietário.
- Permitir aprovação ou rejeição.

Após aprovação, liberar apenas as informações necessárias às atividades autorizadas.

## 5.2 Motocicleta não cadastrada

Permitir cadastrar os dados necessários para realizar um atendimento.

Campos:

- Marca.
- Modelo.
- Versão.
- Ano.
- Cilindrada.
- Placa.
- Quilometragem.
- Cor.
- Fotografias.
- Observações.

O cadastro operacional da oficina não poderá criar automaticamente um passaporte definitivo ou assumir a titularidade da motocicleta.

Quando o proprietário criar seu passaporte, deverá existir um processo seguro de associação e validação.

## 5.3 Histórico de atendimento local

Mesmo sem autorização para consultar o passaporte, a oficina poderá manter seu próprio registro comercial de atendimento, respeitando a finalidade e a privacidade.

Esse registro não deverá ser apresentado como histórico oficial do Moto Passaporte.

---

# 6. MÓDULO DE ORÇAMENTOS

Este será um dos principais recursos do novo sistema.

Criar um gerenciador completo de orçamentos.

## 6.1 Criação de orçamento

Permitir iniciar um orçamento a partir de:

- Cliente cadastrado.
- Motocicleta cadastrada.
- Atendimento existente.
- Ordem de serviço em diagnóstico.

Cada orçamento deverá possuir:

- Número único.
- Oficina responsável.
- Cliente.
- Motocicleta.
- Data de emissão.
- Prazo de validade.
- Quilometragem informada.
- Descrição do problema.
- Diagnóstico informado.
- Serviços.
- Peças.
- Quantidades.
- Valores unitários.
- Descontos.
- Mão de obra.
- Valor total.
- Observações.
- Condições de pagamento.
- Prazo estimado de execução.
- Responsável pela elaboração.

## 6.2 Itens do orçamento

Cada item poderá ser classificado como:

- Mão de obra.
- Peça.
- Produto.
- Material.
- Serviço terceirizado.
- Outros.

Permitir adicionar vários itens.

Cálculo automático:

Quantidade × valor unitário = subtotal.

Total do orçamento = soma dos subtotais, descontos e demais ajustes aplicáveis.

Permitir desconto percentual ou em valor fixo, com registro do responsável pela alteração.

## 6.3 Orçamento profissional

Gerar uma apresentação profissional, com:

- Logotipo da oficina.
- Dados comerciais.
- Dados do cliente.
- Identificação da motocicleta.
- Número do orçamento.
- Lista detalhada dos itens.
- Valores.
- Total.
- Condições de pagamento.
- Validade.
- Observações.
- QR Code ou link para aprovação.
- Data e hora de emissão.

Permitir visualizar, imprimir e gerar PDF.

## 6.4 Status do orçamento

Criar os seguintes estados:

- Rascunho.
- Enviado.
- Visualizado.
- Aguardando aprovação.
- Parcialmente aprovado.
- Aprovado.
- Recusado.
- Expirado.
- Cancelado.
- Substituído por nova versão.

Toda alteração relevante deverá gerar uma nova versão ou revisão documentada.

Não modificar silenciosamente um orçamento que já foi enviado ou aprovado.

## 6.5 Reenvio

Permitir reenviar orçamento.

O sistema deverá preservar o histórico de envios, versões e respostas.

---

# 7. APROVAÇÃO DIGITAL PELO CLIENTE

Criar uma página de aprovação acessível por link seguro.

O cliente não deverá ser obrigado a instalar aplicativo ou criar conta para aprovar um orçamento.

## 7.1 Acesso

O link deverá possuir token imprevisível, escopo restrito e possibilidade de revogação ou expiração.

A página deverá apresentar:

- Identificação da oficina.
- Dados básicos da motocicleta.
- Número do orçamento.
- Serviços.
- Peças.
- Quantidades.
- Valores.
- Total.
- Condições.
- Prazo de validade.

## 7.2 Aprovação integral

Permitir que o cliente aprove todos os itens.

Exigir confirmação explícita antes de concluir.

## 7.3 Aprovação parcial

Permitir que o cliente selecione quais itens deseja autorizar.

Exemplo:

- Troca de óleo: aprovado.
- Troca de filtro: aprovado.
- Troca de relação: aprovado.
- Revisão de freios: recusado.

O total aprovado deverá ser recalculado automaticamente.

A oficina deverá receber notificação da decisão.

## 7.4 Recusa

Permitir recusar o orçamento integralmente.

Campo opcional para informar o motivo.

## 7.5 Registro de aceite

Registrar:

- Identificador do orçamento.
- Versão aprovada.
- Itens aprovados.
- Itens recusados.
- Valores aprovados.
- Identificação da pessoa que realizou o aceite.
- Data e hora.
- Evidência de autenticação ou confirmação.
- IP e informações técnicas estritamente necessárias.
- Versão dos termos apresentados.
- Identificador da sessão de aprovação.

O sistema deverá gerar um comprovante de aceite.

O aceite eletrônico deverá ser tratado como evidência documental da autorização comercial, sem afirmar automaticamente equivalência a uma assinatura qualificada ICP-Brasil.

A validade jurídica deverá ser revisada conforme o modelo de contratação e as exigências aplicáveis.

## 7.6 Alterações posteriores

Se a oficina precisar acrescentar serviços:

1. Criar orçamento complementar.
2. Identificar os novos itens.
3. Informar o motivo.
4. Enviar para nova aprovação.
5. Preservar o orçamento anterior.
6. Aguardar novo aceite.

Nunca considerar serviços adicionais aprovados apenas porque o orçamento inicial foi aceito.

---

# 8. MÓDULO DE ORDENS DE SERVIÇO

Orçamentos aprovados poderão ser convertidos em ordens de serviço.

## 8.1 Criação

Gerar OS automaticamente a partir do orçamento aprovado.

Permitir abertura manual para serviços que não necessitem de orçamento prévio, com registro da autorização aplicável.

Campos:

- Número da OS.
- Cliente.
- Motocicleta.
- Oficina.
- Responsável.
- Mecânico designado.
- Data de abertura.
- Quilometragem.
- Serviços autorizados.
- Peças.
- Prazo previsto.
- Observações.
- Fotografias.
- Checklist de entrada.

## 8.2 Status da OS

- Aberta.
- Aguardando diagnóstico.
- Aguardando aprovação.
- Aguardando peças.
- Aguardando execução.
- Em execução.
- Pausada.
- Aguardando serviço complementar.
- Concluída.
- Aguardando retirada.
- Entregue.
- Cancelada.

Registrar data, hora e responsável por cada mudança de status.

## 8.3 Acompanhamento

A oficina poderá visualizar todas as ordens de serviço em andamento.

Cada OS deverá apresentar:

- Serviços autorizados.
- Serviços executados.
- Serviços pendentes.
- Mecânico responsável.
- Observações técnicas.
- Fotografias.
- Peças utilizadas.
- Histórico de alterações.

## 8.4 Conclusão

Ao finalizar:

1. Conferir serviços realizados.
2. Registrar peças efetivamente utilizadas.
3. Informar quilometragem final.
4. Anexar fotografias.
5. Registrar observações.
6. Informar valores finais.
7. Registrar a entrega ao cliente.
8. Gerar comprovante de conclusão.

Não permitir finalizar como executado um serviço que tenha sido recusado ou que não tenha autorização válida.

---

# 9. CHECKLIST DE ENTRADA E SAÍDA

Criar formulários personalizáveis de inspeção.

## 9.1 Checklist de entrada

Permitir registrar:

- Estado da carenagem.
- Arranhões.
- Amassados.
- Retrovisores.
- Manetes.
- Pneus.
- Rodas.
- Faróis.
- Lanternas.
- Painel.
- Acessórios.
- Chaves entregues.
- Combustível aproximado.
- Quilometragem.
- Observações.

Permitir fotografias dos diferentes lados da motocicleta.

## 9.2 Confirmação do cliente

Disponibilizar documento para ciência do estado da motocicleta na entrada.

O cliente poderá confirmar eletronicamente o recebimento e as condições registradas.

## 9.3 Checklist de saída

Permitir conferir:

- Serviços realizados.
- Peças substituídas.
- Testes efetuados.
- Itens pendentes.
- Estado visual na entrega.
- Quilometragem final.
- Observações.

O checklist deverá ser associado à ordem de serviço.

---

# 10. CATÁLOGO DE SERVIÇOS E MÃO DE OBRA

Criar catálogo próprio para cada oficina.

## 10.1 Cadastro de serviços

Campos:

- Nome do serviço.
- Categoria.
- Descrição.
- Tempo estimado.
- Valor padrão.
- Tipo de cobrança.
- Ativo/inativo.
- Observações.

Categorias sugeridas:

- Motor.
- Lubrificação.
- Transmissão.
- Freios.
- Pneus.
- Suspensão.
- Elétrica.
- Injeção eletrônica.
- Arrefecimento.
- Embreagem.
- Revisões.
- Acessórios.
- Estética.
- Outros.

## 10.2 Preços personalizados

Cada oficina poderá definir preços por:

- Serviço.
- Marca.
- Modelo.
- Versão.
- Ano.
- Cilindrada.
- Faixa de cilindrada.
- Complexidade.

Não obrigar a oficina a utilizar todas as classificações.

## 10.3 Sugestão automática

Ao selecionar uma motocicleta e um serviço, o sistema deverá procurar o preço cadastrado mais específico.

Ordem sugerida:

1. Marca + modelo + ano + serviço.
2. Marca + modelo + serviço.
3. Faixa de cilindrada + serviço.
4. Serviço com valor padrão.
5. Preço informado manualmente.

A sugestão nunca deverá impedir edição manual autorizada.

## 10.4 Tabelas de referência

Permitir criar várias tabelas:

- Tabela padrão.
- Tabela promocional.
- Tabela para clientes especiais.
- Tabela de serviços rápidos.
- Tabela para motocicletas de alta cilindrada.

A oficina será responsável pelos preços praticados.

O Moto Passaporte não estabelecerá preços nacionais obrigatórios.

---

# 11. CATÁLOGO DE PEÇAS E PRODUTOS

Criar catálogo básico de peças.

Campos:

- Nome.
- Código interno.
- Categoria.
- Fabricante.
- Marca compatível.
- Modelos compatíveis.
- Valor de custo.
- Valor de venda.
- Unidade.
- Observações.
- Status.

Permitir adicionar peças diretamente aos orçamentos.

Preparar a arquitetura para controle de estoque futuro.

Não implementar integração obrigatória com fornecedores nesta versão.

---

# 12. AGENDA E AGENDAMENTOS

Criar calendário de atendimentos.

## 12.1 Funcionalidades

- Visualização diária.
- Visualização semanal.
- Visualização mensal.
- Cadastro de horários.
- Identificação da motocicleta.
- Cliente.
- Tipo de serviço.
- Responsável.
- Observações.

## 12.2 Status

- Solicitado.
- Confirmado.
- Aguardando chegada.
- Em atendimento.
- Concluído.
- Cancelado.
- Não compareceu.

## 12.3 Conversão

Permitir transformar agendamento em atendimento e ordem de serviço.

Preparar o sistema para futuros agendamentos públicos pelo perfil da oficina.

---

# 13. COMUNICAÇÃO E WHATSAPP

A comunicação deverá ser simples e integrada.

## 13.1 Compartilhamento por WhatsApp

Permitir enviar:

- Orçamentos.
- Orçamentos complementares.
- Links de aprovação.
- Ordens de serviço.
- Comprovantes de conclusão.
- Lembretes.
- Avisos de retirada.

## 13.2 Formas de envio

Preparar duas possibilidades:

**Opção A — Compartilhamento pelo WhatsApp**

Utilizar o compartilhamento por link ou abertura do WhatsApp com mensagem previamente preenchida.

Não exigir integração paga para o funcionamento básico.

**Opção B — Integração oficial**

Preparar arquitetura para integração com WhatsApp Business Platform ou provedor compatível.

Permitir envio automatizado, conforme credenciais, templates, consentimentos, limites e regras do provedor.

Não implementar envio automatizado não autorizado.

## 13.3 Link seguro

O cliente deverá acessar o documento por link individual.

Não colocar informações pessoais ou documentos privados diretamente na URL.

Permitir expiração, revogação e controle de acesso.

Registrar os eventos:

- Link criado.
- Mensagem preparada.
- Mensagem enviada, quando houver integração.
- Documento visualizado.
- Resposta recebida.

Distinguir abertura do WhatsApp de confirmação efetiva de envio ou entrega.

---

# 14. LEMBRETES E RECUPERAÇÃO DE CLIENTES

Criar recursos para ajudar a oficina a manter relacionamento.

## 14.1 Lembretes de manutenção

Permitir programar lembretes por:

- Quilometragem.
- Data.
- Intervalo de tempo.
- Próxima revisão.
- Recomendação do mecânico.

## 14.2 Recuperação comercial

Identificar:

- Orçamentos enviados e não aprovados.
- Clientes sem retorno.
- Revisões próximas.
- Serviços recomendados.
- Clientes que não retornaram no período configurado.

Permitir gerar uma mensagem de contato.

Não enviar campanhas automaticamente sem configuração e consentimento adequados.

---

# 15. CONTROLE FINANCEIRO BÁSICO DA OFICINA

Criar uma visão financeira operacional, sem transformar o módulo em um sistema contábil.

## 15.1 Lançamentos

Permitir registrar:

- Valor aprovado.
- Valor final.
- Valor recebido.
- Desconto.
- Forma de pagamento.
- Data do recebimento.
- Valor pendente.
- Observação.

## 15.2 Formas de pagamento

- Dinheiro.
- PIX.
- Cartão de débito.
- Cartão de crédito.
- Transferência.
- Outros.

## 15.3 Relatórios

- Serviços concluídos.
- Valores recebidos.
- Valores pendentes.
- Orçamentos aprovados.
- Vendas por período.
- Serviços mais realizados.

Os registros financeiros serão privados da oficina.

Não compartilhar informações financeiras da oficina com o proprietário da motocicleta além dos valores e documentos referentes ao próprio atendimento.

Não implementar emissão fiscal nesta etapa.

---

# 16. EQUIPE E FUNCIONÁRIOS

A estrutura multi-tenant existente deverá ser preservada.

O responsável da oficina poderá cadastrar funcionários.

## 16.1 Papéis sugeridos

**Administrador da oficina**

- Configura a oficina.
- Gerencia funcionários.
- Gerencia preços.
- Visualiza relatórios.
- Gerencia clientes e atendimentos.

**Atendente**

- Cadastra clientes.
- Agenda serviços.
- Cria orçamentos.
- Envia documentos.
- Acompanha aprovações.

**Mecânico**

- Consulta ordens atribuídas.
- Registra diagnóstico.
- Atualiza execução.
- Registra peças e fotografias.
- Finaliza etapas permitidas.

**Financeiro**

- Consulta valores.
- Registra recebimentos.
- Consulta relatórios financeiros.

Permitir permissões personalizadas quando necessário.

Cada funcionário deverá possuir usuário próprio.

Não compartilhar credenciais entre funcionários.

Toda ação deverá registrar o autor.

---

# 17. INTEGRAÇÃO COM O HISTÓRICO DO MOTO PASSAPORTE

Esta é a integração central do produto.

A gestão da oficina e o histórico da motocicleta precisam funcionar juntos, mas não podem ser confundidos.

## 17.1 Fluxo de integração

1. Cliente possui uma motocicleta cadastrada.
2. Autoriza a oficina.
3. Oficina abre atendimento.
4. Cria orçamento.
5. Cliente aprova.
6. Oficina executa.
7. Oficina finaliza a OS.
8. Sistema solicita ou realiza a criação do registro de manutenção, conforme as permissões.
9. Histórico da motocicleta recebe o registro concluído.
10. Proprietário recebe notificação.

## 17.2 Dados registrados no histórico

- Oficina responsável.
- Funcionário responsável.
- Data do serviço.
- Quilometragem.
- Categoria.
- Descrição.
- Serviços executados.
- Peças utilizadas.
- Fabricantes.
- Valor, quando permitido.
- Fotografias.
- Documentos.
- Ordem de serviço.
- Comprovante de conclusão.

## 17.3 Classificação dos registros

Preservar a classificação original:

- Informado pelo proprietário.
- Com comprovante.
- Confirmado por prestador.

O registro feito pela oficina deverá identificar sua origem e autoria.

Não afirmar que a plataforma certifica a qualidade ou a veracidade técnica do serviço.

## 17.4 Orçamento não é manutenção

Regras obrigatórias:

- Orçamento criado não gera manutenção.
- Orçamento enviado não gera manutenção.
- Orçamento aprovado não gera manutenção.
- Ordem de serviço aberta não gera manutenção concluída.
- Serviço finalizado e confirmado gera registro de manutenção, conforme o fluxo de conclusão.

Itens recusados não poderão aparecer como executados.

Itens parcialmente executados deverão ser identificados individualmente.

## 17.5 Correções

Registros confirmados não poderão ser alterados silenciosamente.

Correções deverão gerar eventos adicionais, preservando o conteúdo original, a autoria e a justificativa.

---

# 18. PERFIL PÚBLICO DA OFICINA

Ampliar o perfil público já previsto no PRD.

Permitir apresentar:

- Nome da oficina.
- Logotipo.
- Fotografias.
- Endereço comercial.
- Telefone.
- WhatsApp.
- Horário de funcionamento.
- Especialidades.
- Marcas atendidas.
- Serviços oferecidos.
- Descrição.
- Link de contato.

Preparar estrutura para avaliações de clientes, mediante regras de autenticidade e moderação.

Preparar estrutura para agendamentos públicos em evolução futura.

Não publicar dados pessoais de funcionários ou clientes.

---

# 19. ESTRUTURA DE DADOS E BANCO

Antes de criar tabelas, analisar o banco existente.

Reutilizar estruturas já disponíveis.

Não duplicar entidades que já possuem a mesma finalidade.

As tabelas adicionais deverão respeitar o multi-tenant existente.

Sugestão de entidades, sujeitas à análise técnica:

## 19.1 Atendimento e clientes

- `workshop_customers`
- `workshop_customer_motorcycles`
- `workshop_service_visits`

## 19.2 Orçamentos

- `workshop_quotes`
- `workshop_quote_versions`
- `workshop_quote_items`
- `workshop_quote_approvals`
- `workshop_quote_events`

## 19.3 Ordens de serviço

- `workshop_service_orders`
- `workshop_service_order_items`
- `workshop_service_order_events`
- `workshop_service_assignments`

## 19.4 Catálogos

- `workshop_service_catalog`
- `workshop_service_price_tables`
- `workshop_service_prices`
- `workshop_parts_catalog`
- `workshop_part_compatibilities`

## 19.5 Inspeções

- `workshop_checklists`
- `workshop_checklist_templates`
- `workshop_checklist_responses`
- `workshop_inspections`

## 19.6 Agenda

- `workshop_appointments`
- `workshop_business_hours`

## 19.7 Financeiro

- `workshop_transactions`
- `workshop_payment_records`

## 19.8 Comunicação

- `workshop_message_events`
- `workshop_document_shares`
- `workshop_reminders`

## 19.9 Regras de banco

Toda entidade deverá possuir:

- ID próprio.
- Organização responsável.
- Data de criação.
- Data de atualização.
- Autor de criação, quando aplicável.
- Status controlado.
- Relacionamentos e restrições apropriados.

Não confiar no `organization_id` enviado pelo frontend.

Validar a organização a partir da sessão e dos vínculos autorizados.

Utilizar transações nas operações críticas, principalmente:

- Aprovação de orçamento.
- Criação de ordem de serviço.
- Finalização de atendimento.
- Registro de manutenção.
- Atualização de permissões.

Criar índices para consultas frequentes.

---

# 20. SEGURANÇA E PRIVACIDADE

A expansão do módulo não poderá reduzir a segurança existente.

## 20.1 Isolamento entre oficinas

Uma oficina não poderá:

- Consultar clientes de outra oficina.
- Consultar orçamentos de outra oficina.
- Consultar ordens de serviço de outra oficina.
- Consultar preços de outra oficina.
- Alterar registros de outra oficina.
- Acessar documentos privados de outra oficina.

## 20.2 Segurança de aprovação

Os links de aprovação deverão:

- Utilizar tokens criptograficamente seguros.
- Ter validade configurável.
- Permitir revogação.
- Restringir acesso ao documento correspondente.
- Não expor IDs internos sensíveis.
- Impedir reutilização indevida de tokens.
- Registrar tentativas e decisões.
- Invalidar versões antigas quando substituídas, conforme a regra de negócio.

## 20.3 Arquivos

Orçamentos, fotografias, documentos e ordens de serviço deverão utilizar armazenamento protegido.

Utilizar buckets privados e URLs assinadas de curta duração.

Validar extensões, MIME, tamanho e conteúdo dos arquivos.

## 20.4 RLS

Criar políticas específicas para cada nova tabela.

Testar:

- Acesso entre oficinas.
- Acesso de funcionários.
- Acesso de proprietários.
- Acesso por links externos.
- Acesso após revogação.
- Tentativas de alterar IDs.
- Tentativas de acessar arquivos de outra organização.

## 20.5 LGPD

Aplicar minimização de dados.

Definir finalidade para os dados coletados.

Restringir acesso aos documentos.

Permitir atendimento aos direitos dos titulares.

Estabelecer política de retenção para documentos comerciais e registros históricos.

A revogação da autorização da oficina deverá bloquear novos acessos ao passaporte, sem apagar registros históricos já legitimamente produzidos.

O tratamento dos registros comerciais internos da oficina deverá possuir finalidade e política próprias, sem depender de autorização permanente para consultar o passaporte.

---

# 21. ORGANIZAÇÃO MODULAR DO CÓDIGO

Manter a arquitetura do PRD 2.0.

Expandir o módulo de oficina com separação por domínio.

Estrutura de referência:

`/src/modules/workshop/`

- `/dashboard`
- `/customers`
- `/motorcycles`
- `/visits`
- `/quotes`
- `/quote-approval`
- `/service-orders`
- `/service-catalog`
- `/price-tables`
- `/parts`
- `/checklists`
- `/appointments`
- `/finance`
- `/team`
- `/communications`
- `/reminders`
- `/public-profile`
- `/history-integration`

Serviços compartilhados deverão ficar em locais apropriados da arquitetura existente.

Não colocar todas as funcionalidades em um único componente.

Separar:

- Componentes de interface.
- Regras de negócio.
- Serviços.
- Consultas ao banco.
- Tipos.
- Validações.
- Hooks.
- Integrações.
- Testes.

Não reorganizar pastas existentes sem necessidade comprovada.

---

# 22. INTERFACE E EXPERIÊNCIA DO USUÁRIO

O painel deverá ser simples e funcional.

Priorizar a utilização em smartphones, tablets e computadores.

A oficina precisa conseguir criar um orçamento rapidamente, sem navegar por várias telas desnecessárias.

## 22.1 Navegação sugerida

Menu principal:

- Visão geral.
- Atendimentos.
- Clientes.
- Motocicletas.
- Orçamentos.
- Ordens de serviço.
- Agenda.
- Serviços e preços.
- Peças.
- Financeiro.
- Equipe.
- Perfil da oficina.
- Configurações.

## 22.2 Requisitos visuais

- Interface profissional.
- Hierarquia visual consistente.
- Cards alinhados.
- Formulários objetivos.
- Tabelas responsivas.
- Indicadores de status claros.
- Ações principais acessíveis.
- Confirmação antes de operações importantes.
- Mensagens de erro compreensíveis.
- Estados de carregamento.
- Estados vazios com orientação.
- Acessibilidade por teclado.

Não utilizar aparência genérica de template.

Não adicionar animações que prejudiquem a produtividade.

---

# 23. NOTIFICAÇÕES

Ampliar a central existente.

Eventos:

- Novo orçamento.
- Orçamento visualizado.
- Orçamento aprovado.
- Aprovação parcial.
- Orçamento recusado.
- Orçamento expirado.
- Novo orçamento complementar.
- Nova ordem de serviço.
- Mudança de status.
- Serviço concluído.
- Motocicleta pronta para retirada.
- Novo agendamento.
- Agendamento cancelado.
- Lembrete de manutenção.

Notificações deverão respeitar as preferências dos usuários.

Evitar notificações duplicadas.

Registrar o processamento de cada evento.

---

# 24. RELATÓRIOS

Criar relatórios operacionais para a oficina.

## 24.1 Relatórios comerciais

- Orçamentos criados.
- Orçamentos aprovados.
- Orçamentos recusados.
- Taxa de aprovação.
- Valor médio dos orçamentos.
- Serviços mais vendidos.

## 24.2 Relatórios operacionais

- Serviços realizados.
- Tempo médio de atendimento.
- Ordens em andamento.
- Serviços pendentes.
- Produtividade por funcionário.

## 24.3 Relatórios financeiros

- Valores recebidos.
- Valores pendentes.
- Serviços concluídos.
- Descontos concedidos.
- Recebimentos por período.

Permitir exportação em PDF e CSV, conforme permissões.

---

# 25. IMPLEMENTAÇÃO POR FASES

A implementação deverá ocorrer em etapas independentes.

Não tentar construir todo o módulo simultaneamente.

## FASE 1 — Atendimento e orçamento

Prioridade máxima.

- Dashboard básico.
- Cadastro de clientes.
- Cadastro operacional de motocicletas.
- Integração com autorização existente.
- Catálogo de serviços.
- Tabelas de preços.
- Criação de orçamento.
- PDF.
- Envio por WhatsApp.
- Página de aprovação.
- Aprovação integral e parcial.
- Histórico de versões.

**Resultado esperado:** a oficina já consegue atender um cliente e enviar um orçamento profissional.

## FASE 2 — Ordem de serviço

- Conversão de orçamento aprovado em OS.
- Gestão de status.
- Designação de mecânicos.
- Checklist de entrada.
- Fotografias.
- Registro de peças.
- Checklist de saída.
- Conclusão e comprovante.

**Resultado esperado:** a oficina consegue acompanhar o trabalho do início ao fim.

## FASE 3 — Histórico permanente

- Integração com histórico da motocicleta.
- Registro automático após conclusão válida.
- Anexos.
- Notificação ao proprietário.
- Auditoria.
- Histórico de correções.

**Resultado esperado:** o atendimento gera documentação permanente para a motocicleta.

## FASE 4 — Gestão da oficina

- Agenda.
- Catálogo de peças.
- Financeiro básico.
- Funcionários.
- Relatórios.
- Lembretes.
- Recuperação de clientes.

**Resultado esperado:** a oficina consegue organizar sua rotina diária.

## FASE 5 — Crescimento comercial

- Perfil público avançado.
- Avaliações.
- Agendamento público.
- Campanhas de relacionamento.
- Integração oficial com WhatsApp.
- Novas integrações comerciais.

**Resultado esperado:** o Moto Passaporte também se torna um canal de aquisição e relacionamento para as oficinas.

---

# 26. TESTES E CRITÉRIOS DE ACEITAÇÃO

Nenhuma fase poderá ser considerada concluída somente porque a interface foi construída.

Executar testes reais dos fluxos.

## 26.1 Orçamento

- Criar orçamento.
- Adicionar itens.
- Calcular valores.
- Aplicar desconto.
- Gerar PDF.
- Enviar link.
- Abrir link externamente.
- Aprovar integralmente.
- Aprovar parcialmente.
- Recusar.
- Expirar.
- Criar nova versão.
- Consultar histórico.

## 26.2 Ordem de serviço

- Converter orçamento aprovado.
- Impedir execução de item recusado.
- Adicionar serviço complementar.
- Solicitar nova aprovação.
- Atualizar status.
- Registrar fotografias.
- Concluir.
- Gerar comprovante.

## 26.3 Histórico

- Registrar serviço concluído.
- Verificar autoria.
- Verificar quilometragem.
- Verificar anexos.
- Verificar notificação.
- Garantir que orçamento não aprovado não apareça como manutenção.
- Garantir que serviços recusados não sejam registrados como executados.

## 26.4 Segurança

Criar testes com pelo menos duas oficinas diferentes.

Verificar que:

- Oficina A não acessa clientes da oficina B.
- Oficina A não acessa orçamentos da oficina B.
- Funcionário não executa ações não autorizadas.
- Proprietário não acessa dados financeiros privados da oficina.
- Link revogado não permite acesso.
- Token expirado não permite aprovação.
- Revogação de autorização bloqueia novas operações no passaporte.
- Registros anteriores continuam preservados.

## 26.5 Regressão

Testar também os módulos originais:

- Cadastro de usuário.
- Cadastro de motocicleta.
- QR Code.
- Histórico.
- Pesquisa por placa.
- Solicitação de autorização.
- Aprovação e revogação.
- Transferência de titularidade.
- Compartilhamento público.
- Assinaturas.
- Mercado Pago.
- Painel administrativo.

---

# 27. DOCUMENTAÇÃO E MEMÓRIA TÉCNICA

Preservar os documentos obrigatórios do PRD 2.0.

Atualizar:

- `/docs/PROJECT_MEMORY.md`
- `/docs/PROJECT_STATUS.md`
- `/docs/CHANGELOG.md`
- `/docs/VERSION_HISTORY.md`
- `/docs/ARCHITECTURE.md`
- `/docs/SECURITY.md`
- `/docs/DATABASE.md`
- `/docs/API_DOCUMENTATION.md`
- `/docs/DECISIONS.md`

Criar documentação específica:

- `/docs/modules/WORKSHOP.md`
- `/docs/modules/QUOTES.md`
- `/docs/modules/SERVICE_ORDERS.md`
- `/docs/modules/WORKSHOP_PRICING.md`
- `/docs/modules/WORKSHOP_HISTORY_INTEGRATION.md`
- `/docs/modules/WORKSHOP_APPROVALS.md`

Toda alteração deverá registrar:

- O que foi criado.
- O que foi alterado.
- Arquivos afetados.
- Tabelas afetadas.
- Migrações.
- Políticas RLS.
- Testes executados.
- Problemas encontrados.
- Soluções aplicadas.
- Pendências.
- Versão.
- Estratégia de rollback.

Nunca registrar como concluído algo que não foi implementado e testado.

---

# 28. INSTRUÇÕES OBRIGATÓRIAS PARA A IA DESENVOLVEDORA

Antes de iniciar a implementação:

1. Leia integralmente o PRD 2.0.
2. Leia `/docs/PROJECT_MEMORY.md`.
3. Leia `/docs/PROJECT_STATUS.md`.
4. Inspecione a estrutura atual do projeto.
5. Inspecione as tabelas existentes.
6. Inspecione as políticas RLS.
7. Identifique as funcionalidades já implementadas.
8. Identifique componentes e serviços reutilizáveis.
9. Identifique possíveis conflitos com os novos módulos.
10. Apresente um plano de implementação por fases.

**NÃO comece criando tabelas ou alterando arquivos antes de analisar o sistema existente.**

## 28.1 Preservação

Não substituir módulos existentes.

Não excluir tabelas.

Não recriar autenticação.

Não duplicar cadastro de motocicletas.

Não duplicar notificações.

Não modificar o funcionamento de assinaturas.

Não alterar a integração Mercado Pago.

Não remover regras de autorização.

Não enfraquecer RLS.

Não alterar funcionalidades que não fazem parte desta evolução.

## 28.2 Banco de dados

Toda migração deverá ser versionada.

Antes de alterações estruturais:

- Verificar dependências.
- Avaliar dados existentes.
- Identificar impacto.
- Criar backup quando necessário.
- Planejar reversão.
- Testar em ambiente de desenvolvimento.

Nenhuma alteração destrutiva em produção poderá ocorrer sem aprovação explícita.

## 28.3 Implementação progressiva

Implementar primeiro a Fase 1.

Após concluir, apresentar:

- Funcionalidades implementadas.
- Telas criadas.
- Tabelas criadas ou reutilizadas.
- Migrações.
- Políticas de segurança.
- Testes executados.
- Problemas pendentes.
- Atualização da memória técnica.

Aguardar validação antes de iniciar a próxima fase.

---

# 29. DECISÕES COMERCIAIS E REGRAS FIXAS

As seguintes regras ficam estabelecidas para esta evolução:

**1. Oficinas gratuitas**

A utilização do módulo de oficina continuará gratuita, incluindo orçamentos, aprovações, ordens de serviço, catálogo e registros de manutenção.

Não implementar bloqueios por quantidade de orçamentos ou motocicletas atendidas.

**2. Proprietários**

O modelo de assinatura do proprietário permanece conforme o PRD 2.0.

Não modificar preços, planos ou regras de cobrança nesta evolução.

**3. Dados históricos**

Os registros de manutenção pertencem à história da motocicleta e não à oficina.

A oficina mantém seus próprios documentos comerciais e operacionais, conforme as permissões e regras de retenção.

**4. Autorização**

O proprietário continua tendo controle sobre o acesso da oficina ao passaporte.

**5. Independência operacional**

A oficina poderá utilizar recursos de gestão comercial mesmo para clientes que ainda não possuem Moto Passaporte.

**6. Integridade**

Orçamento, aprovação, execução e registro histórico são etapas diferentes e deverão ser identificadas separadamente.

---

# 30. RESULTADO FINAL ESPERADO

Ao final desta evolução, o Moto Passaporte deverá oferecer dois grandes ambientes integrados:

## Para o motociclista

- Identidade digital da motocicleta.
- Histórico permanente.
- Quilometragem.
- Comprovantes.
- Documentos.
- Lembretes.
- Controle de oficinas autorizadas.
- Compartilhamento na venda.
- Transferência do passaporte.

## Para a oficina

- Gestão de clientes.
- Gestão de motocicletas.
- Orçamentos profissionais.
- Aprovação digital.
- Ordens de serviço.
- Catálogo de serviços.
- Tabelas de preços.
- Catálogo de peças.
- Agenda.
- Checklist.
- Fotografias.
- Comunicação.
- Financeiro básico.
- Histórico de atendimentos.
- Integração com o passaporte.

**O resultado deve ser um ecossistema no qual a oficina utiliza o Moto Passaporte para trabalhar e o motociclista utiliza o Moto Passaporte para preservar a história da sua moto.**

A oficina ganha produtividade e organização. O motociclista ganha transparência e documentação. A plataforma ganha recorrência, registros e crescimento orgânico.

---

# FIM DO PRD COMPLEMENTAR — VERSÃO 2.1

Documento complementar ao PRD_Moto_Passaporte_SaaS_v2.0.docx.

A versão 2.0 permanece como documento-base. Esta versão acrescenta os requisitos do módulo Oficina e deverá ser incorporada à documentação oficial do projeto sem apagar decisões anteriores.