# AI tools disclosure

## Tool

**Claude Code** (Anthropic's command-line coding agent), running the Claude Opus 5.5 model on my own Windows PC. It read and wrote files in this project folder and ran commands (npm, node, git) in my terminal. No other AI tools were used for the code.

## How I used it

**Planning.** Before writing code I worked with Claude Code on a written build plan: stack, schema, the two-lock isolation design, permission table, API contract, threat model, test list and timeline. A separate Claude Code session reviewed that plan the way a CTO would, and the plan was revised. The plan set out the main options with their trade-offs (one lock or two, SQLite or Postgres, 403 or 404 across companies, a framework or plain JavaScript). The reasons for each final choice are written up in ARCHITECTURE.md.

**Building.** Claude Code wrote the code, tests and documentation, following the plan one phase at a time:

1. Database schema, Row Level Security and sample data.
2. The permission table and status workflow.
3. Repository, login and routes.
4. Delivery documents and the 192-check matrix.
5. The front end.
6. The security test script and the docs.

For each phase the test file was written first and run to see it fail, then the code was written until the tests passed. Each phase has its own commits, so the git history shows the order.

After trying the first working version, I asked for a clearer UI, a realistic sample POD and a dashboard with motion. Claude Code pointed out that the brief says design is not the main grade, and I chose a restrained Overview with short, purposeful motion rather than heavy animation.

**Independent review.** Fresh Claude Code sessions that had not written the code were used as reviewers:

- **Security reviewer, round 1.** Attacked the running server: cross-company requests, id guessing, parameter tampering, upload tricks, session tricks, SQL injection. It found no way across companies or above a role. It found one real weakness: the login rate limit could be reset by forging the `X-Forwarded-For` header. Fixed, with two new tests.
- **Security reviewer, round 2.** Same brief, plus the login limits and the front end. Again nothing crossed companies or roles. Four findings: one Medium (the login limit could lock out everyone on the same network), one Low and two Info. I fixed the lockout scope, added a sandbox header on file downloads and startup cleanup of old files, and documented the rest as known issues. Four new tests.
- **Hiring-manager reviewer.** Cloned the project, installed and ran it from the README alone, and graded it against the brief. It found a real workflow bug (a double click could move a load two steps) and several doc claims that were wrong. All are listed below with the fix and the test.

## How the AI's output was checked

I did not take the AI's word that anything worked. Every claim in these docs comes from a command whose output was seen:

- **Tests first.** Each test file failed before its code existed and passed after.
- **The tests can catch a real bug.** During the build Claude Code deliberately broke each lock and reran the tests:
  - Removing the company filter from the repository made `lock1.test.js` fail, while the RLS-protected API tests still passed.
  - Breaking both locks made `npm run security-test` report 18 leaks and exit with an error.
- **Exhaustive matrix.** Every user against every load and action (192 checks), with expected results written out by hand in the test instead of reusing the app's own permission function.
- **Attack script against the real server.** `npm run security-test`: 32 cross-company attempts and a direct database check, 0 leaks.
- **Browser check.** `npm run browser-check` drives headless Chrome as all 8 users: every screen, every Security check button (all BLOCKED), the workflow from the page, that no screen scrolls sideways at phone width, and the console. 73 of 73 checks passed (docs/BROWSER-CHECK.md).
- **Two Node versions.** The suite passed on Node 24 and Node 20 locally. GitHub Actions is set up to run it on Node 20 and 22 on every push.
- **Lint and formatting.** ESLint and Prettier are clean.

## What I reviewed myself

I logged in and used the app myself, including downloading a delivery document, and asked for changes where it was not good enough (see Building above). I chose to publish the repository privately first and make it public once these documents were final, and I had my submission messages checked against the brief before sending.

I'm happy to walk through any file on a call: how a request gets its company, why both locks exist, how the permission table is used, and how each test proves what it claims.

## Hiring-manager review: findings and changes

The reviewer reran the tests, the coverage report and the security script itself rather than trusting the README. What it found and what changed:

| Finding | Change | Covered by |
|---|---|---|
| Double click moved a load two steps, while the docs claimed it could not | The browser sends the status it saw (`{from}`); the server returns 409 if the load changed; the button is disabled while pending; docs corrected | workflow.test.js: stale screen, 10 simultaneous clicks give 1 move |
| Comment said "UPDATE only on load status" but the grant covered every column | Column-level grant `UPDATE (status)` | rls.test.js: app role cannot change `driver_id` |
| Docs said FORCE made RLS apply to the owner, but in PGlite the owner is a superuser, which always skips RLS | Explanation corrected: RLS applies because every tenant query runs as the limited `app_user` role | (documentation) |
| `.replit` named Autoscale while the app must run one instance | Deployment type left to Replit's Publish screen, with single-instance instructions | (configuration) |
| Security test report printed a fixed port and status text | Real values from the response | security-test output |
| A load could be Delivered without a POD | Server refuses Delivered until a document is on file | workflow.test.js, matrix.test.js |
| Re-grade: workflow rules lived only in app code, unlike tenancy | A database trigger also refuses a skipped step or a Delivered without a POD | rls.test.js: two trigger tests |
| Browser check claim could not be rerun | The check is now `npm run browser-check` and writes docs/BROWSER-CHECK.md | browser-check output |
| Tests left temporary folders behind; README lacked the Windows port syntax and some known issues | Fixed | (housekeeping) |

It also said the submission alone cannot show that I understand the code, because the AI wrote it. That is fair, and the answer has to come from me: I'm happy to explain any file live, or change something on a call.

A note on the git history: each phase's tests and code were committed together, so the history does not show the failing test runs. Those happened in the Claude Code session before each commit.
