import { deterministicAgent } from "./deterministic.js";
import { createGroqAgent } from "./groq.js";
import { createLlmAgent } from "./llm.js";
import type { Agent } from "./types.js";

export { deterministicAgent } from "./deterministic.js";
export { createGroqAgent, DEFAULT_GROQ_MODEL } from "./groq.js";
export { createLlmAgent, DEFAULT_MODEL } from "./llm.js";
export { runAgent, type AgentRun } from "./run.js";
export type { Agent, Goal } from "./types.js";

export function withFallback(primary: Agent, fallback: Agent): Agent {
    let used = primary.name;

    return {
        get name() {
            return used;
        },
        async propose(goal, catalog) {
            try {
                const proposal = await primary.propose(goal, catalog);
                used = primary.name;
                return proposal;
            } catch (error) {
                console.error(`[agent] ${primary.name} failed, falling back:`, error instanceof Error ? error.message : error);
                const proposal = await fallback.propose(goal, catalog);

                used = `${fallback.name} (${primary.name} unavailable)`;
                return proposal;
            }
        },
    };
}

export function resolveAgent(): Agent {
    const geminiKey = process.env["GEMINI_API_KEY"];
    const groqKey = process.env["GROQ_API_KEY"];

    let chain: Agent = deterministicAgent;
    if (groqKey) {
        chain = withFallback(createGroqAgent(groqKey), chain);
    }
    if (geminiKey) {
        chain = withFallback(createLlmAgent(geminiKey), chain);
    }

    return chain;
}
