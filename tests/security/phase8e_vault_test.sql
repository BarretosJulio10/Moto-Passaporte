-- =============================================================================
-- PRD 2.4 — Planos: modelo cofre (ADR-056). Banco de TESTE, depois das fases 8a–8d.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set V '99999999-9999-9999-9999-999999999991'
\set A '11111111-1111-1111-1111-111111111111'
\echo '--- PRD 2.4: cofre do plano gratuito'

select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (id, email, raw_user_meta_data) values
  (:'V', 'cofre@teste.local', '{"full_name":"Vera Cofre","terms_accepted":true,"terms_version":"0.1","privacy_version":"0.1"}');
update public.premium_grants set revoked_at = now() where user_id = :'V';
update public.system_settings set value = '0'::jsonb where key = 'vault_enabled';

select set_config('request.jwt.claim.sub', :'V', false);
set role authenticated;
select public.register_motorcycle('Honda', 'Bros 160', 2020, 'CFR-1A23', 5000) ->> 'motorcycle_id' as moto \gset
select public.create_maintenance_record(:'moto', 'oil_change', 'Óleo 1', (current_date - 400), p_mileage => 6000, p_service_value_cents => 5000,
       p_notes => 'nota antiga', p_items => '[{"item_name":"Óleo 10W30","quantity":1}]'::jsonb) ->> 'id' as r1 \gset
select public.create_maintenance_record(:'moto', 'tires', 'Pneu', (current_date - 300), p_mileage => 9000, p_service_value_cents => 30000) ->> 'id' as r2 \gset
select public.create_maintenance_record(:'moto', 'oil_change', 'Óleo 2', (current_date - 200), p_mileage => 12000, p_service_value_cents => 5500) ->> 'id' as r3 \gset
select public.create_maintenance_record(:'moto', 'brakes', 'Pastilhas', (current_date - 100), p_mileage => 15000, p_service_value_cents => 12000) ->> 'id' as r4 \gset
select public.create_maintenance_record(:'moto', 'inspection', 'Revisão', (current_date - 10), p_mileage => 18000, p_service_value_cents => 25000) ->> 'id' as r5 \gset
-- Correção do mais recente: a cadeia (original + correção) fica aberta junto
select public.create_maintenance_record(:'moto', 'inspection', 'Revisão', (current_date - 10), p_mileage => 18100, p_service_value_cents => 26000,
       p_corrects_record_id => :'r5', p_correction_reason => 'km certo') ->> 'id' as r5b \gset
select public.create_passport_share(:'moto', 'Antigo', 30, true, true, true, true, true, false) ->> 'token' as legacy \gset
reset role;
-- Simula link criado antes da migração (as linhas antigas receberam full_history = true)
alter table public.passport_shares disable trigger passport_shares_protect;
update public.passport_shares set full_history = true where token = :'legacy';
alter table public.passport_shares enable trigger passport_shares_protect;
select public.record_attachment_check(:'V' || '/aaaaaaaa-0000-4000-8000-000000000e01.jpg', :'V', 'image/jpeg', true);
insert into public.attachments (motorcycle_id, maintenance_record_id, storage_path, file_name, mime_type, file_size, kind, uploaded_by)
values (:'moto', :'r1', :'V' || '/aaaaaaaa-0000-4000-8000-000000000e01.jpg', 'nota-antiga.jpg', 'image/jpeg', 10, 'invoice', :'V');
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('attachments', :'V' || '/aaaaaaaa-0000-4000-8000-000000000e01.jpg', :'V', '{"mimetype":"image/jpeg","size":10}');

-- Cofre desligado: nada muda
select set_config('request.jwt.claim.sub', :'V', false);
set role authenticated;
select public.get_maintenance_timeline(:'moto') as t \gset
select tests.ok(jsonb_array_length(:'t'::jsonb) = 6 and not exists (select 1 from jsonb_array_elements(:'t'::jsonb) e where (e ->> 'locked')::boolean),
                'cofre desligado: linha do tempo inteira aberta');
