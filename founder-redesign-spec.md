# Founder Class & Perk Redesign — Implementation Spec

**Status:** DESIGN COMPLETE AND APPROVED. All four open questions resolved (§10 records the
decisions and what each one changed). Written as a handoff document: a coding session with no
memory of the design conversation should be able to implement from this file alone.

**Design goal (from the brief):** founders remembered for *how they build companies*, not for
+4 Innovation. Classes define how founders think; Signature Perks define what makes them
exceptional; Philosophy defines who they become; Seeds define where they came from.

---

## 0. Codebase orientation (for the implementing session)

- Single artifact: `founder-hospitality-prototype.jsx` (locked decision).
- All gameplay handlers live in one block bounded by the `END HANDLER BLOCK` sentinel comment;
  `build_harness.mjs` lifts that block verbatim into a headless test harness. **Any new handler
  logic must stay above the sentinel and depend only on `setGame`/`language`/`t`/
  `knownCompanyNamesRef`.** After edits: regenerate harness, rebuild both esbuild bundles, run
  all six test suites (currently 372 tests) plus the new suite this spec defines.
- Established aggregator pattern: `activeTermEffects(game)` (funding terms) and
  `activeModelEffects(game)` (business model) return effect objects read at engine sites. This
  spec adds a third: `founderFx(game)` (§5). Follow the same contract: multiplicative modifiers
  compose; call sites never know which perks exist.
- Existing founder module sits at the `FOUNDER IDENTITY & META-PROGRESSION` banner (~line 4964):
  `FOUNDER_CLASSES` (3), `FOUNDER_PERKS` (13, delta-based — being replaced), `UNLOCK_MARKERS`
  (10 — kept, grants remapped), XP curve, point-buy config, adapters.
- The custom founder enters runs via `customFounderToLeader()` → normal leader shape. The team
  is `game.team.leaders`; the custom founder is identifiable by `l.id === CUSTOM_FOUNDER_ID`
  and `l.isCustom === true`.

---

## 1. The four-layer founder

```
Seed       → where they came from (new; §2)
Class      → how they solve problems (3 → 5; §3)
Signature  → what makes them exceptional (class-exclusive, 4 per class; §4)
Philosophy → who they become (exists; gains creation-time nudges; §7)
```

New custom-founder schema (replaces the current one; migration in §8):

```javascript
{
  id: 'custom',
  name: string,
  seedId: string,            // one of FOUNDER_SEEDS
  classId: string,           // one of 5
  signaturePerkId: string,   // from the chosen class's pool of 4
  generalPerkId: string|null,// from unlocked general pool (§6); null until first unlock
  statPoints: {stat: n},     // unchanged point-buy
  portraitSeed: string, portrait: {...}, createdAt: number,
}
```

New per-run state (add to `initialState` and `GAME_FIELD_DEFAULTS`):

```javascript
perkState: { cooldowns: {}, firedOnce: {} }   // perkId -> month / true
```

---

## 2. Seeds (6) — flavor-first, mechanically light

**Decision:** Seeds give narrative identity, a starting philosophy lean, and ONE small
one-time starting delta. No ongoing modifiers — identity load belongs to class + signature,
and a fourth ongoing-modifier layer would blur attribution ("why did that happen?" must stay
answerable). **Approved (decision 3, §10) on exactly that attribution-clarity reasoning** —
Seeds stay flavor-first; do not add ongoing Seed modifiers later without revisiting §10.

| id | Name | Starting delta | Philosophy seed |
|---|---|---|---|
| `familySurvivor` | Family Business Survivor | +3 Morale | riskVsStability −10, peopleVsProfit +8 |
| `laidOffEngineer` | Laid-Off Engineer | +1 Operations stat | innovationVsExecution −8, riskVsStability +5 |
| `serialDropout` | Serial Dropout | +1 Presence | riskVsStability +12, centralizedVsDelegated −6 |
| `immigrantStriver` | Immigrant Striver | +10 Capital | growthVsSustainability +8, peopleVsProfit +5 |
| `corporateDefector` | Corporate Defector | +4 Board Confidence | centralizedVsDelegated +8, premiumVsMass +5 |
| `academyProdigy` | Academy Prodigy | +1 Innovation stat | innovationVsExecution +12, premiumVsMass +6 |

