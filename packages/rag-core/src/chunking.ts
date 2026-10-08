import type { Chunk } from "./types.js";

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}

const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

export function splitDocuments(
  documents: Array<{
    id: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>,
  options: ChunkingOptions = {}
): Chunk[] {
  const { chunkSize = 500, chunkOverlap = 50, separators = DEFAULT_SEPARATORS } =
    options;
  const chunks: Chunk[] = [];

  for (const doc of documents) {
    const textChunks = splitText(doc.content, chunkSize, chunkOverlap, separators);
    for (let i = 0; i < textChunks.length; i++) {
      const content = textChunks[i];
      if (content === undefined) continue;
      chunks.push({
        id: `${doc.id}_chunk_${i}`,
        documentId: doc.id,
        content,
        metadata: { ...(doc.metadata ?? {}), chunkIndex: i },
      });
    }
  }

  return chunks;
}

function splitText(
  text: string,
  chunkSize: number,
  chunkOverlap: number,
  separators: string[]
): string[] {
  const merged = mergeSegments(splitRecursive(text, chunkSize, separators), chunkSize, chunkOverlap);
  return merged.map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 0);
}

function splitRecursive(text: string, chunkSize: number, separators: string[]): string[] {
  if (text.length <= chunkSize) return [text];

  const separator = separators.find((s) => s.length > 0 && text.includes(s)) ?? "";
  const rest = separators.filter((s) => s !== separator);

  if (separator === "") {
    const pieces: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      pieces.push(text.slice(i, i + chunkSize));
    }
    return pieces;
  }

  const rawSegments = text.split(separator);
  const segments: string[] = [];
  for (const segment of rawSegments) {
    if (segment.length > chunkSize) {
      segments.push(...splitRecursive(segment, chunkSize, rest));
    } else if (segment.length > 0) {
      segments.push(segment);
    }
  }

  return segments;
}

function mergeSegments(segments: string[], chunkSize: number, chunkOverlap: number): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const segment of segments) {
    const candidate = current ? `${current} ${segment}` : segment;
    if (candidate.length > chunkSize && current) {
      chunks.push(current);
      current = `${overlapTail(current, chunkOverlap)} ${segment}`.trim();
      while (current.length > chunkSize) {
        chunks.push(current.slice(0, chunkSize));
        current = current.slice(chunkSize);
      }
    } else if (candidate.length > chunkSize) {
      for (let i = 0; i < segment.length; i += chunkSize) {
        chunks.push(segment.slice(i, i + chunkSize));
      }
      current = "";
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function overlapTail(text: string, overlap: number): string {
  if (overlap <= 0 || text.length <= overlap) return text;
  const tail = text.slice(text.length - overlap);
  const spaceIndex = tail.indexOf(" ");
  return spaceIndex > 0 ? tail.slice(spaceIndex + 1) : tail;
}
