-- Lock 2: Postgres Row Level Security.
--
-- The app runs every tenant query as app_user, a role that does not own the tables.
-- Each request sets app.company_id for its own transaction only (see withTenant in index.js).
-- Each policy compares company_id with that setting. If the setting is missing or empty,
-- NULLIF turns it into NULL, "company_id = NULL" is never true, and the query sees no rows
-- (fails closed). FORCE makes the policy apply even to the table owner.

CREATE ROLE app_user NOLOGIN;

-- Least privilege: app_user can only do what the app needs. No DELETE anywhere,
-- no UPDATE except load status, no INSERT into users, trucks or loads.
GRANT SELECT ON companies TO app_user;
GRANT SELECT ON users, trucks TO app_user;
GRANT SELECT, UPDATE ON loads TO app_user;
GRANT SELECT, INSERT ON load_events, documents, access_denials TO app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- companies: a user can only see their own company row.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON companies
  USING (id = NULLIF(current_setting('app.company_id', true), '')::int);

-- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::int)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::int);

-- trucks
ALTER TABLE trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE trucks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON trucks
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::int)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::int);

-- loads
ALTER TABLE loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE loads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON loads
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::int)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::int);

-- load_events
ALTER TABLE load_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE load_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON load_events
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::int)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::int);

-- documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON documents
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::int)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::int);

-- access_denials
ALTER TABLE access_denials ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_denials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON access_denials
  USING (company_id = NULLIF(current_setting('app.company_id', true), '')::int)
  WITH CHECK (company_id = NULLIF(current_setting('app.company_id', true), '')::int);
