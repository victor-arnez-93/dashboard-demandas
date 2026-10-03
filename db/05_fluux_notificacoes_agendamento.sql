-- FLUUX F2.7: verificação de prazos a cada cinco minutos, mesmo sem site aberto.
-- Supabase/PostgreSQL precisa disponibilizar a extensão pg_cron.
-- Não envia e-mail nem push; atualiza somente as caixas de entrada no banco.
begin;
create extension if not exists pg_cron;
do $$ declare job record; begin
  if to_regprocedure('public.fluux_notifications_tick()') is null then raise exception 'Execute primeiro o SQL 04.'; end if;
  for job in select jobid from cron.job where jobname='fluux-notifications-tick' loop
    perform cron.unschedule(job.jobid);
  end loop;
  perform cron.schedule('fluux-notifications-tick','*/5 * * * *','select public.fluux_notifications_tick();');
end $$;
commit;
