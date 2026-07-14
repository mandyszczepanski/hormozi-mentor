import "dotenv/config";
import express from "express";
import cron from "node-cron";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDb, initSchema } from "./db/init";
import { registerTools } from "./mcp/tools";
import { refreshYouTube } from "./cron/youtube-refresh";

const PORT = parseInt(process.env.PORT || "3456");
const USE_STDIO = process.argv.includes("--stdio");

async function main() {
  // Initialize DB
  const db = getDb();
  initSchema(db);

  // MCP Server
  const server = new McpServer({
    name: "hormozi-mentor",
    version: "1.0.0",
  });
  registerTools(server, db);

  if (USE_STDIO) {
    // stdio mode for mcporter registration
    console.error("Starting Hormozi Mentor MCP server (stdio mode)...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP server connected via stdio");
  } else {
    // HTTP mode with health check
    const app = express();
    app.use(express.json());

    app.get("/health", (_req, res) => {
      const chunkCount = (
        db.prepare("SELECT COUNT(*) as n FROM chunks").get() as { n: number }
      ).n;
      res.json({ status: "ok", chunks: chunkCount });
    });

    app.listen(PORT, () => {
      console.log(`Hormozi Mentor running on port ${PORT}`);
      console.log(`Health: http://localhost:${PORT}/health`);
    });

    // Weekly cron: Sunday 2:00 AM
    cron.schedule("0 2 * * 0", async () => {
      console.log("[cron] Starting weekly YouTube refresh...");
      try {
        await refreshYouTube(db);
      } catch (err) {
        console.error("[cron] Refresh failed:", err);
      }
    });

    console.log("Weekly cron scheduled (Sunday 2:00 AM)");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
