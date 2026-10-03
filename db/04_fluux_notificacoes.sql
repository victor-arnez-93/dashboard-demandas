-- FLUUX F2.7: caixa de entrada individual, alertas e Realtime.

begin;
do $$ begin
  if to_regclass('public.fluux_timeline_events') is null or to_regclass('public.fluux_billing_checks') is null then
    raise exception 'Execute primeiro os SQLs 01, 02 e 03.';
  end if;
end $$;
create table if not exists public.fluux_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  category text not null check(category in ('event','overdue','due','inactive','waiting','billing')),
  entity_kind text not null check(entity_kind in ('demand','converter')),
  entity_id uuid not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  unique(company_id,recipient_id,event_key)
);
create index if not exists fluux_notifications_inbox_idx on public.fluux_notifications(company_id,recipient_id,created_at desc,id);
create table if not exists public.fluux_notification_preferences (
  company_id uuid not null references public.companies(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  due_days integer not null default 3 check(due_days between 1 and 30),
  inactive_days integer not null default 7 check(inactive_days between 1 and 90),
  primary key(company_id,recipient_id)
);
alter table public.fluux_notifications enable row level security;
alter table public.fluux_notification_preferences enable row level security;
drop policy if exists fluux_notifications_read on public.fluux_notifications;
create policy fluux_notifications_read on public.fluux_notifications for select to authenticated using(
  company_id=(select public.current_company_id()) and recipient_id=(select auth.uid()) and public.is_company_member(company_id)
);
drop policy if exists fluux_notification_preferences_read on public.fluux_notification_preferences;
create policy fluux_notification_preferences_read on public.fluux_notification_preferences for select to authenticated using(
  company_id=(select public.current_company_id()) and recipient_id=(select auth.uid()) and public.is_company_member(company_id)
);
revoke all on public.fluux_notifications,public.fluux_notification_preferences from public,anon,authenticated;
grant select on public.fluux_notifications,public.fluux_notification_preferences to authenticated;

-- Private source of current tasks, including the latest billing result per month.
create or replace function public.fluux_notification_tasks(p_company uuid,p_due integer,p_inactive integer)
returns table(event_key text,category text,entity_kind text,entity_id uuid,title text,body text)
language sql stable security definer set search_path='' as $$
with dates as (select (now() at time zone 'America/Sao_Paulo')::date today),
open_demands as (
  select d.*,coalesce(d.updated_at,d.created_at) last_update from public.demands d
  where d.company_id=p_company and d.status not in ('Concluída','Cancelada')
), latest as (
  select distinct on(c.entity_kind,c.competence) c.* from public.fluux_billing_checks c
  where c.company_id=p_company order by c.entity_kind,c.competence,c.created_at desc,c.id desc
), billing as (
  select i.*,c.competence,c.created_at check_time,d.updated_at demand_update,d.status demand_status,
    d.execution_date,d.completed_at,d.billable_amount demand_amount,m.updated_at converter_update,
    m.status converter_status,m.service_date,m.billable_amount converter_amount
  from latest c join public.fluux_billing_check_items i on i.check_id=c.id and i.company_id=p_company
  left join public.demands d on i.entity_kind='demand' and d.id=i.entity_id and d.company_id=p_company
  left join public.media_converter_records m on i.entity_kind='converter' and m.id=i.entity_id and m.company_id=p_company
  where i.entity_id is not null and i.result in ('missing','divergent','ambiguous')
)
select 'overdue:'||d.id||':'||d.due_date,'overdue','demand',d.id,'Demanda atrasada',
  coalesce(nullif(d.lpu_number,''),'Sem LPU')||' · '||coalesce(d.title,'Demanda')||' · prazo '||to_char(d.due_date,'DD/MM/YYYY')
from open_demands d cross join dates where d.due_date<dates.today
union all
select 'due:'||d.id||':'||d.due_date||':'||p_due,'due','demand',d.id,'Demanda próxima do prazo',
  coalesce(nullif(d.lpu_number,''),'Sem LPU')||' · '||coalesce(d.title,'Demanda')||' · prazo '||to_char(d.due_date,'DD/MM/YYYY')
from open_demands d cross join dates where d.due_date between dates.today and dates.today+p_due
union all
select 'inactive:'||d.id||':'||d.last_update||':'||p_inactive,
  case when d.status='Aguardando retorno' then 'waiting' else 'inactive' end,'demand',d.id,
  case when d.status='Aguardando retorno' then 'Retorno sem atualização' else 'Demanda sem atualização' end,
  coalesce(nullif(d.lpu_number,''),'Sem LPU')||' · '||coalesce(d.title,'Demanda')||' · última atualização '||to_char(d.last_update at time zone 'America/Sao_Paulo','DD/MM/YYYY')
from open_demands d cross join dates where (d.last_update at time zone 'America/Sao_Paulo')::date<=dates.today-p_inactive
union all
select 'billingcheck:'||b.check_id||':'||b.entity_id,'billing',b.entity_kind,b.entity_id,'Pendência na conferência',
  b.identifier||' · '||case b.result when 'missing' then 'Não encontrado na planilha' when 'divergent' then 'Divergência de valor' else 'Revisão manual' end||' · '||to_char(b.competence,'MM/YYYY')
from billing b where
  (b.entity_kind='demand' and b.demand_update=(b.snapshot->>'updated_at')::timestamptz
    and b.demand_status<>'Cancelada' and (b.execution_date is not null or b.demand_status='Concluída')
    and coalesce(b.execution_date,(b.completed_at at time zone 'America/Sao_Paulo')::date)=(b.snapshot->>'date')::date
    and (b.demand_amount*100)::bigint is not distinct from (b.snapshot->>'expected_cents')::bigint)
  or (b.entity_kind='converter' and b.converter_update=(b.snapshot->>'updated_at')::timestamptz
    and public.fluux_billing_key(b.converter_status) in ('CONCLUÍDO','CONCLUÍDA','CONCLUIDO','CONCLUIDA','FINALIZADO','FINALIZADA')
    and b.service_date=(b.snapshot->>'date')::date
    and (b.converter_amount*100)::bigint is not distinct from (b.snapshot->>'expected_cents')::bigint);
$$;
revoke all on function public.fluux_notification_tasks(uuid,integer,integer) from public,anon,authenticated;

create or replace function public.fluux_refresh_notification_tasks(p_company uuid,p_recipient uuid,p_due integer,p_inactive integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.company_members where company_id=p_company and user_id=p_recipient and is_active) then return; end if;
  -- Serialize task refreshes for one inbox; never clear a newer concurrent refresh.
  perform pg_advisory_xact_lock(hashtextextended(p_company::text||':'||p_recipient::text,0));
  update public.fluux_notifications n set resolved_at=clock_timestamp()
  where n.company_id=p_company and n.recipient_id=p_recipient and n.category<>'event' and n.resolved_at is null
    and not exists(select 1 from public.fluux_notification_tasks(p_company,p_due,p_inactive) t where t.event_key=n.event_key);
  insert into public.fluux_notifications(company_id,recipient_id,event_key,category,entity_kind,entity_id,title,body)
    select p_company,p_recipient,t.* from public.fluux_notification_tasks(p_company,p_due,p_inactive) t
    on conflict(company_id,recipient_id,event_key) do update set resolved_at=null,title=excluded.title,body=excluded.body
      where public.fluux_notifications.resolved_at is not null or public.fluux_notifications.body<>excluded.body;
  -- Read/dismissal states deliberately survive refreshes and repeated visits.
end $$;
revoke all on function public.fluux_refresh_notification_tasks(uuid,uuid,integer,integer) from public,anon,authenticated;

create or replace function public.fluux_sync_notifications(p_due_days integer default 3,p_inactive_days integer default 7)
returns void language plpgsql security definer set search_path='' as $$
declare c uuid:=public.current_company_id();u uuid:=auth.uid();
begin
  if u is null or c is null or not public.is_company_member(c) then raise exception 'Sessão ou empresa inválida.' using errcode='42501'; end if;
  if p_due_days is null or p_inactive_days is null or p_due_days not between 1 and 30 or p_inactive_days not between 1 and 90 then
    raise exception 'Revise os limites dos alertas.' using errcode='22023';
  end if;
  insert into public.fluux_notification_preferences(company_id,recipient_id,due_days,inactive_days)
    values(c,u,p_due_days,p_inactive_days) on conflict(company_id,recipient_id) do update set due_days=excluded.due_days,inactive_days=excluded.inactive_days;
  perform public.fluux_refresh_notification_tasks(c,u,p_due_days,p_inactive_days);
end $$;
revoke all on function public.fluux_sync_notifications(integer,integer) from public,anon;
grant execute on function public.fluux_sync_notifications(integer,integer) to authenticated;

create or replace function public.fluux_notification_action(p_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare c uuid:=public.current_company_id();u uuid:=auth.uid();
begin
  if u is null or c is null or not public.is_company_member(c) then raise exception 'Sessão ou empresa inválida.' using errcode='42501'; end if;
  if p_action not in ('read','dismiss','read_all') or p_action is null then raise exception 'Ação inválida.' using errcode='22023'; end if;
  if p_action='read_all' then
    update public.fluux_notifications set read_at=clock_timestamp() where company_id=c and recipient_id=u and read_at is null and dismissed_at is null and resolved_at is null;
  else
    update public.fluux_notifications set read_at=coalesce(read_at,clock_timestamp()),
      dismissed_at=case when p_action='dismiss' then clock_timestamp() else dismissed_at end
    where id=p_id and company_id=c and recipient_id=u;
    if not found then raise exception 'Notificação indisponível.' using errcode='42501'; end if;
  end if;
end $$;
revoke all on function public.fluux_notification_action(uuid,text) from public,anon;
grant execute on function public.fluux_notification_action(uuid,text) to authenticated;

-- Only selected business changes create notices. Baselines and own actions do not.
create or replace function public.fluux_capture_notification_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare label text;
begin
  if new.event_type='deleted' then
    update public.fluux_notifications set resolved_at=coalesce(resolved_at,clock_timestamp())
      where company_id=new.company_id and entity_kind=new.entity_kind and entity_id=new.entity_id;
    return new;
  end if;
  if new.event_type='billing' then
    update public.fluux_notifications set resolved_at=coalesce(resolved_at,clock_timestamp())
      where company_id=new.company_id and entity_kind=new.entity_kind and entity_id=new.entity_id and category='billing';
    if new.snapshot->>'result' in ('missing','divergent','ambiguous') then
      insert into public.fluux_notifications(company_id,recipient_id,event_key,category,entity_kind,entity_id,title,body)
      select new.company_id,m.user_id,'billingcheck:'||(new.snapshot->>'check_id')||':'||new.entity_id,
        'billing',new.entity_kind,new.entity_id,'Pendência na conferência',new.message
      from public.company_members m join public.profiles p on p.id=m.user_id
      where m.company_id=new.company_id and m.is_active on conflict(company_id,recipient_id,event_key) do nothing;
    end if;
    return new;
  end if;
  if new.event_type='baseline' then return new; end if;
  if new.event_type='updated' and not (new.changes ?| array['status','manager_status','responsible','responsible_name','notes']) then return new; end if;
  label:=case new.event_type when 'created' then 'Novo registro' when 'manual' then 'Novo andamento' else 'Registro atualizado' end;
  insert into public.fluux_notifications(company_id,recipient_id,event_key,category,entity_kind,entity_id,title,body)
  select new.company_id,m.user_id,'event:'||new.id,'event',new.entity_kind,new.entity_id,label,
    coalesce(nullif(new.actor_name,''),'Equipe')||' · '||coalesce(nullif(new.snapshot->>'lpu_number',''),'Sem identificador')||' · '||coalesce(nullif(new.snapshot->>'title',''),nullif(new.snapshot->>'project',''),'Registro')||' · '||coalesce(nullif(new.message,''),'Confira os detalhes do registro')
  from public.company_members m join public.profiles p on p.id=m.user_id
  where m.company_id=new.company_id and m.is_active and (new.actor_id is null or m.user_id<>new.actor_id)
  on conflict(company_id,recipient_id,event_key) do nothing;
  return new;
end $$;
revoke all on function public.fluux_capture_notification_event() from public,anon,authenticated;
drop trigger if exists fluux_timeline_notifications on public.fluux_timeline_events;
create trigger fluux_timeline_notifications after insert on public.fluux_timeline_events
  for each row execute function public.fluux_capture_notification_event();

-- Run after source changes, so resolved pending tasks leave every member's inbox.
create or replace function public.fluux_refresh_company_notifications()
returns trigger language plpgsql security definer set search_path='' as $$
declare c uuid;member record;
begin
  c:=case when TG_OP='DELETE' then old.company_id else new.company_id end;
  for member in select m.user_id,coalesce(p.due_days,3) due_days,coalesce(p.inactive_days,7) inactive_days
    from public.company_members m left join public.fluux_notification_preferences p on p.company_id=m.company_id and p.recipient_id=m.user_id
    where m.company_id=c and m.is_active order by m.user_id loop
    perform public.fluux_refresh_notification_tasks(c,member.user_id,member.due_days,member.inactive_days);
  end loop;
  return null;
end $$;
revoke all on function public.fluux_refresh_company_notifications() from public,anon,authenticated;
drop trigger if exists zz_fluux_notification_tasks on public.demands;
create trigger zz_fluux_notification_tasks after insert or update or delete on public.demands for each row execute function public.fluux_refresh_company_notifications();
drop trigger if exists zz_fluux_notification_tasks on public.media_converter_records;
create trigger zz_fluux_notification_tasks after insert or update or delete on public.media_converter_records for each row execute function public.fluux_refresh_company_notifications();
create or replace function public.fluux_notifications_tick()
returns void language plpgsql security definer set search_path='' as $$
declare member record;
begin
  for member in select m.company_id,m.user_id,coalesce(p.due_days,3) due_days,coalesce(p.inactive_days,7) inactive_days
    from public.company_members m left join public.fluux_notification_preferences p on p.company_id=m.company_id and p.recipient_id=m.user_id
    where m.is_active order by m.company_id,m.user_id loop
    perform public.fluux_refresh_notification_tasks(member.company_id,member.user_id,member.due_days,member.inactive_days);
  end loop;
end $$;
revoke all on function public.fluux_notifications_tick() from public,anon,authenticated;

create or replace function public.fluux_notification_inbox(p_mode text default 'unread',p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid:=public.current_company_id();u uuid:=auth.uid(); result jsonb;total integer;filtered_total integer;
begin
  if u is null or c is null or not public.is_company_member(c) then raise exception 'Sessão ou empresa inválida.' using errcode='42501'; end if;
  if p_mode is null or p_mode not in ('unread','history') or p_limit is null or p_limit not between 1 and 200 or p_offset is null or p_offset not between 0 and 1000000 then raise exception 'Filtro inválido.' using errcode='22023'; end if;
  select count(*) into total from public.fluux_notifications where company_id=c and recipient_id=u and read_at is null and dismissed_at is null and resolved_at is null;
  select count(*) into filtered_total from public.fluux_notifications where company_id=c and recipient_id=u
    and (p_mode='history' or (read_at is null and dismissed_at is null and resolved_at is null));
  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc,n.id desc),'[]'::jsonb) into result from (
    select * from public.fluux_notifications where company_id=c and recipient_id=u
      and (p_mode='history' or (read_at is null and dismissed_at is null and resolved_at is null))
    order by created_at desc,id desc limit p_limit offset p_offset
  ) n;
  return jsonb_build_object('company_id',c,'recipient_id',u,'unread',total,'items',result,'has_more',p_offset+p_limit<filtered_total);
end $$;
revoke all on function public.fluux_notification_inbox(text,integer,integer) from public,anon;
grant execute on function public.fluux_notification_inbox(text,integer,integer) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='fluux_notifications') then
      alter publication supabase_realtime add table public.fluux_notifications;
    end if;
  else raise notice 'Publicação supabase_realtime ausente; habilite Realtime para fluux_notifications no Supabase.';
  end if;
end $$;
commit;
