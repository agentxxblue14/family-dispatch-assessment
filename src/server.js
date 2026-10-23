// Starts the server: fresh database, sample data, then listen.
const { openDb } = require('./db');
const { seed } = require('./db/seed');
const { createApp } = require('./app');
const config = require('./config');
const { clearUploads } = require('./storage');

async function main() {
  clearUploads(); // old files belong to the previous run's database
  const db = await openDb();
  const ids = await seed(db);
  const app = createApp(db);
  const loadIds = Object.entries(ids.loads).map(([ref, id]) => `${ref}=${id}`);
  app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`Family Dispatch prototype running on http://localhost:${config.PORT}`);
    console.log(`Seeded loads: ${loadIds.join(' ')}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
