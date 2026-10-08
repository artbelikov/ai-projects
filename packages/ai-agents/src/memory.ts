import type { Message } from "@ai-portfolio/llm-integrations";

export class ConversationMemory {
  private messages: Message[] = [];
  private maxMessages: number;

  constructor(maxMessages = 20) {
    if (maxMessages < 4) {
      throw new Error("maxMessages must be at least 4");
    }
    this.maxMessages = maxMessages;
  }

  add(message: Message): void {
    this.messages.push(message);
    while (this.messages.length > this.maxMessages) {
      const dropIndex = this.messages.findIndex((m) => m.role !== "system");
      if (dropIndex === -1) break;
      this.messages.splice(dropIndex, 1);
    }
  }

  get length(): number {
    return this.messages.length;
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }
}

export class KeyValueMemory {
  private store = new Map<string, string>();

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  get(key: string): string | undefined {
    return this.store.get(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  getAll(): Record<string, string> {
    return Object.fromEntries(this.store);
  }

  clear(): void {
    this.store.clear();
  }
}
