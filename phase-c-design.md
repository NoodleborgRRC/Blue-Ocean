# Phase C — Stock Quality, Storage & Spoilage

**Status:** Design only. Not implemented — deliberately held until the Manufacturing content gap
and other backlog items are cleared.
**Supersedes:** the original "obsolescence" sketch in `inventory-design-draft.md` §7.1 step 4.

---

## 0. The correction this makes

The Phase A/7b sketch had `obsolescenceRisk()` deleting units, and only for companies that owned
Warehousing — which is backwards twice over. Owning a warehouse should *reduce* spoilage, not
create it, and manufactured goods do not vanish. They sit there getting harder to sell.

Direction's correction, in three parts:

1. **Nothing currently in the catalogue spoils.** Processed Wood, Paper, Textiles, Glass, Refined
   Metal, Plastics are all shelf-stable. Perishability arrives with future content (food), not now.
2. **Goods carry a quality rating that decays**, at very different rates by material.
   Value follows quality; units never disappear on their own.
3. **Below a quality floor, stock stops being product and becomes a byproduct** — which the
   existing recycling economy can already consume.

`obsolescenceRisk()` should be **deleted**, not extended. It encodes the wrong model.

---

## 0.1 The governing principle (direction, confirmed)

> *"Inventory shouldn't be sat on; a startup business should be working on generating positive
> cashflow, not accumulating inventory assets."*

This is the steer every number in this phase should be tuned against. Holding stock is a
**position**, not an asset — it costs money, it degrades, it can be destroyed, and it locks up
capital a young company needs. Build to Stock stays available because betting on a price recovery
is a legitimate strategy, but it must read as a *risk taken deliberately*, never as the safe
default.

**Consequence for §4:** the quality-tiered contract difficulty spike is CONFIRMED as intended. A
company holding 200 degraded units that cannot fill a 50-unit premium order is exactly the lesson
— the stock was never the asset the balance sheet implied.

---

## 1. Stock quality

Finished-goods stock gains a `quality` figure, seeded from the product's quality at production
time (which the Product system already computes from equipment precision, material grade, and
testing intensity — see `resolveTestingOutcome`).

```
stockLot = { units, quality, producedMonth }
```

**A product's stock becomes lots, not a single number.** This is the main structural change, and
the main cost of this phase: `inst.stock` is currently a scalar. It has to become an array so that
a batch made in month 3 can be worth less than one made in month 11.

### 1.1 Decay is per-material and starts after a grace period

| Line | Grace | Decay after grace | Rationale |
|---|---|---|---|
| Paper Products | 3 months | −0.4 quality/mo | Yellows, absorbs damp, goes brittle |
| Textiles | 6 months | −0.25/mo | Fades, creases set, moths |
| Processed Wood | 9 months | −0.2/mo | Warps and checks if not climate-controlled |
| Plastic Products | 12 months | −0.15/mo | UV embrittlement, very slow |
| Glass Products | 18 months | −0.1/mo | Essentially inert; breakage is an event, not decay |
| Refined Metal | 18 months | −0.1/mo | Surface oxidation only |

Authored per entity in `ECONOMY` as `shelfLife: { graceMonths, decayPerMonth }`, so a future food
product is a content entry (`graceMonths: 1, decayPerMonth: 2.0`) and not an engine change — the
§21 engine/content split the industrial economy is built on.

**Warehousing halves the decay rate.** That is what the tier is *for*, and it finally gives
`warehouseHoldingRelief`'s sibling a real job.

### 1.2 Value follows quality

```
saleValue = marketPrice × qualityRatio
qualityRatio = clamp(lotQuality / productQualityCeiling, 0.35, 1.0)
```

Floor of 0.35 rather than 0 — degraded stock is worth *less*, not worthless, right up until it
crosses the byproduct threshold in §3.

### 1.3 Selling order

**Oldest lot first, always.** Not most-degraded-first, not player-chosen. Real warehouses run FIFO,
and it means neglected stock is the stock that actually goes out the door — which is the pressure
that makes this system matter rather than being a passive tax.

---

## 2. Storage capacity — soft cap

Confirmed soft cap. Exceeding it does not block production; it forces a sale.

