-- Staff and their change log, for the day sign-in moves to the server.
-- The browser's PIN salt and hash are NOT carried over: a 4-digit PIN hash is not a server credential. Credentials come with the sign-in design.
begin;
create table staff (
  id text primary key,
  clinic_id text not null references clinic,
  name text not null,
  role text not null check (role in ('owner','admin','dentist','assistant','reception','accountant')),
  job_title text,                                 -- display only
  extra_permissions text[] not null default '{}', -- owner-made additions to the role's defaults, e.g. 'billing.void'
  removed_permissions text[] not null default '{}',
  suspended_at timestamptz, suspended_reason text,
  version int not null default 1, updated_at timestamptz not null default now()
);
create table staff_event (                        -- who changed whose access; history stays when a person is removed
  id bigserial primary key,
  clinic_id text not null references clinic,
  at timestamptz not null,
  by_staff text not null,
  action text not null check (action in ('added','role','permissions','suspended','reactivated','removed')),
  target text not null,
  detail text
);
create index staff_event_idx on staff_event (clinic_id, at);

alter table staff enable row level security;       alter table staff force row level security;
alter table staff_event enable row level security; alter table staff_event force row level security;
create policy tenant_isolation on staff       using (clinic_id = nullif(current_setting('app.clinic_id', true), '')) with check (clinic_id = nullif(current_setting('app.clinic_id', true), ''));
create policy tenant_isolation on staff_event using (clinic_id = nullif(current_setting('app.clinic_id', true), '')) with check (clinic_id = nullif(current_setting('app.clinic_id', true), ''));
insert into schema_migration (version) values ('0003_staff');
commit;
