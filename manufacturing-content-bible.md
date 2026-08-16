# Entrepreneur Simulator — Manufacturing Content Bible

**Status:** Design source of truth. All open questions resolved (§L). Ready for implementation.
**Reference product category:** Wooden Furniture (template for all future manufactured goods).
**Rule enforced throughout:** nothing here may be furniture-specific in a way that cannot generalize.
**Time scale:** unchanged — the existing month-based engine is kept (§K).

---

## 0. How to read this document

Every system below is tagged:

| Tag | Meaning |
|---|---|
| **EXISTS** | Already built and tested in the current engine. Reuse, do not rebuild. |
| **EXTENDS** | Built, but needs new depth for Manufacturing. |
| **NEW** | Does not exist in any form. |
| **REPLACES** | Supersedes something currently shipped — migration required. |

This matters because roughly a third of what the directive asks for is already running, and duplicating it would fracture systems that currently share one implementation across both industries.

### 0.1 What already exists that this Bible depends on

- **Company DNA / Philosophy** — the six axes in §21 of the directive are already implemented, live, and drive investor alignment, event outcomes and exit availability. They are the *same six axes*, named identically. This Bible does not redefine them.
- **Investors as characters** — 20 authored investors with philosophy spreads, gating behaviour, terms modulation, and cross-run standing.
- **Nemesis system** — rivals with persistent identity (seedId, logo, mission), encounter memory, posture adaptation, and disposition from nemesis to ally.
- **Meta-progression** — career record, 10 unlock markers, leader unlocks, founder classes/seeds/signature perks.
- **Business Model layer** — 3 axes × 3 options, committed at staggered stages, permanent with a compounding re-tool cost.
- **capacityDemand revenue model** — `revenue = min(capacity, demand) × 0.95`, idle capacity costs `0.22/unit`, demand decays `1.5/month`.
- **Six Manufacturing stages** across 84 months; AP per stage 2/3/3/4/5/4.
- **11 project tags**: Prototype, Team, Certification, Plant, Tooling, Sourcing, Line, Quality, Channel, Logistics, Capital.

### 0.2 The central architectural tension — **RESOLVED**

The current Manufacturing model is **two abstract numbers** (capacity, demand). This Bible describes a system with **products, materials, suppliers, inventory, equipment condition, and individual employees**.

Those cannot both be the source of truth for revenue.

**DECISION: capacity and demand become DERIVED meters.** They remain on screen, remain the inputs to revenue, and remain the exit gates — but they are *computed outputs* of the new systems rather than numbers projects set directly. Nothing downstream changes: every exit target, the Analyst forecast, the balance tables, and the full test suite keep working while the substance underneath becomes real.

```
capacity = Σ over equipment( capacityContribution × condition/100 × automationFactor )
           × laborAvailability          // do you have the people to run it
           × skillMatch                 // can they build THIS product
           − maintenanceDowntime

demand   = Σ over products( Σ over segments(
               segmentSize × product.appealSegments[segment]
             × priceElasticity(price, segment)
             × brandStrength(segment)
             × qualityPerception ))
           × trendModifier
           − demandDecay                // existing 1.5/month, unchanged
```

Revenue stays `min(capacity, demand) × marginPerUnit`. Idle capacity still costs `0.22/unit`; shortfall still costs reputation. The player now has *many* levers on each side instead of one, which is the entire point — but the meters they read, and the numbers we have already tuned, are untouched.

**Implementation consequence:** projects that currently grant flat `+capacity` / `+demand` must be re-expressed as grants of equipment, skill, brand, or segment access. That is a content migration, not an engine rewrite.

---

## A. Product System **NEW**

The single largest gap. No product entity exists today.

### A.1 Product attributes

Every product carries these. Values are illustrative ranges, not final balance.

