import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "hormozi.db");

export function getDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Load sqlite-vec extension
  try {
    const extensionPaths = [
      // Common macOS paths for sqlite-vec
      "/opt/homebrew/lib/sqlite-vec.dylib",
      "/usr/local/lib/sqlite-vec.dylib",
      // __dirname-relative paths (works regardless of PM2 cwd)
      path.join(__dirname, "../../node_modules/sqlite-vec-darwin-arm64/vec0.dylib"),
      path.join(__dirname, "../../../node_modules/sqlite-vec-darwin-arm64/vec0.dylib"),
      path.join(__dirname, "../../node_modules/sqlite-vec/vec0.dylib"),
      // process.cwd()-relative fallbacks
      path.join(process.cwd(), "node_modules", "sqlite-vec", "vec0.dylib"),
      path.join(process.cwd(), "node_modules", "sqlite-vec-darwin-arm64", "vec0.dylib"),
    ];
    let loaded = false;
    for (const p of extensionPaths) {
      if (fs.existsSync(p)) {
        db.loadExtension(p);
        loaded = true;
        console.log(`Loaded sqlite-vec from ${p}`);
        break;
      }
    }
    if (!loaded) {
      console.warn(
        "sqlite-vec extension not found. Install with: brew install sqlite-vec\n" +
        "Vector search will not work until the extension is loaded."
      );
    }
  } catch (err) {
    console.warn("Failed to load sqlite-vec extension:", err);
  }

  return db;
}

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      youtube_video_id TEXT UNIQUE,
      published_at TEXT,
      view_count INTEGER,
      duration_seconds INTEGER,
      ingested_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      token_estimate INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);

    CREATE TABLE IF NOT EXISTS ingest_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Virtual table for vector search — requires sqlite-vec
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunk_embeddings USING vec0(
        chunk_id TEXT PRIMARY KEY,
        embedding FLOAT[512]
      );
    `);
    console.log("chunk_embeddings virtual table ready");
  } catch (err) {
    console.warn("Could not create vec0 virtual table (sqlite-vec not loaded?):", err);
  }
}

if (require.main === module) {
  const db = getDb();
  initSchema(db);
  console.log("Database initialized at", DB_PATH);
  db.close();
}
