# Finished Goods, Decoupled Sales & Contract Pricing — Design Draft

**Status:** Design only. No code. Open questions at the end (§7).
**Scope note:** built generically so other industries can adopt it — Hospitality has no product
catalogue today, but a future Retail or Agriculture industry would use the same stock/aging model.

---

## 1. The problem this solves

Today: `revenue = min(capacity, demand) × marginPerUnit`, settled instantly, every month.

Three things are wrong with that as a manufacturing model:

1. **Nothing is ever held.** You cannot build stock in a slow month and sell it in a good one.
2. **Price is a flat constant** (0.95/unit) while a real market with swinging prices already
   exists in Phase 2 and is currently *informational only* — the Market tab shows processedWood
   moving 24 → 62 under demand pressure, and none of that reaches revenue.
3. **Overproduction is pure waste.** Capacity above demand becomes idle-burn, when in reality it
   would become inventory you could sell later.

The fix is one structural change — **production and sales become separate events** — plus the
price signal that makes timing them a real decision.

---

## 2. The core model

```
PRODUCTION  →  FINISHED GOODS STOCK  →  SALES
(what you make)   (what you hold)      (what you sell)
```

Each month, in order:

| Step | What happens |
|---|---|
| **Produce** | `min(capacity, materials available)` units are made and added to stock |
| **Contract deliveries** | Contracted orders are filled FIRST, from stock, at their locked price |
| **Spot sales** | Remaining demand is filled from remaining stock, at the current market price |
| **Carry** | Unsold stock remains, incurs holding cost, risks obsolescence |

The two levers that make this strategic: **how much you produce** and **how much you sell**.

### 2.1 Production stance

A standing policy, matching `maintenanceStance` / `inventoryStrategy` / `byproductPolicy`:

| Stance | Produces | Use when |
|---|---|---|
| **Build to Order** | Only what's contracted + expected spot demand | Cash is tight; you cannot afford to sit on stock |
| **Balanced** | Capacity, capped at ~1.5 months of demand | Default |
| **Build to Stock** | Full capacity regardless of demand | You expect prices to rise, and can fund the gap |

Build to Stock is the "smart player" lever: it burns cash now for inventory you sell later at a
better price. It should be genuinely punishing if you're wrong about the price.

### 2.2 Sales stance

| Stance | Sells | Use when |
|---|---|---|
| **Sell All** | Everything demand will absorb | Need cash now |
| **Hold for Price** | Only when market price ≥ a floor you set | You believe the price is rising |

`Hold for Price` is where the decoupling pays off — and where it can go badly wrong, because
holding costs accrue and demand decays whether you sell or not.

---

## 3. Price becomes real

**`marginPerUnit` retires as the revenue driver.** Sales price comes from the Phase 2 market:

```
spotRevenue = unitsSold × marketPrice(product) × forwardMarginMultiplier × modelFx.marginMultiplier
```

The existing multiplier chain (forward integration, business model) composes on top, unchanged —
same discipline as every prior layer. `marginPerUnit` survives only as a fallback for any industry
without a market.

This makes the Market tab load-bearing rather than decorative, which is what §27 of the blueprint
asked for: *the economy should be something the player can study and exploit.*

**Consequence worth flagging:** revenue becomes considerably more volatile. A player whose costs
are fixed and whose sale price swings 2.5× will feel that hard. That is realistic, and it is also
a balance risk — see §7 Q3.

---

## 4. Contracts: locked price, locked obligation

The piece that turns inventory from a slider into a strategy.

### 4.1 Shape

A contract is an aging commitment, mirroring the receivables/payables queue from Working Capital:

```
{ productId, unitsPerMonth, lockedPrice, monthsRemaining, buyer, penaltyPerUnit }
```

Each month it consumes stock at `unitsPerMonth` and pays `lockedPrice` — regardless of what the
market is doing.

### 4.2 The tension

| Market moves | Effect on you |
|---|---|
| Price **rises** above locked price | You lose the upside. Guaranteed volume was the trade. |
| Price **falls** below locked price | You're insulated. The contract is now an asset. |
| You **can't deliver** | Breach: penalty + reputation hit |

That last row connects directly to the shortfall work just shipped: **a contract breach is
exactly the "broken commitment" case that costs reputation**, while unsold spot inventory is not.
The distinction we drew becomes structural rather than a scaling factor.

### 4.3 Where contracts come from

- Offered as events (a buyer approaches), gated on reputation and B2B channel access
- Longer terms → better locked price but more exposure
- A rival-as-supplier relationship could offer preferential terms

---

## 5. Holding costs and obsolescence

Stock is not free to keep. Per month:

```
holdingCost = stockUnits × baseHoldingRate
            × inventoryStrategyMult          (lean/balanced/high, item 3)
            × (1 − warehouseHoldingRelief)   (item 7b — finally does something)
```

**Storage capacity** becomes real: `Build to Stock` beyond what you can store either overflows
(forced sale at a discount) or is blocked. Warehousing raises the ceiling.

**Obsolescence** (`obsolescenceRisk`, item 7b — currently defined but unwired): each month, a
chance that some stock is written off. Higher for products with low `qualityCeiling` or in
fast-moving families. This finally gives that function a job.

---

## 6. Working capital integration

Finished goods join `workingCapital()` alongside raw materials and receivables:

```
workingCapital = rawMaterials + finishedGoods + receivables − payables
```

