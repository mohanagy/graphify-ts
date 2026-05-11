# 2026-05-11 — `graphify-ts generate --spi` vs legacy `extract()`

> **Tracking issue:** [#130](https://github.com/mohanagy/graphify-ts/issues/130) — *Benchmark v0.18 --spi vs legacy on backend-only and monorepo workspaces.*

## TL;DR (one fixture, ~30 nodes, 7 prompts)

| Metric | Legacy | `--spi` | Δ |
|---|---|---|---|
| Build time (cold) | 506 ms | 710 ms | **+40%** (slower) |
| Build time (cache-hit) | n/a | ~150-200 ms | **~70% faster than legacy** |
| `graph.json` size | 62.8 KB | 42.8 KB | **−32%** |
| Node count | 29 | 30 | +1 |
| **Total pack tokens (7 prompts)** | **1284** | **946** | **−26%** |

The slower cold build is the cost; everything else is the payoff. On a real repo where you rebuild repeatedly, the cache-hit path dominates and the token savings are the headline.

## Per-prompt breakdown

| Prompt | Intent | Legacy tokens | `--spi` tokens | Δ | Comment |
|---|---|---|---|---|---|
| `express-route` | framework | 157 | 128 | **−18%** | Same node count, leaner labels (`getUserById()` vs `GET /api/users/:id` separate route nodes) |
| `hono-route` | framework | 179 | 126 | **−30%** | spi includes `honoApp`; legacy noises with `findUserById` |
| `trpc-mutations` | framework | 298 | 231 | **−22%** | **Legacy returned Express nodes** (wrong); spi returned actual tRPC procedures |
| `prisma-client` | framework | 260 | 93 | **−64%** | **Legacy returned Express middleware**; spi returned `prisma` client correctly |
| `auth-middleware` | framework | 128 | 120 | −6% | Both correct; slight metadata overhead diff |
| `generic-utils` | code | 124 | 123 | −1% | Non-framework query unaffected (as designed) |
| `cross-framework` | framework | 138 | 125 | −9% | spi returns function nodes vs legacy's synthesized `GET /` routes |

## Key qualitative finding

**Legacy retrieval routed framework-shaped prompts to the wrong substrate.**
- `trpc-mutations` → legacy returned Express `app`, `usersRouter`, `USE /`. **None of these are tRPC.** spi returned the 5 actual tRPC procedures.
- `prisma-client` → legacy returned Express middleware nodes. spi returned the `prisma` client + `prisma-client.ts` file.

This is the v0.19 retrieval boost paying off: framework_role-based ranking surfaces the structurally-correct nodes for substrate-shaped queries.

## How to reproduce

```bash
# from repo root
bash docs/benchmarks/2026-05-11-spi-vs-legacy/run.sh
```

The script:
1. Builds `graphify-ts` (if `dist/` missing)
2. Copies the bundled fixture into `results/<timestamp>/fixture-{legacy,spi-cold}`
3. Runs `graphify-ts generate <fixture>` against each variant
4. Runs `graphify-ts pack <prompt> --task explain --budget 2000` for every prompt in `prompts.json`
5. Re-runs `--spi` on the same fixture to measure cache-hit time
6. Aggregates everything into `results/<timestamp>/summary.json`

## Caveats / limitations

- **Fixture is synthetic.** ~10 files, no real-world signal volume. Real repos will see different absolute numbers and (hopefully) directionally similar relative deltas.
- **No model-quality assertion.** Token counts are objective; whether the agent answers BETTER with `--spi` requires a downstream eval against ground-truth answers — that's a separate benchmark (closer to the `2026-04-30-govalidate` shape).
- **Budget chosen as 2000.** Different budgets stress the budget-bounded selection differently — repeat with budgets 500 / 1000 / 4000 / 8000 to see how token deltas scale.
- **No retrieval-gate parameter.** All runs use default retrieval level. Future runs should sweep retrieval_level 0–5.

## Files

- `fixture/` — synthetic TypeScript codebase covering Express, Hono, tRPC, Prisma, and plain utility code
- `prompts.json` — 7 representative prompts (6 framework-shaped, 1 code-comprehension)
- `run.sh` — the benchmark runner
- `summarize.mjs` — aggregator that produces `summary.json`
- `results/<timestamp>/` — per-run artifacts (legacy.json, spi-cold.json, summary.json, generate logs)

## Next steps (issues blocked on this)

- **#133** — Audit retrieval boost rules across ALL 9 substrates; PR #129 only covered Hono/Fastify/tRPC/Prisma. Now we know which prompts misbehave on legacy and can target the boost gaps.
- **#131** — Wire `selectByValuePerToken` into retrieve. Should reduce token counts further by favouring high-density candidates.
- **#134** — Default-readiness criteria. 40% slower cold build is the headline cost; cache-hit recovery + 26% token saving is the headline payoff. Numbers in this report inform the threshold debate.
