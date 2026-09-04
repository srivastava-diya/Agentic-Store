import { placeOrder, type OrderOutcome, type PlaceOrderOptions } from "../order.js";
import type { Inventory } from "../inventory.js";
import type { Agent, Goal } from "./types.js";

export interface AgentRun extends OrderOutcome {
    goal: Goal;
    agent: string;
    proposal: unknown;
}

export async function runAgent(
    agent: Agent,
    goal: Goal,
    inventory: Inventory,
    options: PlaceOrderOptions = {}
): Promise<AgentRun> {
    const proposal = await agent.propose(goal, inventory.list());
    const outcome = await placeOrder(proposal, inventory, options);

    return { ...outcome, goal, agent: agent.name, proposal };
}
