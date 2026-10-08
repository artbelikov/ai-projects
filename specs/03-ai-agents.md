# Package Spec: `@ai-portfolio/ai-agents`

## Purpose
Demonstrate autonomous agent patterns: single-agent reasoning with tool use, and multi-agent orchestration with a supervisor pattern.

## Components

### 1. Tool System (`tools.ts`)
```typescript
interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (args: unknown) => Promise<string>;
}
```
- Built-in tools: `calculator`, `web_search` (mocked), `fetch_document`, `datetime`
- Tool results are stringified JSON returned to the LLM

### 2. ReAct Agent (`react-agent.ts`)
Implements Reasoning + Acting loop:
```typescript
class ReActAgent {
  constructor(llmProvider: BaseLLMProvider, tools: Tool[], maxIterations?: number);
  
  async run(task: string): Promise<{
    answer: string;
    steps: Step[];
    tokenUsage: number;
  }>;
}
```

**Loop**:
1. LLM receives task + available tools
2. LLM decides: `Thought` → `Action` (tool call) or `Final Answer`
3. If action: execute tool, append `Observation` to history
4. Repeat until final answer or max iterations

**Prompt Structure**:
```
You are a reasoning agent. Solve tasks step by step.
You have access to: [tool descriptions]

Respond in one of these formats:
Thought: <reasoning>
Action: <tool_name>(<json_args>)

or

Thought: <reasoning>
Final Answer: <answer>
```

### 3. Multi-Agent Supervisor (`supervisor.ts`)
```typescript
class Supervisor {
  constructor(llmProvider: BaseLLMProvider, workers: WorkerAgent[]);
  
  async delegate(task: string): Promise<{
    result: string;
    delegationChain: DelegationStep[];
  }>;
}

interface WorkerAgent {
  name: string;
  description: string;
  expertise: string[];
  agent: ReActAgent;
}
```

**Flow**:
1. Supervisor analyzes task and selects best worker
2. Delegates to worker with context
3. Worker executes via ReAct loop
4. Supervisor reviews output and decides: return to user or re-delegate

### 4. Agent Memory (`memory.ts`)
- Simple conversation memory (sliding window)
- Key-value store for facts extracted during runs

## Design Decisions
- **No LangChain Agents**: Demonstrates understanding of agent loops at the algorithm level
- **Deterministic tool execution**: Tools are typed with Zod schemas; LLM arguments are validated
- **Step observability**: Every thought, action, observation is captured for UI rendering

## Error Handling
- Tool execution errors are caught and fed back as observations
- Max iteration limit prevents infinite loops
- Invalid tool arguments trigger schema validation error in the observation

## Testing Strategy
- ReAct loop tests with deterministic LLM responses
- Supervisor routing tests with mocked task classification
- End-to-end: "Calculate 15% tip on $85.50" → calculator tool → correct answer

## Showcase Scenarios
1. **ReAct**: "What is the weather in Tokyo and should I pack an umbrella?" (datetime + web_search tools)
2. **Supervisor**: "Analyze Q3 sales data and draft an email summary" (delegate to analyst agent, then writer agent)
