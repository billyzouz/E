-- Planificateur : Supabase appelle l'appli à intervalles réguliers (le plan gratuit Vercel limite ses crons à 1/jour).
-- L'adresse de l'appli et le secret sont lus dans le coffre Supabase (Vault), jamais écrits ici :
--   select vault.create_secret('https://ton-app.vercel.app', 'app_url');
--   select vault.create_secret('<valeur de CRON_SECRET>', 'cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.call_app(path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  secret text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base is null or secret is null then
    raise notice 'Secrets app_url / cron_secret absents du Vault : appel ignoré';
    return null;
  end if;
  return net.http_get(
    url := rtrim(base, '/') || path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 300000
  );
end;
$$;

revoke all on function private.call_app(text) from public, anon, authenticated;

-- (Re)crée les tâches planifiées
select cron.unschedule(jobname) from cron.job where jobname in ('e-orders', 'e-autopilot', 'e-stock');
select cron.schedule('e-orders', '*/15 * * * *', $$select private.call_app('/api/cron/sync-orders')$$);
select cron.schedule('e-autopilot', '5,25,45 * * * *', $$select private.call_app('/api/cron/autopilot')$$);
select cron.schedule('e-stock', '30 */6 * * *', $$select private.call_app('/api/cron/sync-stock')$$);
