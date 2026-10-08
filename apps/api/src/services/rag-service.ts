import {
  RAGPipeline,
  MockEmbeddingProvider,
  OpenAIEmbeddingProvider,
  type EmbeddingProvider,
} from "@ai-portfolio/rag-core";
import { llmService } from "./llm-service.js";

class RAGService {
  private pipeline: RAGPipeline | null = null;

  getPipeline(): RAGPipeline {
    if (!this.pipeline) {
      const embeddingProvider = this.resolveEmbeddings();
      const llmProvider = llmService.getProvider(
        llmService.resolve(process.env.RAG_LLM_PROVIDER)
      );
      this.pipeline = new RAGPipeline(embeddingProvider, llmProvider, undefined, {
        contextualize: process.env.RAG_CONTEXTUALIZE === "true",
        chunking: { chunkSize: 500, chunkOverlap: 50 },
      });
    }
    return this.pipeline;
  }

  reset(): void {
    this.pipeline = null;
  }

  private resolveEmbeddings(): EmbeddingProvider {
    const key = process.env.OPENAI_API_KEY;
    if (key && process.env.RAG_EMBEDDINGS !== "mock") {
      return new OpenAIEmbeddingProvider(key);
    }
    return new MockEmbeddingProvider();
  }
}

export const ragService = new RAGService();