| Attribute | Range | Drives |
|---|---|---|
| `materialCost` | 1–40/unit | Margin, working capital, supplier exposure |
| `materialTypes[]` | 1–4 refs | Which supply chains you are exposed to |
| `laborHours` | 0.5–20/unit | Headcount needed, bottleneck location |
| `skillRequired` | 1–5 | *Which* employees can build it, not just how many |
| `productionTime` | 1–8 weeks | Lead time to fulfil, inventory pressure |
| `equipmentRequired[]` | refs | Gate on capex; a product you cannot build yet |
| `complexity` | 1–5 | Defect rate baseline, training time, automation difficulty |
| `qualityCeiling` | 1–10 | Best achievable with perfect process — a cheap design caps out |
| `defectRateBase` | 0–0.25 | Modified by QC investment, equipment condition, skill |
| `appealSegments{}` | map | Demand per customer segment, not one global number |
| `priceFloor` / `priceCeiling` | money | The band pricing decisions operate inside |
| `scalability` | 1–5 | How well unit cost falls with volume |
| `retoolCost` | money | Cost to change the line to build this |

**Design rule:** no attribute may be a pure numerical modifier. Each must gate or unlock a *decision*. `skillRequired` is not "+2 difficulty" — it means a product you literally cannot build until you hire or train someone.

### A.2 The two anchor archetypes

These must both be viable and must produce different companies:

**Heirloom Dining Table** — materialCost high, laborHours high, skillRequired 4, qualityCeiling 9, scalability 1, premium segments only, high price band.
→ Produces a company that is small, margin-rich, talent-dependent, and fragile to skilled-employee poaching.

**Flat-Pack Side Table** — materialCost low, laborHours low, skillRequired 1, qualityCeiling 5, scalability 5, mass segments, thin price band.
→ Produces a company that is volume-dependent, capital-hungry, automation-rewarding, and fragile to demand shocks and price wars.

Every future product category must be expressible on these same axes.

### A.3 Product lifecycle

```
IDEA → PROTOTYPE → TESTING → PRODUCTION → LAUNCH → MARKET FEEDBACK → ITERATION → SCALE / PIVOT / RETIRE
```

Each transition is a **player decision with a cost**, never an automatic promotion.

| Phase | Cost | Player decision | Failure mode |
|---|---|---|---|
| **Idea** | 0 | Which concept to pursue; concepts come from R&D, events, trends, employee suggestions | Opportunity cost only |
| **Prototype** | Capital + weeks + a skilled employee's time | How much to spend — a cheap prototype tests less | Prototype fails; partial refund of knowledge |
| **Testing** | Capital + weeks | How rigorously? Skipping testing is faster and ships defects | Latent defect discovered post-launch (worse) |
| **Production** | Capex if equipment missing; retooling | Internal / outsourced / hybrid | Cannot produce at target cost |
| **Launch** | Marketing spend | **B2B or B2C** (§D) — the pivotal strategic fork | Launch into no demand |
| **Feedback** | — | Read the segment response | — |
| **Iteration** | Capital + weeks | Fix defects / cut cost / raise quality / widen appeal | Iterating forever instead of scaling |
| **Scale / Pivot / Retire** | — | Commit, redirect, or kill | Sunk-cost trap |

**Non-negotiable:** the player must never acquire a product by clicking "Research." They must remember developing it.

### A.4 Product portfolio

Multiple concurrent products, each with its own lifecycle position. Portfolio composition *is* company identity: three premium lines is a different company from one mass line, and both are legitimate.

| Stage | Concurrent products |
|---|---|
| Pre-Seed | 1 |
| Seed | 1 |
| Early | 1 |
| Growth | 2 |
| Expansion | up to 5 |
| Exit | up to 5 |

The 2 → 5 jump at Expansion is deliberate: Expansion is where the company stops being a manufacturer and becomes a *portfolio*, which is the stage transition the brief describes as "no longer building a business — building an organization."

### A.5 Product Adjacency **NEW** — why a furniture maker cannot pivot to computers

Without this, product count is a meaningless dial: a player at Expansion would add five unrelated products and the game would become a menu. Adjacency makes the portfolio a **capability tree** — you expand into what your existing resources already almost support.

#### A.5.1 Every product carries a resource profile

```
resourceProfile {
  materials[]     // oak, pine, plywood, MDF, steel fixings, foam, textile, glass, laminate
  equipment[]     // saw, planer, CNC, press, upholstery station, finishing line
  skills[]        // joinery, finishing, upholstery, machining, assembly
  channels[]      // which segments/routes it sells through
}
```

