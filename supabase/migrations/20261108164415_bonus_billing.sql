-- =============================================================================
-- Bônus Premium: aviso antes de acabar e primeira cobrança só depois do bônus (ADR-037, complemento)
-- - Avisos: 7 dias antes, 1 dia antes e quando termina (só para quem não tem assinatura).
-- - Quem assina durante o bônus: a 1ª cobrança do Mercado Pago fica para o dia em que o bônus termina
--   (billing_prepare_subscription devolve first_charge_at; a Edge Function usa auto_recurring.start_date).
-- - get_my_plan informa bonus_until para a tela "Meu plano".
-- =============================================================================

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
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  p := public.user_plan(v_uid);
  g := public.user_active_grant(v_uid);
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
    'bonus_until', g.expires_at
  );
end;
$$;

create or replace function public.billing_prepare_subscription(p_user uuid, p_plan_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.subscription_plans;
  g public.payment_gateway_settings;
  b public.premium_grants;
  v_email text;
  v_id uuid;
  v_expired jsonb;
  v_first timestamptz;
begin
  if coalesce((select (value #>> '{}')::boolean from public.system_settings where key = 'billing_enabled'), false) is not true then
    raise exception 'A contratação ainda não está disponível.' using errcode = 'P0001';
  end if;
  select lower(email) into v_email from auth.users where id = p_user;
  if v_email is null then
    raise exception 'Conta não encontrada.' using errcode = '42501';
  end if;
  select * into p from public.subscription_plans
   where code = p_plan_code and kind = 'premium' and is_active and is_public;
  if not found then
    raise exception 'Plano indisponível.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.subscriptions
             where user_id = p_user and status in ('active', 'past_due', 'paused')) then
    raise exception 'Você já tem uma assinatura em andamento. Cancele a atual antes de contratar outra.' using errcode = 'P0001';
  end if;
  select * into g from public.payment_gateway_settings where provider = 'mercadopago';
  if g.access_token_secret_id is null or g.last_check_ok is not true then
    raise exception 'Pagamentos indisponíveis no momento.' using errcode = 'P0001';
  end if;

  -- Bônus em vigor com prazo: a primeira cobrança só no dia em que ele termina.
  b := public.user_active_grant(p_user);
  if b.id is not null and b.expires_at is not null and b.expires_at > now() + interval '1 day' then
    v_first := b.expires_at;
  end if;

  with old as (
    update public.subscriptions set status = 'expired', cancel_reason = 'Nova tentativa de contratação'
     where user_id = p_user and status = 'pending'
     returning provider_subscription_id
  )
  select coalesce(jsonb_agg(provider_subscription_id) filter (where provider_subscription_id is not null), '[]'::jsonb)
    into v_expired from old;

  insert into public.subscriptions
    (user_id, plan_id, plan_code, plan_name, billing_period, price_cents, currency, max_motorcycles,
     storage_quota_mb, environment, provider_account_id, entitlements, max_share_links)
  values
    (p_user, p.id, p.code, p.name, p.billing_period, p.price_cents, p.currency, p.max_motorcycles,
     p.storage_quota_mb, g.environment, g.account_id, p.entitlements, p.max_share_links)
  returning id into v_id;

  return jsonb_build_object(
    'subscription_id', v_id, 'payer_email', v_email, 'plan_name', p.name,
    'billing_period', p.billing_period, 'price_cents', p.price_cents, 'currency', p.currency,
    'trial_days', case when v_first is null then p.trial_days else 0 end, 'expired_provider_ids', v_expired,
    'first_charge_at', v_first
  );
end;
$$;

create or replace function public.system_generate_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_before int := (select count(*) from public.notifications);
  v_alert int := public.setting_int('storage_alert_percent', 80);
  v_deleted int;
begin
  for r in
    select x.owner_user_id, x.v from (
      select rm.owner_user_id, public.reminder_view(rm, public.motorcycle_current_km(rm.motorcycle_id)) v
        from public.maintenance_reminders rm
        join public.motorcycle_ownerships o on o.motorcycle_id = rm.motorcycle_id and o.ended_at is null and o.owner_user_id = rm.owner_user_id
       where not rm.paused and rm.done_at is null) x
     where x.v ->> 'status' in ('due', 'soon')
  loop
    perform public.notify(r.owner_user_id, 'reminder_due',
      case when r.v ->> 'status' = 'due' then 'Manutenção vencida: ' else 'Manutenção chegando: ' end || left(r.v ->> 'title', 80),
      public.moto_label((r.v ->> 'motorcycle_id')::uuid) ||
        coalesce(' · faltam ' || (r.v ->> 'km_left') || ' km', '') || coalesce(' · ' || (r.v ->> 'days_left') || ' dia(s)', ''),
      '/painel/motos/' || (r.v ->> 'motorcycle_id'),
      'reminder:' || (r.v ->> 'id') || ':' || (r.v ->> 'status') || ':' || coalesce(r.v ->> 'next_km', '') || ':' || coalesce(r.v ->> 'next_date', ''));
  end loop;

  for r in select s.id, s.user_id, s.plan_name, s.current_period_end from public.subscriptions s
            where s.status = 'canceled' and s.current_period_end between now() and now() + interval '3 days'
  loop
    perform public.notify(r.user_id, 'subscription_ending', 'Seu Premium termina em breve',
      'A assinatura ' || r.plan_name || ' foi cancelada e o acesso Premium termina em ' || to_char(r.current_period_end at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '.',
      '/painel/plano', 'subscription:' || r.id || ':ending');
  end loop;

  -- Bônus Premium (cortesia) perto do fim ou encerrado, para quem ainda não assinou.
  for r in select g.id, g.user_id, g.expires_at,
                  case when g.expires_at <= now() then 'ended'
                       when g.expires_at <= now() + interval '1 day' then '1d' else '7d' end as stage
             from public.premium_grants g
            where g.revoked_at is null and g.expires_at is not null
              and g.expires_at between now() - interval '2 days' and now() + interval '7 days'
              and not exists (select 1 from public.subscriptions s
                               where s.user_id = g.user_id and s.status in ('pending', 'active', 'past_due', 'paused'))
  loop
    perform public.notify(r.user_id, 'subscription_ending',
      case r.stage when 'ended' then 'Seu bônus Premium terminou' when '1d' then 'Seu bônus Premium termina amanhã' else 'Seu bônus Premium termina em 7 dias' end,
      case when r.stage = 'ended'
           then 'Sua conta voltou ao plano gratuito. Motos e histórico continuam com você. Assine para voltar ao Premium.'
           else 'O bônus termina em ' || to_char((r.expires_at - interval '1 second') at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
                || '. Assine agora para continuar: a primeira cobrança só acontece quando o bônus acabar.' end,
      '/painel/plano', 'grant:' || r.id || ':' || r.stage);
  end loop;

  for r in select s.id, s.user_id, s.past_due_since from public.subscriptions s where s.status = 'past_due'
  loop
    perform public.notify(r.user_id, 'payment_failed', 'Assinatura em atraso',
      'Não conseguimos cobrar a sua assinatura. Regularize no Mercado Pago para manter o Premium.',
      '/painel/plano', 'subscription:' || r.id || ':past_due:' || coalesce(r.past_due_since::date::text, ''));
  end loop;

  for r in select u.id from auth.users u
            where public.user_storage_used_bytes(u.id) > 0
              and public.user_storage_used_bytes(u.id) * 100 >= v_alert::bigint * public.user_storage_quota_mb(u.id)::bigint * 1048576
  loop
    perform public.notify(r.id, 'storage_limit', 'Espaço quase cheio',
      'Você já usou ' || v_alert || '% ou mais do espaço para fotos e comprovantes. Apague o que não precisa ou conheça o Premium.',
      '/painel/plano', 'storage:' || to_char(now(), 'IYYY-IW'));
  end loop;

  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('created', (select count(*) from public.notifications) - v_before + v_deleted, 'deleted_old', v_deleted);
end;
$$;
