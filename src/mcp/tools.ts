// @ts-nocheck — MCP SDK v1 has deep type instantiation issues with zod schemas in strict mode
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Database from "better-sqlite3";
import { query } from "../query/rag";

export function registerTools(server: McpServer, db: Database.Database): void {
  server.tool(
    "hormozi_query",
    "Ask Alex Hormozi a business question. Returns an answer grounded in his YouTube content, in his voice.",
    {
      question: z
        .string()
        .describe("The business question to ask (e.g. 'How do I price my service packages?')"),
      context: z
        .string()
        .optional()
        .describe("Optional context about the user's situation"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(8)
        .describe("Max chunks to retrieve (default 8)"),
    },
    async ({ question, context, limit }) => {
      try {
        const result = await query(db, question, context, limit ?? 8);

        const sourcesText = result.sources
          .map((s, i) => `${i + 1}. ${s.title}\n   ${s.url}`)
          .join("\n");

        const fullResponse = result.sources.length > 0
          ? `${result.answer}\n\n---\nSources:\n${sourcesText}`
          : result.answer;

        return {
          content: [{ type: "text", text: fullResponse }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "hormozi_stats",
    "Get stats about the Hormozi knowledge base (chunk count, source count)",
    {},
    async () => {
      try {
        const sourceCount = (
          db.prepare("SELECT COUNT(*) as n FROM sources").get() as { n: number }
        ).n;
        const chunkCount = (
          db.prepare("SELECT COUNT(*) as n FROM chunks").get() as { n: number }
        ).n;
        let embeddingCount = 0;
        try {
          embeddingCount = (
            db.prepare("SELECT COUNT(*) as n FROM chunk_embeddings").get() as { n: number }
          ).n;
        } catch {
          embeddingCount = -1;
        }

        return {
          content: [
            {
              type: "text",
              text: `Hormozi knowledge base:\n- Sources (videos): ${sourceCount}\n- Chunks: ${chunkCount}\n- Embeddings indexed: ${embeddingCount === -1 ? "sqlite-vec not loaded" : embeddingCount}`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