#### A.5.2 Adjacency score

Computed between a candidate product and everything the company **already has** — equipment owned, supplier relationships held, skills present in the workforce, channels established:

```
adjacency = 0.30 × materialOverlap
          + 0.30 × equipmentOverlap
          + 0.20 × skillOverlap
          + 0.20 × channelOverlap
```

Each overlap term is `|shared| / |required|` — the fraction of what the new product needs that you can already cover.

Equipment and materials are weighted heaviest because they are the ones that cost *capital and lead time* to acquire. Skills can be trained and channels can be built; a CNC machine and a lumber supply relationship cannot be conjured in a quarter.

#### A.5.3 Adjacency bands

| Score | Band | What it means | Cost to enter |
|---|---|---|---|
| ≥ 0.75 | **Line Extension** | Same materials, same machines, same people | Prototype cost only; weeks |
| 0.45–0.74 | **Adjacent** | Mostly shared; one new skill *or* one new machine | Moderate capex + training |
| 0.20–0.44 | **Stretch** | New material stream or new production capability | Major capex, new suppliers, quality risk while the line matures |
| < 0.20 | **Unrelated** | Effectively a different company | **Blocked** — requires acquiring a company that already does it, or building a new facility as an Expansion-stage project |

**Furniture → computers scores near zero on all four terms and is therefore blocked, not merely expensive.** That is the correct outcome and it falls out of the model rather than needing a special case. The only routes in are acquisition (§10 of the directive) or a dedicated new-facility project — both of which are appropriately enormous, late-stage commitments.

#### A.5.4 The wooden furniture product tree

Concrete illustration. Arrows show high-adjacency moves from a company that started with the Heirloom Dining Table:

```
Heirloom Dining Table  (oak, saw+planer+finishing, joinery, heirloom segment)
  ├─► Dining Chairs        0.82  Line Extension  — same everything, more joinery hours
  ├─► Coffee Table         0.88  Line Extension  — literally the same process, smaller
  ├─► Cabinetry            0.61  Adjacent        — adds hardware sourcing + hinge fitting skill
  ├─► Upholstered Seating  0.38  Stretch         — NEW: foam + textile suppliers, upholstery
  │                                                station, upholstery skill
  ├─► Flat-Pack Table      0.34  Stretch         — NEW: press + packaging equipment, MDF
  │                                                supply, mass-retail channel
  └─► Office Computers     0.02  Unrelated       — BLOCKED
```

Two things this produces that are worth protecting:

**It makes the supply chain matter to product strategy.** Owning lumber processing raises `materialOverlap` for every wood product at once — so a vertical-integration decision made for cost reasons quietly widens the product tree. That is exactly the kind of cross-system consequence the directive's §25 asks for.

**It makes the two anchor archetypes into genuinely different trees.** A company that started flat-pack has press equipment and mass-retail channels, so *its* adjacent moves are other flat-pack lines and its stretch move is heirloom-quality work. The Heirloom company sees the mirror image. Two runs starting from the same industry diverge into different capability sets from the first product decision.

#### A.5.5 Rule for future product categories

Any new manufactured category must be expressible as a `resourceProfile` on the same four dimensions. If a proposed category cannot be, it is a **new industry**, not a new product — and belongs in the industry system alongside Hospitality and Manufacturing rather than inside Manufacturing's product tree.

---

## B. Manufacturing Operations **EXTENDS**

### B.1 Equipment **NEW**

Equipment becomes an owned entity with state, not a capacity number.

| Field | Purpose |
|---|---|
| `type` | Saw, planer, CNC, press, finishing line, assembly station |
| `capacityContribution` | Units/week it enables |
| `condition` | 0–100, degrades with use; **the maintenance hook** |
| `precision` | Caps achievable quality — a worn machine cannot hit a high `qualityCeiling` |
| `automationLevel` | 0–3; reduces `laborHours`, raises capex and brittleness |
| `enablesProducts[]` | Hard gate — some products need a machine you do not own |
| `maintenanceCost` | Recurring, skippable, tempting to skip |

### B.2 Maintenance **NEW** — the emergent-story engine

The directive names this as the cascade generator, and it is the cheapest system to build that produces the storytelling the game wants.