```
storageCapacity = BASE_STORAGE
                + (warehousing owned ? WAREHOUSE_CAPACITY : 0)
                × inventoryStrategy multiplier
```

**Baseline storage must be non-zero.** A company with no Warehousing tier still has a yard and a
shed. If baseline were zero, Build to Stock would be impossible before the Growth stage, which
would gut a Phase A stance the player can select from month one. Proposed `BASE_STORAGE` ≈ 2
months of the company's own current output — scaling, so it never becomes irrelevant.

### 2.1 Overflow → distressed liquidation

Per direction: overflow liquidates **at the current market rate**, immediately, oldest lots first.

Note this is *softer* than the earlier 30–50% distress figure floated in the inventory draft, and
deliberately so: with quality decay now doing real work, the overflow itself carries an implicit
penalty (you are dumping your oldest, most-degraded stock at whatever the market happens to pay
today, with no ability to wait for a better price). Stacking a second 50%-of-market haircut on top
would be double-punishing the same mistake.

The liquidation should produce a ticket that names the cost plainly — the player needs to connect
"I overbuilt" to "I got dumped on."

---

## 3. Spoilage → byproduct  **[FLAGGED FOR DETAILED DESIGN]**

Direction: *"When product drops below a certain quality threshold it becomes a byproduct, which can
potentially turn into a different revenue stream if the player is setup for it."*

This is the most interesting piece and the least specified. Sketch:

```
if (lot.quality < SPOILAGE_THRESHOLD) → lot converts to byproduct units
```

The economy graph **already has the receiving end built.** Every base line already maps to a
byproduct with real consumers derived from recipes:

| Spoiled line | Becomes | Already consumed by |
|---|---|---|
| Processed Wood | Wood Scrap | Paper Products, Recycled Wood Composite |
| Paper Products | Pulp Sludge | Recycled Paper |
| Textiles | Textile Waste | Recycled Textile |
| Glass Products | Glass Cullet | Recycled Glass, **Glass Products itself** |
| Refined Metal | Metal Scrap | Recycled Metal |
| Plastic Products | Plastic Scrap | Recycled Plastic |

So a player who built the recycling line already has somewhere for spoiled stock to go — the loop
closes with **no new content required**. A player who didn't pays disposal.

### 3.1 Open questions for that design pass

- **Conversion ratio.** 1:1 units, or lossy (100 spoiled units → 60 scrap)? Lossy is more honest
  and stops spoilage becoming a free scrap generator.
- **Does it bypass the byproduct policy?** Spoilage-derived scrap presumably obeys the same
  dispose/sell/burn/reuse policy already set for that byproduct — but should it, or is spoiled
  finished goods a distinct stream with its own policy?
- **Can a player exploit it?** Deliberately spoiling cheap stock to feed a recycling line must be
  worse than just buying feedstock, or it becomes a degenerate strategy. The lossy ratio plus the
  holding cost paid along the way probably handles this, but it needs checking with real numbers.
- **Does the market see it?** Spoilage-derived scrap adding to byproduct market supply would
  connect this to Phase 2's pricing. Probably yes, for consistency.

---

## 4. Quality-tiered contracts

Direction: buyers with a high Premium philosophy demand higher quality than Mass Market buyers.

Sales contracts gain `qualityRequired`, derived from the counterparty's own philosophy — which
already exists on every rival (`premiumVsMass`) and can be derived for suppliers.

```
qualityRequired = 4 + round(premiumVsMass / 100 × 5)     // roughly 4–9 on the 1–10 scale
```

### 4.1 Delivery must then satisfy quality, not just units

This changes `resolveContractDeliveries` meaningfully: a lot below the contract's required
quality **cannot be used to fill it**, even though it exists. So a company can hold 200 units and
still breach a 50-unit contract, because all 200 are too degraded for that particular buyer.

That is the sharpest version of this system, and worth having: it makes a premium contract a
genuine operational commitment rather than only a volume one — and it gives degraded stock a
natural home in mass-market contracts and spot sales.

### 4.2 Pricing follows

Premium buyers should pay above the base locked-price multiplier to compensate for the tighter
requirement. Otherwise premium contracts are strictly worse and nobody signs them.

