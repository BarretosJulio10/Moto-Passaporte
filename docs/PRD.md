# PRD — MOTO PASSAPORTE
## Documento unificado de requisitos do produto — Versão 2.0

**Produto:** Moto Passaporte  
**Categoria:** SaaS de identidade digital, histórico e documentação de motocicletas  
**Modelo de negócio:** Assinatura para proprietários; oficinas participantes gratuitas  
**Mercado inicial:** Brasil  
**Plataforma:** Site público + aplicação web responsiva com três áreas autenticadas  
**Stack prevista:** Lovable + React + TypeScript + Supabase  
**Pagamento e cobrança:** Mercado Pago  
**Status:** PRD consolidado para orientar análise, arquitetura e desenvolvimento  
**Documento-base:** PRD Moto Passaporte v1.0, consolidado com requisitos de SaaS, site, segurança, governança e versionamento.

---

> **Complemento — Versão 2.1 (08/11/2026):** a evolução do módulo Oficina (clientes, orçamentos, aprovação digital, ordens de serviço, catálogo, preços, agenda, checklist, financeiro básico, equipe e integração com o histórico) está em [`PRD_v2.1_OFICINA.md`](PRD_v2.1_OFICINA.md). A versão 2.0 continua sendo o documento-base; a 2.1 acrescenta requisitos sem apagar decisões anteriores.

> **Complemento — Versão 2.2 (08/11/2026):** Controle de Gastos da Moto (painel de gastos com filtros, mês a mês, categorias, oficinas, custo por km, despesas avulsas, exportação) está em [`PRD_v2.2_GASTOS.md`](PRD_v2.2_GASTOS.md). Implementação em 3 fases (A, B, C).

## Controle do documento

| Campo | Definição |
|---|---|
| Versão | 2.0 — consolidação e ampliação do PRD |
| Data | 06/11/2026 |
| Escopo desta revisão | SaaS, site institucional/comercial, painel do usuário, painel da oficina, painel administrativo, Mercado Pago, arquitetura modular, segurança, memória técnica e controle de versões |
| Regra de preservação | Os fluxos e regras de negócio da versão 1.0 permanecem válidos, exceto quando este documento os detalhar ou complementar expressamente |
| Complementos | v2.1 — Módulo Oficina (`PRD_v2.1_OFICINA.md`), 08/11/2026 · v2.2 — Controle de Gastos (`PRD_v2.2_GASTOS.md`), 08/11/2026 |
| Pendências | Decisões comerciais e operacionais listadas na seção “Decisões pendentes” |

## 1. Visão geral do produto

O Moto Passaporte será uma plataforma SaaS que cria uma identidade digital permanente para cada motocicleta, reunindo seu histórico de manutenção, revisões, quilometragem, peças, modificações, documentos e acontecimentos importantes.

O histórico acompanha a motocicleta, e não apenas a conta do proprietário atual. Quando a moto for vendida, o passaporte poderá ser transferido ao novo proprietário, preservando a trajetória documentada do veículo e a autoria dos registros anteriores.

A plataforma terá um site público moderno e explicativo, uma área autenticada para proprietários, uma área gratuita para oficinas participantes e um painel administrativo central para a operação do SaaS. Os dados de cada usuário e oficina deverão permanecer isolados conforme as permissões e os vínculos autorizados.

**Posicionamento:** “Moto Passaporte — A identidade digital e o histórico de vida da sua motocicleta.”

### 1.1 Problema que o produto resolve

Atualmente, o histórico de uma motocicleta costuma ficar espalhado em notas fiscais, recibos, conversas de WhatsApp, fotografias, anotações pessoais, ordens de serviço em papel e sistemas particulares de oficinas. Quando a motocicleta é vendida, parte dessas informações se perde.

O Moto Passaporte centraliza os registros em uma linha do tempo organizada, com indicação da origem das informações, anexos e controle de compartilhamento.

### 1.2 Proposta de valor

**Para o proprietário:** histórico organizado; registro de manutenções; comprovantes e fotografias; acompanhamento de quilometragem; lembretes; compartilhamento na venda; preservação da história após a troca de proprietário.

**Para a oficina:** ferramenta gratuita de registro; documentação dos serviços; comprovação do trabalho informado; perfil público; relacionamento com clientes; histórico dos atendimentos autorizados.

**Para o comprador:** consulta gratuita ao conteúdo que o vendedor decidiu compartilhar, sem exigir assinatura ou cadastro para a consulta pública básica.

### 1.3 Princípios do produto

1. A identidade interna da motocicleta é permanente e independente de placa ou proprietário.
2. O histórico não pode ser apagado ou alterado silenciosamente por uma troca de proprietário.
3. A origem dos registros deve ser identificável: proprietário, oficina ou documento/comprovante.
4. O proprietário controla as autorizações de acesso, respeitando o vínculo de Oficina de Origem enquanto não for revogado.
5. Oficinas participantes utilizam o painel sem mensalidade e sem cobrança por registro ou motocicleta atendida.
6. O produto documenta informações; não certifica automaticamente procedência, qualidade mecânica ou condição do veículo.
7. A segurança deve ser aplicada no backend e no banco de dados, não apenas na interface.
8. Toda mudança técnica relevante deve ser documentada e versionada.

## 2. Modelo SaaS, contas e isolamento de dados

O Moto Passaporte será operado como Software as a Service (SaaS): uma única plataforma mantida pelo operador do produto, utilizada por múltiplos usuários e oficinas, com contas, permissões, dados e configurações isolados.

### 2.1 Conceito de multi-tenant

- A plataforma central é compartilhada, mas os dados privados de cada usuário e organização devem ter escopo de acesso próprio.
- Cada oficina cadastrada será uma organização/tenant operacional, com seus próprios membros, perfil, atendimentos, documentos e configurações.
- O proprietário pessoa física terá dados privados vinculados à sua conta e à titularidade atual das motocicletas.
- Uma motocicleta não pertence tecnicamente à oficina. Ela possui identidade própria e titularidade atual; a oficina só acessa os dados permitidos enquanto houver autorização ativa.
- Compartilhamentos entre proprietário e oficina serão feitos por vínculos explícitos e revogáveis.
- Uma conta poderá, futuramente, participar de mais de uma organização ou acumular mais de um contexto de uso. A autorização deverá considerar o usuário, a organização, o recurso e a ação.

### 2.2 Isolamento obrigatório

1. Uma oficina não pode consultar dados privados de outra oficina.
2. Uma oficina não pode consultar motocicletas sem autorização ativa ou vínculo de origem ativo.
3. Proprietários não podem consultar dados privados de outros proprietários.
4. Usuários comuns não podem acessar funções administrativas.
5. O painel administrativo não deve conceder acesso irrestrito por padrão; consultas de suporte a dados privados devem ter finalidade, autorização interna, registro de auditoria e escopo mínimo.
6. Todas as consultas e mutações devem validar o escopo no servidor e no banco, incluindo RLS do Supabase.
7. IDs imprevisíveis não substituem autorização: toda operação deve validar se o ator pode acessar aquele registro.

