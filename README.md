# Family Dispatch: multi-tenant trucking prototype

[![tests](https://github.com/agentxxblue14/family-dispatch-assessment/actions/workflows/test.yml/badge.svg)](https://github.com/agentxxblue14/family-dispatch-assessment/actions/workflows/test.yml)

A small working dispatch app with two fictional trucking companies, **Alpha Transport** and **Beta Logistics**. Each has an owner, a dispatcher, two drivers, two trucks and four loads. Owners and dispatchers see their company's loads, drivers and trucks; drivers see only their own loads; loads move Assigned > Picked Up > Delivered; delivery documents (POD) attach to loads. A user of one company can never read or change the other company's data. This is enforced on the server by two independent locks (the application filter and Postgres Row Level Security), and 69 automated tests plus a 32-attempt attack script prove it.

All data is fictional sample data.

- **Live app (Replit):** _link added after import_
- **Source (GitHub):** https://github.com/agentxxblue14/family-dispatch-assessment
- **Architecture, tenant isolation and role permissions:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Cross-company security test results:** [docs/SECURITY-TEST.md](docs/SECURITY-TEST.md)
- **Walkthrough:** [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md)
- **AI tools disclosure:** [docs/AI-DISCLOSURE.md](docs/AI-DISCLOSURE.md)

## Test logins

Password for every account: `Demo2026!` (the login page also lists them; click a name to log in).

| Company | Name | Email | Role |
|---|---|---|---|
| Alpha Transport | Dana Reyes | owner@alpha.test | Owner |
| Alpha Transport | Sam Ortiz | dispatch@alpha.test | Dispatcher |
| Alpha Transport | Miguel Cruz | driver1@alpha.test | Driver |
| Alpha Transport | Jordan Lee | driver2@alpha.test | Driver |
| Beta Logistics | Priya Shah | owner@beta.test | Owner |
| Beta Logistics | Tom Hale | dispatch@beta.test | Dispatcher |
| Beta Logistics | Ana Silva | driver1@beta.test | Driver |
| Beta Logistics | Ben Ward | driver2@beta.test | Driver |

Sample data, the same on every start: Alpha loads A-1001 to A-1004 have ids 1 to 4, Beta loads B-2001 to B-2004 have ids 5 to 8. A-1002 and B-2002 are Delivered and already have a POD.

## Run it

Needs Node.js 20 or newer. No database to install: Postgres runs inside the app (PGlite).

```bash
npm install
npm start          # http://localhost:3000 (set PORT to use another port)
```

On Replit: open the project and press **Run**. Every start rebuilds the database from the sample data, so you always begin from the same state.

## What to try

1. Log in as **Dana Reyes** (Alpha owner). Loads, Drivers and Trucks show Alpha data only.
2. Click **A-1001**, press **Mark Picked Up**, upload any PDF, PNG or JPG as the POD, and read the history ("Dana Reyes moved Assigned to Picked Up").
3. Open **Security check** and press **Run all**. Each button sends a real request for Beta data straight to the API. Every one comes back BLOCKED.
4. Open **Blocked log** to see those attempts recorded for the owner.
5. Log in as **Miguel Cruz** (Alpha driver), on a phone-width window if you like. He sees only A-1001 and A-1003.

Or attack the API directly (output from a real run, extra headers trimmed):

```
$ curl -s -c jar.txt -H "Content-Type: application/json" -d '{"email":"owner@alpha.test","password":"Demo2026!"}' http://localhost:3000/api/login
{"user":{"id":1,"name":"Dana Reyes","role":"owner","company":{"id":1,"name":"Alpha Transport"}}}

$ curl -i -b jar.txt http://localhost:3000/api/loads/5          # a Beta Logistics load
HTTP/1.1 404 Not Found
{"error":"Not found"}

$ curl -i -b jar.txt http://localhost:3000/api/loads/9999       # a load that does not exist
HTTP/1.1 404 Not Found
{"error":"Not found"}
```

The two answers are identical, so an Alpha user cannot even tell whether a Beta load exists.

## API

| Method and path | Who | Success | Errors |
|---|---|---|---|
| POST /api/login `{email, password}` | anyone | 200 `{user}` + session cookie | 400, 401, 429 |
| POST /api/logout | logged in | 204 | 401 |
| GET /api/me | logged in | 200 user with company and role | 401 |
| GET /api/loads | logged in | 200 loads (drivers: own only) | 401 |
| GET /api/loads/:id | allowed to view | 200 `{load, events, document}` | 400, 401, 404 |
| POST /api/loads/:id/advance | owner, dispatcher, assigned driver | 200 `{load}` | 401, 404, 409 already Delivered |
| POST /api/loads/:id/document (multipart `file`) | same as advance | 201 `{document}` | 400, 401, 404 |
| GET /api/loads/:id/document | allowed to view | 200 file download | 401, 404 |
| GET /api/drivers, GET /api/trucks | owner, dispatcher | 200 list | 401, 403 |
| GET /api/audit/denials | owner | 200 blocked attempts | 401, 403 |
| GET /api/health | anyone | 200 `{ok:true}` | |

Another company's record, another driver's load and a missing id all return the same `404 {"error":"Not found"}`. A wrong role inside your own company returns `403 {"error":"Forbidden"}`.

## Automated tests

```bash
npm test               # all tests
npm run test:coverage  # with a coverage table
npm run security-test  # 32 cross-company attempts against the real server, writes docs/SECURITY-TEST.md
npm run lint           # ESLint
```

Results from the last local run (Node 24.19, Windows) and on Node 20.20:

| File | What it covers | Tests |
|---|---|---|
| test/policy.test.js | Role table and status workflow as pure functions | 10 |
| test/rls.test.js | Lock 2 alone: Row Level Security with raw SQL, no app code | 7 |
| test/lock1.test.js | Lock 1 alone: RLS switched off, the API still isolates | 5 |
| test/auth.test.js | Login, logout, cookie flags, rate limits, forged IP header, session fixation, headers | 14 |
| test/isolation.test.js | Cross-company reads, writes, spoofed company_id, SQL injection, blocked log | 8 |
| test/roles.test.js | Owner, dispatcher and driver rules inside one company | 8 |
| test/workflow.test.js | Assigned > Picked Up > Delivered, history, 409 at the end | 4 |
| test/documents.test.js | Upload and download, file type by signature, size cap, path tricks, isolation | 12 |
| test/matrix.test.js | Every user x every load x view, document, advance: 192 checks in one test | 1 |
| **Total** | | **69 passed, 0 failed** |

```
ℹ matrix: 192 checks, 0 unexpected
ℹ tests 69
ℹ pass 69
ℹ fail 0
```

Coverage of `src/` (`npm run test:coverage`): 99.31% of lines, 90.96% of branches, 97.50% of functions.

`npm run security-test`: **32 cross-company attempts, 0 leaks** (16 from Alpha against Beta, 16 from Beta against Alpha), plus a direct database check that no cross-company write landed. Full table in [docs/SECURITY-TEST.md](docs/SECURITY-TEST.md).

GitHub Actions runs lint, formatting, the tests and the security script on Node 20 and 22 on every push (badge above).

## Project layout

```
src/
  server.js            start: clean old uploads, build database, seed, listen
  app.js               middleware order, routes, JSON 404, error handler
  config.js            settings from environment variables
  db/schema.sql        tables, composite foreign keys, indexes
  db/rls.sql           app_user role, grants, Row Level Security policies (Lock 2)
  db/index.js          openDb, withTenant (per-request transaction), login lookups
  db/repo.js           tenantRepo: the only tenant data access (Lock 1)
  db/seed.js           fictional sample data
  policy/permissions.js  PERMISSIONS table and can()
  policy/workflow.js     STATUSES and nextStatus()
  auth/middleware.js     requireAuth, requirePermission, requireLoadAccess
  routes/                auth, loads, fleet, documents, audit
  http/                  errors, input validation, JSON shapes
  storage.js             upload file checks and storage
public/                  one page, plain JavaScript, no build step
test/                    9 test files (node:test + supertest)
scripts/security-test.js end-to-end cross-company attack script
docs/                    architecture, security test, walkthrough, AI disclosure, screenshots
```

## Known issues and unfinished items

- **Data resets on every restart, by design.** The database (PGlite) and the sessions live in memory. Production would use hosted Postgres and a Postgres-backed session store.
- **The deployment must run one instance.** Because sessions and data are in memory, two instances would not share them. On Replit choose a Reserved VM, or Autoscale with max instances set to 1.
- **Uploaded files are stored on the server's disk** under `uploads/<company id>/` and are cleared on restart. Production would use object storage with signed URLs.
- **No create or edit screens** for loads, drivers, trucks or users. The brief asks to view and move sample data; the seed provides it.
- **The login page lists every sample account and the shared password.** This is on purpose so reviewers can log in with one click; a real product would never do this.
- **Account lockout trade-off.** After 10 failed logins an account is blocked for 15 minutes, so someone who knows an email can keep that account locked by repeating bad guesses. Production would use a CAPTCHA or email unlock instead of a hard block. The per-IP limit is 50 so one person's typos do not lock out an office.
- **Rate limit counters are in memory** and reset on restart.
- **The login lookup runs outside Row Level Security**, because the company is not known until the password is checked. It is one small function that returns only the matching user. On hosted Postgres it would become a `SECURITY DEFINER` function.
- **The browser console shows red network lines** for the 404 answers in the Security check tab (those requests are meant to fail) and a 401 from the "am I logged in?" check on the login page. There are no script errors.
- **Browser behaviour is checked by a manual run** (headless Chrome, all 8 users, screenshots in `docs/screenshots/`), not by an automated browser test in CI.