---

## 5. Warehouse events

Direction: fire, theft, rodents. These fit the existing event/ticket pattern and are cheap to add
once lots exist:

| Event | Effect |
|---|---|
| **Warehouse fire** | Destroys a fraction of units outright. The one case where stock genuinely vanishes. |
| **Theft** | Removes units; scales with stock value, not unit count — thieves take the metal, not the paper. |
| **Water damage / rodents** | Does not remove units; drops the quality of affected lots sharply. |

Owning Warehousing should reduce the **frequency** of all three. That gives the tier a third
distinct job (capacity, decay relief, event protection) and makes it read as a genuine investment
rather than a storage number.

---

## 5.5 Progress

- **Step 1 — stock as lots: SHIPPED.** Behaviour-neutral migration, 12 call sites, legacy scalar
  stock still reads correctly. Lots merge when adjacent and mechanically identical (Q2), keeping
  the OLDER `producedMonth` so merging can never reset a decay clock. FIFO draw implemented.
- **Step 2 — quality decay: SHIPPED.** `shelfLife` authored as content on all 12 entities.
  Decay after a per-material grace period, halved by Warehousing. Value follows quality with a
  0.35 floor. Wired into working-capital valuation, monthly sale revenue, and spot sales.
  Inventory tab shows an expandable quality summary (Q1). 97 tests in `inventory_test.cjs`.

Measured curves: Paper 100% → 80% at 6mo → 40% at 12mo. Metal still 91% at 24mo. Warehousing
roughly doubles effective shelf life.

- **Step 3 — storage cap: SHIPPED.** Soft cap scaling with the company's own output
  (2 months baseline + 3 with Warehousing, x inventory strategy). Overflow liquidates at market
  rate, oldest lots first, biggest holding first. Production is never blocked.

**Amendment to §1.3 (direction):** FIFO is the default, but a draw carrying a MINIMUM QUALITY
(a premium contract) may take newer stock, since old stock cannot legitimately fill it. Within
qualifying lots it is still oldest-first, so no cherry-picking for ordinary sales. Rejected stock
is left untouched and keeps decaying — you can ship around bad inventory, never escape it.
`stockMeetingQuality()` reports what actually clears a given bar.

**Bug found and fixed during step 3:** `mergeLots` compared STORED quality only, so a degraded
20-month-old batch and a fresh one both reading `quality: 6` would merge — silently rejuvenating
the old stock. Lots now require a matching production month as well.

