import type { Product } from "../types.js";

export interface Goal {
    description: string;

    maxPrice?: number;
    quantity: number;
}

export interface Agent {
    readonly name: string;
    propose(goal: Goal, catalog: readonly Product[]): Promise<unknown>;
}
