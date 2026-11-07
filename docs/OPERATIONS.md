# OPERATIONS — backup, restauração, rollback e monitoramento

PRD 18.4 e 20 · ADR-028 · Responsável: o responsável pelo produto (dono das chaves). Testado em banco de teste por `scripts/ops/restore_check.sh` (também roda em `scripts/validation/run_all.sh`).

## 1. O que é guardado, onde e por quanto tempo

| O quê | Como | Onde | Periodicidade | Retenção |
|---|---|---|---|---|
| Dados do app (schema `public`) | `pg_dump --data-only -n public` | Artefato do GitHub Actions, criptografado | Diário 03:17 (Brasília) + manual | 30 dias (`BACKUP_RETENTION_DAYS`, máx. 90) |
| Contas e metadados de arquivos (`auth.users`, `auth.identities`, `storage.buckets`, `storage.objects`) | `pg_dump --data-only -t ...` | Mesmo pacote | Diário | 30 dias |
| Estrutura do `public` (referência/perícia) | `pg_dump --schema-only` | Mesmo pacote | Diário | 30 dias |
| Arquivos (fotos, notas, PDFs) | `scripts/ops/backup_storage.mjs` (API de Storage) + `MANIFEST.json` | Artefato separado, criptografado | Diário | 30 dias |
| Estrutura do banco, funções, regras de acesso, Edge Functions, site | Git (`supabase/migrations`, `supabase/functions`, `src`) | GitHub | A cada commit | Permanente |
| Configurações do sistema (`system_settings`) | Dentro dos dados do `public` | — | Diário | 30 dias |
| Segredos (token e segredo do Mercado Pago, no Vault) | **Não entram no backup** | Só no Vault do Supabase | — | Recadastrar no painel admin após restaurar |

