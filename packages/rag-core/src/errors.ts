export class RAGError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "RAGError";
    this.statusCode = statusCode;
  }
}

export class EmptyStoreError extends RAGError {
  constructor(message = "No documents ingested") {
    super(message);
    this.name = "EmptyStoreError";
  }
}

export class EmbeddingError extends RAGError {
  constructor(message: string, statusCode?: number) {
    super(message, statusCode);
    this.name = "EmbeddingError";
  }
}
