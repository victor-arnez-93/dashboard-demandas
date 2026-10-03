-- FLUUX F2.3 — prévia e confirmação transacional de planilha.
-- Não muda o status do gestor nem registra recebimento.
begin;
do $$ begin
  if to_regclass('public.fluux_timeline_events') is null or not exists(
    select 1 from information_schema.columns where table_schema='public' and table_name='demands' and column_name='billable_amount'
  ) then raise exception 'Execute os SQLs 01 e 02 antes deste arquivo.'; end if;
end; $$;

create table if not exists public.fluux_billing_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  competence date not null check(extract(day from competence)=1),
  entity_kind text not null check(entity_kind in ('demand','converter')),
  match_by text not null check(match_by in ('identifier','aggregate')),
  file_name text not null check(char_length(file_name) between 1 and 240),
  request_hash text not null,
  mapping jsonb not null,
  counts jsonb not null,
  created_by uuid not null,
  actor_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(company_id,request_hash)
);
create table if not exists public.fluux_billing_check_items (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.fluux_billing_checks(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  entity_kind text not null check(entity_kind in ('demand','converter')),
  entity_id uuid,
  identifier text not null,
  result text not null check(result in ('found','missing','unknown','divergent','ambiguous')),
  expected_cents bigint,
  imported_cents bigint,
  reason text not null,
  sheet_rows jsonb not null,
  snapshot jsonb not null
);
create index if not exists fluux_checks_competence_idx on public.fluux_billing_checks(company_id,competence,created_at,id);
create index if not exists fluux_check_items_idx on public.fluux_billing_check_items(company_id,check_id,entity_id);
alter table public.fluux_billing_checks enable row level security;
alter table public.fluux_billing_check_items enable row level security;
drop policy if exists fluux_checks_read on public.fluux_billing_checks;
create policy fluux_checks_read on public.fluux_billing_checks for select to authenticated using(
  company_id=(select public.current_company_id()) and ((select public.is_super_admin()) or public.is_company_member(company_id))
);
drop policy if exists fluux_items_read on public.fluux_billing_check_items;
create policy fluux_items_read on public.fluux_billing_check_items for select to authenticated using(
  company_id=(select public.current_company_id()) and ((select public.is_super_admin()) or public.is_company_member(company_id))
);
revoke all on public.fluux_billing_checks,public.fluux_billing_check_items from public,anon,authenticated;
grant select on public.fluux_billing_checks,public.fluux_billing_check_items to authenticated;

create or replace function public.fluux_billing_key(p_value text)
returns text language sql immutable set search_path='' as $$
  select upper(regexp_replace(btrim(coalesce(p_value,'')), '[[:space:]]+', ' ', 'g'));
$$;
revoke all on function public.fluux_billing_key(text) from public,anon,authenticated;

-- Universo de execução completo no servidor; não depende do limite de SELECT do browser.
create or replace function public.fluux_billing_services(p_company uuid,p_kind text,p_month date,p_match text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare services jsonb;
begin
  if p_kind='demand' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',d.id,'identifier',coalesce(d.lpu_number,''),'project',d.title,
      'key',public.fluux_billing_key(d.lpu_number),
      'date',coalesce(d.execution_date,(d.completed_at at time zone 'America/Sao_Paulo')::date),
      'expected_cents',case when d.billable_amount is null then null else (d.billable_amount*100)::bigint end,
      'updated_at',d.updated_at
    ) order by d.id),'[]'::jsonb) into services
    from public.demands d where d.company_id=p_company and d.status <> 'Cancelada'
      and (d.execution_date is not null or d.status='Concluída')
      and coalesce(d.execution_date,(d.completed_at at time zone 'America/Sao_Paulo')::date)>=p_month
      and coalesce(d.execution_date,(d.completed_at at time zone 'America/Sao_Paulo')::date)<(p_month+interval '1 month')::date;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'identifier',coalesce(case when p_match='aggregate' then c.project else c.lpu_number end,''),
      'project',c.project,'key',public.fluux_billing_key(case when p_match='aggregate' then c.project else c.lpu_number end),
      'date',c.service_date,
      'expected_cents',case when c.billable_amount is null then null else (c.billable_amount*100)::bigint end,
      'updated_at',c.updated_at
    ) order by c.id),'[]'::jsonb) into services
    from public.media_converter_records c where c.company_id=p_company
      and public.fluux_billing_key(c.status) in ('CONCLUÍDO','CONCLUÍDA','CONCLUIDO','CONCLUIDA','FINALIZADO','FINALIZADA')
      and c.service_date>=p_month and c.service_date<(p_month+interval '1 month')::date;
  end if;
  return services;
