import { spawnSync } from "child_process";
import Database from "better-sqlite3";
import { embed } from "../embeddings/voyage";

const SYSTEM_PROMPT = `You are channeling Alex Hormozi — his direct, no-BS, data-driven business style.
Speak in his voice: blunt, confident, specific, example-driven.
Ground every answer in the frameworks from the provided source material.
Do not hedge. If you say "it depends," immediately give the answer for each case.
Lead with the most direct actionable answer. Then explain the reasoning.
Never invent frameworks that aren't in the provided material.
Cite which video your framework comes from when it adds clarity.`;

interface Source {
  title: string;
  type: "youtube";
  url: string;
  excerpt: string;
}

interface QueryResult {
  answer: string;
  sources: Source[];
}

export async function query(
  db: Database.Database,
  question: string,
  context?: string,
  limit = 8
): Promise<QueryResult> {
  // Embed the question
  const queryText = context ? `${question}\nContext: ${context}` : question;
  const questionEmbedding = await embed(queryText);
  const embBuf = Buffer.from(new Float32Array(questionEmbedding).buffer);

  // Vector search via sqlite-vec
  let rows: Array<{ chunk_id: string; distance: number }>;
  try {
    rows = db
      .prepare(
        `SELECT chunk_id, distance
         FROM chunk_embeddings
         WHERE embedding MATCH ?
         ORDER BY distance
         LIMIT ?`
      )
      .all(embBuf, limit) as Array<{ chunk_id: string; distance: number }>;
  } catch (err) {
    throw new Error(
      `Vector search failed. Is sqlite-vec loaded? Error: ${err}`
    );
  }

  if (rows.length === 0) {
    return {
      answer:
        "No relevant content found in the knowledge base. Run the ingestion pipeline first.",
      sources: [],
    };
  }

  // Fetch chunk text + source metadata
  const chunkIds = rows.map((r) => r.chunk_id);
  const placeholders = chunkIds.map(() => "?").join(",");

  const chunks = db
    .prepare(
      `SELECT c.id, c.chunk_text, c.chunk_index,
              s.title, s.url, s.type
       FROM chunks c
       JOIN sources s ON s.id = c.source_id
       WHERE c.id IN (${placeholders})`
    )
    .all(...chunkIds) as Array<{
    id: string;
    chunk_text: string;
    chunk_index: number;
    title: string;
    url: string;
    type: string;
  }>;

  // Build context string for Claude
  const contextBlocks = chunks
    .map((c, i) => `[Source ${i + 1}: ${c.title}]\n${c.chunk_text}`)
    .join("\n\n---\n\n");

  const userMessage = context
    ? `User context: ${context}\n\nSource material:\n${contextBlocks}\n\nQuestion: ${question}`
    : `Source material:\n${contextBlocks}\n\nQuestion: ${question}`;

  const prompt = `${SYSTEM_PROMPT}\n\n${userMessage}`;
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  delete env.CLAUDE_CODE_CHILD_SESSION;
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const result = spawnSync(
    "/opt/homebrew/bin/claude",
    ["-p", prompt, "--model", "claude-sonnet-4-6", "--output-format", "text"],
    { encoding: "utf8", timeout: 60000, env }
  );
  if (result.error || result.status !== 0) {
    const errDetail = result.stderr || result.stdout || result.error?.message || `exit ${result.status}`;
    throw new Error(`claude CLI failed: ${errDetail}`);
  }
  const answer = result.stdout.trim();

  // Deduplicate sources
  const seenUrls = new Set<string>();
  const sources: Source[] = [];
  for (const c of chunks) {
    if (!seenUrls.has(c.url)) {
      seenUrls.add(c.url);
      sources.push({
        title: c.title,
        type: "youtube",
        url: c.url,
        excerpt: c.chunk_text.slice(0, 200) + "...",
      });
    }
  }

  return { answer, sources };
}
