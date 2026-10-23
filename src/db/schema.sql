-- Every tenant table carries company_id. Composite foreign keys (id, company_id) make it
-- impossible at the database level for an Alpha load to point at a Beta driver, truck or document.

CREATE TABLE companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'dispatcher', 'driver')),
  UNIQUE (id, company_id)
);

CREATE TABLE trucks (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id),
  unit TEXT NOT NULL,
  UNIQUE (id, company_id)
);

CREATE TABLE loads (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id),
  ref TEXT NOT NULL UNIQUE,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  driver_id INT,
  truck_id INT,
  status TEXT NOT NULL CHECK (status IN ('Assigned', 'Picked Up', 'Delivered')),
  UNIQUE (id, company_id),
  FOREIGN KEY (driver_id, company_id) REFERENCES users(id, company_id),
  FOREIGN KEY (truck_id, company_id) REFERENCES trucks(id, company_id)
);

-- Status history: who moved which load, from what, to what, and when.
CREATE TABLE load_events (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL,
  load_id INT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  user_id INT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (load_id, company_id) REFERENCES loads(id, company_id),
  FOREIGN KEY (user_id, company_id) REFERENCES users(id, company_id)
);

-- Delivery documents (POD). Append-only: the newest row for a load is the current document.
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL,
  load_id INT NOT NULL,
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INT NOT NULL,
  uploaded_by INT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (load_id, company_id) REFERENCES loads(id, company_id),
  FOREIGN KEY (uploaded_by, company_id) REFERENCES users(id, company_id)
);

-- Blocked attempts, shown to the owner of the company whose user made the attempt.
CREATE TABLE access_denials (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL,
  user_id INT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX loads_company_driver ON loads (company_id, driver_id);
CREATE INDEX trucks_company ON trucks (company_id);
CREATE INDEX users_company ON users (company_id);
CREATE INDEX events_company_load ON load_events (company_id, load_id);
CREATE INDEX docs_company_load ON documents (company_id, load_id);
CREATE INDEX denials_company ON access_denials (company_id);