Each seed carries a bilingual 2–3 sentence origin blurb (write in the voice of the investor
bios — specific, wry, no adjectives-as-praise). Seed blurb + name render on the customize
screen and in the founder's Index/detail views.

---

## 3. Classes: 3 → 5

### Critical structural decision — how new-class mechanics attach

The three existing classes deliver their mechanics through `team.style`, which only sets when
**both** leaders share the style. No authored founder is an Analyst or Statesman, so a
style-match is impossible for them. **Decision:** Analyst and Statesman mechanics attach to the
custom founder's *presence* on the team (`leaders.some(l => l.isCustom && classId === X)`),
independent of style match. The three legacy classes keep their style-match delivery unchanged
(no regression risk, and pairing-for-the-bonus remains a real decision for them). This
asymmetry is **explicitly temporary**: decision 1 (§10) approved a content pass authoring
founders for all five classes with no style overlap between them (§11). Once that lands, all
five classes style-match identically and this paragraph should be deleted along with the
presence-based special case. Ship the engine work first — it does not depend on the content.

### 3.1 Visionary — "I see tomorrow." (existing mechanic, unchanged)
Once per month, an Invest action costs no AP. Already wired.

### 3.2 Operator — "I make impossible things routine." (existing, unchanged)
Projects finish 1 month sooner; fundraising −15 to the roll. Already wired.

### 3.3 Hustler — "I'll find a way." (existing, unchanged)
Fundraise costs 1 less Presence; morale losses softened by 2. Already wired.

### 3.4 Analyst — "I don't gamble. I calculate." (NEW)
Three mechanics, all with existing hook sites:
- **Calculated:** event and choice-event severity ×0.8. Hook: `resolveEvent` /
  `resolveChoiceOption` already take an industry param; add `founderFx` severity multiplier the
  same way (§5).
- **Forewarned:** success percentages are *displayed* before committing — on funding
  instruments (the chance `investorTerms` + rep/BC math already computes), choice-event options
  (d10 threshold → %), and external actions. Engine work: expose a pure
  `previewChance(kind, ...)` helper above the sentinel; UI renders it only when the Analyst is
  on the team. This is the class's identity moment — knowledge as the mechanic.
- **Measured:** minimum funding success chance floor raised 4 → 12, and board-confidence loss
  from failed raises halved. Hooks: the `clamp(chance, 4, 95)` lines in `handleFundraise` /
  `handleFundingInstrument`; the fail-branch `applyDelta`.

### 3.5 Statesman — "Power comes from relationships." (NEW)
- **Standing Invitation:** effective investor alignment +0.08 (applied inside
  `investorAlignment()` result before banding/terms — a Statesman is simply easier to read).
- **Peacemaker's Patience:** coexistence requirement 12 → 8 months (`tickCoexistence` reads an
  override from `founderFx`).
- **Compounding Name:** positive reputation deltas ×1.15, rounded. Hook: `applyDelta` — gate
  carefully: only when `draft.team` contains the custom Statesman, only `delta.reputation > 0`.

Class `philosophyLean` (applied once at run start, like the existing three): Analyst
`{riskVsStability: −12, innovationVsExecution: −5}`; Statesman
`{centralizedVsDelegated: −8, peopleVsProfit: +6}`.

---

## 4. Signature Perks — 20 (4 per class, class-exclusive)

**Decision (Q2, approved):** signatures unlock in two waves for longer progression. Per class:
**2 starters** available immediately, **1 gated behind a career milestone** (a global
`UNLOCK_MARKERS` id — cross-class achievement), **1 gated behind class mastery** (a personal
record of playing *that class*). The class-mastery gate is what makes the fourth signature feel
earned by commitment to a playstyle rather than by general progress.

Each signature = **one passive/trigger mechanic** (the identity) + a modest **Operate active**
(1 AP) so the Operate button stays meaningful. Actives may include deltas; passives may not be
flat stat grants.

