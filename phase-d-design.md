# Phase D — The Consumer Economy

**Status:** Design. Implementation to follow in deliberate layers.
**Scope note:** This is written to be **industry-agnostic**. Manufacturing is the proving ground,
but Hospitality is B2C-first and later industries (Retail, Consumer Goods) will be almost entirely
B2C. Nothing here should assume a factory.

---

## 0. The governing shape

B2B and B2C are **different businesses that happen to share a supply chain**.

> Direction: *"the split between B2B and B2C require different relationships, reputation, and
> branding."*

| | B2B | B2C |
|---|---|---|
| Counterparty | Named buyers, individually tracked | Market segments, statistically modelled |
| What earns trust | Delivery record, quality bars | **Brand** — slow to build, quick to lose |
| Volume | Large, contracted | Smaller per unit, uncontracted |
| Price | Locked below market | Higher margin, unlocked |
| Stability | Guaranteed until breach | Volatile; demand can simply evaporate |
| Ongoing cost | Low — the contract does the work | **Continuous marketing**, or the brand decays |
| Failure mode | Breach: penalty and reputation loss | Irrelevance: nobody is angry, they just stop buying |

The asymmetry is the design. B2B is the reliable backbone that keeps the lights on. B2C is
higher-margin and precarious, and it demands constant attention to stay alive.

### 0.1 The fork stays at the product level

Confirmed: a company reaches consumers by making a **different, downstream product**, not by
re-pointing an existing line. A paper mill sells bulk stock B2B; to reach consumers it builds a
*stationery* line. The two may share inputs and cost little more to produce — but they need
separate relationships, separate reputation, and separate brand.

This keeps `launchType` as a genuine fork, makes vertical integration the road to consumers, and
satisfies "B2B and B2C in the same **chain**" rather than the same product.

---

## 1. Market segments

Five segments, each a distinct kind of buyer with its own philosophy, not a difficulty slider.

**Consumer philosophy axes are NOT company philosophy axes.** Direction was explicit that most
company axes make no sense for a shopper. The axes that survive, and their replacements:

| Axis | Range | Meaning |
|---|---|---|
| `premiumVsMass` | −100…100 | *Kept from company philosophy.* Willingness to pay for better. |
| `sustainability` | 0…100 | How much recycled content and byproduct reuse actually moves them. |
| `noveltyVsHeritage` | −100…100 | Chasing the new versus trusting the established. |
| `priceSensitivity` | 0…1 | How sharply demand falls as price rises. |
| `brandWeight` | 0…1 | How much of their buying decision is brand rather than product. |
| `volatility` | 0…1 | How violently their demand swings when trends move. |

### 1.1 The five segments

**Everyday Value** — the mass market floor.
`premiumVsMass -70 · sustainability 10 · novelty -20 · priceSensitivity 0.85 · brandWeight 0.2 · volatility 0.2`
Buys on price, forgives mediocrity, ignores your story entirely. Enormous and stable — the
segment you fall back on when everything else dries up, and the one that will never make you rich
per unit.

**Design-Led** — the premium tastemakers.
`premiumVsMass +75 · sustainability 45 · novelty +60 · priceSensitivity 0.25 · brandWeight 0.8 · volatility 0.6`
Pays nearly anything for the right thing and nothing at all for the wrong one. Brand is most of
the decision. Fashionable, and therefore fickle.

**Conscientious** — sustainability as the buying criterion.
`premiumVsMass +30 · sustainability 95 · novelty 0 · priceSensitivity 0.45 · brandWeight 0.6 · volatility 0.35`
Genuinely rewards recycled inputs and byproduct reuse. **This is the segment that makes the
recycling economy pay on the consumer side** — a player who built a Recycler or set byproduct
policy to `reuse` has something real to sell them.

**Heritage Buyers** — durability and provenance.
`premiumVsMass +55 · sustainability 35 · novelty -75 · priceSensitivity 0.3 · brandWeight 0.75 · volatility 0.15`
Wants the thing their parents had. Slow to adopt, slow to leave — the most *loyal* segment, and
the hardest to win in the first place. Rewards a long-lived brand more than a new one.

**Trend Followers** — motion for its own sake.
`premiumVsMass 0 · sustainability 25 · novelty +90 · priceSensitivity 0.55 · brandWeight 0.5 · volatility 0.9`
Here this year, gone the next. Explosive demand when a trend lands on you and total collapse when
it moves. The segment that makes B2C genuinely dangerous.

### 1.2 Two routes to a consumer

Direction: **both**.

- **Direct** — own the Retail tier (already built in item 7b) and sell to segments yourself.
  Highest margin, and you carry all the demand risk.
- **Mediated** — sell through a retail *buyer* (Crown Retail, Seltzer Home already exist). They
  take a cut and absorb some volatility, but they own the customer, not you, and brand builds
  more slowly because your name is on a shelf rather than on the door.

This reuses forward integration rather than inventing a parallel system, and it makes owning
Retail a genuine strategic choice rather than a margin bump.

---