Five stances, chosen per-facility, changeable:

| Stance | Cost | Effect |
|---|---|---|
| Preventive | High recurring | Condition decays slowly; failures rare |
| Corrective | Low recurring, high spike | Fix on failure |
| Replacement | Capex | Reset condition, chance to raise automation |
| Automation | High capex | Fewer labor hours, higher failure consequence |
| Neglect | Zero | Condition falls fast; failure probability compounds |

**The canonical cascade** — this exact chain must be reachable and legible in the log:

```
Neglected maintenance → equipment failure → production halt → late shipment
→ contract penalty → customer defects to a rival → cash shortfall
→ forced raise on bad terms → investor pressure → board confidence fall
```

Every arrow is an existing or specced system. This is the flagship example of §25 "decision chains, not one-turn effects."

### B.3 Inventory **NEW**

Three stocks tracked separately: **raw materials**, **work-in-progress**, **finished goods**.

Strategy is a standing choice, not a per-turn action:

| Strategy | Working capital | Resilience | Risk |
|---|---|---|---|
| Lean | Low | Low | Stockout halts production; cannot take large orders |
| Balanced | Medium | Medium | — |
| High | High (capital tied up) | High | Obsolescence, storage cost, waste on pivot |

**No universally correct answer** is enforced by making disruption frequency genuinely variable and by making large B2B contracts require stock on hand.

### B.4 Quality **EXTENDS**

Currently a project tag. Becomes a real subsystem with seven investable levers: inspection, testing, training, process control, calibration, supplier quality, quality personnel.

Effective quality is the **minimum** of what design, equipment, and people permit:

```
effectiveQuality = min(product.qualityCeiling, equipment.precision, workerSkill) − defectPenalty + qcInvestment
```

Minimum, not average — deliberately. It means you cannot buy your way out of one bad link, which is how manufacturing actually behaves and forces the player to find the weak point rather than spend uniformly.

**Poor quality:** returns, warranty claims, lost customers, reputation loss, contract penalties, recalls, regulatory attention.
**Excellent quality:** premium pricing, repeat customers, better contracts, lower warranty cost, brand reputation.

---

## C. Supply Chain **NEW** — the largest unbuilt system

### C.1 The chain

```
Forestry/Timber → Lumber Processing → Wood Components → Furniture Manufacturing
→ Warehousing → Distribution → Retail → Customer
```

The player begins at **Furniture Manufacturing** and may extend in either direction.

### C.2 Optionality is mandatory (directive §9)

Six legitimate end-states, none dominant:

1. Efficient manufacturer who buys lumber
2. Lumber processor supplying many manufacturers
3. Contract manufacturer building others' brands
4. Furniture logistics specialist
5. Consumer brand outsourcing all production
6. Vertically integrated conglomerate

**Balance rule:** vertical integration must be *powerful and slow*, never *strictly better*. Each owned tier adds capital requirement, management overhead, and a fixed cost that becomes a liability when demand falls. A specialist should out-margin an integrator in a downturn.

### C.3 Suppliers

| Field | Purpose |
|---|---|
| `tier` | Which chain position they occupy |
| `reliability` | 0–1; disruption probability |
| `leadTime` | Weeks; interacts with inventory strategy |
| `priceIndex` | Relative cost |
| `qualityGrade` | Feeds the `min()` in B.4 |
| `minimumOrder` | Locks out small players |
| `origin` | Domestic / international (§C.5) |
| `relationship` | −100..100, persistent — **mirrors the investor standing system that already exists** |

### C.4 Contract types

| Type | Price | Flexibility | Risk |
|---|---|---|---|
| Spot | Highest | Total | Price volatility |
| Short-term | Medium | Medium | Renewal risk |
| Long-term | Low | Low | **Locked in when demand changes** |
| Exclusive | Lowest | None | Single point of failure; competitor cannot use them either |
| Multi-source | Higher | High | Overhead, weaker relationships |

The directive's key line — *"a long-term cheap contract might look excellent until demand changes"* — is the design target. Long-term contracts must have a real minimum-purchase obligation that hurts in a downturn.

### C.5 Domestic vs international

