import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Product } from "./types.js";

const CATALOG_PATH = fileURLToPath(new URL("../data/catalog.json", import.meta.url));

export interface InventoryOptions {
    persist?: boolean;
}

export class Inventory {
    private readonly products: Map<string, Product>;
    private readonly reservations = new Map<string, { productId: string; quantity: number }>();
    private readonly persist: boolean;

    constructor(products: readonly Product[], options: InventoryOptions = {}) {
        this.products = new Map(products.map((product) => [product.id, { ...product }]));
        this.persist = options.persist ?? false;
    }

    list(): Product[] {
        return [...this.products.values()].map((product) => ({
            ...product,
            stock: this.available(product.id),
        }));
    }

    find(productId: string): Product | undefined {
        const product = this.products.get(productId);
        return product ? { ...product, stock: this.available(productId) } : undefined;
    }

    available(productId: string): number {
        const product = this.products.get(productId);
        if (!product) {
            return 0;
        }

        let reserved = 0;
        for (const reservation of this.reservations.values()) {
            if (reservation.productId === productId) {
                reserved += reservation.quantity;
            }
        }

        return product.stock - reserved;
    }

    reserve(orderId: string, productId: string, quantity: number): boolean {
        if (this.available(productId) < quantity) {
            return false;
        }

        this.reservations.set(orderId, { productId, quantity });
        return true;
    }

    restore(orderId: string, productId: string, quantity: number): void {
        if (this.products.has(productId)) {
            this.reservations.set(orderId, { productId, quantity });
        }
    }

    consume(productId: string, quantity: number): void {
        const product = this.products.get(productId);
        if (product) {
            product.stock = Math.max(0, product.stock - quantity);
        }
    }

    commit(orderId: string): void {
        const reservation = this.reservations.get(orderId);
        if (!reservation) {
            return;
        }

        this.reservations.delete(orderId);
        const product = this.products.get(reservation.productId);
        if (product) {
            product.stock -= reservation.quantity;
        }

        if (this.persist) {
            this.save();
        }
    }

    release(orderId: string): void {
        this.reservations.delete(orderId);
    }

    private save(): void {
        const products = [...this.products.values()];
        writeFileSync(CATALOG_PATH, `${JSON.stringify(products, null, 2)}\n`, "utf8");
    }
}