## 2. Brand

Brand is to B2C what delivery record is to B2B. It is a **separate meter from reputation**:
reputation is what the industry thinks of you as a supplier; brand is what the public thinks of
you as a name.

### 2.1 What moves it

| Input | Effect |
|---|---|
| Marketing spend | Primary driver. Continuous — stop and it decays. |
| Product quality | Sustained high quality raises the ceiling brand can reach. |
| Segment fit | Selling what a segment actually wants builds brand faster than volume alone. |
| Sustainability record | Feeds brand specifically with `Conscientious`, barely elsewhere. |
| Public failure | Recalls, warehouse fires, breaches — brand falls faster than it rose. |
| **Decay** | A flat monthly decline. Brand is a leaky bucket by design. |

### 2.2 What it does

- **Gates segments.** Design-Led and Heritage Buyers will not look at an unknown name at all.
  Everyday Value does not care. So brand determines *which* market you can reach, not just how
  much of it.
- **Sets price tolerance.** A strong brand lets you sit above market price without losing volume.
- **Buffers volatility.** A trend moving against you hurts less if the brand is strong.

### 2.3 Brand is per-company, not per-product

One name, one reputation with the public. A failure on one consumer line damages the others —
which is the honest version, and creates a real decision about whether to risk a cheap line under
the same name.

---

## 3. Living demand

Direction: *"a living B2C system would make the game feel alive and cause the player to adapt to
shifting market preferences, the core of entrepreneurship."*

### 3.1 Trends

A trend is a **temporary multiplier on one axis**, running months rather than forever:
sustainability becoming fashionable, heritage returning, a novelty wave.

Each trend has a direction, a magnitude, a duration, and a **visible ramp** — it should be
readable *before* it peaks, so a player who watches the market can act on it and one who ignores
it gets caught. That readability is what makes it a decision rather than a dice roll.

### 3.2 Demand curves

Segment demand for a product is a function, not a constant:

```
demand = segmentSize
       × philosophyFit(product, segment)      // how well it matches what they want
       × brandFactor(brand, segment)          // gated + scaled by brandWeight
       × priceFactor(price, segment)          // elasticity via priceSensitivity
       × trendFactor(activeTrends, segment)   // the living part
```

Every term is per-segment, so the same product genuinely succeeds with one audience and fails
with another — and a price cut that rescues you with Everyday Value does nothing with Design-Led.

---

## 4. Build order

Deliberately layered, each shippable and verifiable alone:

1. **Segments as content** — the five, with their axes. Pure data, no behaviour change. **SHIPPED.**
2. **Philosophy fit + demand curves** — segment demand becomes a real function. **SHIPPED.**
   Fit runs across three axes with a sharpening exponent (2.1) so near-misses still sell and real
   mismatches do not. Novelty is keyed to TIME ON MARKET, which gives the segments opposite
   trajectories for free — Trend Followers drift away from a line as it ages while Heritage Buyers
   warm to it, with no trend system needed yet. Price elasticity is per-segment: at 1.5x price
   Everyday Value collapses 29->1 while Design-Led only falls 22->13. Brand GATES access rather
   than merely scaling it, so an unknown company can reach only the ungated mass market.
   Sustainability keys off recycled INPUTS plus an honoured reuse policy — and a reuse policy is
   only honoured once the consuming line is actually built.
3. **Brand meter** — build, decay, and its effect on segment access and price tolerance. **SHIPPED.**
   Brand is TWO meters: STRENGTH (how known) and POSITION (known for what, on the same three axes
   consumers judge by). At identical strength, a company known for cheap goods clears Design-Led's
   awareness gate and then converts badly — "our brand is weak" and "our brand is wrong for this
   product" are different problems, which a single number cannot express.
   Reputation is a SOFT CEILING (rep+18, with 25% bleed above it). Marketing is a standing policy
   (none/low/medium/high, optionally aimed at one segment) PLUS AP-costing campaign pushes;
   targeted costs ~35% more, hits harder, and drags position decisively. Position otherwise drifts
   toward what the company actually makes. Public failures are loud discrete shocks
   (recall -14, safety -11, breach -9, fire -7, spoilage -5); decay is a quiet 1.4/month.
   A proven founder starts a NEW company with a small brand head start, capped below the hardest
   segment gate. Gate crossings raise a ticket in both directions.
4. **B2C revenue path** — direct via Retail tier, mediated via retail buyers.
5. **Trends** — the living layer, last, once there is something for it to move.
6. **Marketing rework** — continuous spend against specific segments rather than a flat action.

Steps 1–3 are the foundation. 4 is where it starts paying. 5 is where it becomes alive.

---

## 5. Deliberately not decided yet

- Whether brand should carry across runs as meta-progression (buyer standing does; brand is a
  bigger deal and may unbalance a fresh start).
- Whether segments should have their own *size* trajectories over a run, independent of trends.
- How B2C interacts with sales contracts — a retail buyer contract is B2B machinery pointed at a
  consumer product, which may just work, or may need its own shape.
