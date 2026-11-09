-- Desfaz 20261109144417_workshop_entry_flow (Fase B do fluxo da oficina, ADR-060).
-- Antes: cancele ou complete as OS abertas na entrada sem autorização, senão a restrição antiga não volta.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.workshop_set_order_status(uuid, uuid, text, text)'::regprocedure);
  v_def := regexp_replace(v_def, E'\n  if p_status in \\(''awaiting_execution''.*?antes de executar\\.'' using errcode = ''P0001'';\n  end if;', '', 's');
  execute v_def;
  v_def := pg_get_functiondef('public.pista_mark_ready(uuid, uuid, integer)'::regprocedure);
  v_def := regexp_replace(v_def, E'\n  if not public.wo_has_work\\(o.id\\) then.*?using errcode = ''P0001'';\n  end if;', '', 's');
  execute v_def;
  v_def := pg_get_functiondef('public.workshop_create_order_from_quote(uuid, uuid)'::regprocedure);
  v_def := regexp_replace(v_def, E'\n  if q.entry_order_id is not null then.*?return v_id;\n    end if;\n  end if;', '', 's');
  execute v_def;
  v_def := pg_get_functiondef('public.workshop_list_orders(uuid, text, text, boolean)'::regprocedure);
  v_def := regexp_replace(v_def, E'\n               o.opened_at_entry, o.diagnosed_at,.*?as entry_quote,', '', 's');
  execute v_def;
end;
$$;
drop function if exists public.workshop_order_entry_info(uuid, uuid);
drop function if exists public.workshop_quote_from_order(uuid, uuid);
drop function if exists public.pista_mark_diagnosed(uuid, uuid, text);
drop function if exists public.workshop_mark_diagnosed(uuid, uuid, text);
drop function if exists public.wo_mark_diagnosed(uuid, public.workshop_service_orders, text);
drop function if exists public.workshop_create_entry(uuid, uuid, uuid, int, text, date, boolean);
drop function if exists public.wo_has_work(uuid);
alter table public.workshop_quotes drop constraint if exists workshop_quotes_entry_order_fk;
alter table public.workshop_quotes drop column if exists entry_order_id;
alter table public.workshop_service_orders drop constraint if exists workshop_service_orders_authorized_check;
alter table public.workshop_service_orders add constraint workshop_service_orders_check
  check (quote_id is not null or (auth_method is not null and auth_by_name is not null));
alter table public.workshop_service_orders drop column if exists diagnosed_by, drop column if exists diagnosed_at, drop column if exists opened_at_entry;
-- Eventos 'diagnosed', 'quote_created', 'quote_items_added' ficam no histórico; a restrição de tipos continua aceitando-os.
