-- =============================================================================
-- Direitos do titular (LGPD art. 18; PRD 15.6; ADR-036)
-- - export_my_data(): cópia dos dados pessoais da conta e das motos atuais (acesso/portabilidade).
--   Sem caminhos de arquivo, códigos de links, chassi (cifrado, consultado na página da moto) nem
--   dados de outras pessoas além do nome de oficinas e e-mails que o próprio usuário informou.
-- - Pedidos de privacidade (exclusão, correção, acesso, outro): o usuário abre e acompanha; a
--   equipe responde em /admin/privacidade com motivo auditado; o usuário recebe aviso.
-- A exclusão em si segue procedimento manual documentado (docs/LGPD.md): histórico da moto é
-- preservado; dados pessoais são anonimizados.
-- Rollback: supabase/rollback/20261108161525_privacy_rights.down.sql
-- =============================================================================

create table if not exists public.privacy_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('deletion', 'correction', 'access', 'other')),
  details     text check (details is null or char_length(details) <= 1000),
  status      text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'rejected', 'canceled')),
  reply       text check (reply is null or char_length(reply) <= 1000),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists privacy_requests_user_idx on public.privacy_requests (user_id, created_at desc);
create index if not exists privacy_requests_status_idx on public.privacy_requests (status, created_at);
create index if not exists privacy_requests_resolved_by_idx on public.privacy_requests (resolved_by);
alter table public.privacy_requests enable row level security;
revoke all on public.privacy_requests from public, anon, authenticated;
comment on table public.privacy_requests is 'Pedidos dos titulares (LGPD art. 18, ADR-036). Só por funções.';