- **Step 4 — quality-tiered contracts: SHIPPED.** `qualityRequired` derives from the
  counterparty's premium lean (rivals: `philosophy.premiumVsMass` directly; suppliers: derived
  from their authored `qualityGrade`, since they carry no philosophy field). Bar is always
  `ceiling x (0.60 to 0.95)` — every product can theoretically serve every buyer. Price scales
  proportionally with the bar demanded, up to +35% (direction's Q3). Delivery is quality-aware:
  each contract draws only from lots that clear ITS OWN bar, oldest-first among those. A company
  can hold plenty of stock and still breach a premium contract if none of it qualifies — reported
  as `qualityBlocked`, distinct from an ordinary volume shortfall, with its own ticket wording.

- **Step 5 — spoilage -> byproduct: SHIPPED.** Automatic (direction's Q5): once a lot's decayed
  quality crosses `SPOILAGE_QUALITY_FLOOR` (30), it converts 1:1 (Q4 — no lossy ratio needed,
  since the value collapse between a product and its byproduct is already ~98%) into the SAME
  byproduct stream, obeying the SAME policy already set for that material (Q6). A product with no
  byproduct at all is an honest write-off, not an invented sink. Runs per-product before storage
  overflow, so overflow never tries to liquidate stock that has already spoiled out.

**Two real bugs caught during implementation:**
- A leftover second draw from before delivery operated on real lots would have silently removed
  contract-delivered units from stock TWICE. Caught on review before shipping.
- Verified live that overflow (step 3) and spoilage (step 5) compose correctly in sequence rather
  than conflicting — a zero-equipment company's stock was half-liquidated by overflow immediately,
  with the remainder decaying and spoiling together later.

- **Step 6 — warehouse events: SHIPPED.** Fire, theft, water damage. Deliberately NOT part of
  the ordinary event deck: those fire regardless of circumstance, and a warehouse fire at a
  company holding no stock is nonsense. Conditional on real stock (25+ units), scaling with how
  much is held, capped at 14%/month so a large holding is never a guaranteed monthly disaster.
  Warehousing cuts frequency ~45% — its THIRD distinct job, alongside capacity and decay relief.

  | Event | Weight | Effect |
  |---|---|---|
  | Water damage | 3 (most common) | Removes nothing; drops quality 8-20 points. Under FIFO the damage surfaces later, when that stock finally ships. |
  | Theft | 2 | Takes 8-20% — **highest quality first**, the only draw in the game that inverts FIFO. You lose exactly the stock a premium contract needed. |
  | Fire | 1 (rarest) | Destroys 25-55% outright. The one case where stock genuinely vanishes. Costs reputation and morale, since a fire is public. |

  Ordered in the monthly tick AFTER spoilage (so it cannot destroy stock that already left the
  sellable pool) and BEFORE overflow (so a fire genuinely relieves an over-full warehouse rather
  than the player being charged to liquidate stock that burned).

  Measured: ~10 events across 288 stockpiling months with Warehousing owned — roughly one per 29
  months. Memorable rather than routine.

**Phase C is now feature-complete.** All six steps shipped.

---

## 5.6 Quality rescaled to 0-100 (direction, step 4 prerequisite)

The 1-10 scale could not carry step 4. Ceilings ran 5-7, so the design doc's premium formula
(`4 + premiumVsMass/100 * 5`, range 4-9) produced **unfillable contracts** — a quality-8 bar on a
product that caps at 5. Decay had the same problem: 0.4/month was 8% of the entire range.

Quality now runs **0-100** everywhere — product ceilings, achieved lot quality, equipment
precision, supplier material grade — so all four can be compared directly.

| | old | new |
|---|---|---|
| Product ceilings | 5-7 | 47-71 |
| Equipment precision | 1-10 (catalog) | x10 at the accessor |
| Supplier grade | 1-10 (authored) | x10 at `materialQualityFloor` |
| Spoilage floor | 3 | 30 |
| Decay rates | 0.10-0.40/mo | 1.0-4.0/mo |

Decay curves are preserved exactly (Paper still 100% -> 80% at 6mo -> 39% at 12mo).
`QUALITY_MAX` is declared at the top of the file, above every consumer, since a const used before
declaration is a module-load TDZ error.

**Step 4 formula, revised:** `qualityRequired = ceiling x (0.6 to 0.95)` scaled by the buyer's
`premiumVsMass`. Always theoretically fillable, and every line can serve premium buyers.

---

## 6. Implementation order, when this is picked up

1. **Stock as lots** — the structural change everything else depends on. Ships alone, verifiable
   alone: same behaviour as today, just represented as lots.
2. **Quality decay + value effect** — per-material `shelfLife` content, FIFO selling.
3. **Storage cap + overflow liquidation.**
4. **Quality-tiered contracts** — needs §4's open pricing question answered first.
5. **Spoilage → byproduct** — needs §3.1 answered first.
6. **Warehouse events** — last; pure content on top of finished mechanics.

Steps 1–3 are self-contained and could ship as one pass. Steps 4–5 each need a design
conversation before code.

---

## 7. What this touches

| System | Change |
|---|---|
| Finished goods (`inst.stock`) | Scalar → array of lots. The big one. |
| `resolveSales` | Sells FIFO across lots, price scaled by lot quality |
| `resolveContractDeliveries` | Must match lot quality against contract requirement |
| `finishedGoodsValue` | Values each lot at its own quality |
| `finishedGoodsHoldingCost` | Unchanged in shape; more stock to count |
| Byproduct system | Gains a second inbound source (spoilage, not just production) |
| Warehousing tier (7b) | Gains capacity, decay relief, event protection |
| `obsolescenceRisk()` | **Deleted** — wrong model |
| Market (Phase 2) | Spoilage-derived scrap may add to byproduct supply |
| Inventory tab | Must show lots, ages, and quality — not one stock number |
