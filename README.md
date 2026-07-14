# Hormozi Mentor Agent

Alex Hormozi RAG mentor agent. Katie calls `hormozi_query()` and gets answers grounded in Hormozi's actual YouTube content.

## Stack

- SQLite + sqlite-vec (local, always-on, no cloud DB needed)
- Voyage AI `voyage-3-lite` embeddings (1024 dimensions)
- YouTube Data API v3 + `youtube-transcript` npm
- Claude `claude-sonnet-4-6` for synthesis
- MCP server registered with mcporter

## Prerequisites

1. **sqlite-vec** — install on Mac mini:
   ```bash
   brew install sqlite-vec
   ```

2. **Environment variables** — copy `.env.example` to `.env` and fill in:
   - `YOUTUBE_API_KEY` — Google Cloud Console → APIs → YouTube Data API v3 → Create Key
   - `VOYAGE_API_KEY` — sign up at voyageai.com (free tier, 5 minutes)
   - `ANTHROPIC_API_KEY` — already in Mark's environment

## Setup

```bash
npm install
npm run db:init
```

## Ingestion

```bash
# Full channel load (run once — ~30-60 min for 600+ videos)
npm run ingest

# Subsequent manual refresh (only fetches new videos)
npm run cron
```

## Query (CLI test)

```bash
npm run query "what would you do about cold calling pricing objections?"
```

## Run the MCP Server

```bash
# stdio mode (for mcporter)
node dist/index.js --stdio

# HTTP mode (with health endpoint + built-in weekly cron)
node dist/index.js
# http://localhost:3456/health
```

## mcporter Registration

After building (`npm run build`), register with mcporter on the Mac mini:

```bash
mcporter add hormozi-mentor --command "node /path/to/hormozi-mentor/dist/index.js --stdio"
```

Or if running as HTTP server:
```bash
mcporter add hormozi-mentor --url http://localhost:3456/mcp
```

## Mac mini launchd Cron (Weekly Refresh)

Create `/Library/LaunchDaemons/com.marksapp.hormozi-mentor-cron.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.marksapp.hormozi-mentor-cron</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/mandyassistant/Desktop/MarkProjects/hormozi-mentor/dist/cron-ingest.js</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>0</integer>
    <key>Hour</key>
    <integer>2</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>YOUTUBE_API_KEY</key>
    <string>YOUR_KEY_HERE</string>
    <key>VOYAGE_API_KEY</key>
    <string>YOUR_KEY_HERE</string>
    <key>ANTHROPIC_API_KEY</key>
    <string>YOUR_KEY_HERE</string>
    <key>DB_PATH</key>
    <string>/Users/mandyassistant/Desktop/MarkProjects/hormozi-mentor/hormozi.db</string>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/hormozi-mentor-cron.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/hormozi-mentor-cron.err</string>
</dict>
</plist>
```

Load it:
```bash
sudo launchctl load /Library/LaunchDaemons/com.marksapp.hormozi-mentor-cron.plist
```

## Notes

- The `books/` directory is gitignored. Drop Hormozi PDFs there for book ingestion (Phase 2).
- The `hormozi.db` file is gitignored. It lives on the Mac mini only.
- Weekly cron also runs automatically when the HTTP server is up (built into `src/index.ts` via node-cron).