select tests.ok((select count(*) from public.maintenance_records where motorcycle_id = :'moto') = 6, 'cofre desligado: leitura direta igual a antes');
select tests.ok(not (public.get_my_vault() ->> 'applies')::boolean, 'cofre desligado: get_my_vault diz que não se aplica');
reset role;

-- Liga o cofre
update public.system_settings set value = '1'::jsonb where key = 'vault_enabled';
select set_config('request.jwt.claim.sub', :'V', false);
set role authenticated;
select public.get_my_vault() as vlt \gset
select tests.ok((:'vlt'::jsonb ->> 'applies')::boolean and (:'vlt'::jsonb ->> 'open_records')::int = 2, 'gratuito: cofre ligado, 2 registros abertos');
select public.get_maintenance_timeline(:'moto') as t \gset
select tests.ok(jsonb_array_length(:'t'::jsonb) = 6, 'a lista continua completa');
select tests.ok((select count(*) from jsonb_array_elements(:'t'::jsonb) e where (e ->> 'locked')::boolean) = 3, '3 registros no cofre (r1, r2, r3)');
select tests.ok((select bool_and(not (e ->> 'locked')::boolean) from jsonb_array_elements(:'t'::jsonb) e
                  where e ->> 'id' in (:'r4', :'r5', :'r5b')), 'abertos: os 2 mais recentes e o original corrigido');
select tests.ok((select e -> 'mileage' = 'null'::jsonb and e -> 'service_value_cents' = 'null'::jsonb and e -> 'notes' = 'null'::jsonb
                        and e -> 'items' = '[]'::jsonb and e -> 'attachments' = '[]'::jsonb and e ->> 'title' = 'Óleo 1'
                   from jsonb_array_elements(:'t'::jsonb) e where e ->> 'id' = :'r1'),
                'registro fechado: título e data, sem km, valor, notas, peças e anexos');
select tests.ok((select (e ->> 'mileage')::int = 15000 from jsonb_array_elements(:'t'::jsonb) e where e ->> 'id' = :'r4'), 'registro aberto: detalhes completos');
select tests.ok((select count(*) from public.maintenance_records where motorcycle_id = :'moto') = 3, 'leitura direta da tabela: só os abertos');
select tests.ok((select count(*) from public.maintenance_timeline where motorcycle_id = :'moto') = 3, 'leitura direta da view: só os abertos');
select tests.ok(not exists (select 1 from public.maintenance_items where maintenance_record_id = :'r1'), 'peças de registro fechado não saem');
select tests.ok(not exists (select 1 from public.attachments where maintenance_record_id = :'r1'), 'anexo de registro fechado não aparece');
select tests.ok(not public.can_access_attachment_object(:'V' || '/aaaaaaaa-0000-4000-8000-000000000e01.jpg'), 'arquivo de registro fechado não baixa');
select public.get_spending_entries(:'moto', null, null, 'ownership', null, null, null, 'service') as se \gset
select tests.ok((select (e ->> 'locked')::boolean and e -> 'value_cents' = 'null'::jsonb and e -> 'mileage' = 'null'::jsonb
                   from jsonb_array_elements(:'se'::jsonb) e where e ->> 'id' = :'r2'), 'gastos: lançamento fechado sem valor e sem km');
select tests.ok((select (e ->> 'value_cents')::int = 12000 from jsonb_array_elements(:'se'::jsonb) e where e ->> 'id' = :'r4'), 'gastos: lançamento aberto com valor');
-- Exportação nunca consulta o plano
select public.export_my_data() as d \gset
select tests.ok((select (x ->> 'mileage')::int = 6000 from jsonb_array_elements(:'d'::jsonb -> 'motorcycles' -> 0 -> 'maintenance') x where x ->> 'title' = 'Óleo 1'),
                '"Meus dados" traz o registro fechado completo');
select public.export_my_attachments() as ea \gset
select tests.ok(exists (select 1 from jsonb_array_elements(:'ea'::jsonb) f where f ->> 'file_name' = 'nota-antiga.jpg' and f ->> 'bucket' = 'attachments'),
                'exportação de comprovantes inclui os do cofre');
