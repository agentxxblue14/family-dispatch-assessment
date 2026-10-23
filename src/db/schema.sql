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

-- Blocked attempts (403 wrong role, 404 not yours or missing). Each row belongs to the company
-- of the user who made the attempt, so its owner can see what their own staff tried.
CREATE TABLE access_denials (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL,
  user_id INT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INT NOT NULL CHECK (status IN (403, 404)),
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, company_id) REFERENCES users(id, company_id)
);

CREATE INDEX loads_company_driver ON loads (company_id, driver_id);
CREATE INDEX trucks_company ON trucks (company_id);
CREATE INDEX users_company ON users (company_id);
CREATE INDEX events_company_load ON load_events (company_id, load_id);
CREATE INDEX docs_company_load ON documents (company_id, load_id);
CREATE INDEX denials_company ON access_denials (company_id);

-- Workflow rules, enforced by the database as well as by the app (a second lock, like tenancy).
-- A status may only move one step forward, and Delivered needs a delivery document on file.
-- Setting the same status again is a no-op and allowed.
CREATE FUNCTION check_load_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT ((OLD.status = 'Assigned' AND NEW.status = 'Picked Up')
       OR (OLD.status = 'Picked Up' AND NEW.status = 'Delivered')) THEN
    RAISE EXCEPTION 'status change from % to % is not allowed', OLD.status, NEW.status;
  END IF;
  IF NEW.status = 'Delivered' AND NOT EXISTS (
       SELECT 1 FROM documents d WHERE d.load_id = NEW.id AND d.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'a POD is required before a load is Delivered';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER load_status_rules
  BEFORE UPDATE OF status ON loads
  FOR EACH ROW EXECUTE FUNCTION check_load_status();
