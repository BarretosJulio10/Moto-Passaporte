-- Reversão de spending_phase_c (ADR-052).
drop function if exists public.get_spending_export(uuid, date, date, text, text, text, text, text);
create or replace view public.storage_unlinked_objects
with (security_invoker = true) as
  select o.name, coalesce((o.metadata ->> 'size')::bigint, 0) as size_bytes, o.created_at,
         o.created_at < now() - make_interval(hours => public.setting_int('storage_orphan_retention_hours', 24)) as is_orphan
    from storage.objects o
   where o.bucket_id = 'attachments'
     and not exists (select 1 from public.attachments a where a.storage_path = o.name);
revoke all on public.storage_unlinked_objects from public, anon, authenticated;

create or replace function public.get_spending_entries(
  p_motorcycle uuid,
  p_from date default null,
  p_to date default null,
  p_scope text default 'ownership',
  p_category text default null,
  p_workshop text default null,
  p_source text default null,
  p_kind text default null,
  p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
        v_top date := greatest((now() at time zone 'America/Sao_Paulo')::date, current_date);
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_scope not in ('ownership', 'all') then raise exception 'Escopo inválido.' using errcode = '22023'; end if;
  if p_motorcycle is not null and not public.is_current_owner(p_motorcycle) then
    raise exception 'Moto não encontrada na sua conta.' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
             'kind', e.kind, 'id', e.id, 'motorcycle_id', e.motorcycle_id, 'category', e.category, 'title', e.title,
             'date', e.entry_date, 'workshop_name', e.workshop_name, 'mileage', e.mileage, 'value_cents', e.value_cents,
             'has_receipt', e.has_receipt,
             'receipt_path', case when e.kind = 'expense' then (select x.receipt_path from public.owner_expenses x where x.id = e.id) end,
             'receipt_name', case when e.kind = 'expense' then (select x.receipt_name from public.owner_expenses x where x.id = e.id) end)
           order by e.entry_date desc, e.kind, e.id), '[]'::jsonb)
    from (select * from public.sp_entries(v_uid, p_motorcycle, p_scope) e
           where (p_kind is null or e.kind = p_kind)
             and (p_category is null or e.category = p_category)
             and (p_workshop is null or (e.kind = 'service' and ((p_workshop = '' and e.workshop_name is null) or e.workshop_name = p_workshop)))
             and (p_source is null or (e.kind = 'service' and e.source_type = p_source))
             and (p_from is null or e.entry_date >= p_from)
             and e.entry_date <= least(coalesce(p_to, v_top), v_top)
           order by e.entry_date desc
           limit greatest(1, least(coalesce(p_limit, 200), 2000))) e);
end;
$$;
revoke execute on function public.get_spending_entries(uuid, date, date, text, text, text, text, text, integer) from public, anon;
grant execute on function public.get_spending_entries(uuid, date, date, text, text, text, text, text, integer) to authenticated;

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


