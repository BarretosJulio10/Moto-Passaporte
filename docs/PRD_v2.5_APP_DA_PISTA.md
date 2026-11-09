# PRD 2.5 — App da Pista (PWA do mecânico)

**Status: implementado e no ar em 09/11/2026 (v0.57.0, ADR-057).** A seção "Conta da pista" (abaixo) está em estudo e aguarda decisões do responsável.

Plano completo: https://claude.ai/artifact/Kvc2BhR74LdciZbrV2FFsc

## Já entregue (v0.57.0)
- PWA próprio em `/pista`, com manifesto e ícone laranja "Pista". O manifesto é trocado em tempo de execução.
- Quem entra: membro da oficina com "Executar OS" ou o responsável (`pista_context`). Hoje o mecânico usa a mesma conta do Moto Passaporte, criada por convite por e-mail.
- Link para instalar fica no menu da oficina → "App da Pista", logo após "Visão geral". Dá para enviar por WhatsApp, compartilhar, copiar ou baixar o QR.
- Duas regras, ambas ligadas por padrão: o mecânico pode pegar uma OS sem mecânico e pode marcar "Pronto".
- Telas:
  - Lista com Minhas / Sem mecânico / Todas e busca por placa.
  - OS com Iniciar, Pausar, Aguardando peça, Pronto (km de saída), itens, fotos por etapa, notas, áudio e checklist.
- Sem preços nem contato do cliente.
- Nova situação de OS: `ready` ("Pronto (mecânico)"). Concluir e entregar continuam no painel.
- Fotos: sempre redesenhadas (1600 px, JPEG 0,8), o que remove o GPS.
- Áudio:
  - Sem transcrição.
  - Formatos m4a, webm ou ogg, conferidos pela assinatura do arquivo.
  - Até 2 min por áudio e 30 por OS. Só a equipe ouve.
  - Apagado automaticamente 90 dias após a entrega (`system_expire_workshop_audios`).
- Sem internet: fila no IndexedDB com código único por envio. A shell fica em cache no service worker `mp-v2`.

## Relacionado (v0.57.1)
- Janela de pedido de acesso de oficina: abre ao entrar e a cada troca de tela enquanto houver pedido pendente. Opções: Autorizar, Recusar, Ver detalhes, Decidir depois.

## Em estudo — Conta da pista (pedido de 09/11/2026)
Pedido do responsável:
- O responsável cadastra o mecânico direto, sem convite, informando nome e apelido (e senha).
- O mecânico só acessa o App da Pista.
- O sistema encontra a oficina e loga o mecânico nela.
- O nome da oficina aparece dentro do app.

Proposta:
1. **Cadastro:** Equipe → "Novo mecânico", com nome, apelido (único na oficina) e senha. "Executar OS" já vem ligado.
2. **Link por oficina:** `/pista/<código-da-oficina>`. A tela de entrada mostra o nome da oficina e pede apelido + senha.
3. **Conta marcada "conta da pista":**
   - Só abre `/pista`; o bloqueio também vale no banco.
   - Não cadastra moto, não cria oficina, não assina plano e não ganha os 3 meses de Premium.
4. **Login:** usa um e-mail interno invisível, `apelido.codigo@pista.<domínio>`. A conta é criada por uma Edge Function com service role, que confere se quem pede é o responsável e cria a conta já confirmada. Nada de chave secreta no frontend.
5. **Gestão pelo responsável:** trocar senha (não existe "esqueci a senha"), desligar o mecânico (bloqueio e saída na hora) e ver o último acesso.
6. **Convite atual:** continua como opção para quem já tem conta.
7. **Cuidados:**
   - Limite de tentativas de login.
   - LGPD com dados mínimos; aviso de uso no primeiro acesso.
   - Subdomínio sem serviço de e-mail, de preferência junto com a migração para `motopassaporte.com.br`.

Esforço: médio.

Decisões pendentes:
1. Formato do login: apelido + senha (sugerido) ou apelido + PIN de 6 números.
2. "Trocar mecânico" no celular compartilhado: mostrar a lista de apelidos ou cada um digita o seu.
3. Mecânicos já convidados: manter no convite atual ou converter em "conta da pista".
