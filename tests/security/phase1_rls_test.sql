-- =============================================================================
-- Testes de segurança e integridade — Fase 1
-- Executar em banco de TESTE após tests/db/supabase_stub.sql + migrações.
-- Uso: psql -v ON_ERROR_STOP=1 -f tests/security/phase1_rls_test.sql
-- Qualquer falha interrompe o script com "FALHOU: ...".
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.ok(p_cond boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FALHOU: %', p_label;
  end if;
  raise notice 'OK  %', p_label;
end $$;

create function tests.must_fail(p_sql text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'OK  % (bloqueado: %)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FALHOU: % — a operação deveria ter sido bloqueada', p_label;
end $$;

grant execute on all functions in schema tests to anon, authenticated;

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Cadastro de usuários'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'A', 'ana@teste.local',    '{"full_name":"Ana","terms_accepted":true,"terms_version":"1.0","privacy_version":"1.0"}'),
  (:'B', 'bruno@teste.local',  '{"full_name":"Bruno","terms_accepted":true,"terms_version":"1.0","privacy_version":"1.0"}'),
  (:'C', 'carlos@teste.local', '{"full_name":"Carlos","terms_accepted":true,"terms_version":"1.0","privacy_version":"1.0"}'),
  (:'D', 'admin@teste.local',  '{"full_name":"Admin"}');

select tests.ok((select count(*) = 4 from public.profiles), 'perfil criado automaticamente no cadastro');
select tests.ok((select count(*) = 4 from public.user_roles where role = 'owner'), 'papel owner atribuído no cadastro');
select tests.ok((select terms_accepted_at is not null from public.profiles where id = :'A'), 'aceite dos termos registrado');
select tests.ok((select terms_accepted_at is null from public.profiles where id = :'D'), 'sem aceite quando não informado');
insert into public.user_roles (user_id, role) values (:'D', 'admin'); -- concessão interna

-- =============================================================================
\echo '--- Usuária A (proprietária)'
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;

select r->>'status' as st_a, r->>'motorcycle_id' as moto_a, r->>'public_id' as pub_a
from (select public.register_motorcycle('Honda', 'CB 500F', 2022, 'abc-1d23', 12000,
        p_model_year => 2023, p_displacement_cc => 471, p_color => 'Preta',
        p_chassis => '9c2pc4500nr000001') r) s \gset
select tests.ok(:'st_a' = 'created', 'A cadastra a moto');
select tests.ok((select count(*) = 1 from public.my_motorcycles), 'moto aparece em my_motorcycles');
select tests.ok((select current_plate = 'ABC1D23' and latest_mileage = 12000 from public.my_motorcycles), 'placa normalizada e km inicial registrados');
select tests.ok((select chassis = '9C2PC4500NR000001' from public.motorcycle_private where motorcycle_id = :'moto_a'), 'A vê o próprio chassi');

select tests.must_fail($$select public.register_motorcycle('Yamaha','MT-03',2021,'XYZ1234',5000)$$, 'limite de 1 moto no plano gratuito');
select tests.must_fail(format($$update public.motorcycles set public_id = 'x' where id = %L$$, :'moto_a'), 'public_id não pode ser alterado');
select tests.must_fail(format($$delete from public.motorcycles where id = %L$$, :'moto_a'), 'moto não pode ser excluída pelo usuário');
select tests.must_fail(format($$insert into public.user_roles (user_id, role) values (%L, 'admin')$$, :'A'), 'usuário não se torna admin');
select tests.must_fail($$update public.profiles set email = 'x@x.com'$$, 'usuário não altera e-mail do perfil diretamente');
select tests.must_fail($$select public.write_audit('x','x','x')$$, 'usuário não escreve auditoria diretamente');
select tests.must_fail(format($$insert into public.motorcycle_ownerships (motorcycle_id, owner_user_id) values (%L, %L)$$, :'moto_a', :'A'), 'titularidade não é criada pelo frontend');

with u as (update public.motorcycles set color = 'Vermelha' where id = :'moto_a' returning 1)
select tests.ok((select count(*) = 1 from u), 'A edita dados básicos da própria moto');
with u as (update public.profiles set full_name = 'Ana Souza' where id = :'A' returning 1)
select tests.ok((select count(*) = 1 from u), 'A edita o próprio nome');

select tests.ok((public.record_mileage(:'moto_a', 15000)->>'below_previous')::boolean = false, 'km maior não gera alerta');
select tests.ok((public.record_mileage(:'moto_a', 9000, p_note => 'teste')->>'below_previous')::boolean = true, 'km menor gera alerta de inconsistência');
select tests.must_fail($$update public.mileage_records set mileage = 1$$, 'leitura de km não pode ser sobrescrita');
select tests.must_fail($$delete from public.mileage_records$$, 'leitura de km não pode ser excluída');

select public.change_motorcycle_plate(:'moto_a', 'ABC1234');
select tests.ok((select count(*) = 2 from public.motorcycle_plates where motorcycle_id = :'moto_a'), 'troca de placa preserva histórico');
select tests.ok((select count(*) = 1 from public.motorcycles), 'troca de placa não cria outra moto');
select tests.ok((select current_plate = 'ABC1234' from public.my_motorcycles), 'placa atual atualizada');

update public.motorcycle_private set chassis = '9C2PC4500NR000002' where motorcycle_id = :'moto_a';
select tests.ok((select count(*) = 0 from public.audit_logs), 'usuária comum não lê a auditoria');

reset role;

-- =============================================================================
\echo '--- Usuário B (outro proprietário)'
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;

select tests.ok((select count(*) = 0 from public.motorcycles),           'B não vê a moto de A');
select tests.ok((select count(*) = 0 from public.motorcycle_plates),     'B não vê placas de A');
select tests.ok((select count(*) = 0 from public.motorcycle_private),    'B não vê chassi de A');
select tests.ok((select count(*) = 0 from public.mileage_records),       'B não vê km de A');
select tests.ok((select count(*) = 0 from public.motorcycle_ownerships), 'B não vê titularidade de A');
select tests.ok((select count(*) = 1 from public.profiles),              'B vê apenas o próprio perfil');

select tests.ok((public.register_motorcycle('Honda','CB 500F',2022,'ABC-1234',100)->>'status') = 'verification_required',
                'placa ativa duplicada gera pedido de verificação');
select tests.ok((select count(*) = 0 from public.motorcycles), 'pedido de verificação não revela a moto existente');
select tests.must_fail($$select motorcycle_id from public.motorcycle_claim_requests$$, 'B não vê qual moto corresponde ao pedido');
select tests.ok((select count(*) = 1 from public.motorcycle_claim_requests), 'B acompanha o próprio pedido');

select tests.ok((public.register_motorcycle('Yamaha','Fazer 250',2019,'ABC1D23',30000)->>'status') = 'created',
                'placa antiga (não ativa) pode ser reutilizada por outra moto');

with u as (update public.motorcycles set color = 'Hackeada' where id = :'moto_a' returning 1)
select tests.ok((select count(*) = 0 from u), 'B não edita a moto de A');
with u as (update public.motorcycle_private set chassis = 'XXXXX' where motorcycle_id = :'moto_a' returning 1)
select tests.ok((select count(*) = 0 from u), 'B não altera o chassi de A');
select tests.must_fail(format($$select public.change_motorcycle_plate(%L, 'QWE1234')$$, :'moto_a'), 'B não troca a placa de A');
select tests.must_fail(format($$select public.record_mileage(%L, 99999)$$, :'moto_a'), 'B não registra km na moto de A');

reset role;

-- =============================================================================
\echo '--- Visitante anônimo'
select set_config('request.jwt.claim.sub', '', false);
set role anon;

select tests.ok((public.get_public_passport(:'pub_a')->>'brand') = 'Honda', 'passaporte público responde pelo public_id');
select tests.ok(not (public.get_public_passport(:'pub_a') ?| array['plate','chassis','owner','current_plate']),
                'passaporte público não expõe placa, chassi nem proprietário');
select tests.ok(public.get_public_passport('00000000000000000000000000000000') is null, 'public_id inexistente retorna vazio');
select tests.ok(public.get_public_passport(:'moto_a') is null, 'id interno não funciona como link público');
select tests.must_fail($$select * from public.motorcycles$$, 'anônimo não lê tabela de motos');
select tests.must_fail($$select * from public.profiles$$, 'anônimo não lê perfis');
select tests.must_fail($$select public.register_motorcycle('a','b',2020,'AAA1111',1)$$, 'anônimo não cadastra moto');
select tests.ok((select count(*) = 1 from public.system_settings), 'anônimo vê apenas configurações públicas');

reset role;

-- =============================================================================
\echo '--- Oficina (usuário C)'
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;

select public.create_workshop('Oficina do Carlos', 'oficina-do-carlos', 'Barretos', 'sp',
                              p_cnpj => '12.345.678/0001-90') as org_c \gset
select tests.ok(public.has_role('workshop'), 'criar oficina concede papel workshop');
select tests.ok(public.is_org_responsible(:'org_c'), 'criador é responsável pela oficina');
select tests.ok((select cnpj = '12345678000190' and state = 'SP' from public.workshops), 'CNPJ e UF normalizados');
select tests.ok((select count(*) = 0 from public.motorcycles), 'oficina não vê motos sem autorização');
with u as (update public.workshops set description = 'Especialista em motos' where organization_id = :'org_c' returning 1)
select tests.ok((select count(*) = 1 from u), 'responsável edita o perfil da oficina');
select tests.must_fail(format($$update public.workshops set verification_status = 'verified' where organization_id = %L$$, :'org_c'),
                       'oficina não se autoverifica');

reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok((select count(*) = 1 from public.workshops), 'perfil público da oficina visível a usuários');
select tests.ok((select count(*) = 0 from public.organizations), 'A não vê dados internos da organização');
select tests.ok((select count(*) = 0 from public.organization_members), 'A não vê membros da oficina');
with u as (update public.workshops set description = 'invadido' returning 1)
select tests.ok((select count(*) = 0 from u), 'A não edita perfil de oficina alheia');
reset role;

set role anon;
select tests.ok((select count(*) = 1 from public.workshops), 'perfil público da oficina visível a anônimos');
reset role;

-- =============================================================================
\echo '--- Administrador (usuário D)'
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((select count(*) > 0 from public.audit_logs), 'admin lê a auditoria');
select tests.ok((select count(*) = 2 from public.motorcycles), 'admin vê dados básicos das motos');
select tests.ok((select count(*) = 0 from public.motorcycle_private), 'admin NÃO vê chassi por padrão');
select tests.ok((select count(*) = 0 from public.motorcycle_plates), 'admin NÃO vê placas por padrão');
select tests.must_fail($$update public.audit_logs set action = 'x'$$, 'nem admin altera auditoria');
reset role;

-- =============================================================================
\echo '--- Integridade (mesmo com privilégio máximo do banco)'
select set_config('request.jwt.claim.sub', '', false);
select tests.must_fail($$delete from public.audit_logs$$,            'auditoria não pode ser apagada');
select tests.must_fail($$truncate public.audit_logs$$,               'auditoria não pode ser truncada');
select tests.must_fail($$delete from public.motorcycles$$,           'motos não podem ser apagadas');
select tests.must_fail($$delete from public.motorcycle_ownerships$$, 'titularidades não podem ser apagadas');
select tests.must_fail($$delete from public.motorcycle_plates$$,     'histórico de placas não pode ser apagado');
select tests.must_fail($$update public.mileage_records set mileage = 1$$, 'km não pode ser sobrescrita');
select tests.must_fail(format($$delete from auth.users where id = %L$$, :'A'), 'excluir conta não apaga a história da moto');
select tests.ok((select count(*) = 0 from public.audit_logs where action = 'chassis_changed' and new_data is not null),
                'auditoria de chassi não grava o valor');
select tests.ok((select count(*) >= 1 from public.audit_logs where action = 'duplicate_plate_claim'), 'pedido de duplicidade auditado');

\echo '=== TODOS OS TESTES DA FASE 1 PASSARAM ==='