| | Cost | Lead time | Reliability | Extra exposure |
|---|---|---|---|---|
| Domestic | Higher | Short | High | — |
| International | Lower | Long | Lower | Currency, tariffs, customs, geopolitical events |

International sourcing should be the correct choice often enough to be tempting, and wrong at exactly the moment it hurts most.

### C.6 Vertical integration as meta-progression **EXTENDS**

Ties directly into the existing unlock-marker system.

```
Exit a furniture run          → unlock Lumber Processing as a starting option
Exit with lumber owned        → unlock Wood Components
Exit with components owned    → unlock Forestry
Exit with a distribution arm  → unlock Retail
```

**Guard rail:** starting with a supply tier must not be a straight power increase. It should mean starting with *that tier's costs and obligations already on the books* — a lumber operation you must keep loaded. The unlock expands strategic possibility, per directive §23; it does not raise starting power.

---

## D. Commercial System **EXTENDS**

### D.1 The B2B/B2C fork

Chosen at Launch, per product. Neither superior.

| | B2C | B2B |
|---|---|---|
| Demand | Built slowly via brand; durable | Arrives in large contracted blocks |
| Margin | Higher per unit | Lower per unit, higher volume |
| Volatility | Steady, trend-sensitive | Lumpy; one lost account is a cliff |
| Investment | Marketing, channel, brand | Sales team, samples, relationships |
| Failure mode | Brand irrelevance | Customer concentration |
| Reputation | Consumer-facing; recalls are brutal | Contract-facing; reliability is everything |

A company can run both, but splitting investment means excelling at neither — an intentional tension.

### D.2 Customer segments

Segments replace the single global `demand` number:

- **Value consumers** — price-driven, volume, unforgiving on price
- **Design-conscious consumers** — trend-driven, brand-sensitive
- **Heirloom buyers** — quality-driven, tiny volume, enormous margin
- **Independent retailers** — B2B, moderate volume, relationship-driven
- **National retail chains** — B2B, huge volume, punishing terms, concentration risk
- **Hospitality/commercial** — B2B, spec-driven, **explicit cross-industry hook to the Hospitality game**
- **Property developers** — B2B, project-based, feast-or-famine

Each product's `appealSegments{}` determines who wants it.

### D.3 Pricing

Price sits inside the product's band. Raising it lifts margin and suppresses volume; lowering it does the reverse — but *also* moves the company's perceived premium/mass position, which feeds Company DNA and therefore investor alignment and exit availability.

---

## E. People **REPLACES**

Currently `laborPool` is a single integer. That cannot support skills, training, poaching, or unionization.

### E.1 Model — hybrid **DECIDED**

A full named-employee simulation for 40 workers is a different game. The model is:

- **Pool** — production workers as a headcount number with an average skill level. The worker bees: they set how much can be built, and they are hired, trained and laid off in bulk. Keeps the existing burn math intact.
- **Named key people** — a small set (3–8) tracked individually: master craftsperson, plant engineer, quality lead, maintenance tech, designer, sales lead. These are the ones who **materially affect whether the company succeeds** — they gate which products can be built at all (via `skillRequired`), set the quality ceiling, and determine whether a machine failure is a bad week or a catastrophe.

The split is also the story split. Named people can be poached, trained, promoted, burnt out, or quit — and each of those is an event with a name attached. The pool never generates a story; it generates a number.

**Existing mechanic to redirect:** rival talent raids currently steal abstract labor. They should target *named* people. "Kestrel Dynamics hired away Ana, your master craftsperson of six years — and your heirloom line needs joinery skill 4" is a crisis with consequences. "−2 labor" is arithmetic.

### E.2 Roles

Production workers · Skilled craftspeople · Engineers · Quality specialists · Maintenance technicians · Warehouse workers · Sales staff · Product designers · Managers

### E.3 Attributes (named specialists)

`skill` · `experience` · `productivity` · `morale` · `loyalty` · `compensationExpectation` · `ambition`

Loyalty and ambition are the poaching and promotion hooks. **Existing rival talent-raid mechanic should target named specialists rather than abstract labor** — losing "Ana, your master craftsperson of six years" is a story; losing "2 labor" is not.