### 2.3 Papéis e permissões

| Perfil | Finalidade | Permissões principais |
|---|---|---|
| Visitante | Usuário não autenticado | Navegar no site, conhecer planos, consultar passaporte compartilhado e páginas públicas autorizadas |
| Proprietário/usuário | Pessoa que possui ou administra uma motocicleta | Cadastrar motos conforme plano, gerir histórico permitido, anexos, lembretes, oficinas, compartilhamento, assinatura e transferência |
| Responsável da oficina | Administrador de uma organização oficina | Gerenciar perfil e membros, consultar motos autorizadas, registrar serviços e acompanhar atendimentos |
| Funcionário da oficina | Membro de uma oficina | Executar apenas as ações concedidas pelo responsável e permitidas pelo proprietário |
| Administrador da plataforma | Operador interno do SaaS | Gerenciar usuários, oficinas, planos, pagamentos, suporte, configurações, auditoria e operação global com acesso controlado |

O papel administrativo deverá ser concedido exclusivamente por processo interno seguro, nunca pelo próprio usuário. A mesma identidade poderá acessar mais de um contexto quando receber as permissões correspondentes. A interface deverá permitir alternar de contexto sem misturar dados ou permissões.

## 3. Site público moderno e explicativo

O projeto deverá incluir um site institucional/comercial completo, separado visual e logicamente das áreas autenticadas. O site será a principal porta de entrada do SaaS e deverá explicar o produto de maneira simples, visual e convincente, sem exigir conhecimento técnico do visitante.

### 3.1 Objetivos do site

- Explicar o que é o Moto Passaporte e como funciona.
- Demonstrar o valor de manter o histórico da motocicleta organizado e transferível.
- Mostrar benefícios específicos para proprietários e oficinas.
- Explicar a autorização de oficinas e o controle do proprietário.
- Apresentar planos e preços vigentes, sem valores fixos no código.
- Converter visitantes em cadastros e assinaturas.
- Facilitar o cadastro gratuito de oficinas.
- Responder dúvidas sobre histórico, privacidade, transferência e cobrança.
- Dar acesso a login, cadastro, suporte, termos e política de privacidade.

### 3.2 Direção visual e experiência

O site deve ter aparência atual, profissional, confiável e responsiva. Utilizar identidade visual consistente, boa hierarquia tipográfica, imagens reais ou ilustrações coerentes com motocicletas, animações discretas e carregamento rápido. Evitar excesso de efeitos, textos longos em blocos densos, elementos desalinhados, aparência genérica de template e promessas que o produto não consegue garantir.

Requisitos de interface:

- Layout responsivo com prioridade para celular.
- Navegação clara e menu simples.
- Cabeçalho com marca, links principais e botões “Entrar” e “Criar conta”.
- Chamadas para ação visíveis para proprietário e oficina.
- Cards, botões, formulários e seções com alinhamento consistente em todas as páginas.
- Contraste, foco por teclado, textos alternativos e acessibilidade compatível com boas práticas WCAG 2.2 AA, na medida aplicável.
- SEO técnico: títulos, descrições, URLs legíveis, sitemap, robots, metadados sociais e dados estruturados quando adequados.
- Otimização de imagens, fontes e scripts; monitoramento de desempenho.
- Aviso de cookies e gestão de consentimento quando houver cookies ou tecnologias não essenciais sujeitos a consentimento.

### 3.3 Estrutura mínima de páginas públicas

1. **Página inicial:** proposta de valor, explicação curta, benefícios, como funciona, chamadas de cadastro e planos.
2. **Como funciona:** passos para criar passaporte, registrar serviços, autorizar oficinas, compartilhar e transferir para novo proprietário.
3. **Para motociclistas:** benefícios, linha do tempo, lembretes, quilometragem, comprovantes e venda da moto.
4. **Para oficinas:** uso gratuito, cadastro, pesquisa por placa, autorização, registro de serviços e perfil público.
5. **Planos e preços:** comparação clara entre gratuito e Premium, periodicidades, limites, renovação e cancelamento.
6. **Perguntas frequentes:** privacidade, QR Code, troca de placa, transferência, oficinas, assinatura, Mercado Pago, cancelamento e acesso do comprador.
7. **Entrar e criar conta:** formulários simples e seguros.
8. **Contato/suporte:** canais e formulário protegido contra abuso.
9. **Termos de uso e política de privacidade:** páginas versionadas e acessíveis.
10. **Passaporte compartilhado:** página pública controlada, com apenas os dados selecionados pelo proprietário.

### 3.4 Conteúdo e mensagens

O site deve deixar claro que o Moto Passaporte registra a história documentada da motocicleta. Não deve afirmar que verifica automaticamente a procedência, certifica a condição mecânica, substitui laudo, consulta bases oficiais ou garante a veracidade de todo dado inserido.

Exemplos de mensagens permitidas:

- “A história da sua moto organizada em um só lugar.”
- “O histórico acompanha a motocicleta quando ela muda de proprietário.”
- “Autorize as oficinas que podem consultar e registrar serviços.”
- “Oficinas participantes utilizam a plataforma gratuitamente.”

Não apresentar valores, benefícios, limites ou serviços que não estejam configurados e disponíveis na plataforma.

## 4. Modelo de negócio e planos

A receita será baseada principalmente nos proprietários das motocicletas. As oficinas participantes permanecerão gratuitas conforme definido no PRD original.

### 4.1 Planos iniciais propostos

| Plano | Valor proposto | Equivalente mensal aproximado |
|---|---:|---:|
| Mensal | R$ 9,90 | R$ 9,90 |
| Semestral | R$ 49,90 | R$ 8,32 |
| Anual | R$ 89,90 | R$ 7,49 |

Os valores são propostas comerciais iniciais e devem ser confirmados antes do lançamento. O painel administrativo deverá permitir configurar preço, periodicidade, desconto, cotas, benefícios e disponibilidade sem alteração de código.

### 4.2 Plano gratuito

- Cadastro de uma motocicleta, conforme limite configurável.
- Identidade digital.
- Histórico básico.
- Registros essenciais.
- Consulta do histórico próprio.
- Recebimento de solicitações de oficina.
- Compartilhamento autorizado.
- Limite de armazenamento definido pelo administrador.

### 4.3 Plano Premium

- Histórico completo e recursos adicionais de organização.
- Maior espaço para anexos.
- Relatórios em PDF.
- Lembretes de manutenção.
- Recursos avançados de compartilhamento.
- Benefícios futuros liberados conforme configuração do plano.

### 4.4 Oficinas gratuitas

Não haverá mensalidade, cobrança por registro, cobrança por motocicleta atendida ou cobrança para manter o perfil básico de oficina participante. Recursos futuros pagos para oficinas só poderão ser incluídos mediante decisão comercial explícita e atualização deste PRD.

