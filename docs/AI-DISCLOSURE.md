# AI tools disclosure

## Tool

**Claude Code** (Anthropic's command-line coding agent), running the Claude Opus 5.5 model on my own Windows PC. It read and wrote files in this project folder and ran commands (npm, node, git) in my terminal. No other AI tools were used for the code.

## How I used it

**Planning.** Before writing code I worked with Claude Code on a written build plan: stack, schema, the two-lock isolation design, permission table, API contract, threat model, test list and timeline. A separate Claude Code session reviewed that plan the way a CTO would, and the plan was revised. I made the main calls between the options it laid out, including two locks instead of one, Postgres (PGlite) instead of SQLite so Row Level Security was possible, 404 instead of 403 across companies, and no front-end framework. _[Judah: confirm these were your calls, or edit.]_

**Building.** Claude Code wrote the code, tests and documentation, following the plan one phase at a time:

1. Database schema, Row Level Security and sample data.
2. The permission table and status workflow.
3. Repository, login and routes.
4. Delivery documents and the 192-check matrix.
5. The front end.
6. The security test script and the docs.

For each phase the test file was written first and run to see it fail, then the code was written until the tests passed. Each phase has its own commits, so the git history shows the order.

**Independent review.** Fresh Claude Code sessions that had not written the code were used as reviewers:

- **Security reviewer, round 1.** Attacked the running server: cross-company requests, id guessing, parameter tampering, upload tricks, session tricks, SQL injection. It found no way across companies or above a role. It found one real weakness: the login rate limit could be reset by forging the `X-Forwarded-For` header. Fixed, with two new tests.
- **Security reviewer, round 2.** Same brief, plus the login limits and the front end. Again nothing crossed companies or roles. Four findings: one Medium (the login limit could lock out everyone on the same network), one Low and two Info. I fixed the lockout scope, added a sandbox header on file downloads and startup cleanup of old files, and documented the rest as known issues. Four new tests.
- **Hiring-manager reviewer.** Installed and ran the project from the README alone and graded it against the brief. Its findings and the changes made are listed below.

## How the AI's output was checked

I did not take the AI's word that anything worked. Every claim in these docs comes from a command whose output was seen:

- **Tests first.** Each test file failed before its code existed and passed after.
- **The tests can catch a real bug.** During the build Claude Code deliberately broke each lock and reran the tests:
  - Removing the company filter from the repository made `lock1.test.js` fail, while the RLS-protected API tests still passed.
  - Breaking both locks made `npm run security-test` report 18 leaks and exit with an error.
- **Exhaustive matrix.** Every user against every load and action (192 checks), with expected results written out by hand in the test instead of reusing the app's own permission function.
- **Attack script against the real server.** `npm run security-test`: 32 cross-company attempts and a direct database check, 0 leaks.
- **Browser check.** Headless Chrome logged in as all 8 users, checked every screen and the console, ran every Security check button (all BLOCKED) and saved the screenshots in `docs/screenshots/`.
- **Two Node versions.** The suite passed on Node 24 and Node 20 locally. GitHub Actions runs it on Node 20 and 22 on every push.
- **Lint and formatting.** ESLint and Prettier are clean.

## What I reviewed myself

_[Judah: replace this paragraph with what you actually did, for example: "I read every file in src/, ran the app and logged in as each user, ran npm test and npm run security-test myself, and walked through repo.js, rls.sql and permissions.js line by line until I could explain them without notes."]_

I can walk through any file on a call: how a request gets its company, why both locks exist, how the permission table is used, and how each test proves what it claims.

## Hiring-manager review: findings and changes

_Filled in after the review._
