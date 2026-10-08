import type { LLMResponse, MockHandler } from "@ai-portfolio/llm-integrations";

function extractWorkerResult(prompt: string): string {
  const match = /Worker \([^)]+\) result:\s*([\s\S]*?)(?:\n\n|$)/.exec(prompt);
  return match?.[1]?.trim() ?? "";
}

export const demoMockHandler: MockHandler = (
  messages,
  _options
): LLMResponse => {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const last = messages[messages.length - 1]?.content ?? "";
  const transcript = messages.map((m) => m.content).join("\n");

  if (system.includes("You situate document chunks")) {
    return {
      content: "This chunk is part of a demo knowledge base entry.",
      finishReason: "stop",
    };
  }

  if (system.includes("reasoning agent") && system.includes("Action:")) {
    const observation = [...messages]
      .reverse()
      .find((m) => m.content.startsWith("Observation:"))
      ?.content.replace(/^Observation:\s*/, "");

    if (observation !== undefined) {
      return {
        content: `Thought: I have the tool result.\nFinal Answer: ${observation}`,
        finishReason: "stop",
      };
    }

    const has = (name: string) => transcript.includes(`- ${name}:`);
    const isCalculation = /analy|calculat|budget|tax|total|%|tip|math|\d+\s*[+*/-]/i.test(last);
    const isSearch = /weather|search|research|compare|vector database/i.test(last);
    const isDocument = /fetch|document|rag-guide|agent-guide|prompt-guide/i.test(last);

    if (isCalculation && has("calculator")) {
      return {
        content:
          'Thought: I should compute this with the calculator.\nAction: calculator({"expression": "15 * 85.50"})',
        finishReason: "stop",
      };
    }
    if (isSearch && has("web_search")) {
      return {
        content:
          'Thought: I should search for this.\nAction: web_search({"query": "weather tokyo"})',
        finishReason: "stop",
      };
    }
    if (isDocument && has("fetch_document")) {
      return {
        content:
          'Thought: I should fetch the document first.\nAction: fetch_document({"documentId": "rag-guide"})',
        finishReason: "stop",
      };
    }
    return {
      content: `Thought: No tool is needed.\nFinal Answer: Mock agent answer for: ${last.replace(/^Task:\s*/, "").slice(0, 120)}`,
      finishReason: "stop",
    };
  }

  if (transcript.includes("supervisor agent") && transcript.includes("Route to:")) {
    const available = ["analyst", "researcher", "writer"].filter((name) =>
      transcript.includes(`- ${name}:`)
    );
    const taskMatch = /Task:\s*([\s\S]*?)(?:\n\nRespond|$)/.exec(transcript);
    const taskText = taskMatch?.[1]?.trim() ?? last;
    const routed =
      (/research|search|document|fact|compare|vector/i.test(taskText) && available.includes("researcher")
        ? "researcher"
        : /writ|draft|email|summar|report|format/i.test(taskText) && available.includes("writer")
          ? "writer"
          : available[0]) ?? "analyst";
    return {
      content: `Route to: ${routed}\nReason: Mock routing decision based on task keywords.\nContext: ${taskText.slice(0, 200)}`,
      finishReason: "stop",
    };
  }

  if (transcript.includes("A worker has completed a task")) {
    return {
      content: `Final Answer: Mock reviewed result: ${extractWorkerResult(transcript).slice(0, 200)}`,
      finishReason: "stop",
    };
  }

  if (system.includes("Use the provided context")) {
    return {
      content:
        "Based on the provided context (mock mode, no API keys configured): the documents describe RAG pipelines, AI agents, prompt engineering, and vector databases. Configure OPENAI_API_KEY or ANTHROPIC_API_KEY for real model answers.",
      finishReason: "stop",
    };
  }

  return {
    content: "This is a mock response. Configure an API key for real completions.",
    finishReason: "stop",
  };
};
