import proposalSchema from "../schemas/order-proposal.schema.json" with { type: "json" };
import type { Product } from "../types.js";
import type { Agent, Goal } from "./types.js";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export const DEFAULT_GROQ_MODEL = process.env["GROQ_MODEL"] ?? "openai/gpt-oss-120b";

const SYSTEM_INSTRUCTION = `You are a shopping agent for a small online store.

You are given the store catalog and a shopper's goal. Choose the single product
that best satisfies the goal and call the place_order function with its id and
the requested quantity.

Rules:
- Only use product ids that appear in the catalog.
- If nothing in the catalog satisfies the goal, do not call the function.
  Reply in plain text explaining why instead.`;

const { $schema: _ignored, ...functionParameters } = proposalSchema;

interface ChatCompletion {
    choices?: Array<{
        message?: {
            tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
        };
    }>;
    error?: { message?: string };
}

function buildPrompt(goal: Goal, catalog: readonly Product[]): string {
    const budget = goal.maxPrice === undefined ? "" : `\nShopper's budget for the whole order: ${goal.maxPrice}`;
    return `Catalog:\n${JSON.stringify(catalog, null, 2)}\n\nGoal: ${goal.description}\nQuantity wanted: ${goal.quantity}${budget}`;
}

export function createGroqAgent(apiKey: string, model: string = DEFAULT_GROQ_MODEL): Agent {
    return {
        name: `groq:${model}`,
        async propose(goal: Goal, catalog: readonly Product[]): Promise<unknown> {
            const response = await fetch(ENDPOINT, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${apiKey}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: "system", content: SYSTEM_INSTRUCTION },
                        { role: "user", content: buildPrompt(goal, catalog) },
                    ],
                    tools: [
                        {
                            type: "function",
                            function: {
                                name: "place_order",
                                description: "Order a product from the catalog on the shopper's behalf.",

                                parameters: functionParameters,
                            },
                        },
                    ],
                    tool_choice: "auto",
                }),
            });

            const body = (await response.json()) as ChatCompletion;

            if (!response.ok) {
                throw new Error(body.error?.message ?? `Groq request failed (HTTP ${response.status})`);
            }

            const call = body.choices?.[0]?.message?.tool_calls?.[0]?.function;
            if (!call?.arguments) {
                return null;
            }

            try {
                return JSON.parse(call.arguments) as unknown;
            } catch {
                return call.arguments;
            }
        },
    };
}