### 4.0 New tracking required: `career.byClass`

Class mastery gates need per-class play records, which nothing currently stores. Extend
`accumulateCareer` (it already receives the finished run) to also write:

```javascript
career.byClass[classId] = {
  runs, wins, months,        // cumulative
  bestStageIndex,            // furthest stage reached with this class, as stageOrder index
}
```

`classId` comes from the custom founder on the team; runs without a custom founder (Quickplay/
Blitz) contribute nothing, consistent with the existing rule that they don't feed career.
`evaluateUnlocks` stays untouched — signature gates are evaluated separately by
`availableSignatures(classId, career, unlockedIds)` so the 10 markers keep their current meaning.

Gate checks are **pure recomputes from `career.byClass`**, never cached — the same rule that
governs `evaluateUnlocks` and `deriveDisposition`.

Cooldown bookkeeping: `perkState.cooldowns[perkId] = month` for per-N-months triggers;
`perkState.firedOnce[perkId] = true` for once-per-run moments. Every trigger that fires MUST
emit a ticket — these are the memorable moments; a silent trigger is wasted design.

Gate legend: **★** = starter · **C** = career-gated (marker id) · **M** = class-mastery gated.

### Visionary
| Perk | Gate | Passive mechanic | Operate active |
|---|---|---|---|
| **Blue Ocean** | ★ | Projects with `requires.length === 0` (frontier work) cost ×0.85 and finish 1 month sooner | +4 Demand (capDem) / +3 Market Position (other) |
| **Product Evangelist** | ★ | Every completed project → +2 Reputation, with ticket ("the story writes itself") | Convert 3 Presence → +6 Demand or +4 Reputation |
| **Future Market** | C `publicCompany` | Each stage transition → +4 Market Position ("she was already there") | +3 Presence |
| **Moonshot Founder** | M: 3 Visionary runs **and** 1 Visionary win | Once per run: completing a project with base capital cost ≥8 fires **Breakthrough**: +8 Rep, +6 MP, +1 Innovation stat. COST: all event severity ×1.1 (risk courted) | +2 Innovation-check bonus this month (store flag) |

### Operator
| Perk | Gate | Passive | Active |
|---|---|---|---|
| **Kaizen** | ★ | Every 12 months: permanent +1 burnReduction, capped at +4, with ticket | −1 Burn this month |
| **Lean Six Sigma** | ★ | Project capital costs ×0.9 | +2 Operations-check bonus this month |
| **Factory Whisperer** | C `industrialist` | capDem industries: idle capacity causes no idleBurn; shortfall repHit ×0.5. Others: location overhead −1 | +4 Capacity / +2 Morale |
| **Master Scheduler** | M: 3 Operator runs **and** reach Growth as Operator | Active projects add **zero** to burn (remove the `activeProjects.length` term) | Reduce one active project's remaining time by 1 month |

### Hustler
| Perk | Gate | Passive | Active |
|---|---|---|---|
| **Handshake Deal** | ★ | Once per run, when capital < burn×3: a rostered angel-stage investor wires 15k automatically, named in the ticket (ties investor system in) | +3 Presence |
| **Street Smart** | ★ | External actions vs rivals: −1 Presence cost, +1 to the roll | +2 Agility-check bonus this month |
| **Community Builder** | C `restaurateur` | 15%/month: +3 free Demand (capDem) or +2 Reputation (other) — "the regulars bring friends" | +3 Morale, +1 Reputation |
| **Natural Recruiter** | M: 3 Hustler runs **and** 1 Hustler win | Recruit grants +1 extra labor; talent-raid defense bar +2 in your favor | Recruit 1 labor at no capital cost (still 1 AP) |

### Analyst
| Perk | Gate | Passive | Active |
|---|---|---|---|
| **Data Driven** | ★ | Choice events show exact success % AND threshold −1 | +3 Board Confidence |
| **Scenario Planner** | ★ | Stage transitions: +3 Board Confidence and the transition ticket lists the next stage gate's targets | +2 Compliance-check bonus this month |
| **Risk Model** | C `dealmaker` | Once per quarter: the first failed d10 check is rerolled, ticket "the model caught it" | Peek: next month's event roll shown |
| **Predictive Analytics** | M: 3 Analyst runs **and** reach Expansion as Analyst | Monthly event chance ×0.85 | Suppress this month's random event roll entirely (once per 6 months) |

