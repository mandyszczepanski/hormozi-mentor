/**
 * Sentence-aware text chunker.
 * targetTokens: approximate target chunk size in tokens (1 token ≈ 4 chars)
 * overlapTokens: overlap between consecutive chunks
 */
export function chunkText(
  text: string,
  targetTokens = 500,
  overlapTokens = 50
): string[] {
  const targetChars = targetTokens * 4;
  const overlapChars = overlapTokens * 4;

  // Split into sentences
  const sentences = text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  let prevOverlap = "";

  for (const sentence of sentences) {
    const candidate = current ? current + " " + sentence : sentence;

    if (candidate.length > targetChars && current.length > 0) {
      chunks.push((prevOverlap + " " + current).trim());
      // Capture overlap from end of current chunk
      prevOverlap = current.slice(-overlapChars).trim();
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    chunks.push((prevOverlap + " " + current).trim());
  }

  return chunks.filter((c) => c.length > 50);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