create or replace function public.create_privacy_request(p_kind text, p_details text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_kind not in ('deletion', 'correction', 'access', 'other') then
    raise exception 'Tipo de pedido inválido.' using errcode = '22023';
  end if;
  if p_kind in ('correction', 'other') and char_length(coalesce(trim(p_details), '')) < 10 then
    raise exception 'Descreva o pedido (pelo menos 10 caracteres).' using errcode = '22023';
  end if;
  if char_length(coalesce(p_details, '')) > 1000 then
    raise exception 'Descrição muito longa (máximo 1000 caracteres).' using errcode = '22023';
  end if;
  if (select count(*) from public.privacy_requests where user_id = v_uid and status in ('pending', 'in_progress')) >= 3 then
    raise exception 'Você já tem pedidos em andamento. Aguarde a resposta.' using errcode = 'P0001';
  end if;
  insert into public.privacy_requests (user_id, kind, details) values (v_uid, p_kind, nullif(trim(p_details), ''))
  returning id into v_id;
  perform public.write_audit('privacy_request', v_id::text, 'privacy_request_created', null, null, null, jsonb_build_object('kind', p_kind));
  return v_id;
end;
$$;

create or replace function public.get_my_privacy_requests()
returns table (id uuid, kind text, details text, status text, reply text, created_at timestamptz, resolved_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.kind, r.details, r.status, r.reply, r.created_at, r.resolved_at
    from public.privacy_requests r where r.user_id = auth.uid() order by r.created_at desc limit 50;
$$;

create or replace function public.cancel_my_privacy_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.privacy_requests set status = 'canceled', updated_at = now()
   where id = p_id and user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Pedido não encontrado ou já em análise.' using errcode = 'P0002';
  end if;
  perform public.write_audit('privacy_request', p_id::text, 'privacy_request_canceled', null, null, null, null);
end;
$$;

-- Cópia dos dados pessoais (acesso e portabilidade).
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_motos uuid[];
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  select coalesce(array_agg(motorcycle_id), '{}') into v_motos
    from public.motorcycle_ownerships where owner_user_id = v_uid and ended_at is null;
  perform public.write_audit('privacy_request', v_uid::text, 'privacy_data_exported', null, null, null, null);
  return jsonb_build_object(
    'generated_at', now(),
    'about', 'Cópia dos seus dados no Moto Passaporte (LGPD art. 18). Arquivos (fotos, notas) são baixados na página de cada moto. O chassi fica cifrado e aparece na página da moto.',
    'account', (select jsonb_build_object('name', p.full_name, 'email', p.email, 'phone', p.phone, 'created_at', p.created_at,
                  'terms_accepted_at', p.terms_accepted_at, 'terms_version', p.terms_version,
                  'privacy_accepted_at', p.privacy_accepted_at, 'privacy_version', p.privacy_version, 'account_status', p.account_status)
                  from public.profiles p where p.id = v_uid),
    'roles', (select coalesce(jsonb_agg(role), '[]') from public.user_roles where user_id = v_uid),
    'motorcycles', (select coalesce(jsonb_agg(jsonb_build_object(
        'brand', m.brand, 'model', m.model, 'version', m.version, 'manufacturing_year', m.manufacturing_year,
        'model_year', m.model_year, 'displacement_cc', m.displacement_cc, 'color', m.color, 'initial_notes', m.initial_notes,
        'owned_since', o.started_at, 'acquisition_date', o.acquisition_date,
        'plates', (select coalesce(jsonb_agg(jsonb_build_object('plate', pl.plate, 'valid_from', pl.valid_from, 'valid_until', pl.valid_until) order by pl.valid_from), '[]')
                     from public.motorcycle_plates pl where pl.motorcycle_id = m.id),
        'mileage', (select coalesce(jsonb_agg(jsonb_build_object('mileage', r.mileage, 'recorded_at', r.recorded_at, 'source', r.source_type, 'note', r.note) order by r.recorded_at), '[]')
                      from public.mileage_records r where r.motorcycle_id = m.id),
        'maintenance', (select coalesce(jsonb_agg(jsonb_build_object(
                          'service_date', t.service_date, 'category', t.category, 'title', t.title, 'description', t.description,
                          'mileage', t.mileage, 'workshop_name', t.workshop_name, 'service_value_cents', t.service_value_cents,
                          'notes', t.notes, 'status', t.status, 'is_void', t.is_void,
                          'items', t.items, 'files', (select coalesce(jsonb_agg(jsonb_build_object('file_name', x ->> 'file_name', 'kind', x ->> 'kind')), '[]')
                                                         from jsonb_array_elements(t.attachments) x)) order by t.service_date), '[]')
                          from public.maintenance_timeline t where t.motorcycle_id = m.id),
        'reminders', (select coalesce(jsonb_agg(jsonb_build_object('title', rm.title, 'every_km', rm.every_km, 'every_months', rm.every_months,
                         'due_date', rm.due_date, 'paused', rm.paused)), '[]')
                        from public.maintenance_reminders rm where rm.motorcycle_id = m.id and rm.owner_user_id = v_uid)
      ) order by o.started_at), '[]')
      from public.motorcycles m join public.motorcycle_ownerships o on o.motorcycle_id = m.id and o.owner_user_id = v_uid and o.ended_at is null),
    'previous_motorcycles', (select coalesce(jsonb_agg(jsonb_build_object('brand', m.brand, 'model', m.model, 'manufacturing_year', m.manufacturing_year,
        'owned_from', o.started_at, 'owned_until', o.ended_at, 'end_reason', o.end_reason) order by o.started_at), '[]')
      from public.motorcycle_ownerships o join public.motorcycles m on m.id = o.motorcycle_id
      where o.owner_user_id = v_uid and o.ended_at is not null),
    'diary', (select coalesce(jsonb_agg(jsonb_build_object('entry_date', d.entry_date, 'category', d.category, 'title', d.title, 'body', d.body,
        'location', d.location, 'visibility', d.visibility, 'motorcycle', mm.brand || ' ' || mm.model) order by d.entry_date), '[]')
      from public.motorcycle_diary d join public.motorcycles mm on mm.id = d.motorcycle_id where d.author_id = v_uid),
    'shares', (select coalesce(jsonb_agg(jsonb_build_object('label', s.label, 'created_at', s.created_at, 'expires_at', s.expires_at,
        'revoked_at', s.revoked_at, 'view_count', s.view_count, 'show_plate', s.show_plate, 'show_values', s.show_values,
        'show_attachments', s.show_attachments, 'show_diary', s.show_diary) order by s.created_at), '[]')
      from public.passport_shares s where s.created_by = v_uid and s.motorcycle_id = any (v_motos)),
    'transfers', (select coalesce(jsonb_agg(jsonb_build_object('direction', case when t.from_user_id = v_uid then 'sent' else 'received' end,
        'to_email', case when t.from_user_id = v_uid then t.to_email end, 'status', t.status, 'created_at', t.created_at, 'decided_at', t.decided_at) order by t.created_at), '[]')
      from public.transfer_requests t where t.from_user_id = v_uid or t.to_user_id = v_uid),
    'workshop_memberships', (select coalesce(jsonb_agg(jsonb_build_object('organization', g.name, 'role', om.role, 'status', om.status, 'since', om.created_at)), '[]')
      from public.organization_members om join public.organizations g on g.id = om.organization_id where om.user_id = v_uid),
    'subscriptions', (select coalesce(jsonb_agg(jsonb_build_object('plan', s.plan_name, 'status', s.status, 'price_cents', s.price_cents,
        'billing_period', s.billing_period, 'started_at', s.started_at, 'current_period_end', s.current_period_end, 'canceled_at', s.canceled_at) order by s.created_at), '[]')
      from public.subscriptions s where s.user_id = v_uid),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object('number', i.number, 'amount_cents', i.amount_cents, 'status', i.status,
        'period_start', i.period_start, 'period_end', i.period_end, 'paid_at', i.paid_at) order by i.created_at), '[]')
      from public.invoices i where i.user_id = v_uid),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('status', p.status, 'amount_cents', p.amount_cents, 'paid_at', p.paid_at, 'created_at', p.created_at) order by p.created_at), '[]')
      from public.payments p where p.user_id = v_uid),
    'plate_claims', (select coalesce(jsonb_agg(jsonb_build_object('plate', c.plate, 'status', c.status, 'note', c.requester_note, 'created_at', c.created_at)), '[]')
      from public.motorcycle_claim_requests c where c.requested_by = v_uid),
    'notifications', (select coalesce(jsonb_agg(jsonb_build_object('kind', n.kind, 'title', n.title, 'body', n.body, 'created_at', n.created_at, 'read_at', n.read_at) order by n.created_at), '[]')
      from (select * from public.notifications where user_id = v_uid order by created_at desc limit 500) n),
    'notification_preferences', (select coalesce(jsonb_agg(jsonb_build_object('kind', np.kind, 'in_app', np.in_app, 'email', np.email)), '[]')
      from public.notification_preferences np where np.user_id = v_uid),
    'privacy_requests', (select coalesce(jsonb_agg(jsonb_build_object('kind', r.kind, 'status', r.status, 'details', r.details, 'reply', r.reply,
        'created_at', r.created_at, 'resolved_at', r.resolved_at) order by r.created_at), '[]')
      from public.privacy_requests r where r.user_id = v_uid)
  );