### E.4 Training

Costs money and *time during which productivity falls*. Pays back later. The tension is deliberate: training is always correct long-term and often unaffordable short-term.

### E.5 Labor relations

Introduce lightly (directive §20): unionization drives, labor disputes, wage negotiations. Triggered by low morale, aggressive cost-cutting, safety incidents, or a strongly profit-leaning Company DNA — an explicit consequence of the philosophy axis rather than a random event.

---

## F. Finance **NEW** (0 finance projects currently exist)

The most conspicuous content gap in the shipped game: no project improves how the company handles money.

### F.1 Working capital — the missing pressure

Manufacturing binds cash in inventory and receivables. A profitable company can die of a cash gap. This is the most *characteristically manufacturing* financial pressure and is entirely absent today.

```
workingCapital = rawMaterials + WIP + finishedGoods + receivables − payables
```

### F.2 Instruments

Beyond the existing equity/instrument system: **inventory financing**, **equipment leasing** (lower capex, higher ongoing), **receivables factoring** (cash now at a discount), **trade credit** from suppliers (a *use* of supplier relationship).

### F.3 Finance projects to author

Cost accounting · Cash-flow forecasting · Procurement discipline · Credit control · Capital budgeting · Treasury/currency hedging (pairs with international sourcing)

---

## G. Competitors **EXTENDS**

### G.1 Archetypes

Six, each with a real weakness — these map onto the existing authored-company philosophy spreads, so **the 12 authored companies already shipped should be assigned archetypes rather than replaced**.

| Archetype | Focus | Weakness |
|---|---|---|
| Cost Leader | Automation, scale, price | Vulnerable to premium competition; brittle in downturn |
| Quality House | Craftsmanship, premium | High cost, cannot scale |
| Innovator | R&D, new materials | Burn rate, operational instability |
| Vertical Integrator | Owning the chain | Capital intensity, complexity |
| Outsourcing Specialist | Asset-light | Supplier dependency |
| Conglomerate | Acquisition, multi-product | Debt, integration failure |

### G.2 Competitor lifecycle **NEW**

Rivals currently grow, attack, poach and remember. The directive also requires them to: **raise capital, acquire, lose investors, change strategy, expand, enter new markets, fail, merge, become suppliers, become customers.**

Priority order for implementation:
1. **Fail** — a rival going bankrupt makes the market feel alive at the lowest cost
2. **Acquire each other** — consolidation the player watches and can race
3. **Become suppliers / customers** — enormous, and the disposition system already supports it
4. **Pivot / change strategy** — archetype migration in response to the player
5. **Merge** — two known rivals becoming one nemesis

### G.3 Nemesis **EXISTS**

Already implemented. The directive's examples map to existing mechanics; the missing ones are: *former supplier becomes competitor*, *competitor acquires something you wanted*, *former employee launches a rival* — all of which depend on systems above (suppliers, acquisitions, named employees).

---

## H. Event Taxonomy

Per directive §17 — a taxonomy, not hundreds of events.

### H.1 Required schema

Every event must specify all of:

```
trigger          — what state makes this possible (never purely random)
context          — the narrative situation
choices[]        — 2–4, each with a real cost
immediate        — this turn's consequence
longTerm         — persistent state change
cascade          — what this can cause later
systemsAffected  — which of the ten systems
dnaRelevance     — which philosophy axes it reads or moves
competitorHook   — optional rival involvement
investorHook     — optional investor involvement
```

### H.2 Categories with trigger conditions

| Category | Trigger condition | Example |
|---|---|---|
| **Supply** | Has supplier / low inventory / international sourcing | Key supplier raises prices mid-contract |
| **Equipment** | Condition below threshold | Machine fails during the largest order of the year |
| **Quality** | Defect rate above threshold | Employee discovers a defect *after* shipping |
| **People** | Morale low / specialist ambitious | A rival offers your master craftsperson double |
| **Labor** | Morale low + profit-leaning DNA | Unionization drive begins |
| **Customer** | Has B2B account | Largest account demands exclusivity |
| **Competitor** | Rival exists, disposition-gated | Rival begins selling below cost |
| **Market** | Trend state | A furniture style explodes; do you retool? |
| **Regulatory** | Compliance below threshold | Unannounced inspection |
| **Finance** | Working capital tight | Bank pulls the credit line |
| **Product** | Product in testing/launched | Prototype fails; product unexpectedly goes viral |
| **Opportunity** | Capital available | An acquisition target appears |