end;
$$;
revoke all on function public.fluux_billing_services(uuid,text,date,text) from public,anon,authenticated;

create or replace function public.fluux_preview_billing(p_request jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  company uuid:=public.current_company_id();
  kind text:=p_request->>'kind';
  match_field text:=p_request->>'match_by';
  month_date date;
  tolerance bigint;
  services jsonb;
  results jsonb;
  counts jsonb;
  clean_request jsonb;
begin
  if auth.uid() is null or company is null or not
    (public.is_super_admin() or public.is_company_member(company)) then raise exception 'Empresa não autorizada.'; end if;
  if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>3000000
    or kind is null or kind not in ('demand','converter')
    or match_field is null or match_field not in ('identifier','aggregate')
    or (kind='demand' and match_field<>'identifier')
    or coalesce(p_request->>'competence','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
    or jsonb_typeof(p_request->'rows') is distinct from 'array' then
    raise exception 'Configuração da conferência inválida.';
  end if;
  month_date:=(p_request->>'competence'||'-01')::date;
  if jsonb_array_length(p_request->'rows') not between 1 and 5000 then raise exception 'Use entre 1 e 5000 linhas por conferência.'; end if;
  if coalesce(p_request->>'tolerance_cents','') !~ '^[0-9]{1,6}$' then raise exception 'Tolerância inválida.'; end if;
  tolerance:=(p_request->>'tolerance_cents')::bigint;
  if tolerance>100000 then raise exception 'Tolerância máxima: R$ 1.000,00.'; end if;
  if char_length(coalesce(p_request->>'file_name','')) not between 1 and 240
    or coalesce(p_request->>'file_hash','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_request->'mapping') is distinct from 'object' then raise exception 'Metadados da planilha inválidos.'; end if;
  if exists(select 1 from jsonb_array_elements(p_request->'rows') r where
    jsonb_typeof(r)<>'object' or char_length(btrim(coalesce(r->>'identifier',''))) not between 1 and 240
    or coalesce(r->>'row_number','') !~ '^[1-9][0-9]{0,6}$'
    or (r->'amount_cents' is not null and r->'amount_cents'<>'null'::jsonb and
      (coalesce(r->>'amount_cents','') !~ '^[0-9]{1,14}$'))
  ) then raise exception 'Há linhas com identificador, valor ou número de linha inválido.'; end if;
  if exists(select 1 from jsonb_array_elements(p_request->'rows') r group by r->>'row_number' having count(*)>1) then
    raise exception 'Números de linha repetidos na conferência.';
  end if;
  -- Normaliza a requisição aceita, descartando campos arbitrários do cliente.
  clean_request:=jsonb_build_object('kind',kind,'match_by',match_field,'competence',p_request->>'competence',
    'tolerance_cents',tolerance,'file_name',p_request->>'file_name','file_hash',p_request->>'file_hash',
    'mapping',p_request->'mapping','rows',p_request->'rows');
  services:=public.fluux_billing_services(company,kind,month_date,match_field);
  with service_rows as (select value s from jsonb_array_elements(services)),
  import_rows as (
    select value r,public.fluux_billing_key(value->>'identifier') k from jsonb_array_elements(clean_request->'rows')
  ), service_counts as (select s->>'key' k,count(*) n from service_rows group by s->>'key'),
  import_counts as (
    select k,count(*) n,jsonb_agg((r->>'row_number')::int order by (r->>'row_number')::int) lines,
      case when count(*)=1 then min((r->>'amount_cents')::bigint) end amount
    from import_rows group by k
  ), joined as (
    select s,coalesce(i.n,0) imported_count,sc.n service_count,coalesce(i.lines,'[]'::jsonb) lines,i.amount,
      case when s->>'key'='' then 'ambiguous'
        when coalesce(i.n,0)=0 then 'missing'
        when sc.n<>1 or i.n<>1 then 'ambiguous'
        when (s->>'expected_cents') is not null and i.amount is not null
          and abs((s->>'expected_cents')::bigint-i.amount)>tolerance then 'divergent'
        else 'found' end status
    from service_rows left join service_counts sc on sc.k=s->>'key' left join import_counts i on i.k=s->>'key'
  ), all_results as (
    select jsonb_build_object('entity_id',s->>'id','identifier',s->>'identifier','project',s->>'project',
      'date',s->>'date','expected_cents',s->'expected_cents','imported_cents',amount,'result',status,'sheet_rows',lines,
      'reason',case status when 'missing' then 'Execução não encontrada nesta planilha.'
        when 'ambiguous' then 'Identificador ausente ou repetido: revisão manual necessária.'
        when 'divergent' then 'Valor da planilha difere do valor deste registro.'
        else case when (s->>'expected_cents') is null or amount is null then 'Encontrado; comparação de valor indisponível.'
          else 'Identificador e valor conferidos.' end end,
      'snapshot',s) item from joined
    union all
    select jsonb_build_object('entity_id',null,'identifier',r->>'identifier','project','',
      'date',null,'expected_cents',null,'imported_cents',(r->>'amount_cents')::bigint,
      'result',case when ic.n>1 then 'ambiguous' else 'unknown' end,
      'sheet_rows',jsonb_build_array((r->>'row_number')::int),
      'reason','Linha sem correspondência única entre as execuções desta competência.','snapshot','{}'::jsonb)
    from import_rows join import_counts ic using(k) left join service_counts sc using(k) where sc.k is null
  ) select coalesce(jsonb_agg(item order by item->>'entity_id',item->>'identifier',item->>'sheet_rows'),'[]'::jsonb)
    into results from all_results;
  select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) into counts from
    (select value->>'result' status,count(*) n from jsonb_array_elements(results) group by value->>'result') c;
  return jsonb_build_object('company_id',company,'request',clean_request,'items',results,'counts',counts,
    'executed',jsonb_array_length(services),'imported',jsonb_array_length(clean_request->'rows'),
    'fingerprint',md5(jsonb_build_object('request',clean_request,'services',services,'items',results)::text));
end;
$$;
revoke all on function public.fluux_preview_billing(jsonb) from public,anon,authenticated;
grant execute on function public.fluux_preview_billing(jsonb) to authenticated;

create or replace function public.fluux_save_billing(p_request jsonb,p_fingerprint text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  company uuid:=public.current_company_id();
  preview jsonb;
  request jsonb;
  new_id uuid;
  author text;
  item jsonb;
begin
  if auth.uid() is null or company is null or not
    (public.is_super_admin() or public.has_company_role(company,array['owner','admin','member'])) then
    raise exception 'Você não tem permissão para salvar conferências.';
  end if;
  -- Recalcula contra o banco: cliente não determina resultados nem vínculos.
  preview:=public.fluux_preview_billing(p_request);
  if p_fingerprint is null or preview->>'fingerprint'<>p_fingerprint then
    raise exception 'Os dados mudaram desde a prévia. Gere uma nova conferência antes de confirmar.';
  end if;
  request:=preview->'request';
  select nullif(btrim(full_name),'') into author from public.profiles where id=auth.uid();
  author:=coalesce(author,'Usuário autenticado');
  insert into public.fluux_billing_checks(company_id,competence,entity_kind,match_by,file_name,request_hash,mapping,counts,created_by,actor_name)
  values(company,(request->>'competence'||'-01')::date,request->>'kind',request->>'match_by',request->>'file_name',
    md5((request-'file_name')::text),request-'rows',preview->'counts',auth.uid(),author)
  on conflict(company_id,request_hash) do nothing returning id into new_id;
  if new_id is null then raise exception 'Esta planilha, competência e configuração já foram conferidas e salvas.'; end if;
  for item in select value from jsonb_array_elements(preview->'items') loop
    insert into public.fluux_billing_check_items(check_id,company_id,entity_kind,entity_id,identifier,result,
      expected_cents,imported_cents,reason,sheet_rows,snapshot)
    values(new_id,company,request->>'kind',(item->>'entity_id')::uuid,item->>'identifier',item->>'result',
      (item->>'expected_cents')::bigint,(item->>'imported_cents')::bigint,item->>'reason',item->'sheet_rows',item->'snapshot');
    if item->>'entity_id' is not null then
      insert into public.fluux_timeline_events(company_id,entity_kind,entity_id,event_type,actor_id,actor_name,message,snapshot)
      values(company,request->>'kind',(item->>'entity_id')::uuid,'billing',auth.uid(),author,
        'Conferência de planilha — '||(request->>'competence')||': '||
        case item->>'result' when 'found' then 'encontrado' when 'missing' then 'não encontrado'
          when 'divergent' then 'divergência de valor' else 'revisão manual necessária' end,
        jsonb_build_object('check_id',new_id,'result',item->>'result','file_name',request->>'file_name',
          'expected_cents',item->'expected_cents','imported_cents',item->'imported_cents'));
    end if;
  end loop;
  return new_id;
end;
$$;
revoke all on function public.fluux_save_billing(jsonb,text) from public,anon,authenticated;
grant execute on function public.fluux_save_billing(jsonb,text) to authenticated;
commit;
select 'F2.3 — Conferência instalada' as resultado;