-- Novo link de comprador: resumo
select public.create_passport_share(:'moto', 'Novo', 30, true, true, true, true, true, false) ->> 'token' as novo \gset
reset role;
set role anon;
select public.get_shared_passport(:'novo') as sp \gset
select tests.ok((:'sp'::jsonb ->> 'vault')::boolean and not (:'sp'::jsonb ? 'history')
                and (:'sp'::jsonb -> 'history_summary' ->> 'services')::int = 5
                and (:'sp'::jsonb -> 'history_summary' ->> 'last_mileage')::int = 18100, 'link novo do gratuito: só o resumo (5 serviços, último km)');
select tests.ok(not (:'sp'::jsonb -> 'options' ->> 'values')::boolean and not (:'sp'::jsonb -> 'options' ->> 'attachments')::boolean, 'resumo não promete valores nem anexos');
select public.get_shared_passport(:'legacy') as lp \gset
select tests.ok(not (:'lp'::jsonb ->> 'vault')::boolean and jsonb_array_length(:'lp'::jsonb -> 'history') = 5, 'link criado antes do cofre continua completo');
reset role;
select id as att from public.attachments where maintenance_record_id = :'r1' \gset
select tests.ok(public.shared_attachment_for_download(:'novo', :'att') is null, 'link em resumo não entrega comprovante');
select tests.ok(public.shared_attachment_for_download(:'legacy', :'att') is not null, 'link antigo entrega comprovante');
set role anon;
select tests.must_fail(format($$select public.get_maintenance_timeline(%L)$$, :'moto'), 'visitante não lê a linha do tempo');
reset role;

-- Outra conta não lê
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.get_maintenance_timeline(%L)$$, :'moto'), 'outra conta não lê a linha do tempo');
select tests.must_fail($$select public.vault_open_records('00000000-0000-0000-0000-000000000000')$$, 'função interna do cofre fechada');
reset role;

-- Premium abre tudo na hora
update public.premium_grants set revoked_at = null where user_id = :'V';
select set_config('request.jwt.claim.sub', :'V', false);
set role authenticated;
select public.get_maintenance_timeline(:'moto') as t \gset
select tests.ok(not exists (select 1 from jsonb_array_elements(:'t'::jsonb) e where (e ->> 'locked')::boolean), 'Premium: nada no cofre');
select tests.ok((select count(*) from public.maintenance_records where motorcycle_id = :'moto') = 6, 'Premium: leitura direta completa');
select tests.ok(public.can_access_attachment_object(:'V' || '/aaaaaaaa-0000-4000-8000-000000000e01.jpg'), 'Premium: comprovante antigo baixa');
reset role;
set role anon;
select tests.ok(public.get_shared_passport(:'novo') ? 'history', 'Premium: link novo mostra o histórico completo');
reset role;

-- Volta ao gratuito: fecha de novo, nada apagado
update public.premium_grants set revoked_at = now() where user_id = :'V';
select tests.ok((select count(*) from public.maintenance_records where motorcycle_id = :'moto') = 6, 'nada foi apagado');
select tests.ok(public.vault_notice_text() like '%2 registros mais recentes%', 'aviso do fim do bônus cita o cofre');

-- Termos novos
select set_config('request.jwt.claim.sub', :'V', false);
set role authenticated;
select public.accept_current_terms('0.2', '0.2');
select tests.must_fail($$select public.accept_current_terms('x y', '0.2')$$, 'versão inválida recusada');
reset role;
select tests.ok((select terms_version = '0.2' and privacy_version = '0.2' from public.profiles where id = :'V'), 'aceite dos termos novos registrado');

-- Limite da exportação de comprovantes
select set_config('request.jwt.claim.sub', :'V', false);
set role authenticated;
select public.export_my_attachments(); select public.export_my_attachments(); select public.export_my_attachments(); select public.export_my_attachments();
select tests.must_fail($$select public.export_my_attachments()$$, 'mais de 5 exportações de comprovantes em 24 h recusadas');
reset role;

update public.system_settings set value = '0'::jsonb where key = 'vault_enabled';
\o
\echo '=== TODOS OS TESTES DO COFRE PASSARAM ==='
