import { FunctionCallingConfigMode, GoogleGenAI } from "@google/genai";
import proposalSchema from "../schemas/order-proposal.schema.json" with { type: "json" };
import type { Product } from "../types.js";
import type { Agent, Goal } from "./types.js";

export const DEFAULT_MODEL = process.env["GEMINI_MODEL"] ?? "gemini-3.1-flash-lite";

const SYSTEM_INSTRUCTION = `You are a shopping agent for a small online store.

You are given the store catalog and a shopper's goal. Choose the single product
that best satisfies the goal and call the place_order function with its id and
the requested quantity.

Rules:
- Only use product ids that appear in the catalog.
- If nothing in the catalog satisfies the goal, do not call the function.
  Reply in plain text explaining why instead.`;

const { $schema: _ignored, ...functionParameters } = proposalSchema;

function buildPrompt(goal: Goal, catalog: readonly Product[]): string {
    const budget = goal.maxPrice === undefined ? "" : `\nShopper's budget for the whole order: ${goal.maxPrice}`;
    return `Catalog:\n${JSON.stringify(catalog, null, 2)}\n\nGoal: ${goal.description}\nQuantity wanted: ${goal.quantity}${budget}`;
}

export function createLlmAgent(apiKey: string, model: string = DEFAULT_MODEL): Agent {
    const ai = new GoogleGenAI({ apiKey });

    return {
        name: `gemini:${model}`,
        async propose(goal: Goal, catalog: readonly Product[]): Promise<unknown> {
            const response = await ai.models.generateContent({
                model,
                contents: buildPrompt(goal, catalog),
                config: {
                    systemInstruction: SYSTEM_INSTRUCTION,
                    tools: [
                        {
                            functionDeclarations: [
                                {
                                    name: "place_order",
                                    description: "Order a product from the catalog on the shopper's behalf.",

                                    parametersJsonSchema: functionParameters,
                                },
                            ],
                        },
                    ],
                    toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
                },
            });

            return response.functionCalls?.[0]?.args ?? null;
        },
    };
}