### 4.5 Consulta pública por comprador

A consulta do conteúdo que o proprietário decidiu compartilhar deverá ser gratuita e não exigirá cadastro para o acesso público básico.

## 5. Painel do proprietário/usuário

O painel do usuário é a área autenticada destinada ao proprietário da motocicleta. Deve funcionar em celular, tablet e computador, com foco em clareza, facilidade de uso e acesso rápido às motos e ao histórico.

### 5.1 Cadastro e autenticação

- Nome, e-mail, senha e confirmação.
- Aceite dos termos e política de privacidade.
- Confirmação de e-mail.
- Login, logout e recuperação de senha.
- Gerenciamento seguro de sessão.
- Opção de solicitar encerramento da conta conforme política aplicável.
- MFA recomendado para funções sensíveis quando disponível.

### 5.2 Cadastro da motocicleta

Campos: marca, modelo, versão, ano de fabricação, ano/modelo, cilindrada, cor, placa atual, chassi com acesso restrito, quilometragem atual, data de aquisição, fotografias e observações iniciais.

Após cadastro, o sistema deverá gerar ID interno imutável, criar passaporte, gerar QR Code, registrar o primeiro vínculo de propriedade, registrar quilometragem inicial e disponibilizar linha do tempo. O vínculo com oficina de origem só será criado com autorização do proprietário.

O sistema deverá detectar possíveis duplicidades sem revelar dados privados. Casos suspeitos deverão seguir fluxo de verificação, sem permitir que qualquer pessoa descubra livremente se determinada placa está cadastrada.

### 5.3 Dashboard e painel da motocicleta

Exibir foto, marca/modelo, ano, placa conforme permissão, quilometragem mais recente, data de criação do passaporte, situação do plano, próximas manutenções, últimos registros, oficinas autorizadas, QR Code e acesso ao histórico.

### 5.4 Linha do tempo e registros

Categorias iniciais: revisão, óleo, filtros, freios, pneus, suspensão, motor, transmissão, sistema elétrico, bateria, arrefecimento, acessórios, modificações, reparos, acidentes informados, inspeções e outros serviços.

Cada registro poderá incluir título, categoria, descrição, data, quilometragem, oficina, peças, fabricante, valor opcional, fotos, documentos, nota fiscal, ordem de serviço e observações.

A linha do tempo deverá permitir filtros por categoria, data, oficina e tipo de registro.

### 5.5 Origem e comprovação

- **Informado pelo proprietário:** declaração inserida pelo dono, sem confirmação independente.
- **Com comprovante:** acompanhado de documento, foto, nota fiscal, recibo ou ordem de serviço.
- **Confirmado por prestador:** criado ou confirmado por oficina identificada.

Essas classificações indicam origem e evidência, não certificação mecânica ou garantia de veracidade.

### 5.6 Quilometragem

Manter histórico com data, quilometragem, origem, responsável e evidência quando disponível. Não sobrescrever registros anteriores silenciosamente. Detectar valores inferiores ao histórico e apresentar alerta de possível inconsistência, sem presumir fraude. Correções devem ser documentadas e auditadas.

### 5.7 Diário da motocicleta

Área separada dos registros técnicos para primeira viagem, viagens, encontros, acessórios, personalizações, fotos e outros acontecimentos. O proprietário escolhe o que é privado ou compartilhável.

### 5.8 Lembretes

Permitir lembretes por quilometragem, intervalo de tempo ou data específica. Exemplos: óleo, revisão, pneus e componentes. Usar recomendações confiáveis do fabricante ou intervalos configurados pelo usuário; não inventar intervalos técnicos. Permitir editar, pausar ou excluir lembretes sem alterar o histórico de serviços.

### 5.9 Relatórios PDF

Gerar relatório profissional contendo identificação básica, criação do passaporte, quilometragem documentada, linha do tempo, serviços, oficinas, comprovantes selecionados, origem dos registros, avisos sobre informações não verificadas e data/hora da geração. Não apresentar como laudo, perícia ou certificado oficial.

### 5.10 Assinatura e cobrança

O usuário deverá consultar plano atual, preço, periodicidade, situação, próxima cobrança quando aplicável, pagamentos, faturas, falhas, cancelamento e instruções para regularização. A interface não poderá marcar pagamento como aprovado por simples retorno do navegador; a confirmação deverá vir do backend após validação junto ao Mercado Pago.

## 6. Painel da oficina

O painel da oficina é gratuito e deverá ser separado da área do proprietário. Será otimizado para operação rápida no celular, inclusive durante atendimento presencial.

### 6.1 Cadastro e perfil

Campos: nome comercial, razão social opcional, CNPJ quando aplicável, responsável, e-mail, telefone, WhatsApp, endereço, cidade, estado, especialidades, logotipo, fotos, descrição e horário de funcionamento. A oficina poderá ter perfil público e QR Code próprio.

### 6.2 Membros e permissões da oficina

O responsável poderá gerenciar funcionários e conceder permissões proporcionais. Cada funcionário terá identidade própria; ações devem registrar o usuário que as executou. Um funcionário não poderá alterar papel ou privilégios próprios.

### 6.3 Dashboard da oficina

Exibir dados da oficina, perfil público, QR Code, motos autorizadas, solicitações pendentes, serviços registrados, histórico de atendimentos, clientes relacionados e atalhos para registrar serviço.

### 6.4 Pesquisa por placa e solicitação de acesso

Fluxo:
1. Oficina informa a placa.
2. Sistema procura correspondência com proteção contra enumeração.
3. Antes da autorização, revela apenas o mínimo necessário.
4. Oficina solicita acesso.
5. Proprietário recebe notificação.
6. Proprietário aprova ou rejeita.
7. Após aprovação, a oficina acessa apenas os dados necessários e permitidos.

Deverão existir rate limiting, registros de auditoria e proteções contra consultas automatizadas.

### 6.5 Oficina de Origem

A oficina que participou do cadastro inicial poderá ser identificada como Oficina de Origem somente com consentimento do proprietário. O vínculo permanece ativo sem nova solicitação até ser revogado. Não concede propriedade sobre a moto ou passaporte. O proprietário poderá revogar a qualquer momento.

### 6.6 Autorizações e revogações

O proprietário poderá aprovar, rejeitar, revogar e consultar o histórico de autorizações. Uma moto poderá ter várias oficinas autorizadas simultaneamente. A revogação deverá bloquear novas consultas e operações no backend imediatamente. Não apaga registros anteriores da oficina. O acesso futuro exigirá nova solicitação e aprovação.

### 6.7 Registro de serviço

Após autorização, a oficina poderá registrar serviço, descrição, data, quilometragem, peças, fabricantes, valor opcional, fotografias, nota fiscal, ordem de serviço e observações técnicas. O sistema identifica oficina, funcionário, data/hora, moto e origem do registro.

