-- FLUUX F2.1 — histórico incremental. 
-- Não substitui tabelas, políticas ou triggers anteriores da aplicação.
begin;

do $$
begin
  if to_regclass('public.demands') is null
     or to_regclass('public.media_converter_records') is null
     or to_regprocedure('public.current_company_id()') is null
     or to_regprocedure('public.has_company_role(uuid,text[])') is null
     or to_regprocedure('public.is_company_member(uuid)') is null
     or to_regprocedure('public.is_super_admin()') is null then
    raise exception 'Pré-requisitos multiempresa não encontrados. Não execute as migrações antigas novamente; confira o esquema atual.';
  end if;
end;
$$;

create table if not exists public.fluux_timeline_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  entity_kind text not null check (entity_kind in ('demand', 'converter')),
  entity_id uuid not null,
  event_type text not null check (event_type in ('baseline', 'created', 'updated', 'deleted', 'manual', 'billing')),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  actor_name text not null,
  message text not null check (char_length(message) between 1 and 2000),
  changes jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb
);

-- Sem FK ao registro operacional: exclusão de demanda não apaga seu histórico.
create index if not exists fluux_timeline_entity_idx
  on public.fluux_timeline_events(company_id, entity_kind, entity_id, occurred_at, id);
create unique index if not exists fluux_timeline_one_baseline_idx
  on public.fluux_timeline_events(company_id, entity_kind, entity_id)
  where event_type = 'baseline';
alter table public.fluux_timeline_events enable row level security;
drop policy if exists fluux_timeline_read on public.fluux_timeline_events;
create policy fluux_timeline_read on public.fluux_timeline_events for select to authenticated
  using (company_id = (select public.current_company_id()) and
    ((select public.is_super_admin()) or public.is_company_member(company_id)));
revoke all on public.fluux_timeline_events from public, anon, authenticated;
grant select on public.fluux_timeline_events to authenticated;

create or replace function public.fluux_event_snapshot(p_row jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(p_row)
  where key = any(array['lpu_number','title','project','description','issue_reason',
    'status','manager_status','priority','responsible','responsible_name','manager','manager_name',
    'requester','location_name','location_subdivision_name','start_date','due_date',
    'execution_date','completed_at','service_date','estimated_hours','actual_hours',
    'notes','tags','equipment_type','service_type','quantity_replaced','billable_amount',
    'created_at','updated_at']);
$$;
revoke all on function public.fluux_event_snapshot(jsonb) from public, anon, authenticated;

create or replace function public.fluux_capture_timeline()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  before_data jsonb := '{}'::jsonb;
  after_data jsonb := '{}'::jsonb;
  row_data jsonb;
  diff jsonb := '{}'::jsonb;
  kind text;
  author text;
  event_name text;
begin
  kind := case when tg_table_name = 'demands' then 'demand' else 'converter' end;
  if tg_op <> 'INSERT' then before_data := public.fluux_event_snapshot(to_jsonb(old)); end if;
  if tg_op <> 'DELETE' then after_data := public.fluux_event_snapshot(to_jsonb(new)); end if;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(k, jsonb_build_object('from', before_data -> k, 'to', after_data -> k)), '{}'::jsonb)
    into diff
    from jsonb_object_keys(before_data || after_data) as keys(k)
    where k not in ('created_at','updated_at')
      and (before_data -> k) is distinct from (after_data -> k);
    if diff = '{}'::jsonb then return new; end if;
  end if;
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  select nullif(btrim(full_name), '') into author from public.profiles where id = auth.uid();
  author := coalesce(author, case when auth.uid() is null then 'Sistema / atualização técnica' else 'Usuário autenticado' end);
  event_name := case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end;
  insert into public.fluux_timeline_events(company_id,entity_kind,entity_id,event_type,actor_id,actor_name,message,changes,snapshot)
  values ((row_data ->> 'company_id')::uuid,kind,(row_data ->> 'id')::uuid,event_name,auth.uid(),author,
    case tg_op when 'INSERT' then 'Registro criado' when 'DELETE' then 'Registro excluído' else 'Registro atualizado' end,
    diff,case when tg_op = 'DELETE' then before_data else after_data end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.fluux_capture_timeline() from public, anon, authenticated;

-- Fotografia do estado conhecido, sem inventar eventos/atores retroativos.
insert into public.fluux_timeline_events(company_id,entity_kind,entity_id,event_type,actor_name,message,snapshot)
select company_id,'demand',id,'baseline','Implantação do histórico',
  'Estado conhecido na implantação. As alterações anteriores não foram registradas.',public.fluux_event_snapshot(to_jsonb(d))
from public.demands d on conflict do nothing;
insert into public.fluux_timeline_events(company_id,entity_kind,entity_id,event_type,actor_name,message,snapshot)
select company_id,'converter',id,'baseline','Implantação do histórico',
  'Estado conhecido na implantação. As alterações anteriores não foram registradas.',public.fluux_event_snapshot(to_jsonb(c))
from public.media_converter_records c on conflict do nothing;

drop trigger if exists fluux_demands_timeline on public.demands;
create trigger fluux_demands_timeline after insert or update or delete on public.demands
  for each row execute function public.fluux_capture_timeline();
drop trigger if exists fluux_converters_timeline on public.media_converter_records;
create trigger fluux_converters_timeline after insert or update or delete on public.media_converter_records
  for each row execute function public.fluux_capture_timeline();

create or replace function public.fluux_add_timeline_note(p_kind text,p_id uuid,p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  company uuid := public.current_company_id();
  author text;
  event_id uuid;
  found_record boolean;
begin
  if auth.uid() is null or company is null or not
    (public.is_super_admin() or public.has_company_role(company,array['owner','admin','member'])) then
    raise exception 'Você não tem permissão para registrar andamento.';
  end if;
  if p_kind not in ('demand','converter') or p_kind is null
    or p_message is null or char_length(btrim(p_message)) not between 1 and 2000 then
    raise exception 'Informe um andamento entre 1 e 2000 caracteres.';
  end if;
  if p_kind = 'demand' then
    perform id from public.demands where id=p_id and company_id=company for share;
    found_record := found;
  else
    perform id from public.media_converter_records where id=p_id and company_id=company for share;
    found_record := found;
  end if;
  if not found_record then raise exception 'Registro não disponível na empresa ativa.'; end if;
  select nullif(btrim(full_name),'') into author from public.profiles where id=auth.uid();
  insert into public.fluux_timeline_events(company_id,entity_kind,entity_id,event_type,actor_id,actor_name,message)
  values (company,p_kind,p_id,'manual',auth.uid(),coalesce(author,'Usuário autenticado'),btrim(p_message))
  returning id into event_id;
  return event_id;
end;
$$;
revoke all on function public.fluux_add_timeline_note(text,uuid,text) from public, anon, authenticated;
grant execute on function public.fluux_add_timeline_note(text,uuid,text) to authenticated;
comment on table public.fluux_timeline_events is 'Histórico do FLUUX: leitura isolada por empresa, inclusões via trigger/RPC, sem edição/exclusão pelo frontend.';
commit;

select 'F2.1 — Timeline instalada' as resultado;
