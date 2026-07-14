import Database from "better-sqlite3";
import { fetchChannelVideos, ingestVideos } from "../ingestion/youtube";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

export async function refreshYouTube(db: Database.Database): Promise<void> {
  if (!YOUTUBE_API_KEY) {
    console.error("YOUTUBE_API_KEY not set — skipping cron refresh");
    return;
  }

  // Get last ingested timestamp
  const row = db
    .prepare("SELECT value FROM ingest_state WHERE key = 'youtube_last_ingested'")
    .get() as { value: string } | undefined;

  const since = row?.value ? new Date(row.value) : undefined;
  console.log(`[cron] Checking for new Hormozi videos since ${since?.toISOString() ?? "beginning"}...`);

  const videos = await fetchChannelVideos(YOUTUBE_API_KEY, since);
  console.log(`[cron] Found ${videos.length} new video(s)`);

  if (videos.length > 0) {
    const result = await ingestVideos(db, videos);
    console.log(`[cron] Done: ${result.ingested} ingested, ${result.skipped} skipped, ${result.failed} failed`);
  }

  // Update last ingested timestamp
  db.prepare(`
    INSERT OR REPLACE INTO ingest_state (key, value, updated_at)
    VALUES ('youtube_last_ingested', datetime('now'), datetime('now'))
  `).run();
}