A oficina não poderá apagar registros de outras oficinas nem alterar silenciosamente registro confirmado. Correções geram evento de correção preservando o original e a auditoria.

## 7. Painel administrativo do SaaS

O painel administrativo será de uso interno do operador da plataforma. Não deve ser confundido com o painel da oficina nem com o painel do proprietário.

### 7.1 Dashboard executivo

Indicadores: usuários, motocicletas, oficinas, registros, novos cadastros, assinaturas ativas/vencidas, receita recorrente, pagamentos pendentes/recusados, inadimplência, consumo de armazenamento, arquivos, transferências e solicitações pendentes.

### 7.2 Gestão de usuários

Listar e consultar contas, situação, assinatura, histórico operacional e suporte; bloquear ou suspender mediante justificativa e auditoria; atender solicitações. Não alterar histórico de motocicletas sem fluxo específico e auditado.

### 7.3 Gestão de oficinas

Listar, verificar cadastros quando necessário, consultar perfil, bloquear em caso justificado, consultar registros e reclamações e gerenciar participação. A administração não poderá apagar registros históricos sem processo justificado e auditado.

### 7.4 Gestão comercial e planos

Criar/editar/ativar/desativar planos, preço, periodicidade, desconto, cotas, recursos, teste grátis quando aprovado, regras de cancelamento e textos exibidos no site. Toda mudança comercial terá histórico de quem alterou e quando.

### 7.5 Gestão de pagamentos

Consultar assinaturas, pagamentos, faturas, tentativas, falhas, reembolsos, chargebacks, cancelamentos e identificadores do Mercado Pago. Exibir conciliação entre estado local e provedor, sem permitir edição manual arbitrária de pagamento aprovado.

### 7.6 Gestão de armazenamento

Exibir consumo total e por usuário/motocicleta, arquivos por categoria, temporários, sem vínculo e alertas de limite. Ações de limpeza deverão ser restritas a arquivos comprovadamente temporários ou sem vínculo, com política de retenção e auditoria.

### 7.7 Auditoria e suporte

Consultar autoria de registros, transferências, autorizações, revogações, ações administrativas e eventos financeiros. A consulta de dados privados para suporte deve exigir motivo e manter trilha de auditoria.

### 7.8 Configurações gerais

Gerenciar identidade visual, contatos, textos públicos, parâmetros comerciais, limites, notificações, integrações, recursos habilitados e configurações operacionais. Segredos e tokens nunca serão exibidos integralmente na interface.

## 8. Cobrança e pagamentos — Mercado Pago

O Mercado Pago será o provedor de pagamento e cobrança do Moto Passaporte para as assinaturas dos proprietários. Ele não é o banco de dados do sistema: o Supabase/PostgreSQL manterá o cadastro interno de planos, assinaturas, faturas, eventos e conciliação. O Mercado Pago processará pagamentos conforme os recursos contratados e disponíveis na integração.

### 8.1 Modelo de integração

- Utilizar a API oficial do Mercado Pago no backend, por meio de Edge Functions ou serviço backend protegido.
- Para cobranças recorrentes, avaliar e implementar a API de Assinaturas do Mercado Pago, com planos e/ou assinaturas configuradas conforme a periodicidade comercial escolhida.
- Não chamar endpoints autenticados diretamente do frontend com Access Token privado.
- Manter tokens e segredos somente em armazenamento seguro de segredos/variáveis de ambiente do servidor.
- Não armazenar número completo de cartão, CVV ou dados sensíveis de pagamento no Moto Passaporte.
- Guardar apenas identificadores externos, metadados necessários e status sincronizados.
- Manter camada de integração isolada para permitir mudança ou inclusão de provedor no futuro sem reescrever regras de negócio.

### 8.2 Fluxo de contratação

1. Usuário escolhe plano e periodicidade no site ou painel.
2. Backend valida plano, preço vigente, elegibilidade e usuário.
3. Backend cria a preferência/assinatura pelo fluxo oficial aplicável do Mercado Pago.
4. Usuário conclui o processo de pagamento no ambiente seguro disponibilizado pelo provedor.
5. O retorno do navegador apresenta apenas uma mensagem de processamento/resultado preliminar.
6. O backend recebe notificação Webhook, valida a origem/autenticidade conforme documentação vigente e consulta o recurso no Mercado Pago para confirmar o estado real.
7. O sistema registra o evento de forma idempotente e atualiza assinatura, pagamento e benefícios em transação consistente.
8. O usuário recebe confirmação no painel e, se habilitado, por e-mail.

### 8.3 Webhooks e conciliação

- Implementar endpoint de Webhook no backend.
- Validar assinatura/cabeçalhos de segurança conforme documentação oficial vigente do Mercado Pago.
- Não confiar somente no conteúdo recebido; consultar o objeto correspondente na API do provedor quando necessário.
- Tratar eventos repetidos com idempotência, evitando ativar duas vezes ou duplicar cobrança/crédito.
- Armazenar identificador do evento, referência externa, tipo, data, resultado do processamento e erro técnico sem gravar segredos.
- Responder adequadamente ao Webhook e processar trabalho demorado de forma assíncrona quando necessário.
- Implementar rotina de conciliação para identificar notificações perdidas, status divergentes e pagamentos sem vínculo local.
- Não ativar Premium com base em redirecionamento de tela ou declaração do cliente.

### 8.4 Estados internos

Definir um mapa explícito entre estados do Mercado Pago e estados internos. Estados internos mínimos: `pending`, `active`, `past_due`, `paused`, `canceled`, `expired`, `rejected` e `refunded`, conforme aplicabilidade. O mapeamento final deverá refletir os estados reais fornecidos pelo provedor e não inventar equivalências.

Cada pagamento deverá manter estado próprio, separado do estado geral da assinatura. Um reembolso ou chargeback deverá ser registrado como evento financeiro e refletido nas regras comerciais e de acesso.

### 8.5 Regras de negócio de cobrança

- O Premium só será liberado após confirmação válida do pagamento/assinatura no backend.
- Pagamento pendente não equivale a pagamento aprovado.
- Falha de cobrança deverá gerar estado e comunicação claros.
- Definir política de tolerância (grace period), suspensão e reativação antes do lançamento.
- Cancelamento deverá respeitar as regras contratuais e o estado confirmado no provedor.
- Registrar cancelamento, pausa, reativação e alteração de plano.
- Valores, datas, descontos e periodicidade devem ser persistidos no histórico da contratação para evitar que uma alteração futura no plano mude retroativamente contratos existentes.
- O usuário deve conseguir consultar histórico de pagamentos e situação da assinatura.
- O administrador deve conseguir conciliar e investigar divergências sem editar registros financeiros de forma silenciosa.

### 8.6 Tabelas de cobrança sugeridas

