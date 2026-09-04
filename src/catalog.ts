import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import rawCatalog from "../data/catalog.json" with { type: "json" };
import productSchema from "./schemas/product.schema.json" with { type: "json" };
import type { Product } from "./types.js";

const ajv = new Ajv({ allErrors: true });
const validateProduct = ajv.compile<Product>(productSchema);

export function loadCatalog(): Product[] {
    const products: Product[] = [];

    for (const [index, entry] of rawCatalog.entries()) {
        if (!validateProduct(entry)) {
            throw new Error(
                `catalog.json[${index}] is not a valid product: ${ajv.errorsText(validateProduct.errors)}`
            );
        }
        products.push(entry);
    }

    return products;
}

export function findProduct(catalog: readonly Product[], productId: string): Product | undefined {
    return catalog.find((product) => product.id === productId);
}