**Criptografia:** [age](https://age-encryption.org) com chave pública. O GitHub só tem a chave **pública** (variável `BACKUP_AGE_RECIPIENT`); quem tem a **privada** é só o responsável. Sem ela, ninguém (nem o GitHub, nem o Claude) abre o backup. Perder a chave privada = perder os backups.

**Plano do Supabase:** no plano Pro há também backup diário do próprio Supabase (7 dias) e opção de restauração a um instante (PITR, pago). O backup do GitHub é a cópia em **local separado** exigida pelo PRD 20 e vale em qualquer plano.

**Atenção — repositório público:** em repositório público, os artefatos podem ser baixados por qualquer pessoa logada no GitHub. O conteúdo está criptografado, mas nomes, datas e tamanhos ficam visíveis. Recomendado: tornar o repositório privado ou levar os pacotes para um armazenamento privado (KI-031).

## 2. Ativar o backup (uma vez)

1. Instalar o age no seu computador e gerar a chave: `age-keygen -o moto-passaporte-backup.key`. Guardar esse arquivo em dois lugares seguros (ex.: gerenciador de senhas e pendrive). **Não enviar a ninguém.**
2. Copiar a linha `# public key: age1...` do arquivo.
3. No GitHub: *Settings → Secrets and variables → Actions*:
   - **Variables:** `BACKUP_AGE_RECIPIENT` = a chave pública `age1...` (opcional: `BACKUP_RETENTION_DAYS`).
   - **Secrets:** `SUPABASE_DB_URL` = *Supabase → Connect → Session pooler* (URI com a senha do banco; o GitHub não usa IPv6, por isso o pooler), `SUPABASE_URL` = `https://ripgenhykaajcnzdxoid.supabase.co`, `SUPABASE_SERVICE_ROLE_KEY` = chave secreta (*Project Settings → API keys*).
4. *Actions → Backup → Run workflow* para o primeiro teste. Falhas geram e-mail do GitHub.

## 3. Restaurar

Princípio: **a estrutura vem das migrações do Git; os dados vêm do backup** (o backup só do `public` não carrega as regras dos arquivos em `storage.objects` nem o gatilho de nova conta em `auth.users`, que ficam em schemas do Supabase).

1. Baixar o artefato (*Actions → Backup → execução → Artifacts*) e abrir:
   `age -d -i moto-passaporte-backup.key db-AAAAMMDD.tar.age | tar -xf -` (o mesmo para `files-...`).
2. Criar um projeto Supabase novo (ou usar o atual, se a perda for só de dados) e aplicar **todas** as migrações de `supabase/migrations` em ordem, no commit indicado em `GIT_COMMIT` (ou mais novo, se compatível).
3. Limpar os dados semeados pelas migrações e carregar o backup com os gatilhos desligados (impede perfis duplicados e alterações na auditoria):
   ```sql
   set session_replication_role = replica;
   -- truncar todas as tabelas de public (cascade) e: delete from storage.objects; delete from storage.buckets;
   ```
   ```bash
   PGOPTIONS='-c session_replication_role=replica' pg_restore -d "$DB_URL" --data-only auth_storage_data.dump
   PGOPTIONS='-c session_replication_role=replica' pg_restore -d "$DB_URL" --data-only public_data.dump
   ```
4. Enviar os arquivos para o bucket `attachments` nos mesmos caminhos (`MANIFEST.json` lista tudo).
5. Republicar as Edge Functions (`supabase/functions`) e recadastrar no painel admin o token e o segredo do Mercado Pago (o Vault não vai no backup). Conferir o endereço do Webhook no Mercado Pago se o projeto mudou.
6. Conferir: rodar `tests/security/supabase/phase6e_security_sweep.sql` (nenhuma linha), entrar com uma conta de teste e abrir uma moto, um arquivo e o painel admin.

**Teste de restauração:** `scripts/ops/restore_check.sh` faz os passos 1–3 e 6 num banco de teste (dados → criptografia → restauração → mesmas linhas, funções, RLS, permissões, bucket privado, varredura e acesso do titular). Repetir com um backup real a cada 3 meses ou antes de mudanças grandes, num projeto Supabase separado.

## 4. Rollback por camada

| Camada | Como voltar | Observações |
|---|---|---|
| Site (Vercel) | *Vercel → Deployments → versão anterior → Promote to Production* (instantâneo), ou `git revert` + push | Não mexe no banco. Conferir compatibilidade com as migrações já aplicadas |
| Edge Functions | Republicar a versão anterior a partir do Git (`supabase/functions/<nome>`) | `storage-cleanup` e funções de pagamento dependem de funções do banco da mesma versão |
| Migrações | **Preferência: corrigir para frente** (nova migração). Quando for preciso desfazer: scripts em `supabase/rollback/*.down.sql`, do mais novo ao mais antigo | Cobertos e testados: Fase 6 (`admin_management` … `storage_monitoring`). Cada script diz o que se perde. O rollback de `admin_audit_settings` **não** reabre a escrita direta em configurações (falha de segurança corrigida) |
| Dados | Restaurar do backup (§3) ou do backup/PITR do Supabase | Reverter código não reverte dados (PRD 18.4). Histórico é imutável: correções são registros novos |
| Arquivos | Reenviar do pacote `files-...` | Arquivos só são apagados pela limpeza de "sem vínculo" (ADR-026) |

Cada release registra no `CHANGELOG.md` o que precisa para voltar; a nota "Rollback:" fica no cabeçalho de cada migração.

## 5. Monitoramento

| O quê | Onde ver hoje |
|---|---|
| Pagamentos e Webhooks | `/admin/assinaturas` (avisos recebidos, inválidos, falhas) e `/admin` (recusados, faturas com falha) |
| Armazenamento e limites | `/admin/armazenamento` (alertas por conta e oficina, arquivos sem vínculo) |
| Ações administrativas e mudanças | `/admin/auditoria` |
| Erros do banco, Auth e Edge Functions | Painel do Supabase → *Logs* |
| Erros e disponibilidade do site | Painel da Vercel → *Logs* / *Deployments* |
| Falha do backup | E-mail automático do GitHub Actions |

Ainda não há alerta ativo (e-mail/WhatsApp) para erro de aplicação, falha de login em massa ou indisponibilidade (KI-030). Alertas não devem conter dados pessoais.

## 6. Ambientes

Hoje há um ambiente (desenvolvimento = produção em teste) — KI-007. Antes do lançamento aberto: projeto Supabase de homologação separado, com dados fictícios. Não copiar dados reais para testes sem anonimização.