- `billing_customers`: vínculo entre usuário e identificador do pagador no Mercado Pago, quando necessário.
- `subscription_plans`: catálogo interno de planos e recursos.
- `subscriptions`: assinatura interna, usuário, plano, preço contratado, periodicidade, status e identificador externo.
- `invoices`: cada ciclo/cobrança esperada, período de referência, valor, vencimento e estado.
- `payments`: transações, valor, moeda, estado, identificadores externos e datas.
- `payment_events`: eventos recebidos, payload minimizado/seguro, validação, idempotência e processamento.
- `billing_audit_logs`: histórico de alterações administrativas e operações de cobrança.

Não armazenar dados de cartão desnecessários. Restringir acesso às tabelas e mascarar identificadores quando exibidos a perfis sem necessidade.

### 8.7 Testes de pagamento

Criar ambiente de teste e validar: contratação, pagamento aprovado, pagamento pendente, recusado, cancelamento, pausa/reativação quando aplicável, renovação, atraso, reembolso, chargeback, Webhook duplicado, Webhook inválido, falha temporária, conciliação e divergência de status. Só liberar produção após validação ponta a ponta com credenciais de produção configuradas de forma segura.

## 9. Identidade permanente, placa e QR Code

Cada motocicleta terá ID interno único, imutável e independente da placa ou proprietário. A placa será mecanismo de pesquisa operacional, não chave primária.

Campos de identidade: ID interno, public_id, marca, modelo, versão, ano de fabricação, ano/modelo, cilindrada, cor, placa atual, chassi protegido, data de criação, código público e QR Code.

A placa poderá mudar sem perder o histórico. Registrar histórico de placas com período de validade. Não criar outra moto automaticamente quando a placa mudar. O QR Code aponta para página pública ou fluxo de autorização, respeitando permissões; não revela dados privados por padrão.

## 10. Transferência de titularidade do passaporte

Fluxo: proprietário atual inicia transferência; informa conta/e-mail do comprador; sistema cria solicitação; comprador recebe aviso e aceita ou rejeita; após validações, operação é executada de forma transacional.

Na conclusão: antigo proprietário perde edição; novo proprietário assume controle; registros e autores anteriores permanecem; quilometragem permanece; todas as autorizações anteriores são encerradas, inclusive Oficina de Origem; novo proprietário autoriza novamente as oficinas; data e envolvidos ficam auditados.

A transferência do passaporte não representa transferência oficial no DETRAN nem valida a propriedade legal do veículo. Casos sem participação do proprietário anterior exigem fluxo excepcional de verificação a ser definido antes do lançamento.

## 11. Passaporte público e compartilhamento

O proprietário poderá gerar link e QR Code de compartilhamento, selecionar informações e revogar o acesso. O conteúdo público poderá incluir foto, marca/modelo, ano, histórico selecionado, quilometragens documentadas, serviços, oficinas e comprovantes autorizados.

Não expor por padrão: CPF, endereço, telefone pessoal, e-mail pessoal, dados financeiros, senhas, identificadores internos sensíveis, chassi completo, documentos pessoais, dados privados de antigos proprietários ou diário privado.

Links deverão usar tokens imprevisíveis, ser revogáveis, permitir expiração quando configurada e possuir proteção contra abuso. O conteúdo do comprador será gratuito e não exigirá cadastro para a visualização pública básica.

## 12. Notificações

Implementar central de notificações internas para: solicitação de oficina; aprovação/rejeição; revogação; novo serviço; transferência; lembretes; assinatura próxima do vencimento; pagamento confirmado; falha de pagamento; limite de armazenamento; avisos administrativos relevantes.

Arquitetura preparada para e-mail e WhatsApp, sem tornar essas integrações obrigatórias no MVP. Preferências de notificação e consentimentos deverão ser respeitados.

## 13. Dados, armazenamento e retenção

### 13.1 Separação

Dados estruturados (motocicletas, histórico, usuários, oficinas, autorizações, pagamentos e metadados) ficam no PostgreSQL. Fotos, PDFs, notas fiscais e ordens de serviço ficam em armazenamento de objetos, preferencialmente buckets privados, com metadados e referências no banco.

### 13.2 Regras

- Comprimir imagens e limitar tamanho.
- Permitir formatos seguros definidos pelo produto.
- Validar MIME real e extensão; não confiar no nome enviado.
- Fazer varredura/verificação de arquivos quando viável.
- Evitar duplicação desnecessária.
- Controlar consumo por usuário/moto.
- Não permitir vídeos no MVP.
- Não manter URLs públicas permanentes para arquivos privados.
- Limpar somente temporários e órfãos após verificação, prazo e auditoria.
- Preservar anexos vinculados ao histórico conforme política de retenção e obrigações legais.

Cotas iniciais propostas: gratuito 100 MB; Premium 500 MB; armazenamento adicional a definir. São hipóteses e devem ser validadas financeiramente. O cancelamento não apaga automaticamente identidade e histórico estruturado. Comunicar limites, exportação e tratamento dos anexos excedentes antes de qualquer remoção.

## 14. Estrutura de dados inicial

A estrutura definitiva será validada durante o desenho do banco. Não criar tabelas duplicadas sem analisar o que já existe. Toda tabela com dados protegidos deverá ter política de acesso correspondente.

### 14.1 Identidade e acesso

- `profiles`: dados básicos do usuário.
- `user_roles`: papéis globais, atribuídos por processo seguro.
- `organizations`: organizações/tenants, incluindo oficinas.
- `organization_members`: associação usuário-organização, papel, status e permissões.
- `workshops`: dados específicos do perfil de oficina, vinculados à organização.

### 14.2 Motocicletas e titularidade

- `motorcycles`: identidade permanente, public_id, características e status.
- `motorcycle_plates`: histórico de placas.
- `motorcycle_ownerships`: histórico de titularidade do passaporte, apenas uma atual por moto.
- `transfer_requests`: solicitações e eventos de transferência.

### 14.3 Autorizações e histórico

- `motorcycle_workshop_access`: pedido, aprovação, origem/autorized, status, aprovador, revogação.
- `maintenance_records`: serviços, origem, autoria, data, quilometragem e estado.
- `maintenance_items`: peças e componentes.
- `mileage_records`: leituras históricas de quilometragem.
- `motorcycle_diary`: diário pessoal e visibilidade.
- `attachments`: referências a objetos armazenados, visibilidade e autor.
- `passport_shares`: tokens, escopos, expiração e revogação.

### 14.4 SaaS, cobrança e operação

- `subscription_plans` e `subscriptions`.
- `billing_customers`, `invoices`, `payments`, `payment_events`.
- `notifications`.
- `audit_logs`.
- `support_cases`, se aprovado para operação de suporte.
- `system_settings`, com controle de alterações e sem armazenar segredos em texto acessível.

### 14.5 Regras de modelagem