**Standard:** every event must test a decision the player already made. If an event could fire identically regardless of how the company was built, it is flavor text and does not belong.

### H.3 Cascade requirement

At least one event per category must be able to *start a chain* rather than resolve in one turn. The maintenance cascade (§B.2) is the reference implementation.

---

## I. Action Taxonomy

Actions must migrate from operational to executive as the company grows — directive §6.

| Stage | Player question | Action character |
|---|---|---|
| Pre-Seed | "Can I build one of these at all?" | Personally prototype, source materials, find first buyer |
| Seed | "How do we produce this repeatably?" | Hire first workers, buy first machine, set QC |
| Early | "How do we produce it *reliably*?" | Supplier contracts, maintenance stance, inventory strategy, B2B/B2C |
| Growth | "How do we produce far more of it?" | Second line, automation, distribution, new products |
| Expansion | "Where should the company be positioned?" | Acquisitions, vertical integration, market entry, portfolio |
| Exit | "What is this worth and to whom?" | Exit preparation, buyer courtship, structure |

The same *verb* should change meaning across stages: "Hire" at Pre-Seed is one craftsperson you interview personally; at Expansion it is authorizing a plant's headcount plan.

---

## J. Startup Progression — system availability by stage

| System | Pre-Seed | Seed | Early | Growth | Expansion | Exit |
|---|---|---|---|---|---|---|
| Product development | ● one | ● | ● | ● | ● | ● |
| Equipment | — | ● basic | ● | ● | ● | ● |
| Maintenance | — | — | ● | ● | ● | ● |
| Inventory strategy | — | — | ● | ● | ● | ● |
| Quality system | — | ● basic | ● | ● | ● | ● |
| Supplier contracts | spot only | ● short | ● all | ● | ● | ● |
| B2B/B2C | — | ● at launch | ● | ● | ● | ● |
| Named employees | 1–2 | ● | ● | ● | ● | ● |
| Training | — | — | ● | ● | ● | ● |
| Labor relations | — | — | — | ● | ● | ● |
| Automation | — | — | — | ● | ● | ● |
| Multi-product | 1 | 1 | 1 | ● 2 | ● up to 5 | ● up to 5 |
| Product adjacency | — | — | ● | ● | ● | ● |
| Acquisitions | — | — | — | ● small | ● | ● |
| Vertical integration | — | — | — | ● one tier | ● | ● |
| International sourcing | — | — | ● | ● | ● | ● |
| Working capital finance | — | — | ● | ● | ● | ● |

**Complexity must emerge, not arrive.** A Pre-Seed player sees a handful of controls; an Expansion player sees the full board. This gating is as important as the content itself.

---

## K. Time Progression **REPLACES** — the highest-risk change

The directive asks for weekly turns early, monthly later. The engine is month-based throughout: `stageOf(month)`, 84-month runs, every scaling table, all balance tuning, exit gates, and the entire test suite.

### K.1 Three options

**Option A — True variable turn length.** Weekly Pre-Seed/Seed, monthly from Early.
*For:* exactly what the directive describes. *Against:* invalidates every scaling table and balance number; every `month`-keyed system needs auditing; largest possible blast radius.

**Option B — Keep months, vary action density.** Turn length constant; early stages give more AP and finer-grained operational actions, later stages fewer but larger decisions.
*For:* zero migration; delivers the *felt* transition (hands-on → executive) which is the actual design goal; already partially true (AP is 2→5 by stage). *Against:* does not literally satisfy "one week per turn."

**Option C — Hybrid.** Pre-Seed/Seed run in weeks as a distinct "founding" phase with its own compressed rules, converting to the existing monthly engine at Early.
*For:* honest early-game texture, contained blast radius. *Against:* two engines to maintain; the conversion boundary is a likely bug source.

