-- FLUUX F2.2 — valores opcionais POR REGISTRO. 
begin;
do $$ begin
  if to_regclass('public.fluux_timeline_events') is null then
    raise exception 'Execute primeiro 01_fluux_timeline.sql.';
  end if;
end; $$;

alter table public.demands add column if not exists billable_amount numeric(14,2);
alter table public.media_converter_records add column if not exists billable_amount numeric(14,2);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='fluux_demands_amount_ck' and conrelid='public.demands'::regclass) then
    alter table public.demands add constraint fluux_demands_amount_ck check(billable_amount is null or billable_amount between 0 and 999999999999.99);
  end if;
  if not exists(select 1 from pg_constraint where conname='fluux_converters_amount_ck' and conrelid='public.media_converter_records'::regclass) then
    alter table public.media_converter_records add constraint fluux_converters_amount_ck check(billable_amount is null or billable_amount between 0 and 999999999999.99);
  end if;
end; $$;
comment on column public.demands.billable_amount is 'Valor opcional exclusivo deste registro/serviço. Não repetir o valor global de uma LPU em cada demanda.';
comment on column public.media_converter_records.billable_amount is 'Valor opcional exclusivo deste atendimento. Não repetir o valor global da LPU agregada.';

create or replace function public.fluux_set_service_amount(p_kind text,p_id uuid,p_amount numeric,p_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  company uuid := public.current_company_id();
  current_row jsonb;
  saved_row jsonb;
begin
  if auth.uid() is null or company is null or not
    (public.is_super_admin() or public.has_company_role(company,array['owner','admin','member'])) then
    raise exception 'Você não tem permissão para alterar valores.';
  end if;
  if p_kind is null or p_kind not in ('demand','converter') or
    (p_amount is not null and (p_amount < 0 or p_amount > 999999999999.99 or p_amount <> round(p_amount,2))) then
    raise exception 'Valor inválido: informe até duas casas decimais ou deixe em branco.';
  end if;
  if p_kind='demand' then
    select to_jsonb(d) into current_row from public.demands d where id=p_id and company_id=company for update;
  else
    select to_jsonb(c) into current_row from public.media_converter_records c where id=p_id and company_id=company for update;
  end if;
  if current_row is null then raise exception 'Registro não disponível na empresa ativa.'; end if;
  if (current_row->>'updated_at')::timestamptz is distinct from p_updated_at then
    raise exception 'O registro mudou. Atualize o fechamento antes de editar o valor.';
  end if;
  if p_kind='demand' then
    update public.demands set billable_amount=p_amount,updated_by=auth.uid()
      where id=p_id and company_id=company returning to_jsonb(demands) into saved_row;
  else
    update public.media_converter_records set billable_amount=p_amount,updated_by=auth.uid()
      where id=p_id and company_id=company returning to_jsonb(media_converter_records) into saved_row;
  end if;
  return saved_row;
end;
$$;
revoke all on function public.fluux_set_service_amount(text,uuid,numeric,timestamptz) from public,anon,authenticated;
grant execute on function public.fluux_set_service_amount(text,uuid,numeric,timestamptz) to authenticated;
commit;
select 'F2.2 — Valores do fechamento instalados' as resultado;