- IDs internos não devem depender de placa ou e-mail.
- Adotar chaves estrangeiras, restrições, índices e unicidade necessários.
- Criar `created_at`, `updated_at` e autoria onde aplicável.
- Modelar status com valores controlados e transições válidas.
- Evitar guardar arrays JSON como substitutos de relacionamentos quando houver necessidade de consulta, integridade ou RLS.
- Não confiar em `tenant_id` enviado pelo frontend: derivar ou validar no backend a partir da sessão e dos vínculos.
- Histórico de registros confirmados deve ser imutável em sua origem, com correções por eventos adicionais.

## 15. Segurança, privacidade e conformidade

Segurança deverá ser requisito de cada módulo desde a concepção, desenvolvimento, testes e operação.

### 15.1 Autenticação e sessão

- Usar Supabase Auth ou mecanismo aprovado.
- Não armazenar senhas em texto puro.
- Aplicar recuperação de senha segura, confirmação de e-mail e gestão de sessão.
- Aplicar limitação de tentativas de login e proteções contra força bruta.
- Exigir MFA para administradores e avaliar para responsáveis de oficina.
- Proteger cookies/tokens conforme o mecanismo de autenticação adotado.
- Encerrar/revogar sessões em situações de risco.

### 15.2 Autorização e controle de acesso

- Princípio do menor privilégio.
- Verificação no backend em todas as operações sensíveis.
- RLS em tabelas com dados protegidos.
- Isolamento entre oficinas/organizações.
- Verificação de titularidade atual para edição pelo proprietário.
- Verificação de autorização ativa para cada consulta/escrita da oficina.
- Validação de papel e organização do funcionário.
- Papel admin concedido somente por processo interno.
- Controle de acesso a arquivos com políticas equivalentes aos registros.
- Testes de IDOR e escalada de privilégio.

### 15.3 Proteções contra vulnerabilidades

Considerar, no mínimo: SQL Injection, XSS, CSRF quando aplicável, Broken Access Control, IDOR, SSRF, upload malicioso, path traversal, força bruta, abuso de APIs, enumeração de placas, exposição de dados, manipulação de parâmetros, escalada de privilégios, falhas de sessão e configuração insegura.

Usar consultas parametrizadas, validação de entrada, codificação/escape de saída, validação de arquivos, rate limiting, cabeçalhos de segurança e mensagens de erro que não revelem segredos ou detalhes internos. Adotar OWASP Top 10 e OWASP ASVS como referências de revisão.

### 15.4 Credenciais e segredos

- Nunca expor Access Token do Mercado Pago, service role key do Supabase ou outras chaves privadas no frontend.
- Nunca versionar `.env` real.
- Separar credenciais de desenvolvimento, homologação e produção.
- Usar cofre de segredos/variáveis protegidas.
- Aplicar privilégio mínimo e rotação em caso de suspeita de vazamento.
- Não registrar tokens, senhas, CVV ou dados completos de cartão em logs.

### 15.5 Auditoria

Registrar ator, ação, módulo, entidade, identificador, data/hora, resultado e alterações relevantes. Auditoria reforçada para autenticação, pagamentos, permissões, transferência, revogação, correções e ações administrativas. Proteger registros contra alteração por usuários comuns. Evitar registrar dados pessoais ou segredos desnecessários.

### 15.6 LGPD

Manter política de privacidade, termos, finalidade e base legal, mecanismos de atendimento aos direitos dos titulares, retenção, acesso restrito, procedimento de incidentes e registro de operações relevantes. Dados da motocicleta e dados pessoais devem ser tratados separadamente. Implementação e documentação devem passar por revisão jurídica apropriada antes do lançamento.

## 16. Arquitetura técnica e organização modular

### 16.1 Stack prevista

Frontend: Lovable, React, TypeScript e interface responsiva. Backend: Supabase, PostgreSQL, Auth, Storage, RLS e Edge Functions quando necessário. Git como controle de versão. Ambientes separados para desenvolvimento, homologação e produção.

### 16.2 Princípios de arquitetura

- Separar apresentação, regras de negócio, acesso a dados e integrações.
- Organizar por módulos de domínio.
- Evitar componentes e arquivos gigantes.
- Não duplicar serviços ou regras existentes.
- Compartilhar componentes sem acoplar módulos independentes.
- Manter contratos de interface e tipos explícitos.
- Concentrar operações privilegiadas no backend.
- Isolar integração Mercado Pago em serviço próprio.
- Tratar erros e logs de forma padronizada.
- Manter configurações por ambiente.

### 16.3 Estrutura de pastas de referência

```text
/projeto
  /src
    /core
      /auth
      /security
      /permissions
      /config
      /shared
    /modules
      /public_site
      /owner
      /workshop
      /admin
      /motorcycles
      /maintenance
      /transfers
      /sharing
      /subscriptions
      /notifications
    /components
    /services
    /hooks
    /utils
    /types
    /lib
  /supabase
    /migrations
    /functions
    /seed
  /tests
    /unit
    /integration
    /security
    /e2e
    /regression
  /docs
    PROJECT_MEMORY.md
    PROJECT_STATUS.md
    CHANGELOG.md
    VERSION_HISTORY.md
    ARCHITECTURE.md
    SECURITY.md
    DATABASE.md
    API_DOCUMENTATION.md
    DECISIONS.md
    KNOWN_ISSUES.md
    /modules
    /security_audits
    /releases
    /rollback
  /scripts
    /backup
    /deployment
    /maintenance
    /validation
  .env.example
  .gitignore
  README.md
```

A estrutura é referência, não ordem para criar diretórios vazios nem para reorganizar o projeto cegamente. Antes de mover arquivos, analisar o repositório, framework e dependências existentes. Adaptar a estrutura sem comprometer o sistema.

## 17. Memória técnica permanente e documentação viva

Criar `/docs/PROJECT_MEMORY.md` como memória técnica oficial e continuamente atualizada. A memória deve permitir que uma nova sessão de IA ou desenvolvedor compreenda o estado atual sem depender do histórico informal de conversas.

Registrar: arquitetura, stack, estrutura, módulos, regras de negócio, banco, relacionamentos, RLS, integrações, decisões, funcionalidades, pendências, problemas conhecidos, falhas corrigidas, riscos, configurações não secretas, versões e procedimentos de recuperação.

A memória nunca deve conter senhas, tokens, chaves privadas, dados pessoais desnecessários ou segredos operacionais.

### 17.1 Documentos obrigatórios

- `PROJECT_MEMORY.md`: contexto técnico consolidado e estado conhecido.
- `PROJECT_STATUS.md`: versão atual, ambientes, módulos, pendências, riscos e última publicação/backup confirmado.
- `CHANGELOG.md`: registro detalhado de mudanças.
- `VERSION_HISTORY.md`: releases, datas, responsáveis, migrações e rollback.
- `ARCHITECTURE.md`: arquitetura e dependências.
- `SECURITY.md`: controles, papéis, RLS, segredos e procedimentos.
- `DATABASE.md`: tabelas, relacionamentos, índices e políticas.
- `API_DOCUMENTATION.md`: endpoints, contratos e integrações.
- `DECISIONS.md`: decisões arquiteturais e justificativas.
- `KNOWN_ISSUES.md`: problemas conhecidos e situação.
- Documentação por módulo em `/docs/modules/`.
- Relatórios em `/docs/security_audits/`.
- Notas por release em `/docs/releases/`.
- Procedimentos em `/docs/rollback/`.

