import { google } from "googleapis";
import { YoutubeTranscript } from "youtube-transcript";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import { chunkText, estimateTokens } from "./chunk";
import { embedBatch } from "../embeddings/voyage";

const CHANNEL_ID = "UCUyDOdBWhC1MCxEjC46d-zw"; // Alex Hormozi
const MIN_DURATION_SECONDS = 300; // 5 min — exclude Shorts

interface VideoMeta {
  videoId: string;
  title: string;
  publishedAt: string;
  url: string;
  viewCount: number;
  durationSeconds: number;
}

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0");
  const m = parseInt(match[2] || "0");
  const s = parseInt(match[3] || "0");
  return h * 3600 + m * 60 + s;
}

export async function fetchChannelVideos(
  apiKey: string,
  since?: Date
): Promise<VideoMeta[]> {
  const youtube = google.youtube({ version: "v3", auth: apiKey });

  // Get uploads playlist ID
  const channelRes = await youtube.channels.list({
    part: ["contentDetails"],
    id: [CHANNEL_ID],
  });
  const uploadsPlaylistId =
    channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error("Could not find uploads playlist");

  // Paginate through all playlist items
  const videoIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await youtube.playlistItems.list({
      part: ["contentDetails", "snippet"],
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken,
    });

    for (const item of res.data.items || []) {
      const publishedAt = item.snippet?.publishedAt;
      if (since && publishedAt && new Date(publishedAt) <= since) continue;
      const videoId = item.contentDetails?.videoId;
      if (videoId) videoIds.push(videoId);
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  if (videoIds.length === 0) return [];

  // Batch fetch video details (50 per call)
  const videos: VideoMeta[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const res = await youtube.videos.list({
      part: ["snippet", "contentDetails", "statistics"],
      id: batch,
    });

    for (const v of res.data.items || []) {
      const dur = parseDuration(v.contentDetails?.duration || "PT0S");
      if (dur < MIN_DURATION_SECONDS) continue;

      videos.push({
        videoId: v.id!,
        title: v.snippet?.title || "Unknown",
        publishedAt: v.snippet?.publishedAt || "",
        url: `https://www.youtube.com/watch?v=${v.id}`,
        viewCount: parseInt(v.statistics?.viewCount || "0"),
        durationSeconds: dur,
      });
    }
  }

  return videos;
}

export async function ingestVideos(
  db: Database.Database,
  videos: VideoMeta[],
  verbose = true
): Promise<{ ingested: number; skipped: number; failed: number }> {
  let ingested = 0;
  let skipped = 0;
  let failed = 0;

  const insertSource = db.prepare(`
    INSERT OR IGNORE INTO sources (id, type, title, url, youtube_video_id, published_at, view_count, duration_seconds)
    VALUES (@id, @type, @title, @url, @youtubeVideoId, @publishedAt, @viewCount, @durationSeconds)
  `);

  const insertChunk = db.prepare(`
    INSERT OR REPLACE INTO chunks (id, source_id, chunk_index, chunk_text, token_estimate)
    VALUES (@id, @sourceId, @chunkIndex, @chunkText, @tokenEstimate)
  `);

  const insertEmbedding = db.prepare(`
    INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding)
    VALUES (?, ?)
  `);

  const alreadyIngested = db.prepare(
    "SELECT id FROM sources WHERE youtube_video_id = ?"
  );

  for (const video of videos) {
    // Skip if already ingested
    const existing = alreadyIngested.get(video.videoId);
    if (existing) {
      skipped++;
      continue;
    }

    if (verbose) console.log(`Ingesting: ${video.title} (${video.videoId})`);

    try {
      // Fetch transcript
      const segments = await YoutubeTranscript.fetchTranscript(video.videoId);
      const fullText = segments.map((s) => s.text).join(" ");

      if (!fullText || fullText.trim().length < 100) {
        if (verbose) console.log(`  → Skipping: no transcript`);
        skipped++;
        continue;
      }

      // Chunk
      const chunks = chunkText(fullText, 400, 40);
      if (chunks.length === 0) {
        skipped++;
        continue;
      }

      // Embed all chunks
      const embeddings = await embedBatch(chunks);

      // Store in DB (transaction)
      const sourceId = randomUUID();
      const ingestTx = db.transaction(() => {
        insertSource.run({
          id: sourceId,
          type: "youtube",
          title: video.title,
          url: video.url,
          youtubeVideoId: video.videoId,
          publishedAt: video.publishedAt,
          viewCount: video.viewCount,
          durationSeconds: video.durationSeconds,
        });

        for (let i = 0; i < chunks.length; i++) {
          const chunkId = randomUUID();
          insertChunk.run({
            id: chunkId,
            sourceId,
            chunkIndex: i,
            chunkText: chunks[i],
            tokenEstimate: estimateTokens(chunks[i]),
          });

          // Store embedding as Float32Array binary
          const embBuf = Buffer.from(new Float32Array(embeddings[i]).buffer);
          insertEmbedding.run(chunkId, embBuf);
        }
      });

      ingestTx();
      ingested++;
      if (verbose) console.log(`  → ${chunks.length} chunks stored`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (verbose) console.warn(`  → Failed: ${msg}`);
      failed++;
    }
  }

  return { ingested, skipped, failed };
}
