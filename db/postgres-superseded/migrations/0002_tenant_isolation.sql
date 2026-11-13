-- Row-level security: a session sees only its clinic's rows.
-- The server sets the tenant once per connection or transaction:  select set_config('app.clinic_id', '<clinic id>', true);
-- With no value set, no rows are visible. Application roles must not own the tables or bypass RLS.
begin;
do $$
declare t text;
begin
  for t in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'clinic_id'
             and table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($p$create policy tenant_isolation on %I using (clinic_id = nullif(current_setting('app.clinic_id', true), '')) with check (clinic_id = nullif(current_setting('app.clinic_id', true), ''))$p$, t);
  end loop;
end $$;
alter table clinic enable row level security;
alter table clinic force row level security;
create policy tenant_isolation on clinic using (id = nullif(current_setting('app.clinic_id', true), '')) with check (id = nullif(current_setting('app.clinic_id', true), ''));
insert into schema_migration (version) values ('0002_tenant_isolation');
commit;