### 17.2 Atualização obrigatória

Toda alteração relevante deverá atualizar a memória central e os documentos específicos afetados. Não registrar como concluído o que não foi implementado ou testado. Distinguir claramente “planejado”, “em desenvolvimento”, “implementado”, “testado”, “homologado” e “publicado”.

## 18. Versionamento, Git, migrações e rollback

### 18.1 Versionamento semântico

Utilizar `MAJOR.MINOR.PATCH`:
- PATCH: correções sem mudança incompatível.
- MINOR: funcionalidades compatíveis e evoluções.
- MAJOR: mudanças incompatíveis ou estruturais relevantes.

### 18.2 Git

- Repositório privado.
- Commits descritivos e pequenos quando possível.
- Branches para funcionalidades e correções.
- Revisão antes de integrar mudanças relevantes.
- Branch principal protegida.
- Tags para releases estáveis.
- Não reescrever histórico publicado como prática normal.
- Não colocar secrets ou dumps de produção no Git.

### 18.3 Migrações de banco

Toda alteração estrutural deverá ser arquivo de migração versionado, com identificador único, objetivo, dependências, impacto, validação e estratégia de reversão/compensação. Não editar manualmente o banco de produção fora do processo documentado. Alterações destrutivas exigem backup validado e aprovação explícita.

### 18.4 Rollback

Código, banco, arquivos e infraestrutura precisam de estratégias distintas de recuperação. Reverter código não reverte automaticamente os dados. Cada release deve documentar o rollback de frontend/backend, migrações, compatibilidade e restauração de backup quando necessária.

## 19. Qualidade, testes e processo de alteração

Nenhuma funcionalidade relevante será considerada concluída apenas porque o código foi escrito.

### 19.1 Processo obrigatório

1. **Análise:** ler a memória técnica, entender módulo, dependências, dados, permissões e riscos.
2. **Planejamento:** listar arquivos e componentes afetados, migrações, testes e rollback.
3. **Implementação:** respeitar arquitetura, segurança, tipagem e padrões existentes.
4. **Validação:** executar testes e verificar regressões, integrações e permissões.
5. **Documentação:** atualizar memória, changelog, status, documentação do módulo e segurança quando aplicável.
6. **Versionamento:** registrar no Git, classificar versão e criar tag quando aplicável.
7. **Publicação:** publicar após aprovação e validação; monitorar erros e confirmar funcionamento.

### 19.2 Tipos de teste

- Unitários: regras e funções isoladas.
- Integração: módulos, banco, APIs e Mercado Pago.
- Segurança: RLS, isolamento, IDOR, autenticação, arquivos e permissões.
- E2E: fluxos reais de proprietário, oficina, administrador e comprador.
- Regressão: garantir que alterações não quebraram funcionalidades existentes.
- Pagamentos: aprovado, pendente, recusado, renovação, cancelamento, Webhook duplicado/inválido, reembolso e conciliação.

### 19.3 Critérios de conclusão de tarefa

Uma tarefa só poderá ser marcada como concluída quando: implementação revisada; testes executados e resultado registrado; riscos avaliados; documentação atualizada; migrações versionadas; changelog atualizado; e rollback identificado quando houver impacto relevante.

## 20. Backup, continuidade e monitoramento

Manter backups regulares do banco, arquivos e configurações necessárias, armazenados em local separado da infraestrutura principal e com acesso restrito. Definir periodicidade, retenção, criptografia, responsáveis e testes de restauração.

Monitorar erros de aplicação, falhas de autenticação, processamento de Webhooks, integrações, consumo de armazenamento, jobs e disponibilidade. Alertas devem evitar exposição de dados sensíveis.

Separar ambientes de desenvolvimento, homologação e produção. Não utilizar dados reais de produção em testes sem anonimização e autorização apropriada.

## 21. Requisitos não funcionais

**Desempenho:** telas principais rápidas, paginação de históricos, consultas otimizadas, índices, carregamento progressivo de imagens e ausência de requisições repetitivas desnecessárias.

**Disponibilidade:** monitoramento, backups, restauração testada, logs, tratamento de falhas e comunicação de incidentes.

**Escalabilidade:** permitir crescimento de usuários, oficinas, motos, registros, arquivos, compartilhamentos e cobranças sem misturar dados entre organizações.

**Manutenibilidade:** código tipado, módulos com responsabilidade clara, componentes reutilizáveis, migrações, documentação e testes.

**Acessibilidade e responsividade:** experiência adequada em smartphones Android, iPhones, tablets e computadores; foco mobile para proprietário e oficina.

## 22. Escopo do MVP e fases de desenvolvimento

### Fase 1 — Fundação SaaS e site

- Estrutura do projeto, Git e ambientes.
- Identidade visual e site público institucional.
- Cadastro, login e recuperação de senha.
- Papéis, organizações e controle de acesso.
- Banco de dados inicial, RLS e auditoria.
- Painéis base do usuário, oficina e administrador.
- Cadastro de motocicleta, ID permanente e QR Code.
- Memória técnica e documentação inicial.

### Fase 2 — Histórico e arquivos

- Linha do tempo.
- Registros de manutenção.
- Quilometragem.
- Anexos e cotas.
- Origem dos registros.
- Auditoria e diário básico.

### Fase 3 — Oficinas e autorizações

- Cadastro gratuito de oficina.
- Perfil público.
- Pesquisa protegida por placa.
- Solicitação, aprovação e revogação.
- Oficina de Origem.
- Membros da oficina e permissões.
- Registro de serviços.

### Fase 4 — Transferência e compartilhamento

- Solicitação e aceite de transferência.
- Preservação do histórico.
- Encerramento de acessos anteriores.
- Página pública controlada.
- Link e QR Code compartilhável e revogável.

### Fase 5 — Monetização e Mercado Pago

- Planos e preços configuráveis.
- Integração oficial Mercado Pago.
- Assinaturas recorrentes.
- Webhooks seguros e idempotência.
- Histórico de pagamentos e faturas.
- Cotas e benefícios Premium.
- Regras de atraso, cancelamento e reativação.

### Fase 6 — Administração, segurança e lançamento

- Dashboard administrativo completo.
- Gestão de usuários, oficinas, planos e pagamentos.
- Monitoramento de armazenamento.
- Auditoria e suporte.
- Testes de segurança, integração e regressão.
- Testes de restauração e rollback.
- Homologação e publicação.

As fases poderão ser reordenadas por dependência técnica, mas não se deve liberar cobrança real antes de validar o fluxo completo de pagamentos e acesso Premium.