end;
$$;

-- Administração
create or replace function public.admin_list_privacy_requests(p_status text default 'open', p_limit int default 100)
returns table (id uuid, user_id uuid, full_name text, email_masked text, kind text, details text, status text, reply text,
               created_at timestamptz, resolved_at timestamptz, motorcycles int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select r.id, r.user_id, p.full_name, public.mask_email(p.email), r.kind, r.details, r.status, r.reply, r.created_at, r.resolved_at,
           (select count(*)::int from public.motorcycle_ownerships o where o.owner_user_id = r.user_id and o.ended_at is null)
      from public.privacy_requests r
      left join public.profiles p on p.id = r.user_id
     where p_status = 'all' or (p_status = 'open' and r.status in ('pending', 'in_progress')) or r.status = p_status
     order by (r.status in ('pending', 'in_progress')) desc, r.created_at
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create or replace function public.admin_resolve_privacy_request(p_id uuid, p_status text, p_reply text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.require_admin_reason(p_reason);
  r public.privacy_requests;
begin
  if p_status not in ('in_progress', 'done', 'rejected') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(p_reply), '')) < 10 or char_length(p_reply) > 1000 then
    raise exception 'Escreva a resposta ao titular (10 a 1000 caracteres).' using errcode = '22023';
  end if;
  select * into r from public.privacy_requests where id = p_id for update;
  if not found or r.status not in ('pending', 'in_progress') then
    raise exception 'Pedido não encontrado ou já encerrado.' using errcode = 'P0002';
  end if;
  update public.privacy_requests
     set status = p_status, reply = trim(p_reply), updated_at = now(),
         resolved_by = case when p_status in ('done', 'rejected') then auth.uid() end,
         resolved_at = case when p_status in ('done', 'rejected') then now() end
   where id = p_id;
  perform public.write_audit('privacy_request', p_id::text, 'admin_resolve_privacy_request', null, null,
    jsonb_build_object('status', r.status), jsonb_build_object('status', p_status, 'reason', v_reason));
  perform public.notify(r.user_id, 'admin_notice',
    case p_status when 'in_progress' then 'Seu pedido de privacidade está em análise'
                  when 'done' then 'Seu pedido de privacidade foi atendido'
                  else 'Seu pedido de privacidade foi respondido' end,
    left(trim(p_reply), 1000), '/painel/conta', null);
end;
$$;