**DECISION: Option B now, Option C later.** The current month-based time scale is kept unchanged. The founder→executive transition is delivered through **action granularity and character**, not turn length — early-stage actions are hands-on and numerous, late-stage actions are few and large. Option C (a distinct weekly founding phase) is revisited only after the product and supply-chain systems are in place and stable, on the reasoning that introducing a second time engine while the underlying simulation is still being built would change too much at once.

**Consequence for content authoring:** the felt difference between Pre-Seed and Expansion must be carried entirely by §I's action taxonomy. If a Pre-Seed action and an Expansion action read the same way, the progression has failed and no time-scale change will rescue it.

---

## L. Design decisions — **ALL RESOLVED**

Recorded with reasoning so a future session does not relitigate them.

| # | Question | Decision |
|---|---|---|
| 1 | capacityDemand's fate | **Derived meters.** Computed from products/equipment/employees/segments; formulas in §0.2. Keeps the numbers fluid while the system stays put. |
| 2 | Time scale | **Option B now, C later.** Current month scale kept. Transition carried by action granularity (§K). |
| 3 | Employee granularity | **Hybrid.** Pooled workers as headcount; a small set of named key people who materially affect company success (§E). |
| 4 | Concurrent products | **1 / 1 / 1 / 2 / 5 / 5** by stage, gated by **adjacency** (§A.5) so expansion follows shared resources. |
| 5 | Supply-chain unlocks | **Obligation-with-capability.** Achievement that arrives with new responsibilities, not flat power (§C.6). |
| 6 | Build order | Locked below. |
| 7 | Hospitality cross-sell | **Yes.** Merging industries is a target, not a side effect (§D.2). |

### L.1 Locked build order

Each item depends on the ones above it. Supply chain sits last deliberately: it is the largest vision gap, but it cannot function until products exist to consume materials, equipment exists to process them, suppliers exist to provide them, people exist to run them, and finance exists to fund the working capital they tie up.

| # | System | Why it must come first | Unblocks |
|---|---|---|---|
| 1 | **Products + lifecycle + adjacency** | The spine everything attaches to; nothing else has meaning without something being *made* | Everything |
| 2 | **Equipment + maintenance** | Cheapest system that produces the game's signature cascading storytelling (§B.2) | Capacity derivation, quality ceiling, failure events |
| 3 | **Suppliers + inventory** | Materials must have a source and a cost of holding | Disruption events, contract strategy, working capital |
| 4 | **Named employees** | Skills gate products; loyalty gates poaching | Talent raids with stakes, training, labor relations |
| 5 | **Working capital / finance** | Manufacturing's characteristic way of dying: profitable but cash-starved | Inventory financing, the cash-gap cascade |
| 6 | **Competitor lifecycle** | A market that moves without the player | Rivals failing, acquiring, becoming suppliers |
| 7 | **Vertical integration** | Requires all six above to have anything to integrate | Supply-chain ownership, meta-progression tiers |

### L.2 Cross-industry hook — confirmed direction

The **Hospitality/commercial** customer segment (§D.2) lets a Manufacturing company sell furniture into the Hospitality world. This is the first concrete bridge between industries and should be treated as a template, not a one-off: each future industry pair should be asked "what does one buy from the other?"

Longer term this is what makes the shared simulation engine pay off — a rival in one industry becoming a supplier in another is already supported by the existing disposition system.

---

## L.3 Sequencing note for implementation

Items 1–7 in §L.1 are each large enough to be their own session or several. Recommended first slice for coding is **Products alone** — attributes, the lifecycle state machine, adjacency scoring, and the derived-capacity/demand migration — with equipment stubbed. That produces a playable, testable change with a clear before/after, rather than a half-finished six-system rewrite.

---

## M. Known defects this Bible does not address

Carried forward so they are not lost:

- `systemAudit()` ignores its industry argument — always reports Hospitality's projects
- Manufacturing has **0 minor events**; it runs Hospitality's deck, including the Celebrity Visit bug where a revenue grant is immediately overwritten by the capacityDemand model
- Predatory nemesis: 0% win / 91% insolvent at N=100 — parked for tuning
- Analyst/Statesman cannot style-match — no authored co-founders in those classes
- Late game unreachable: 0 of 160 runs reached the final stage of either industry
