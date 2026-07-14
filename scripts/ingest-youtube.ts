/**
 * Full YouTube channel ingestion script.
 * Run once to load all Hormozi videos (600-800 videos, ~$0.12 in embedding costs).
 *
 * Usage:
 *   npm run ingest
 *   or: ts-node scripts/ingest-youtube.ts [--since 2024-01-01]
 */
import "dotenv/config";
import { getDb, initSchema } from "../src/db/init";
import { fetchChannelVideos, ingestVideos } from "../src/ingestion/youtube";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

async function main() {
  if (!YOUTUBE_API_KEY) {
    console.error(
      "ERROR: YOUTUBE_API_KEY is not set.\n" +
      "Get one at: console.cloud.google.com → APIs → YouTube Data API v3 → Create Key"
    );
    process.exit(1);
  }

  if (!process.env.VOYAGE_API_KEY) {
    console.error(
      "ERROR: VOYAGE_API_KEY is not set.\n" +
      "Sign up at: voyageai.com (free, takes 5 minutes)"
    );
    process.exit(1);
  }

  const sinceArg = process.argv.indexOf("--since");
  const since = sinceArg !== -1 ? new Date(process.argv[sinceArg + 1]) : undefined;

  console.log("Initializing database...");
  const db = getDb();
  initSchema(db);

  console.log("Fetching Hormozi channel videos from YouTube API...");
  const videos = await fetchChannelVideos(YOUTUBE_API_KEY, since);
  console.log(`Found ${videos.length} videos to process`);

  if (videos.length === 0) {
    console.log("Nothing to ingest.");
    process.exit(0);
  }

  console.log("\nStarting ingestion (this may take a while for the full channel)...\n");
  const result = await ingestVideos(db, videos, true);

  // Update last ingested timestamp
  db.prepare(`
    INSERT OR REPLACE INTO ingest_state (key, value, updated_at)
    VALUES ('youtube_last_ingested', datetime('now'), datetime('now'))
  `).run();

  console.log("\n===== Ingestion Complete =====");
  console.log(`Ingested: ${result.ingested}`);
  console.log(`Skipped:  ${result.skipped}`);
  console.log(`Failed:   ${result.failed}`);

  const chunkCount = (
    db.prepare("SELECT COUNT(*) as n FROM chunks").get() as { n: number }
  ).n;
  console.log(`Total chunks in DB: ${chunkCount}`);

  db.close();
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
