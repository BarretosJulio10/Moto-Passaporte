# Aprovação digital do orçamento (PRD 2.1 §7, §13.3, §20.2)

## Link

- Gerado ao enviar (ou reenviar). Token de 32 bytes aleatórios em base64url (43 caracteres); o banco guarda só o SHA-256.
- O token aparece uma única vez para a oficina (copiar / WhatsApp / QR Code no PDF). Reenviar cria outro e revoga o anterior.
- Vale até o fim do dia da validade (Brasília). Nova versão, cancelamento ou "Desativar link" revogam. Depois da resposta o link mostra só o comprovante.
- A página mostra oficina, moto, número, itens, valores, total, condições e validade. Nunca CPF, observações internas ou ids.
- Consultas anônimas limitadas por conexão (ADR-035, chave `quote_link_requests_per_hour`, padrão 120/h).

## Decisão

- Cliente marca os itens que autoriza (todos marcados ao abrir), escreve o nome completo e confirma o texto exibido. Recusar abre campo de motivo opcional.
- Integral = todos; parcial = alguns; recusa = nenhum. Total aprovado recalculado (desconto proporcional aos itens aprovados).
- Decisão única por versão (índice único + bloqueio da linha do orçamento).

## Registro de aceite (`workshop_quote_approvals`, imutável)

Orçamento, versão, link, decisão, posições aprovadas e recusadas, total aprovado, nome, motivo, texto confirmado, versão dos termos (`orcamento-v1`), identificador da sessão da página, IP e navegador (só como evidência; a tela da oficina não os mostra), código do comprovante, data e hora.

O aceite é evidência documental da autorização comercial. **Não** equivale a assinatura qualificada ICP-Brasil; validade jurídica a revisar (KI-035).

## Avisos

Equipe com permissão de orçamento recebe: orçamento visualizado (opcional), respondido, vencido — no sistema e no celular.