## 23. Funcionalidades fora do MVP

Rede social, feed de viagens, marketplace, venda de motos, GPS/rastreamento, diagnóstico mecânico por IA, integração automática com DETRAN, consulta automática de multas, certificação de procedência, laudo mecânico, avaliação técnica automática, apps nativos Android/iOS, reputação de oficinas, vídeos no histórico e integrações complexas com fabricantes. Poderão ser avaliadas em roadmap posterior.

## 24. Critérios gerais de aceitação

### Site

- Apresenta claramente o produto e os benefícios para proprietário e oficina.
- Tem navegação, cadastro, login, planos, perguntas frequentes, suporte, termos e privacidade.
- É responsivo, acessível e otimizado.
- Não publica promessas ou recursos inexistentes.

### SaaS e painéis

- Perfis e permissões são aplicados no backend.
- Proprietário acessa apenas suas motos e recursos autorizados.
- Oficina acessa somente motos com autorização ativa.
- Funcionários respeitam permissões da organização.
- Administrador usa autenticação reforçada e ações auditadas.
- Os três painéis são distintos, coerentes e responsivos.

### Motocicleta e histórico

- Cadastro cria ID permanente e QR Code.
- Mudança de placa não perde histórico.
- Registros mostram origem e autoria.
- Quilometragem inconsistente gera alerta.
- Registro confirmado não é alterado silenciosamente.

### Autorizações e transferência

- Oficina solicita acesso e proprietário aprova/rejeita.
- Oficina de Origem só existe com consentimento e pode ser revogada.
- Revogação bloqueia acesso pelo backend.
- Transferência preserva histórico, encerra acessos anteriores e concede controle ao novo titular do passaporte.

### Pagamentos

- Checkout/assinatura ocorre pelo fluxo oficial.
- Webhook é validado.
- Evento duplicado não gera duplicidade.
- Premium só é liberado após confirmação no backend.
- Histórico de pagamento e assinatura é consultável.
- Cancelamento, falha, reembolso e chargeback são tratados.

### Segurança e continuidade

- Isolamento de tenant validado por testes.
- RLS revisada em todas as tabelas protegidas.
- Arquivos privados não ficam públicos por URL permanente.
- Backups existem e a restauração foi testada.
- Versão publicada possui changelog, memória e rollback documentados.

## 25. Indicadores de sucesso

**Aquisição:** visitantes, cadastros, motos e oficinas cadastradas, conversão por canal.  
**Engajamento:** registros por moto, oficinas ativas, autorizações, compartilhamentos e relatórios.  
**Monetização:** assinaturas, conversão gratuito/Premium, receita recorrente, cancelamentos e inadimplência.  
**Qualidade do histórico:** registros documentados, registros de oficinas, comprovantes e consistência de quilometragem.  
**Eficiência:** custo de armazenamento por moto/usuário, custo de infraestrutura e receita líquida por assinante.

Qualquer índice de histórico deverá medir quantidade e completude documental, nunca a qualidade mecânica da motocicleta.

## 26. Riscos e mitigação

- **Armazenamento acima da receita:** cotas, compressão, monitoramento, limites e simulação de custos.
- **Baixa adesão das oficinas:** cadastro simples, gratuidade, registro rápido e perfil público.
- **Baixa conversão dos proprietários:** plano gratuito útil, demonstração clara de valor e compartilhamento gratuito.
- **Registros sem comprovação:** origem explícita, evidências, auditoria e linguagem sem certificação automática.
- **Exposição de dados:** RLS, autorização, links revogáveis, minimização e testes de isolamento.
- **Falha de cobrança:** Webhooks validados, idempotência, conciliação e estado local auditável.
- **Mudanças que quebram produção:** ambientes separados, testes, releases, backup e rollback.

## 27. Decisões pendentes antes do lançamento

1. Confirmar valores finais e benefícios do plano gratuito e Premium.
2. Confirmar cotas de armazenamento após simulação financeira.
3. Definir período de tolerância após falha de cobrança, suspensão e reativação.
4. Definir política de reembolso e cancelamento, alinhada aos termos e legislação aplicável.
5. Confirmar se serão usados planos de assinatura do Mercado Pago ou assinaturas individuais sem plano, conforme fluxo e meios de pagamento desejados.
6. Definir exigências de verificação das oficinas e documentos de cadastro.
7. Definir fluxo excepcional de transferência quando o proprietário anterior não puder participar.
8. Definir campos públicos padrão e quais exigem autorização expressa.
9. Definir canais e prazos de atendimento ao usuário.
10. Definir política de retenção/exportação dos anexos após cancelamento e encerramento de conta.
11. Definir responsável interno pelo tratamento de dados e procedimento de incidentes.

Essas decisões não impedem o planejamento técnico, mas devem ser concluídas antes da abertura comercial ampla.

## 28. Diretriz obrigatória para uso de IA e desenvolvimento no Lovable

Antes de qualquer implementação, a IA/desenvolvedor deve ler o PRD completo, examinar o repositório e o banco existentes, ler `/docs/PROJECT_MEMORY.md`, consultar o changelog, identificar módulos e dependências e produzir um diagnóstico do estado atual. Não deve começar criando ou alterando tabelas sem verificar o que já existe.

O desenvolvimento deverá ocorrer por etapas pequenas, com aprovação e validação entre fases. Não construir tudo em uma única solicitação. Não desabilitar RLS para facilitar desenvolvimento, não colocar segredos no frontend, não usar dados fictícios em produção, não afirmar que testes foram executados sem executá-los e não apagar funcionalidades sem autorização.

Quando encontrar incompatibilidade entre o projeto existente e este PRD, registrar a divergência, explicar impacto e propor plano de adequação antes de executar mudanças estruturais.

## 29. Definição final do produto

O Moto Passaporte será um SaaS de identidade digital e histórico de motocicletas. Seu site público explicará o produto e converterá visitantes; o painel do proprietário permitirá criar e controlar o passaporte; o painel da oficina permitirá documentar serviços gratuitamente e somente com autorização; o painel administrativo permitirá operar o SaaS, gerenciar planos, pagamentos e suporte; e o Mercado Pago será responsável pelo processamento das cobranças das assinaturas Premium.

A plataforma deverá crescer de forma organizada, com isolamento de dados, segurança desde a arquitetura, histórico preservado, documentação viva, versionamento e possibilidade comprovada de recuperação.

**Moto Passaporte — A história da sua moto não precisa começar de novo a cada proprietário.**

---

## Referências técnicas para a integração Mercado Pago

A implementação deve conferir sempre a documentação oficial vigente, especialmente:

- API de Assinaturas: https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview
- Visão geral de assinaturas recorrentes: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview
- Webhooks: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks

Este PRD define requisitos de produto e segurança; os endpoints, eventos, assinatura de Webhook, parâmetros e limitações finais deverão ser confirmados na documentação técnica atual no momento da implementação.
