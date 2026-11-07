# HOMOLOGATION — roteiro de testes com o Supabase e o Mercado Pago reais

Complementa os testes automáticos (ADR-027). O ambiente do Claude não alcança o Supabase nem o site pela rede (KI-009), então os fluxos com backend real são conferidos por este roteiro, no navegador, antes do lançamento (PRD 22, item 6.6).

**Como usar:** usar contas de teste (não a conta de admin para os papéis de proprietário/comprador/oficina). Marcar cada item com data e quem conferiu. Qualquer falha vira item em `KNOWN_ISSUES.md`.

Pré-requisitos: três contas de teste com e-mail confirmado — **P** (proprietário), **C** (comprador), **O** (responsável de oficina); conta **A** (admin). Credenciais de teste do Mercado Pago cadastradas (KI-026).

## 1. Visitante
- [ ] Página inicial, perguntas frequentes, contato (WhatsApp), termos e privacidade abrem no celular sem rolagem lateral.
- [ ] Passaporte público (`/p/...`) mostra só dados públicos; sem placa, chassi, dono ou valores.
- [ ] `/painel` sem login leva para "Entrar".

## 2. Proprietário (P)
- [ ] Criar conta, confirmar e-mail, aceitar termos, entrar e sair; recuperar senha.
- [ ] Cadastrar moto (placa nova). Tentar a mesma placa com C → vira pedido de verificação (C não vê dados da moto).
- [ ] Registrar manutenção com peças e foto/PDF; corrigir um registro (original fica no histórico).
- [ ] Quilometragem menor que a anterior exige confirmação.
- [ ] Diário: criar, editar, apagar entrada com foto.
- [ ] Gerar link de compartilhamento, abrir em janela anônima, revogar e confirmar que parou.
- [ ] Gerar relatório e salvar em PDF.
- [ ] Plano gratuito não deixa cadastrar a 2ª moto.

## 3. Oficina (O)
- [ ] Criar oficina, perfil público em `/oficinas/...`.
- [ ] Pesquisar a placa de P e pedir acesso; P aprova no painel.
- [ ] Registrar serviço com comprovante; P vê o selo "confirmado por oficina".
- [ ] Convidar um funcionário, ajustar permissões, remover.
- [ ] P revoga o acesso; O não vê mais o histórico.

## 4. Comprador (C)
- [ ] P envia transferência para o e-mail de C; C vê resumo antes de aceitar.
- [ ] C aceita: moto e histórico passam para C; acessos de oficina encerrados; P vê em "Motos anteriores" só o próprio diário.

## 5. Pagamentos (ambiente de teste do Mercado Pago)
- [ ] Admin: salvar token, testar conexão, cadastrar segredo do Webhook, liberar contratação.
- [ ] C assina o Premium mensal com cartão de teste aprovado → plano muda; fatura e recibo aparecem.
- [ ] Cartão de teste recusado → nada liberado; mensagem clara.
- [ ] Cancelar → Premium até o fim do período.
- [ ] Admin: avisos do Webhook aparecem como processados; conciliação manual não altera nada indevido.
- [ ] Reembolso feito no painel do Mercado Pago → Premium encerra.

## 6. Administração (A)
- [ ] Indicadores do painel batem com os dados de teste.
- [ ] Ver dados de um usuário exige motivo e aparece na auditoria.
- [ ] Suspender C → C não consegue entrar de novo; reativar.
- [ ] Decidir o pedido de verificação de placa; P recebe o aviso anônimo.
- [ ] Alterar uma configuração com motivo; conferir na auditoria.
- [ ] Armazenamento: números coerentes; limpeza sem arquivos sem vínculo responde "nada para limpar".

## 7. Segurança (com contas reais)
- [ ] Com a conta C, trocar o id de uma moto de P na URL → página não mostra nada.
- [ ] Com a conta O sem autorização, abrir `/oficina/<org>/motos/<moto de P>` → sem acesso.
- [ ] Rodar `tests/security/supabase/phase6e_security_sweep.sql` no SQL Editor → nenhuma linha.
