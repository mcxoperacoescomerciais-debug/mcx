-- =====================================================================
-- MCX Campo — usuário SOMENTE LEITURA para o Assistente do MCX Operações
-- =====================================================================
-- Quem roda: você (Eduardo), no Supabase do MCX CAMPO › SQL Editor.
-- Quando: depois das 21h (promotores fora do app). Leva menos de 1 segundo.
-- O que faz: só ACRESCENTA um usuário que lê algumas colunas. Não altera
-- nenhuma tabela, nenhum dado, não reinicia o Campo e não muda o app.
-- O que NÃO libera: senha, telefone, e-mail, custos, fotos, coordenadas,
-- chaves de alerta, notas internas — essas colunas ficam invisíveis.
--
-- ANTES DE RODAR: troque TROQUE_ESTA_SENHA por uma senha forte (só letras e
-- números, 24+ caracteres). Ela vai depois na variável do Render
-- (CAMPO_READONLY_DATABASE_URL) e em nenhum outro lugar. Não cole no chat.
-- =====================================================================

begin;

create role mcx_leitura login password 'TROQUE_ESTA_SENHA' connection limit 3;
alter role mcx_leitura set default_transaction_read_only = on;
alter role mcx_leitura set statement_timeout = '8s';
alter role mcx_leitura set idle_in_transaction_session_timeout = '30s';

grant usage on schema public to mcx_leitura;

-- Só as colunas que o Assistente usa.
grant select (id, name, status, kind) on agencies to mcx_leitura;
grant select (id, agency_id, role, name, status, last_seen_at) on users to mcx_leitura;
grant select (id, agency_id, name, status) on brands to mcx_leitura;
grant select (id, agency_id, name) on chains to mcx_leitura;
grant select (id, agency_id, chain_id, name, city, status) on stores to mcx_leitura;
grant select (id, agency_id, brand_id, name) on products to mcx_leitura;
grant select (id, agency_id, promoter_id, store_id, date, status) on schedules to mcx_leitura;
grant select (schedule_id, brand_id) on schedule_brands to mcx_leitura;
grant select (id, agency_id, promoter_id, store_id, schedule_id, visit_date, status, origin, started_at, finished_at) on visits to mcx_leitura;
grant select (id, agency_id, visit_id, brand_id, status) on attendances to mcx_leitura;
grant select (id, agency_id, attendance_id, product_id, situation, status, recorded_at, deleted_at) on ruptures to mcx_leitura;
grant select (id, agency_id, attendance_id, product_id, kind, quantity, unit, recorded_at, deleted_at) on damages to mcx_leitura;
grant select (id, agency_id, attendance_id, product_id, expiry_date, days_to_expiry, quantity, unit, recorded_at, deleted_at) on validities to mcx_leitura;
grant select (id, agency_id, attendance_id, category, status, note, recorded_at, deleted_at) on occurrences to mcx_leitura;

-- O RLS está ligado em todas as tabelas do Campo sem nenhuma política (proteção
-- contra a API pública). Estas políticas valem SÓ para o mcx_leitura e SÓ para
-- leitura; o app e o painel continuam exatamente como estão.
create policy mcx_leitura_select on agencies for select to mcx_leitura using (true);
create policy mcx_leitura_select on users for select to mcx_leitura using (true);
create policy mcx_leitura_select on brands for select to mcx_leitura using (true);
create policy mcx_leitura_select on chains for select to mcx_leitura using (true);
create policy mcx_leitura_select on stores for select to mcx_leitura using (true);
create policy mcx_leitura_select on products for select to mcx_leitura using (true);
create policy mcx_leitura_select on schedules for select to mcx_leitura using (true);
create policy mcx_leitura_select on schedule_brands for select to mcx_leitura using (true);
create policy mcx_leitura_select on visits for select to mcx_leitura using (true);
create policy mcx_leitura_select on attendances for select to mcx_leitura using (true);
create policy mcx_leitura_select on ruptures for select to mcx_leitura using (true);
create policy mcx_leitura_select on damages for select to mcx_leitura using (true);
create policy mcx_leitura_select on validities for select to mcx_leitura using (true);
create policy mcx_leitura_select on occurrences for select to mcx_leitura using (true);

commit;

-- Conferência (deve mostrar mcx_leitura com rolsuper = false):
-- select rolname, rolsuper, rolcanlogin, rolconnlimit from pg_roles where rolname = 'mcx_leitura';


-- =====================================================================
-- DESFAZER (se um dia precisar): rode o bloco abaixo, sem os "--".
-- =====================================================================
-- begin;
-- drop policy if exists mcx_leitura_select on agencies;
-- drop policy if exists mcx_leitura_select on users;
-- drop policy if exists mcx_leitura_select on brands;
-- drop policy if exists mcx_leitura_select on chains;
-- drop policy if exists mcx_leitura_select on stores;
-- drop policy if exists mcx_leitura_select on products;
-- drop policy if exists mcx_leitura_select on schedules;
-- drop policy if exists mcx_leitura_select on schedule_brands;
-- drop policy if exists mcx_leitura_select on visits;
-- drop policy if exists mcx_leitura_select on attendances;
-- drop policy if exists mcx_leitura_select on ruptures;
-- drop policy if exists mcx_leitura_select on damages;
-- drop policy if exists mcx_leitura_select on validities;
-- drop policy if exists mcx_leitura_select on occurrences;
-- revoke all on all tables in schema public from mcx_leitura;
-- revoke usage on schema public from mcx_leitura;
-- drop role mcx_leitura;
-- commit;