### Statesman
| Perk | Gate | Passive | Active |
|---|---|---|---|
| **Diplomat** | ★ | Disposition damage from your attacks ×0.5; each coexistence credit grants +1 extra | +2 disposition with a chosen rival |
| **Lobbyist** | ★ | Events defended by `compliance` get +3 to the defense roll | +2 Compliance-check bonus this month |
| **Coalition Builder** | C `peacemaker` | Ally burn relief: 3/ally (was 2), cap 9 (was 6) | +2 Presence, +1 Board Confidence |
| **Public Servant** | M: 3 Statesman runs **and** `kingmaker` | Reputation floor of 25 (never fully collapses); while Rep ≥ 60, +1 Board Confidence/month | +3 Reputation |

**Why these four are the mastery gates:** each is the perk that most changes how its class is
played rather than how well it performs — Moonshot converts the Visionary into a gambler,
Master Scheduler removes a burn term the whole economy is balanced around, Natural Recruiter
makes labor cheap, Predictive Analytics suppresses the event system, Public Servant makes
reputation collapse impossible. They are the strongest in each pool by design, and they should
be the reward for committing to a class across multiple runs.

**Starter-pair balance note for the implementing session:** every class's two starters are
deliberately *low-ceiling and immediately legible* (a cost multiplier, a per-project trigger),
so a first-time player of any class gets a working identity without a cliff. Do not tune the
starters up to match the gated pair — the gap is the progression.

Each signature also nudges philosophy once at run start (±4–8 on 1–2 axes, listed per-perk in
data; e.g. Moonshot `riskVsStability +8`, Kaizen `innovationVsExecution −6`). Picking a
signature is a statement about who this founder is; philosophy should hear it.

---

## 5. `founderFx(game)` — the effects aggregator

Mirror `activeModelEffects` exactly. Returns neutral object when no custom founder on team.
Reads classId + signaturePerkId + generalPerkId from the custom leader (stash the founder
config on the leader in `customFounderToLeader` so the aggregator needs only `game`).

Effect keys and their single hook site each:

| Key | Neutral | Hook site |
|---|---|---|
| `eventSeverityMult` | 1 | `resolveEvent`, `resolveChoiceOption` (already industry-parameterized — add founderFx the same way) |
| `eventChanceMult` | 1 | endMonth monthly-event roll |
| `choiceThresholdBonus` | 0 | `resolveChoiceOption` |
| `projectCostMult` / `projectSpeedBonus` | 1 / 0 | `handleInvest` (stacks with modelFx) |
| `frontierCostMult` / `frontierSpeedBonus` | 1 / 0 | `handleInvest`, gated on `proj.requires.length === 0` |
| `burnFlat` / `activeProjectBurnFree` | 0 / false | endMonth burn formula |
| `idleBurnFree` / `shortfallRepMult` | false / 1 | capacityDemand block |
| `fundraiseChanceFloor` / `fundraiseFailBCMult` | 4 / 1 | both raise handlers |
| `demandGenChance` / `demandGenAmount` | 0 / 0 | endMonth (capDem) or reputation fallback (other) |
| `reputationGainMult` | 1 | `applyDelta` (positive rep only, custom-on-team only) |
| `raidBarBonus` | 0 | `attemptTalentRaid` |
| `externalRollBonus` / `externalPresenceDiscount` | 0 / 0 | `handleExternalAction` |
| `dispositionDamageMult` / `coexistCreditBonus` / `coexistMonthsOverride` | 1 / 0 / null | attack recording, `tickCoexistence` |
| `allyReliefPer` / `allyReliefCap` | 2 / 6 | `allyEffects` |
| `alignmentBonus` | 0 | `investorAlignment` |
| `complianceDefenseBonus` | 0 | event defense where `defendStat === 'compliance'` |
| `repFloor` | 0 | `applyDelta` clamp |
| `rivalGrowthMult` | 1 | rival monthly growth call site |
| `exitTargetMult` | 1 | `exitProgress` numeric targets |
| `rosterXpMult` | 1 | `Store.commitFounderRun` |
| `capacityEffMult` | 1 | capacityDemand throughput |

