-- Desfaz os avisos por e-mail e WhatsApp (ADR-064).
do $$ begin perform cron.unschedule(jobid) from cron.job where jobname = 'moto-passaporte-messages'; end $$;

drop function if exists public.admin_list_outbound_messages(integer);
drop function if exists public.admin_save_messaging_settings(boolean, text, text, text, boolean, text, text, integer);
drop function if exists public.admin_get_messaging_settings();
drop function if exists public.messages_report(jsonb);
drop function if exists public.messages_claim_whatsapp(integer);
drop function if exists public.messages_claim_email(integer);
drop function if exists public.messaging_config();
drop function if exists public.notify_motorcycle_limit();
drop function if exists public.email_unsubscribe(uuid);
drop function if exists public.set_my_messaging_prefs(boolean, boolean);
drop function if exists public.get_my_messaging_prefs();

-- notify() volta ao formato anterior.
do $$
declare v text := pg_get_functiondef('public.notify(uuid,text,text,text,text,text)'::regprocedure);
begin
  v := replace(v, 'insert into public.notifications (user_id, kind, title, body, link, dedupe_key, email_pending, push_pending, whatsapp_pending)',
                  'insert into public.notifications (user_id, kind, title, body, link, dedupe_key, email_pending, push_pending)');
  v := regexp_replace(v, 'coalesce\(pref\.email, public\.notification_email_default\(p_kind\)\), v_push,.*?phone ~ ''\^\[0-9\]\{10,13\}\$''\)\)',
                         'coalesce(pref.email, false), v_push)', 's');
  execute v;
end $$;

drop function public.set_my_notification_preference(text, boolean, boolean, boolean, boolean);
create function public.set_my_notification_preference(p_kind text, p_in_app boolean, p_email boolean, p_push boolean default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_kind not in (select kind from public.get_my_notification_preferences()) then
    raise exception 'Tipo de aviso desconhecido.' using errcode = '22023';
  end if;
  if not coalesce(p_in_app, true) and not public.notification_kind_optional(p_kind) then
    raise exception 'Este aviso é essencial e não pode ser desligado.' using errcode = '22023';
  end if;
  insert into public.notification_preferences (user_id, kind, in_app, email, push)
  values (auth.uid(), p_kind, coalesce(p_in_app, true), coalesce(p_email, false), p_push)
  on conflict (user_id, kind) do update set in_app = excluded.in_app, email = excluded.email,
    push = coalesce(excluded.push, public.notification_preferences.push), updated_at = now();
end;
$$;

drop function public.get_my_notification_preferences();
create function public.get_my_notification_preferences()
returns table (kind text, optional boolean, in_app boolean, email boolean, push boolean)
language sql stable security definer set search_path = ''
as $$
  select k.kind, public.notification_kind_optional(k.kind), coalesce(p.in_app, true), coalesce(p.email, false),
         coalesce(p.push, public.notification_push_default(k.kind))
    from unnest(array['care_checkup', 'oil_change', 'workshop_access_request', 'workshop_access_decided', 'workshop_access_revoked',
                      'workshop_service', 'transfer_received', 'transfer_decided', 'reminder_due', 'subscription_ending',
                      'payment_approved', 'payment_failed', 'storage_limit', 'claim_decided', 'ownership_notice', 'admin_notice',
                      'quote_viewed', 'quote_decided', 'quote_expired', 'service_order_assigned',
                      'appointment_requested', 'workshop_review', 'workshop_update', 'workshop_reminder_due', 'appointment_canceled']) k(kind)
    left join public.notification_preferences p on p.user_id = auth.uid() and p.kind = k.kind;
$$;
revoke execute on function public.get_my_notification_preferences() from public, anon;
grant execute on function public.get_my_notification_preferences() to authenticated;
revoke execute on function public.set_my_notification_preference(text, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_my_notification_preference(text, boolean, boolean, boolean) to authenticated;

do $$
declare v text;
begin
  v := pg_get_functiondef('public.notification_kind_optional(text)'::regprocedure);
  execute replace(v, $q$('reminder_due', 'storage_limit', 'limit_reached',$q$, $q$('reminder_due', 'storage_limit',$q$);
  v := pg_get_functiondef('public.notification_push_default(text)'::regprocedure);
  execute replace(v, $q$('reminder_due', 'storage_limit', 'limit_reached')$q$, $q$('reminder_due', 'storage_limit')$q$);
end $$;
drop function if exists public.notification_whatsapp_default(text);
drop function if exists public.notification_email_default(text);

delete from public.notifications where kind = 'limit_reached';
do $$
declare v text;
begin
  select pg_get_constraintdef(oid) into v from pg_constraint where conrelid = 'public.notifications'::regclass and conname = 'notifications_kind_check';
  alter table public.notifications drop constraint notifications_kind_check;
  execute 'alter table public.notifications add constraint notifications_kind_check ' || replace(v, ', ''limit_reached''::text', '');
end $$;

drop index if exists public.profiles_email_unsub_token_idx;
alter table public.profiles drop column if exists email_unsub_token, drop column if exists email_optout, drop column if exists whatsapp_optin;
drop index if exists public.notifications_whatsapp_pending_idx;
drop index if exists public.notifications_email_pending_idx;
alter table public.notifications drop column if exists whatsapp_sent_at, drop column if exists email_sent_at, drop column if exists whatsapp_pending;
alter table public.notification_preferences drop column if exists whatsapp;
drop table if exists public.outbound_messages;
drop table if exists public.messaging_settings;
delete from vault.secrets where name in ('resend_api_key', 'fzap_token');
