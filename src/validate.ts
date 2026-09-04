import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import catalog from "../data/catalog.json" with { type: "json" };
import schema from "./schemas/product.schema.json" with { type: "json" };

const ajv = new Ajv();
const validate = ajv.compile(schema);

for (const product of catalog) {
    const valid: boolean = validate(product);
    if (valid) {
        console.log(`${product.id} (${product.name}) is valid`);
    } else {
        console.log(`${product.id} failed:`, validate.errors);
    }
}