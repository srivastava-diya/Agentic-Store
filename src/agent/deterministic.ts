import type { Product } from "../types.js";
import type { Agent, Goal } from "./types.js";

function tokenise(text: string): string[] {
    return text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
}

function score(product: Product, goalTokens: readonly string[]): number {
    const nameTokens = tokenise(product.name);
    return goalTokens.filter((token) => nameTokens.includes(token)).length;
}

export const deterministicAgent: Agent = {
    name: "deterministic",
    propose(goal: Goal, catalog: readonly Product[]): Promise<unknown> {
        const goalTokens = tokenise(goal.description);

        const candidates = catalog
            .map((product) => ({ product, score: score(product, goalTokens) }))
            .filter(({ product, score: matched }) => {
                if (matched === 0) return false;
                if (product.stock < goal.quantity) return false;
                if (goal.maxPrice !== undefined && product.price * goal.quantity > goal.maxPrice) return false;
                return true;
            })
            .toSorted((a, b) => b.score - a.score || a.product.price - b.product.price);

        const best = candidates[0];

        return Promise.resolve(
            best ? { productId: best.product.id, quantity: goal.quantity } : null
        );
    },
};
