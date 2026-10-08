import { describe, it, expect } from "vitest";
import { splitDocuments } from "../src/chunking.js";

describe("splitDocuments", () => {
  it("returns no chunks for an empty document", () => {
    expect(splitDocuments([{ id: "d1", content: "" }])).toEqual([]);
  });

  it("returns no chunks for whitespace-only documents", () => {
    expect(splitDocuments([{ id: "d1", content: "   \n\t  " }])).toEqual([]);
  });

  it("hard-splits oversized segments with no separators", () => {
    const content = "x".repeat(2000);
    const chunks = splitDocuments([{ id: "d1", content }], {
      chunkSize: 500,
      chunkOverlap: 50,
    });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(500);
    }
  });

  it("bounds every chunk even with mixed separators", () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) =>
      `Paragraph ${i} ` + "word ".repeat(200)
    );
    const chunks = splitDocuments([{ id: "d1", content: paragraphs.join("\n\n") }], {
      chunkSize: 300,
      chunkOverlap: 40,
    });
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(300);
    }
  });

  it("preserves chunk ids and metadata", () => {
    const chunks = splitDocuments(
      [{ id: "doc42", content: "alpha\n\nbeta", metadata: { category: "x" } }],
      { chunkSize: 5, chunkOverlap: 0 }
    );
    expect(chunks[0]?.id).toBe("doc42_chunk_0");
    expect(chunks[0]?.documentId).toBe("doc42");
    expect(chunks[0]?.metadata.category).toBe("x");
    expect(chunks[0]?.metadata.chunkIndex).toBe(0);
    expect(chunks[1]?.metadata.chunkIndex).toBe(1);
  });

  it("keeps overlap bounded", () => {
    const content = Array.from({ length: 20 }, (_, i) => `seg${i}data`).join(" ");
    const chunks = splitDocuments([{ id: "d1", content }], {
      chunkSize: 60,
      chunkOverlap: 15,
    });
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(60);
    }
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      const previous = chunks[i - 1]!.content;
      const current = chunks[i]!.content;
      const tail = previous.slice(Math.max(0, previous.length - 15));
      const shares = tail
        .split(" ")
        .filter((word) => word.length > 0 && current.includes(word));
      expect(shares.length).toBeGreaterThan(0);
    }
  });
});
