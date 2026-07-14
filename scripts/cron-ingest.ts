/**
 * Weekly cron ingestion script — run manually or via launchd on Mac mini.
 * Fetches only new Hormozi videos since last run.
 *
 * Mac mini launchd setup: see README.md
 *
 * Manual run:
 *   ts-node scripts/cron-ingest.ts
 */
import "dotenv/config";
import { getDb, initSchema } from "../src/db/init";
import { refreshYouTube } from "../src/cron/youtube-refresh";

async function main() {
  const db = getDb();
  initSchema(db);

  await refreshYouTube(db);

  db.close();
}

main().catch((err) => {
  console.error("Cron ingest failed:", err);
  process.exit(1);
});
