import {
  ReActAgent,
  Supervisor,
  defaultTools,
  type WorkerAgent,
} from "@ai-portfolio/ai-agents";
import { llmService } from "./llm-service.js";

class AgentService {
  private supervisors = new Map<string, Supervisor>();

  getReActAgent(maxIterations?: number): ReActAgent {
    const provider = llmService.getProvider(
      llmService.resolve(process.env.AGENT_LLM_PROVIDER)
    );
    return new ReActAgent(provider, defaultTools, {
      maxIterations: maxIterations ?? 10,
    });
  }

  getSupervisor(name = "default"): Supervisor {
    const cached = this.supervisors.get(name);
    if (cached) return cached;

    const provider = llmService.getProvider(
      llmService.resolve(process.env.AGENT_LLM_PROVIDER)
    );
    const workers: WorkerAgent[] = [
      {
        name: "analyst",
        description: "Analyzes data, performs calculations, and extracts insights.",
        expertise: ["math", "data analysis", "calculations"],
        agent: new ReActAgent(
          provider,
          defaultTools.filter((t) => ["calculator", "datetime"].includes(t.name)),
          { maxIterations: 8 }
        ),
      },
      {
        name: "researcher",
        description: "Researches topics using search and document retrieval.",
        expertise: ["research", "search", "facts", "documents"],
        agent: new ReActAgent(
          provider,
          defaultTools.filter((t) => ["web_search", "fetch_document"].includes(t.name)),
          { maxIterations: 8 }
        ),
      },
      {
        name: "writer",
        description: "Drafts summaries, emails, and explanations based on provided information.",
        expertise: ["writing", "summaries", "communication"],
        agent: new ReActAgent(provider, [], { maxIterations: 6 }),
      },
    ];
    const supervisor = new Supervisor(provider, workers, { maxHops: 2 });
    this.supervisors.set(name, supervisor);
    return supervisor;
  }
}

export const agentService = new AgentService();
