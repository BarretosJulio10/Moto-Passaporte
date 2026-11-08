# LGPD — tratamento de dados pessoais no Moto Passaporte

PRD 15.6 · ADR-036 · **Rascunho técnico: precisa de revisão jurídica antes do lançamento** (PRD 15.6). Não substitui a política de privacidade publicada em `/privacidade`, que deve ser alinhada a este documento.

## 1. Papéis

- **Controlador:** responsável pelo Moto Passaporte (definir razão social/CNPJ e encarregado — DPO — com o jurídico).
- **Operadores:** Supabase (banco, autenticação, arquivos — us-east-1, EUA), Vercel (site), Mercado Pago (pagamentos), GitHub (código e backups criptografados).
- **Transferência internacional:** banco e arquivos ficam nos EUA (ADR-009, KI-006). Base: cláusulas contratuais dos operadores — confirmar com o jurídico.

## 2. Dados, finalidade e base legal (proposta)

| Dados | Finalidade | Base legal (art. 7º) | Retenção |
|---|---|---|---|
| Nome, e-mail, telefone, senha (hash) | Conta, login, contato de suporte | Execução de contrato | Enquanto a conta existir; apagados na exclusão |
| Aceite dos termos e da privacidade (data e versão) | Prova do aceite | Cumprimento de obrigação / exercício de direitos | Mantido sem identificação após exclusão |
| Motos, placas, chassi (cifrado), quilometragem, manutenções, comprovantes | Histórico da moto (produto) | Execução de contrato | **Pertence à moto**: segue com o próximo dono; na exclusão, fica sem ligação com a pessoa |
| Diário (textos e fotos) | Lembranças do titular | Execução de contrato | Apagado na exclusão |
| Assinaturas, faturas, pagamentos | Cobrança e obrigações fiscais | Obrigação legal | 5 anos (fiscal), sem dados de contato após exclusão |
| Transferências (inclui e-mail do comprador informado pelo vendedor) | Prova da transferência de titularidade | Exercício regular de direitos | Mantido (histórico da moto) |
| Auditoria (quem fez o quê) | Segurança e prova | Legítimo interesse / exercício de direitos | Mantida; acesso só de administradores com MFA |
| Aparelhos com notificação no celular (endereço de push do navegador, chaves públicas, nome do aparelho como "Android · Chrome") | Enviar os avisos ao celular | Consentimento (o titular ativa e desativa) | Até desativar, desinstalar ou 5 falhas seguidas; apagados com a conta. O texto vai criptografado (ADR-040) |
| Resumo do IP com chave diária (limite de consultas) | Segurança contra abuso | Legítimo interesse | 2 dias (ADR-035) |
| Pesquisas de placa por oficinas (placa em resumo) | Segurança e limite | Legítimo interesse | Ver `plate_search_log` |

## 3. Direitos do titular (art. 18) — como são atendidos

| Direito | Como | Prazo |
|---|---|---|
| Confirmação e acesso | `/painel/conta` → **Baixar meus dados** (imediato, JSON) | Imediato |
| Portabilidade | Mesmo arquivo JSON (formato aberto) | Imediato |
| Correção | Nome e telefone em `/painel/conta`; demais: pedido "Corrigir dados" | 15 dias |
| Eliminação | Pedido "Excluir minha conta" → `/admin/privacidade` → **Anonimizar conta** | 15 dias |
| Informação sobre compartilhamento | Este documento e a política de privacidade | — |
| Revogação de consentimento | Links de compartilhamento revogáveis; página pública desligável por moto | Imediato |

Todos os pedidos ficam em `privacy_requests`, com resposta registrada, motivo auditado e aviso ao titular.

## 4. Procedimento de exclusão (anonimização)

Quem já teve moto não pode ser apagado do sistema de login: o histórico de titularidade é da moto. Por isso a exclusão **anonimiza**:

1. O titular abre o pedido em `/painel/conta`.
2. O admin confere em `/admin/privacidade` e resolve os impedimentos que a função aponta:
   - motos no nome → o titular transfere ou arquiva;
   - assinatura ativa → cancelar no Mercado Pago e aguardar a conciliação;
   - membro de oficina → remover da equipe ou transferir a responsabilidade;
   - transferência pendente → aguardar ou cancelar;
   - papel admin → retirar antes.
3. **Anonimizar conta** (com motivo): apaga nome, e-mail, telefone, foto, login (e-mail trocado por endereço anônimo, senha, sessões, MFA e identidades removidos, conta bloqueada), diário e fotos do diário, avisos e preferências, lembretes, pedidos de verificação de placa e detalhes de outros pedidos. Links de compartilhamento perdem o autor.
4. Ficam, sem identificação: histórico das motos e das titularidades, transferências, cobranças/faturas/pagamentos, auditoria e o próprio pedido (sem detalhes).
5. Os arquivos do diário ficam sem registro e saem na limpeza automática diária (ADR-029). Backups antigos expiram em 30 dias (ADR-028).

## 5. Incidentes de segurança

1. **Conter:** revogar chaves expostas (Supabase → API keys; token do Mercado Pago em `/admin/pagamentos`), suspender contas envolvidas, publicar correção.
2. **Avaliar:** dados afetados, titulares, período — usar `/admin/auditoria`, logs do Supabase e da Vercel.
3. **Comunicar:** à ANPD e aos titulares afetados, em prazo razoável (Resolução CD/ANPD nº 15/2024: 3 dias úteis), quando houver risco ou dano relevante. Modelo de comunicação a definir com o jurídico.
4. **Registrar:** o que aconteceu, decisões e medidas, por 5 anos.

## 6. Medidas de segurança (resumo)

RLS em todas as tabelas, escrita só por funções, MFA obrigatório para administradores, chassi cifrado, arquivos privados com links temporários e conferência de conteúdo, segredos no Vault, backups criptografados com chave só do responsável, varredura de segurança automática. Detalhes em `SECURITY.md`.

## 7. Pendências para o jurídico

- Razão social, CNPJ e encarregado (DPO) para a política de privacidade.
- Confirmar bases legais e prazos de retenção da tabela 2.
- Transferência internacional (Supabase nos EUA).
- Texto da política de privacidade e dos termos alinhado a este documento.
- Modelo de comunicação de incidente.