Triggers (evaluated in endMonth, after events, before game-over checks) are a separate ordered
list `FOUNDER_TRIGGERS` keyed by perkId: `{ when(draft, founderFx, month), fire(draft, month, tickets, language) }`,
each consulting/writing `perkState`. Keep triggers OUT of the pure-effects object — they mutate.

---

## 6. General Perks — 10, category-organized, unlock-gated

The 10 existing `UNLOCK_MARKERS` are kept verbatim (names, checks, statPoints). Their `grants.perks`
remap to the new general pool. Old delta-perks are deleted (migration §8).

| Category | Perk | Mechanic | Unlocked by |
|---|---|---|---|
| Financial | **Roadshow Veteran** | fundraise chance ×1.12; failed raises cost no Board Confidence | publicCompany |
| Financial | **Inner Circle** | investor grace periods +3 months; equity demands ×0.92 | kingmaker |
| Leadership | **Firefighter** | Morale < 35 → restored to 50, once per 12 months, with ticket | turnaroundSpecialist |
| Leadership | **Natural Mentor** | roster founders on your team earn ×1.25 XP | endurance |
| Innovation | **Patent Portfolio** | rival market-position growth ×0.85 ("they need longer to copy you") | nemesis |
| Innovation | **Skunkworks** | Once per run, Operate (2 AP): instantly complete an active project with ≤2 months left | dealmaker |
| Market | **Closer** | exit numeric targets ×0.95 | firstExit |
| Market | **Trend Hunter** | new rivals arrive with a dossier (posture + weakest stat in the spawn ticket); +2 on your first external action vs each rival | peacemaker |
| Industrial | **Automation Pioneer** | effective capacity ×1.15 once capacity ≥ 30 (efficiency emerges at scale) | industrialist |
| Industrial | **Quality First** | shortfall/idle reputation penalties ×0.5 (capDem); negative event reputation deltas ×0.85 (other) | restaurateur |

Two mappings are thematically loose (peacemaker→Trend Hunter, dealmaker→Skunkworks) — noted
deliberately rather than papered over; re-map freely if better pairings emerge in writing.

One `generalPerkId` slot on the founder. `availableGeneralPerks(unlockedIds)` replaces
`availablePerks`. Validation: signature must belong to `classId`'s pool; general must be
unlocked or null.

---

## 6b. Roster founder progression — tiers and signature slots (Q4, approved)

Pre-authored roster founders were previously capability-only (earned stat points, fixed
identity). Approved change: **harder-to-recruit founders are meaningfully more powerful**, and
**high-level roster founders eventually unlock a signature slot**.

### Tiers

Add `tier` to every authored leader. Tier determines both how they're acquired and their
ceiling.

| Tier | Name | Acquisition | Signature slot | Notes |
|---|---|---|---|---|
| 1 | **Available** | On the roster from the first run | At **level 5** | The current six per industry become tier 1 |
| 2 | **Recruited** | Unlocked by a career marker (each tier-2 founder names one) | At **level 4** | New content; ~4 per industry |
| 3 | **Legendary** | Unlocked by a *compound* condition (two markers, or a marker + a class-mastery record) | At **level 3**, and may take a **Legendary signature** (§6c) | New content; ~2 per industry, deliberately rare |

Acquisition is evaluated by a pure `availableRosterFounders(career, unlocked)` recompute, same
rule as everything else. A newly-unlocked founder should announce itself on the customize screen
(a "New founder available" banner on the roster panel) — an unlock the player never notices is a
wasted unlock, the same reasoning behind triggers emitting tickets.

### Signature slots on roster founders

When a roster founder reaches its tier's slot level, the player may equip **one signature perk
from the pool matching that founder's own `style`/class** — chosen in the existing
`FounderDetailModal` Perks tab (which already renders equipped-vs-locked and needs only an
equip control added). Rules:

