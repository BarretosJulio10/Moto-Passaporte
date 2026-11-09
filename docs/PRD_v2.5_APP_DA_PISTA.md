# PRD 2.5 — App da Pista (PWA do mecânico)

**Status: implementado e no ar em 09/11/2026 (v0.57.0, ADR-057; conta da pista v0.58.0, ADR-058).**

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

## Conta da pista (v0.58.0, ADR-058) — no ar
Decisões do responsável em 09/11/2026: login por apelido + senha; no celular compartilhado cada mecânico digita o próprio apelido; quem já foi convidado vira conta da pista e o responsável define a senha.

- Equipe → "Mecânicos da pista": nome, apelido (único na oficina) e senha (mín. 6). Sem e-mail e sem convite; "Executar OS" já vem ligado.
- Lista com último acesso, Trocar senha, Desligar (sai na hora; OS em andamento ficam sem mecânico) e Reativar. Não existe "esqueci a senha": o responsável cria outra.
- Funcionário convidado por e-mail: botão "Virar conta da pista" (apelido e senha); as OS em andamento passam para a conta nova e a conta pessoal sai da equipe.
- Entrada: `/pista/<código>` mostra o nome da oficina e pede apelido e senha. Sem o link, o app pede o código (aparece no menu "App da Pista" e na Equipe) e guarda no aparelho. "Entrar com e-mail" para o responsável.
- A conta só usa o App da Pista: bloqueio no banco para toda chamada fora de `pista_*`, envio de arquivos só no bucket da oficina, sem plano nem Premium de boas-vindas; o painel redireciona para `/pista`.
- Login interno: `apelido.código@pista.motopassaporte.com.br` (ninguém vê; criado no servidor pela função `pista-accounts`).
- Pendências: tentativas de login seguem o limite padrão do Supabase Auth; trocar o apelido exige criar outro acesso.