-- Volta o resumo à versão da Fase B (sem a correção do DELETE).
create or replace function public.get_spending_summary(
  p_motorcycle uuid,
  p_from date default null,
  p_to date default null,
  p_scope text default 'ownership',
  p_category text default null,
  p_workshop text default null,
  p_source text default null,
  p_compare boolean default false,
  p_kind text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
        v_today date := (now() at time zone 'America/Sao_Paulo')::date;
        v_top date := greatest((now() at time zone 'America/Sao_Paulo')::date, current_date);
        v_entitled boolean;
        v_start date;
        v_from date;
        v_to date;
        v_days int;
        v_total bigint;
        v_count int;
        v_missing int;
        v_km int;
        v_year_total bigint;
        v_year_days int;
        v_res jsonb;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_scope not in ('ownership', 'all') then raise exception 'Escopo inválido.' using errcode = '22023'; end if;
  if p_kind is not null and p_kind not in ('service', 'expense') then raise exception 'Tipo inválido.' using errcode = '22023'; end if;
  if p_motorcycle is not null and not public.is_current_owner(p_motorcycle) then
    raise exception 'Moto não encontrada na sua conta.' using errcode = '42501';
  end if;
  v_entitled := public.user_has_entitlement(v_uid, 'spending_insights');

  select min(public.sp_ownership_start(o.id)) into v_start
    from public.motorcycle_ownerships o
   where o.owner_user_id = v_uid and o.ended_at is null and (p_motorcycle is null or o.motorcycle_id = p_motorcycle);

  create temporary table if not exists sp_g (kind text, id uuid, motorcycle_id uuid, category text, entry_date date,
                                             workshop_name text, value_cents bigint) on commit drop;
  delete from sp_g;
  insert into sp_g
  select e.kind, e.id, e.motorcycle_id, e.category, e.entry_date, e.workshop_name, e.value_cents
    from public.sp_entries(v_uid, p_motorcycle, p_scope) e
   where (p_kind is null or e.kind = p_kind)
     and (p_category is null or e.category = p_category)
     and (p_workshop is null or (e.kind = 'service' and ((p_workshop = '' and e.workshop_name is null) or e.workshop_name = p_workshop)))
     and (p_source is null or (e.kind = 'service' and e.source_type = p_source));

  v_from := coalesce(p_from, (select min(entry_date) from sp_g), v_today);
  v_to := least(coalesce(p_to, v_top), v_top);
  if v_from > v_to then v_from := v_to; end if;
  if v_to - v_from > 3700 then raise exception 'Escolha um período de até 10 anos.' using errcode = '22023'; end if;
  v_days := greatest(1, v_to - v_from + 1);

  select coalesce(sum(value_cents), 0), count(*) filter (where value_cents is not null), count(*) filter (where value_cents is null)
    into v_total, v_count, v_missing
    from sp_g where entry_date between v_from and v_to;

  v_res := jsonb_build_object(
    'entitled', v_entitled, 'scope', p_scope, 'ownership_start', v_start, 'from', v_from, 'to', v_to,
    'total_cents', v_total, 'entries', v_count, 'missing_values', v_missing,
    'monthly_average_cents', case when v_count > 0 then round(v_total * 30.4375 / v_days) end,
    'service_cents', coalesce((select sum(value_cents) from sp_g where kind = 'service' and entry_date between v_from and v_to), 0),
    'expense_cents', coalesce((select sum(value_cents) from sp_g where kind = 'expense' and entry_date between v_from and v_to), 0),
    'filters', jsonb_build_object(
      'categories', coalesce((select jsonb_agg(distinct category) from public.sp_entries(v_uid, p_motorcycle, p_scope)), '[]'::jsonb),
      'workshops', coalesce((select jsonb_agg(distinct workshop_name) from public.sp_entries(v_uid, p_motorcycle, p_scope) where workshop_name is not null), '[]'::jsonb)));

  if not v_entitled then
    return v_res;
  end if;

  -- Km e custo por km (regra 5); várias motos: soma das motos com dados suficientes.
  select sum(k) into v_km from (
    select public.sp_km(o.motorcycle_id, v_from, v_to) k
      from public.motorcycle_ownerships o
     where o.owner_user_id = v_uid and o.ended_at is null and (p_motorcycle is null or o.motorcycle_id = p_motorcycle)) x;
  if v_km is not null and v_km < 100 then v_km := null; end if;

  -- Projeção do ano (regra 7): com 90 dias ou mais passados no ano.
  v_year_days := v_today - date_trunc('year', v_today)::date + 1;
  select coalesce(sum(value_cents), 0) into v_year_total
    from sp_g where entry_date between date_trunc('year', v_today)::date and v_top;

  return v_res || jsonb_build_object(
    'km', v_km,
    'cost_per_km_cents', case when v_km is not null then round(v_total::numeric / v_km, 2) end,
    'year_projection_cents', case when v_year_days >= 90 and v_year_total > 0
                                  then round(v_year_total::numeric / v_year_days
                                             * (((date_trunc('year', v_today) + interval '1 year')::date) - date_trunc('year', v_today)::date)) end,
    'year_to_date_cents', v_year_total,
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                  'cents', coalesce((select sum(value_cents) from sp_g where date_trunc('month', entry_date) = m and entry_date between v_from and v_to), 0),
                  'count', (select count(*) from sp_g where date_trunc('month', entry_date) = m and entry_date between v_from and v_to and value_cents is not null),
                  'previous_cents', case when p_compare then coalesce((select sum(value_cents) from sp_g
                                      where date_trunc('month', entry_date) = m - interval '1 year'), 0) end)
                  order by m), '[]'::jsonb)
                 from generate_series(date_trunc('month', v_from::timestamp), date_trunc('month', v_to::timestamp), interval '1 month') m),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'kind', kind, 'cents', cents, 'count', n) order by cents desc, category), '[]'::jsonb)
                      from (select category, kind, sum(value_cents) as cents, count(*) as n from sp_g
                             where entry_date between v_from and v_to and value_cents is not null group by category, kind) x),
    'by_workshop', (select coalesce(jsonb_agg(jsonb_build_object('workshop', workshop_name, 'cents', cents, 'count', n) order by cents desc, workshop_name nulls last), '[]'::jsonb)
                      from (select workshop_name, sum(value_cents) as cents, count(*) as n from sp_g
                             where kind = 'service' and entry_date between v_from and v_to and value_cents is not null group by workshop_name) x),
    'by_motorcycle', case when p_motorcycle is null then
                      (select coalesce(jsonb_agg(jsonb_build_object('motorcycle_id', m.id, 'label', m.brand || ' ' || m.model,
                                 'cents', coalesce(t.cents, 0), 'count', coalesce(t.n, 0)) order by coalesce(t.cents, 0) desc, m.brand, m.model), '[]'::jsonb)
                         from public.motorcycle_ownerships o
                         join public.motorcycles m on m.id = o.motorcycle_id
                         left join (select motorcycle_id, sum(value_cents) cents, count(*) filter (where value_cents is not null) n
                                      from sp_g where entry_date between v_from and v_to group by motorcycle_id) t on t.motorcycle_id = m.id
                        where o.owner_user_id = v_uid and o.ended_at is null) end,
    'missing', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'motorcycle_id', f.motorcycle_id, 'service_date', f.entry_date,
                   'title', (select title from public.maintenance_records where id = f.id)) order by f.entry_date desc), '[]'::jsonb)
                  from (select * from sp_g where value_cents is null and entry_date between v_from and v_to order by entry_date desc limit 20) f));
end;
$$;
revoke execute on function public.get_spending_summary(uuid, date, date, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.get_spending_summary(uuid, date, date, text, text, text, text, boolean, text) to authenticated;