- The signature is chosen from that founder's class pool, subject to the **same career and
  class-mastery gates** in §4 — a roster Operator cannot equip Master Scheduler until the player
  has earned it. Gates are account-wide, not per-founder.
- The founder's **authored trait and operate ability are unchanged** — the signature is
  additional, consistent with the locked rule that authored identity is fixed while capability
  grows.
- A roster founder's signature contributes to `founderFx` exactly like the custom founder's
  (§5); the aggregator must therefore scan **all team leaders**, not only the custom one. This is
  a change from §5 as originally written — see the implementation note below.
- Equipping is re-editable between runs, like everything else on the customize screen.

> **Implementation note (supersedes §5's "custom founder only" reading):** `founderFx(game)`
> aggregates over every leader on the team that has a `signaturePerkId`, plus the custom
> founder's `generalPerkId`. Two leaders carrying the *same* signature do not stack — take the
> single strongest instance per perk id. Class mechanics (§3) remain custom-founder-only;
> only signature perks travel with roster founders.

### 6c. Legendary signatures (tier 3 only) — 5, one per class

Tier-3 founders may take one of these *instead of* a normal class signature. These are the
"more unique/powerful abilities" that justify a hard unlock. Each is strictly stronger than a
normal signature and deliberately warps one system.

| Class | Legendary | Mechanic |
|---|---|---|
| Visionary | **Category Creator** | The first project completed in each stage grants +6 Market Position and permanently +1 to a random Company Stat. Ticket names the stat. |
| Operator | **Zero Defects** | Capacity shortfalls cost no reputation, and idle capacity generates +1 Demand/month instead of idle burn (capDem); non-capDem: burn −3 flat. |
| Hustler | **Rainmaker** | Fundraise and funding instruments cannot roll below 35% success; the first failed raise each run is retried free. |
| Analyst | **Perfect Information** | All success percentages shown everywhere (not just Analyst-class sites), and once per run the player may cancel a resolved negative event outright ("we saw it coming"). |
| Statesman | **Elder Statesman** | Investor grace periods +6 months, all rival disposition starts at +15, and coexistence credits accrue in 6 months rather than 12. |

Legendary signatures are **not** available to the custom founder — they are the reward for
recruiting and developing a rare authored founder, which keeps tier-3 founders desirable rather
than strictly-worse copies of a fully-built custom founder.

---

## 7. Philosophy integration

- Seed philosophy values + class `philosophyLean` + signature nudge all apply **once, at run
  start** (in `initialState`, after team assembly, custom-founder-present only).
- Nothing else changes: run-time philosophy still accumulates from tagged choices exactly as
  today, and the career-level custom founder remains the memory anchor.

---

## 8. Migration (old saves must load)

`Store.getFounders()` migrates on read (same pattern as `migrateDoc`):
- Missing `seedId` → `'laidOffEngineer'` (the most neutral origin).
- Legacy `perkId` present → `signaturePerkId` = first signature of `classId`
  (Visionary→Blue Ocean, Operator→Kaizen, Hustler→Handshake Deal); `generalPerkId` = mapped
  legacy perk if its marker is in `unlocked`, else null. Legacy map: closer→Closer,
  turnaround→Firefighter, bellRinger→Roadshow Veteran, warmIntro→Inner Circle,
  supplyPartner→null(Coalition Builder is now a Statesman signature — drop with a log line),
  pressAdvantage→Trend Hunter, toolmaker→Automation Pioneer, fullHouse→Quality First,
  termSheet→Inner Circle, institutional→Natural Mentor, all four old starters→null.
- Delete `perkId` after mapping. Bump the founders doc schema version.

---

## 9. Test plan (new suite: `founder_perks_test.cjs`)

1. **Data integrity:** 5 classes; 4 signatures each, ids unique, all bilingual, every signature
   has passive spec + active deltas + philosophy nudge; 10 general perks, 2 per category, every
   marker grants exactly one that exists.
2. **founderFx:** neutral without custom founder; each effect key reaches its engine number
   (measure real deltas, pin `Math.random` where events would contaminate — the established
   technique from `business_model_test.cjs`).
3. **Per-signature behavior:** one focused test each for all 20 + all 10 general (Firefighter
   fires at <35 and not again within 12 months; Handshake Deal names a real rostered investor
   and fires once; Master Scheduler's burn excludes active projects; Risk Model rerolls once per
   quarter; Moonshot's severity cost is real; etc.).
4. **Class mechanics:** Analyst severity/floor/BC-halving; Statesman alignment/coexistence/rep
   compounding; legacy three unchanged (regression).
5. **Migration:** old-shape doc loads, maps correctly, round-trips.
5b. **Signature gating (§4/§4.0):** exactly 2 starters per class available on a blank career;
   each career-gated signature appears only once its marker is earned and not before; each
   mastery-gated signature requires *both* its run count and its condition (test the boundary —
   2 runs must not unlock it, 3 must); `career.byClass` accumulates runs/wins/months/bestStage
   only for runs with a custom founder, and Quickplay contributes nothing.
5c. **Roster tiers and signature slots (§6b/§6c):** tier-1 founders available on a blank career,
   tier-2/3 not; slot unlocks at the tier's level and not before; a roster founder's equipped
   signature reaches `founderFx` and its mechanic fires in a live run; two leaders carrying the
   same signature do not stack; Legendary signatures are equippable only by tier-3 founders and
   never by the custom founder; account-wide gates apply to roster equips too.
6. **Playtest batches** (extend `behavior_playtest.cjs`): N=200 per class, same bot, report
   outcome distributions + class-relevant metrics (Analyst: events suffered/severity taken;
   Statesman: allies formed, alignment at raise time; Visionary/Moonshot: breakthroughs fired).
   Verdict checks must be directional, not `Math.abs` (lesson from the standing playtest).

## 9b. Implementation order (suggested session split)

1. Data + `founderFx` + passive hooks (costs, burn, severity, alignment, floors) + tests §9.1–2
2. Triggers, once-per-run moments, `perkState`, tickets + tests §9.3–4
3. UI (seed/class/signature/general pickers, Analyst probability previews), migration + §9.5
4. Playtest batches, then number tuning **only after** results (standing rule)

---

## 10. Decisions (all resolved — recorded with what each changed)

1. **Authored founders for all five classes → BACKLOG (approved).** Content pass tracked in §11.
   Until it lands, Analyst and Statesman deliver via custom-founder presence (§3); once it
   lands, all five classes style-match identically and §3's asymmetry note can be deleted.
   Explicit requirement from the decision: **no style overlap between classes** — every authored
   founder belongs to exactly one class, and each class gets its own dedicated founders rather
   than founders being reskinned across classes.
2. **Gate 2 of 4 signatures → APPROVED.** Specced in §4/§4.0: 2 starters, 1 career-gated,
   1 class-mastery-gated. Requires new `career.byClass` tracking (§4.0).
3. **Seeds stay flavor + one-time delta → APPROVED on attribution clarity.** §2 unchanged.
4. **Roster founders unlock signature slots → APPROVED,** with power scaling to unlock
   difficulty. Specced in §6b/§6c: three tiers, slot level by tier, and five tier-3-only
   Legendary signatures. This changed `founderFx` from custom-founder-only to team-wide for
   signature perks (implementation note in §6b).

---

## 11. Backlog (post-implementation content passes)

- **Authored founders for all five classes, no style overlap** (from decision 1). Target shape:
  per industry, ~2 tier-1 founders per class (10), ~4 tier-2, ~2 tier-3 — roughly 16 per
  industry vs. the current 6. Each needs name, role, bilingual bio, portrait seed, trait,
  operate ability, `statBonus`, `tier`, and (tier 2/3) an unlock condition. This is a large
  writing pass and should be its own session; the engine work in §1–§9 does not depend on it and
  should ship first with the existing six as tier 1.
- Equip-signature control in `FounderDetailModal`'s Perks tab (§6b) — small UI addition, but
  worth its own pass since it also needs the "New founder available" banner.
- Revisit whether tier-2/3 founders should also carry richer *authored* traits, now that
  tier implies power.
