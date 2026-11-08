-- =============================================================================
-- Premium de boas-vindas no cadastro (ADR-049)
-- Toda conta nova recebe o Premium por N dias (configuração welcome_premium_days, padrão 90; 0 desliga),
-- usando o mecanismo de bônus/cortesia (premium_grants, ADR-037/038): sem cobrança, sem cartão. No fim, ou a
-- pessoa assina/paga (a 1ª cobrança só ocorre quando o bônus acaba) ou a conta volta ao gratuito sem perder dados.
-- Os avisos de 7 dias, 1 dia e fim já existem (system_generate_notifications).
-- =============================================================================

alter table public.premium_grants
  add column if not exists source text not null default 'admin' check (source in ('admin', 'welcome'));
comment on column public.premium_grants.source is 'admin = cortesia dada pelo administrador; welcome = bônus automático de boas-vindas no cadastro (uma vez por conta).';

insert into public.system_settings (key, value, description, is_public)
values ('welcome_premium_days', '90'::jsonb, 'Dias de Premium grátis para toda conta nova (0 desliga). Vale só para cadastros feitos depois da mudança.', true)
on conflict (key) do nothing;

create or replace function public.setting_spec(p_key text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_key
    when 'support_email'                    then '{"kind":"email","group":"Contato","label":"E-mail de suporte"}'
    when 'support_whatsapp'                 then '{"kind":"phone","group":"Contato","label":"WhatsApp de suporte (com DDI e DDD)"}'
    when 'registration_rate_limit_per_hour' then '{"kind":"int","min":1,"max":100,"group":"Limites","label":"Cadastros de moto por usuário, por hora"}'
    when 'attachment_max_file_mb'           then '{"kind":"int","min":1,"max":50,"group":"Limites","label":"Tamanho máximo de cada arquivo (MB)"}'
    when 'workshop_storage_quota_mb'        then '{"kind":"int","min":10,"max":100000,"group":"Limites","label":"Espaço de cada oficina (MB)"}'
    when 'workshop_plate_search_per_hour'   then '{"kind":"int","min":1,"max":500,"group":"Limites","label":"Pesquisas de placa por usuário de oficina, por hora"}'
    when 'workshop_org_search_per_hour'     then '{"kind":"int","min":1,"max":500,"group":"Limites","label":"Pesquisas por oficina, por hora"}'
    when 'workshop_access_requests_per_day' then '{"kind":"int","min":1,"max":500,"group":"Limites","label":"Pedidos de acesso por oficina, por dia"}'
    when 'workshop_access_retry_days'       then '{"kind":"int","min":0,"max":90,"group":"Regras","label":"Dias para a oficina pedir acesso de novo após recusa"}'
    when 'origin_workshop_window_days'      then '{"kind":"int","min":1,"max":365,"group":"Regras","label":"Dias para reconhecer a Oficina de Origem"}'
    when 'transfer_request_days'            then '{"kind":"int","min":1,"max":60,"group":"Regras","label":"Dias para o comprador aceitar a transferência"}'
    when 'transfer_requests_per_day'        then '{"kind":"int","min":1,"max":50,"group":"Limites","label":"Pedidos de transferência por usuário, por dia"}'
    when 'billing_grace_days'               then '{"kind":"int","min":0,"max":30,"group":"Cobrança","label":"Tolerância após falha de cobrança (dias)"}'
    when 'welcome_premium_days'             then '{"kind":"int","min":0,"max":365,"group":"Cobrança","label":"Premium grátis para contas novas (dias; 0 desliga)"}'
    when 'storage_orphan_retention_hours'   then '{"kind":"int","min":1,"max":720,"group":"Armazenamento","label":"Horas até um envio sem registro poder ser limpo"}'
    when 'storage_alert_percent'            then '{"kind":"int","min":50,"max":100,"group":"Armazenamento","label":"Alerta de espaço a partir de (% usado)"}'
  end::jsonb;
$$;

-- Plano usado no bônus: o Premium mensal ativo; se não existir, o Premium ativo de menor ordem.
create or replace function public.welcome_premium_plan()
returns public.subscription_plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.subscription_plans p
   where p.kind = 'premium' and p.is_active
   order by (p.code = 'premium_mensal') desc, (p.billing_period = 'monthly') desc, p.sort_order, p.price_cents
   limit 1;
$$;
revoke execute on function public.welcome_premium_plan() from public, anon, authenticated;

create or replace function public.grant_welcome_premium(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_days int := public.setting_int('welcome_premium_days', 90);
        v_plan public.subscription_plans;
        v_id uuid;
        v_until timestamptz;
begin
  if p_user is null or v_days <= 0 then return null; end if;
  -- Uma vez por conta, e nunca por cima de cortesia, assinatura ou período pago.
  if exists (select 1 from public.premium_grants where user_id = p_user)
     or (public.user_active_subscription(p_user)).id is not null
     or (public.user_active_pass(p_user)).id is not null then
    return null;
  end if;
  v_plan := public.welcome_premium_plan();
  if v_plan.id is null then return null; end if;
  -- Até o fim do dia (horário de Brasília) em que completa o período.
  v_until := ((now() at time zone 'America/Sao_Paulo')::date + v_days + 1)::timestamp at time zone 'America/Sao_Paulo';
  insert into public.premium_grants (user_id, plan_id, reason, expires_at, source)
  values (p_user, v_plan.id, 'Boas-vindas: ' || v_days || ' dias de Premium no cadastro', v_until, 'welcome')
  returning id into v_id;
  perform public.notify(p_user, 'admin_notice', 'Bem-vindo! Você ganhou ' ||
      case when v_days % 30 = 0 then (v_days / 30) || case when v_days = 30 then ' mês' else ' meses' end else v_days || ' dias' end || ' de Premium',
    'Todos os benefícios Premium estão liberados sem cobrança até ' || to_char(v_until - interval '1 second', 'DD/MM/YYYY') ||
    '. Depois, você escolhe: assina para continuar ou segue no plano gratuito, sem perder motos nem histórico.',
    '/painel/plano', 'welcome:' || p_user);
  return v_id;
end;
$$;
revoke execute on function public.grant_welcome_premium(uuid) from public, anon, authenticated;

-- No cadastro (o perfil nasce junto com a conta). Falha no bônus nunca impede o cadastro.
create or replace function public.profiles_welcome_premium()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.grant_welcome_premium(new.id);
  exception when others then
    raise warning 'grant_welcome_premium(%) falhou: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function public.profiles_welcome_premium() from public, anon, authenticated;
drop trigger if exists profiles_welcome_premium on public.profiles;
create trigger profiles_welcome_premium after insert on public.profiles
  for each row execute function public.profiles_welcome_premium();

-- Plano vigente: assinatura paga > período pago > bônus (boas-vindas ou cortesia) > gratuito.
create or replace function public.user_plan(p_user uuid)
returns public.subscription_plans
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  x public.premium_passes;
  g public.premium_grants;
  p public.subscription_plans;
begin
  s := public.user_active_subscription(p_user);
  if s.id is not null then
    select * into p from public.subscription_plans where id = s.plan_id;
    p.name := s.plan_name;
    p.max_motorcycles := s.max_motorcycles;
    p.storage_quota_mb := s.storage_quota_mb;
    p.price_cents := s.price_cents;
    p.entitlements := s.entitlements;
    p.max_share_links := s.max_share_links;
    return p;
  end if;
  x := public.user_active_pass(p_user);
  if x.id is not null then
    select * into p from public.subscription_plans where id = x.plan_id;
    p.name := x.plan_name;
    p.max_motorcycles := x.max_motorcycles;
    p.storage_quota_mb := x.storage_quota_mb;
    p.price_cents := x.price_cents;
    p.entitlements := x.entitlements;
    p.max_share_links := x.max_share_links;
    return p;
  end if;
  g := public.user_active_grant(p_user);
  if g.id is not null then
    select * into p from public.subscription_plans where id = g.plan_id;
    p.name := case when g.source = 'welcome' then 'Premium (boas-vindas)' else p.name || ' (cortesia)' end;
    p.price_cents := 0;
    return p;
  end if;
  select * into p from public.subscription_plans where kind = 'free' limit 1;
  return p;
end;
$$;
revoke execute on function public.user_plan(uuid) from public, anon, authenticated;

create or replace function public.get_my_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.subscription_plans;
  g public.premium_grants;
  v_pass timestamptz;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  p := public.user_plan(v_uid);
  g := public.user_active_grant(v_uid);
  v_pass := public.user_pass_until(v_uid);
  return jsonb_build_object(
    'code', p.code, 'kind', p.kind, 'name', p.name, 'billing_period', p.billing_period,
    'max_motorcycles', coalesce(p.max_motorcycles, 1),
    'storage_quota_mb', coalesce(p.storage_quota_mb, 100),
    'motorcycles_used', (select count(*) from public.motorcycle_ownerships
                          where owner_user_id = v_uid and ended_at is null),
    'features', to_jsonb(coalesce(p.features, '{}')),
    'entitlements', to_jsonb(coalesce(p.entitlements, '{}')),
    'max_share_links', coalesce(p.max_share_links, 3),
    'bonus', g.id is not null,
    'bonus_until', g.expires_at,
    'bonus_source', g.source,
    'paid_until', v_pass
  );
end;
$$;
