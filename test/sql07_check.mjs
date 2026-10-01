// Valida a sintaxe do 07 com stubs de storage/cron/realtime (PGlite não tem esses recursos)
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
const db = new PGlite({ extensions: { pg_trgm } });
await db.exec(fs.readFileSync('test/00_stub_supabase.sql', 'utf8'));
await db.exec(fs.readFileSync('sql/atos_completo.sql', 'utf8'));
await db.exec(`
  create role supabase_auth_admin; create role service_role_x;
  create schema if not exists extensions; create schema storage; create schema cron;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create table cron.job (jobid serial primary key, jobname text, schedule text, command text);
  create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job(jobname, schedule, command) values (n, s, c) returning jobid $$;
  create function cron.unschedule(i int) returns boolean language sql as $$ delete from cron.job where jobid = i returning true $$;
  create publication supabase_realtime;
  create extension pg_trgm schema public; -- simula o projeto em que o pg_trgm já está no public
`).catch(e => console.log('stub parcial:', e.message));
let sql = fs.readFileSync('sql/07_supabase_storage_cron.sql', 'utf8')
  .replace(/create extension if not exists pg_cron;/, '')
  ;
for (let i = 0; i < 2; i++) await db.exec(sql);
const jobs = (await db.query('select jobname, schedule from cron.job order by jobname')).rows;
const pub = (await db.query("select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1")).rows;
const idx = (await db.query("select indexname from pg_indexes where indexname like '%trgm'")).rows;
console.log('índices:', idx.map(x => x.indexname).join(','));
console.log('jobs:', JSON.stringify(jobs), '| realtime:', pub.map(x => x.tablename).join(','));
console.log(jobs.length === 2 && pub.length === 1 ? '07 OK (executado 2x)' : '07 FALHOU');