This is the cash-flow teeth: **Build to Stock converts cash into inventory**, and the Analyst's
cash-gap forecast should treat unsold stock as *not yet cash*. A player who over-builds gets an
early warning from their own Analyst rather than a surprise insolvency.

---

## 7. Design decisions — **ALL RESOLVED**

Recorded with reasoning so a later session does not relitigate them.

| # | Question | Decision |
|---|---|---|
| 1 | Production control | **Stance only.** Three standing options, no per-product monthly targets — avoids the spreadsheet game. Per-product override deferred indefinitely. |
| 2 | Stock granularity | **Per-product.** UI solved by grouping, dropdowns and filters on one page, not by pooling the data. |
| 3 | Price volatility | **Full market volatility.** Complicated, brutal, rewarding — a smart player may navigate it by choice. Contracts are the intended stabiliser, and **contract content is where the emphasis goes**. |
| 4 | Storage overflow | **Distressed liquidation at 30–50% of current market value.** Penalises overproduction and forces the lean decisions a startup actually faces. |
| 5 | Contract payment | **Delayed — net-60**, same terms as ordinary B2B receivables. Start there and re-feel it. So a contract is three distinct things at once: locked price, guaranteed volume, delayed cash. |
| 6 | Scope | **Ship 1–2 first, verify balance, then 3–4.** |

### 7.1 Locked build order

**Phase A (ship first):**
1. Finished-goods stock, production/sales split, production + sales stances, holding costs
2. Market price driving revenue (retire `marginPerUnit` as the driver)

*Then verify balance holds before continuing.*

**Phase B:**
3. Contracts with locked pricing, net-60 settlement, breach penalties
4. Obsolescence, storage capacity, distressed liquidation

### 7.2 Consequence of Q3 worth carrying forward

Choosing full volatility means an all-spot company genuinely has swinging revenue against fixed
costs. That is intended. It also means **the contract system in Phase B is not optional polish —
it is the counterweight that makes the volatility survivable.** Phase A will feel harsher than the
finished design until Phase B lands, and that gap is expected rather than a balance failure.

---

## 7.3 Steps 1-2 — **SHIPPED**

Finished-goods stock, production/sales stances, market-price revenue, holding costs, and working
capital integration are live. 49 dedicated tests (`inventory_test.cjs`), 1,701 total across 27
suites, three consecutive clean regression runs.

**Real bugs found and fixed during implementation, not assumption:**
- A TDZ crash — `modelFx` referenced before its declaration ran later in the same function.
- **The serious one**: the legacy capacity/demand block kept folding the same per-product totals
  into its own aggregate after the new precise per-product resolution already handled them —
  silently double-counting both revenue and the reputation penalty for every launched product.
  Caught by reading actual ticket output, not by inspection.
- An ordering bug: receivables created inside the new block, before the month's aging/decrement
  step ran later in the same function, got immediately decremented and sometimes collected in
  the SAME month they were created — silently shaving a month off every product's payment term.
  Fixed by deferring cash/receivable crediting to the correct point in the sequence.

**Balance note:** Manufacturing read 40-56% post-change, down from the low-50s/60s range seen
before. This matches §7.2's anticipated consequence of choosing full market volatility with
contracts deferred — expected, not a regression. Revisit once Phase B (contracts) lands.

---

## 7.4 Phase B — Sales Contracts **SHIPPED**

Contracts, offers, prorated breach, and the research gate are live. 65 dedicated tests
(`sales_contract_test.cjs`); 27 suites clean.

**Naming:** "Sales Contract" everywhere, never bare "Contract" — supplier `CONTRACT_TYPES`
(item 3) are the BUYING side and predate this. Sales = money in, Supplier = money out.

**Locked decisions as built:**
- Q2 — production does NOT auto-adjust for obligations; overcommitting is an earnable mistake
- Q3 — contracts fill from stock first, at locked price; Hold for Price applies to the remainder
- Q4 — breach prorated by severity, scaled by term seriousness, reputation capped at 12
- Q5 — multiple contracts per product, one per counterparty
- Q6 — both routes: `mfgSourceBuyers` research unlocks solicitation (1 AP + 1 Presence) AND
  inbound offers; inbound arrive via ticket rail with a `!` badge on the Invest tab, never as a
  Choice Event (which could override another event that month)

**Still deferred:** obsolescence, storage capacity, distressed liquidation.

**Balance:** Manufacturing 36-48%, materially unchanged from Phase A's 40-56%. Expected — the
diagnostic bot never signs a contract, so it measures the un-contracted path only. Contracts'
effect on balance needs a bot that uses them, or human playtest data.

---

## 8. What this touches

For scope awareness — this is not a bolt-on:

| System | Change |
|---|---|
| `capacityDemand` revenue block | Rewritten: produce → deliver → sell, instead of `min(cap, demand)` |
| Market model (Phase 2) | Becomes load-bearing for revenue, not informational |
| Working capital (item 5) | Finished goods join the calculation |
| Warehousing (item 7b) | Finally governs real storage and obsolescence |
| Inventory strategy (item 3) | Now affects finished goods too, not just raw-material buffering |
| Shortfall consequences | Contract breach becomes the reputation case; spot shortfall is pure market |
| Analyst forecast | Must treat stock as non-cash |
| Products UI | Stock levels, stances, contracts |

Roughly comparable in size to items 3 or 7b — a full build-order item, not a patch.
