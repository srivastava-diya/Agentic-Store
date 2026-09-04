# Agentic Store

**An AI can order from this store, but every payment is schema-checked, bounded, and logged.**


<img width="1917" height="911" alt="image" src="https://github.com/user-attachments/assets/31613c75-3db7-4122-b3c4-d6baa48fd11c" />


Built for the Razorpay Buildathon
<br/>
**Track 1: AI Growth & Agentic Commerce.**

Letting a model spend real money is the hard part of agentic commerce. The usual demo hands an LLM a
payment API and hopes the prompt holds. This one assumes it will not. The agent proposes; a
deterministic gate decides; only then does money move. Every proposal, refusal and charge is written
to an append-only ledger before anything is billed.

The agent is never told the budget. It cannot negotiate with the gate, because the gate is not a
prompt.

---

## Run it

```bash
npm install
npm run web:build      # build the React frontend
npm start              # http://localhost:3000
```

That works with no API keys at all: the store falls back to a deterministic agent and a mock payment
provider. To use real ones, copy `.env.example` to `.env` and fill in what you have.

```bash
GEMINI_API_KEY=          # optional, primary agent
GROQ_API_KEY=            # optional, fallback agent
RAZORPAY_KEY_ID=         # optional, test-mode payment links
RAZORPAY_KEY_SECRET=
```

Razorpay test keys never move real money. Nothing here is ever charged to a real card.

## See the gate work

```bash
npm run demo:gate      # 7 proposals, 1 approved. No keys, no network, no payment.
npm run demo:limits    # stock, released reservations, the rolling cap, idempotency
npm run demo:llm       # a live model proposing orders into the same gate
```

`demo:gate` is the fastest way to understand the project:

```
ALLOW  valid order            [APPROVED] Order approved: 2 x Wireless Mouse for 1598 INR
BLOCK  hallucinated product   [UNKNOWN_PRODUCT] No product with id prod_999
BLOCK  out of stock           [INSUFFICIENT_STOCK] Not enough stock for prod_003: asked for 1, 0 available
BLOCK  over budget            [OVER_BUDGET] Order total 6998 exceeds the 5000 per-order limit
BLOCK  negative quantity      [MALFORMED_PROPOSAL] Proposal failed schema validation: data/quantity must be >= 1
BLOCK  smuggled extra field   [MALFORMED_PROPOSAL] Proposal failed schema validation: data must NOT have additional properties
BLOCK  not an order at all    [MALFORMED_PROPOSAL] Proposal failed schema validation: data must be object
```

The fifth and sixth lines are the interesting ones. A model that emits `quantity: -5` is trying to
be refunded; a model that emits `price: 0` is trying to set its own price. Both are rejected by the
schema before any code reads a field.

## Use it from an AI assistant

The store is also an MCP server, so any MCP client can shop here under the same rules.

```bash
npm run mcp:smoke      # connects a client, calls every tool, prints the verdicts
```

`.mcp.json` registers it for Claude Code. It exposes three tools:

| Tool | Purpose |
| --- | --- |
| `search_catalog` | Live prices and stock. Product ids are not guessable, so the agent must look them up. |
| `place_order` | Attempts an order. Its `inputSchema` **is** the gate's schema file, so the client is constrained by the same contract the server enforces. |
| `read_audit_log` | Recent orders, including refusals, plus spend remaining in the window. |

A refused order comes back as `isError: true` with the machine-readable reason, so the calling agent
can adapt rather than retry blindly.

## The rules

Seven checks, in order, in [`src/gate.ts`](src/gate.ts). The first failure wins.

| Code | Blocks |
| --- | --- |
| `NO_PROPOSAL` | The agent produced nothing |
| `MALFORMED_PROPOSAL` | Fails the JSON Schema: bad shape, non-integer or negative quantity, unknown field |
| `UNKNOWN_PRODUCT` | A product id that is not in the catalog |
| `CURRENCY_NOT_ALLOWED` | Priced in anything but INR |
| `INSUFFICIENT_STOCK` | More than is actually available |
| `OVER_BUDGET` | Above the per-order cap (default 5,000) |
| `SPEND_LIMIT_EXCEEDED` | Would push the rolling 1h spend past the cap (default 10,000) |

`evaluateOrder` is pure and never throws. Given any input at all, including a string, an array or a
prototype-pollution payload, it returns a `Decision`.

## Checks

```bash
npm run check     # lint, typecheck, tests
npm test          # 30 tests
npm run lint      # oxlint
npm run typecheck
```

The tests cover all seven refusal codes, a table of malformed proposals, hostile input that must
never throw, the ledger fold, the rolling window, and the end-to-end order path: that a blocked order
**never reaches the payment provider**, that a declined card releases its reservation, and that a
repeated idempotency key replays instead of charging twice.

## Housekeeping

```bash
npm run reset      # empty the ledger, restore full stock and a clean budget
npm run settle     # poll pending payment links and settle them
npm run web        # Vite dev server, for working on the frontend
```

The ledger is append-only and never expires, so stock consumed by a settled order stays consumed.
Run `reset` before a demo.

## Layout

```
src/gate.ts                          the seven rules
src/schemas/order-proposal.schema.json   the contract, used in four places
src/order.ts                         gate -> log -> reserve -> charge -> commit
src/audit.ts                         the append-only ledger
src/mcp-server.ts                    MCP tools
src/agent/                           Gemini -> Groq -> deterministic
src/payment/                         Razorpay, Stripe, mock
web/                                 React frontend
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit and why.
