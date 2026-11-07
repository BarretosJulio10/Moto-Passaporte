-- =============================================================================
-- Fase 6.2 — Resolução dos pedidos de verificação de placa (ADR-007; PRD 7.2, 7.7; ADR-025)
-- - Admin vê a fila com o contexto necessário (sem revelar ao solicitante quem é o titular).
-- - Decisão procedente/improcedente com resposta ao solicitante e motivo na auditoria.
-- - Opcional: avisar o titular atual, de forma anônima, que alguém informou ter comprado a moto
--   (contato intermediado). Não há transferência forçada: depende da decisão P-7.
-- - Solicitante acompanha, complementa e pode cancelar o pedido.
-- Rollback: remover as funções, o gatilho e as colunas owner_notified_at/owner_notice_dismissed_at.
-- =============================================================================

alter table public.motorcycle_claim_requests
  add column owner_notified_at          timestamptz,
  add column owner_notice_dismissed_at  timestamptz;

create trigger motorcycle_claim_requests_audit
  after insert or update or delete on public.motorcycle_claim_requests
  for each row execute function public.audit_row_change('motorcycle_id', '');


-- Solicitante -------------------------------------------------------------------

create or replace function public.get_my_claims()
returns table (id uuid, plate text, status text, created_at timestamptz, requester_note text,
               resolution_note text, resolved_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.plate, c.status::text, c.created_at, c.requester_note, c.resolution_note, c.resolved_at
    from public.motorcycle_claim_requests c
   where c.requested_by = auth.uid()
   order by c.created_at desc
   limit 50;
$$;

revoke execute on function public.get_my_claims() from public, anon;
grant execute on function public.get_my_claims() to authenticated;

create or replace function public.update_my_claim_note(p_claim_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(p_note), '');
begin
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Use até 1.000 caracteres.' using errcode = '22023';
  end if;
  update public.motorcycle_claim_requests set requester_note = v_note
   where id = p_claim_id and requested_by = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.cancel_my_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.motorcycle_claim_requests set status = 'canceled', resolved_at = now()
   where id = p_claim_id and requested_by = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.update_my_claim_note(uuid, text) from public, anon;
revoke execute on function public.cancel_my_claim(uuid) from public, anon;
grant execute on function public.update_my_claim_note(uuid, text) to authenticated;
grant execute on function public.cancel_my_claim(uuid) to authenticated;

-- Titular atual: aviso anônimo -------------------------------------------------

create or replace function public.get_my_ownership_notices()
returns table (claim_id uuid, motorcycle_id uuid, motorcycle_name text, notified_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, m.id, m.brand || ' ' || m.model || ' ' || m.manufacturing_year, c.owner_notified_at
    from public.motorcycle_claim_requests c
    join public.motorcycle_ownerships o on o.motorcycle_id = c.motorcycle_id and o.ended_at is null and o.owner_user_id = auth.uid()
    join public.motorcycles m on m.id = c.motorcycle_id
   where c.owner_notified_at is not null and c.owner_notice_dismissed_at is null
     and c.owner_notified_at >= o.started_at
   order by c.owner_notified_at desc;
$$;

create or replace function public.dismiss_ownership_notice(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.motorcycle_claim_requests c set owner_notice_dismissed_at = now()
   where c.id = p_claim_id and c.owner_notified_at is not null and c.owner_notice_dismissed_at is null
     and public.is_current_owner(c.motorcycle_id);
  if not found then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.get_my_ownership_notices() from public, anon;
revoke execute on function public.dismiss_ownership_notice(uuid) from public, anon;
grant execute on function public.get_my_ownership_notices() to authenticated;
grant execute on function public.dismiss_ownership_notice(uuid) to authenticated;

-- Administração ---------------------------------------------------------------

create or replace function public.admin_list_claims(p_status text default 'pending', p_limit int default 100)
returns table (
  id uuid, plate text, status text, created_at timestamptz, requester_note text, resolution_note text, resolved_at timestamptz,
  resolved_by_name text, requester_id uuid, requester_name text, requester_email_masked text, requester_account_age_days int,
  motorcycle_id uuid, motorcycle_name text, passport_created_at timestamptz, current_owner_id uuid, current_owner_name text,
  owner_since timestamptz, plate_since timestamptz, same_moto_claims int, pending_transfer boolean, owner_notified_at timestamptz
)
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
    select c.id, c.plate, c.status::text, c.created_at, c.requester_note, c.resolution_note, c.resolved_at,
           rb.full_name,
           c.requested_by, rq.full_name, public.mask_email(coalesce(rq.email, ru.email)),
           (current_date - rq.created_at::date)::int,
           m.id, m.brand || ' ' || m.model || ' ' || m.manufacturing_year, m.created_at,
           o.owner_user_id, ow.full_name, o.started_at,
           (select pl.valid_from from public.motorcycle_plates pl where pl.motorcycle_id = m.id and pl.valid_until is null),
           (select count(*)::int from public.motorcycle_claim_requests c2 where c2.motorcycle_id = c.motorcycle_id),
           exists (select 1 from public.transfer_requests t where t.motorcycle_id = m.id and t.status = 'pending' and t.expires_at > now()),
           c.owner_notified_at
      from public.motorcycle_claim_requests c
      left join public.profiles rq on rq.id = c.requested_by
      left join auth.users ru on ru.id = c.requested_by
      left join public.profiles rb on rb.id = c.resolved_by
      left join public.motorcycles m on m.id = c.motorcycle_id
      left join public.motorcycle_ownerships o on o.motorcycle_id = m.id and o.ended_at is null
      left join public.profiles ow on ow.id = o.owner_user_id
     where p_status is null or c.status::text = p_status
     order by case when c.status = 'pending' then c.created_at end asc nulls last, c.created_at desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke execute on function public.admin_list_claims(text, int) from public, anon;
grant execute on function public.admin_list_claims(text, int) to authenticated;

create or replace function public.admin_resolve_claim(
  p_claim_id      uuid,
  p_status        text,
  p_reply         text,
  p_notify_owner  boolean,
  p_reason        text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.require_admin_reason(p_reason);
  v_reply text := nullif(btrim(p_reply), '');
  c public.motorcycle_claim_requests;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  if v_reply is null or char_length(v_reply) < 10 or char_length(v_reply) > 1000 then
    raise exception 'Escreva a resposta ao solicitante (10 a 1.000 caracteres).' using errcode = '22023';
  end if;
  if p_notify_owner and p_status <> 'approved' then
    raise exception 'Só é possível avisar o titular em pedidos procedentes.' using errcode = 'P0001';
  end if;
  select * into c from public.motorcycle_claim_requests where id = p_claim_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  if c.status <> 'pending' then
    raise exception 'Este pedido já foi encerrado.' using errcode = 'P0001';
  end if;
  update public.motorcycle_claim_requests set
    status = p_status::public.claim_status,
    resolution_note = v_reply,
    resolved_by = auth.uid(),
    resolved_at = now(),
    owner_notified_at = case when p_notify_owner then now() end
  where id = c.id;
  perform public.write_audit('motorcycle_claim_requests', c.id::text, 'admin_resolve_claim', c.motorcycle_id, null,
                             jsonb_build_object('status', c.status),
                             jsonb_build_object('status', p_status, 'reason', v_reason, 'owner_notified', coalesce(p_notify_owner, false)));
end;
$$;

revoke execute on function public.admin_resolve_claim(uuid, text, text, boolean, text) from public, anon;
grant execute on function public.admin_resolve_claim(uuid, text, text, boolean, text) to authenticated;
