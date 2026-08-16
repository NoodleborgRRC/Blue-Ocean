# Blue Ocean

A roguelike strategy game simulating company founding and scaling from Pre-Seed to Exit, across
multiple industry verticals — currently Hospitality and Manufacturing, built on a shared
simulation engine (Finance, Operations, Production, Supply Chain, Marketing, Sales, R&D, HR,
Legal, Strategy) so a new industry is content, not an engine change.

## Structure

```
src/
  blueocean-core.jsx                  the full engine — both industries, single React file
  blueocean-manufacturing-slice.jsx   Manufacturing-only build (Hospitality disabled), for demos
tests/
  *.cjs                               27 suites, ~1,900+ tests, run directly with Node
tools/
  factory_bot.cjs                     diagnostic bot — plays the Manufacturing economy across
                                       six play styles and every starting business to surface
                                       bugs and balance data
docs/
  manufacturing-content-bible.md      original vision & architecture brief
  phase-c-design.md                   finished-goods quality/storage/spoilage design
  phase-d-design.md                   consumer economy (segments, brand, demand) design
  deferred-backlog.md                 open issues found during development
  *-for-review.md                    design proposals awaiting decisions
```

## Running the tests

```
npm install
npm test          # builds the harness, then runs every suite
```

Or run one suite at a time (after `npm run build:harness` once):

```
node tests/economy_test.cjs
node tests/sales_contract_test.cjs
```

**Why a build step exists at all:** every gameplay handler is a closure inside the React
component, so nothing outside it can call `handleInvest`, `endMonth`, etc. directly.
`build-tools/build_harness.mjs` lifts that handler block *verbatim* out of `src/blueocean-core.jsx`
into a module-scope factory the tests can drive — the handler source is never edited, so what the
tests exercise is byte-identical to what ships. Then esbuild bundles it with a minimal React stub
(`build-tools/stubs/`) into `tests/build/harness.cjs`, which the tests `require()`. No browser
needed. Verified: all 27 suites pass from a clean `npm install && npm test`.

## Running the factory bot

```
node tools/factory_bot.cjs 5
```

Runs 5 full playthroughs per (business × play style) combination and reports launch rates,
outcomes, and any anomalies found (dead ends, unreachable content, runaway states).

## Status

Manufacturing and Hospitality are both content-complete. Active development is on the consumer
economy (Phase D — market segments, brand, demand curves); see `docs/phase-d-design.md`.