-- Exclusão a pedido do titular = anonimização (ADR-036). Quem já teve moto não pode ser apagado do
-- Auth (o histórico de titularidade é da moto); por isso os dados pessoais são apagados e a conta
-- fica sem identificação, bloqueada e sem login. Ficam: histórico das motos, transferências,
-- cobranças/notas/pagamentos (obrigação legal) e auditoria — ligados a uma conta anônima.
create or replace function public.admin_anonymize_account(p_request_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.require_admin_reason(p_reason);
  r public.privacy_requests;
  v_uid uuid;
  v_paths text[];
  v_diary int;
begin
  select * into r from public.privacy_requests where id = p_request_id for update;
  if not found or r.kind <> 'deletion' or r.status not in ('pending', 'in_progress') then
    raise exception 'Pedido de exclusão não encontrado ou já encerrado.' using errcode = 'P0002';
  end if;
  v_uid := r.user_id;
  if exists (select 1 from public.user_roles where user_id = v_uid and role = 'admin') then
    raise exception 'Conta de administrador: retire o papel admin antes.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.motorcycle_ownerships where owner_user_id = v_uid and ended_at is null) then
    raise exception 'O titular ainda tem motos no nome. Elas precisam ser transferidas ou arquivadas antes.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.subscriptions where user_id = v_uid and status in ('pending', 'active', 'past_due', 'paused')) then
    raise exception 'O titular tem assinatura ativa. Cancele no Mercado Pago e aguarde a conciliação antes.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.organization_members where user_id = v_uid and status = 'active') then
    raise exception 'O titular ainda faz parte de uma oficina. Remova-o da equipe (ou transfira a responsabilidade) antes.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.transfer_requests where (from_user_id = v_uid or to_user_id = v_uid) and status = 'pending') then
    raise exception 'Há transferência pendente envolvendo o titular. Aguarde ou cancele antes.' using errcode = 'P0001';
  end if;

  -- Diário (conteúdo pessoal) e fotos: os arquivos ficam sem registro e saem na limpeza automática.
  select coalesce(array_agg(a.storage_path), '{}') into v_paths
    from public.attachments a join public.motorcycle_diary d on d.id = a.diary_entry_id where d.author_id = v_uid;
  perform set_config('app.diary_photo_delete', 'on', true);
  delete from public.attachments a using public.motorcycle_diary d where d.id = a.diary_entry_id and d.author_id = v_uid;
  perform set_config('app.diary_photo_delete', 'off', true);
  delete from public.motorcycle_diary where author_id = v_uid;
  get diagnostics v_diary = row_count;

  delete from public.notifications where user_id = v_uid;
  delete from public.notification_preferences where user_id = v_uid;
  delete from public.maintenance_reminders where owner_user_id = v_uid;
  delete from public.motorcycle_claim_requests where requested_by = v_uid;
  update public.passport_shares set created_by = null where created_by = v_uid;
  update public.privacy_requests set details = null, updated_at = now() where user_id = v_uid and id <> p_request_id;

  update public.profiles
     set full_name = 'Conta excluída', email = null, phone = null, avatar_url = null,
         account_status = 'blocked', status_reason = 'Conta excluída a pedido do titular (LGPD)',
         status_changed_at = now(), status_changed_by = auth.uid()
   where id = v_uid;

  update auth.users
     set email = 'excluida-' || v_uid || '@anon.invalid', raw_user_meta_data = '{}'::jsonb, banned_until = 'infinity'
   where id = v_uid;
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
    execute 'update auth.users set phone = null, encrypted_password = '''' where id = $1' using v_uid;
  end if;
  if to_regclass('auth.identities') is not null then execute 'delete from auth.identities where user_id = $1' using v_uid; end if;
  if to_regclass('auth.sessions') is not null then execute 'delete from auth.sessions where user_id = $1' using v_uid; end if;
  if to_regclass('auth.mfa_factors') is not null then execute 'delete from auth.mfa_factors where user_id = $1' using v_uid; end if;

  update public.privacy_requests
     set status = 'done', details = null, reply = 'Conta excluída: dados pessoais apagados; histórico das motos e registros exigidos por lei mantidos sem identificação.',
         resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
   where id = p_request_id;
  perform public.write_audit('privacy_request', p_request_id::text, 'admin_anonymize_account', null, null, null,
    jsonb_build_object('reason', v_reason, 'diary_entries', v_diary, 'diary_files', coalesce(array_length(v_paths, 1), 0)));
  return jsonb_build_object('diary_entries', v_diary, 'diary_files', coalesce(array_length(v_paths, 1), 0));
end;
$$;
revoke execute on function public.admin_anonymize_account(uuid, text) from public, anon;
grant execute on function public.admin_anonymize_account(uuid, text) to authenticated;

revoke execute on function public.create_privacy_request(text, text) from public, anon;
revoke execute on function public.get_my_privacy_requests() from public, anon;
revoke execute on function public.cancel_my_privacy_request(uuid) from public, anon;
revoke execute on function public.export_my_data() from public, anon;
revoke execute on function public.admin_list_privacy_requests(text, int) from public, anon;
revoke execute on function public.admin_resolve_privacy_request(uuid, text, text, text) from public, anon;
grant execute on function public.create_privacy_request(text, text) to authenticated;
grant execute on function public.get_my_privacy_requests() to authenticated;
grant execute on function public.cancel_my_privacy_request(uuid) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.admin_list_privacy_requests(text, int) to authenticated;
grant execute on function public.admin_resolve_privacy_request(uuid, text, text, text) to authenticated;
