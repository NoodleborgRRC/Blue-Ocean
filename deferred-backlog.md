# Entrepreneur Simulator — Deferred Work Backlog

Items deliberately flagged rather than fixed, with enough context to pick up cold.
Ordered by when they should be revisited.

---

## 1. ~~Manufacturing has no location projects~~ — **RESOLVED**
The four genuine facility projects (`mfgPilotWorkshop`, `mfgSecondPlant`, `mfgThirdPlant`,
`mfgInternationalPlant`) now carry `isLocation: true` alongside their existing `isPlant: true`.

**Recommendation changed on inspection.** The backlog recommended option B (author new location
projects). Reading the actual data made that wrong: these projects are literally named "Open the
Pilot Workshop" / "Open a Second Facility" / "Overseas Manufacturing Facility" — they ARE
locations. Authoring parallel content would have duplicated what already existed. The equipment
entry models a facility's *production capability*; the location flag models it as *a place that
needs a manager and carries overhead*. Both are true of a facility; that is not double-counting.

Verified end to end: completing a facility grants a location AND equipment → manager slot opens →
manager hireable, assignable, perk goes live. Balance after: Manufacturing 36-44%, unchanged
within normal variance.

---

## 1b. ~~Vertical integration was unreachable in the UI~~ — **RESOLVED**
Found while starting the locations work, and larger than the locations gap itself:
`handleBuildTier`, `handleAcquireRival` and `handleSellTier` each had exactly **one** reference in
the whole file — their own definition. Items 7a and 7b were fully built and fully tested but
completely unreachable by a player.

`SupplyChainPanel` now renders the full ladder (upstream → your own position → downstream) in the
Invest tab, with the retail co-location fork, sell-off, chain overhead summary, and player-side
rival acquisition. Every handler now has a UI call site.

**Process note:** a handler with no UI reference is invisible to the test suite, since tests call
handlers directly. Worth a periodic reachability audit (`grep -c` per handler) rather than
trusting green tests to mean playable.

---

## 2b. ~~Item 7b — Forward integration~~ — **SHIPPED**
Warehousing / Distribution / Retail are built and live. Each lands on a different system:
warehousing on inventory (item 3), distribution on margin + receivable terms (item 5), retail on
margin + the channel gate (item 1). Co-location implemented per direction. 64 tests.

---

## 2c. Tiered integration as separately ownable positions (design option B)
**Flagged:** build order item 7a
**Revisit:** after 7b, if the ladder proves too thin
**Severity:** design richness

7a implements **option C**: acquiring a supplier grants its tier, and higher tiers become
buildable once you hold the one below. That reuses the item 3 supplier system as the on-ramp and
produces a real ladder, but a tier is currently a single binary flag — you own Lumber Processing
or you don't.

**Option B** would make each tier a genuine ownable *position* with its own capacity, condition,
and failure modes — closer to how `EQUIPMENT_CATALOG` models machines. That would let a player own
two processing facilities, have one go down, run one at capacity and one idle, and so on.

Worth doing only if playtesting shows the binary flag feels thin. It is a substantial system, and
option C may well carry the strategic weight on its own.

---

## 3. ~~`systemAudit()` ignores its industry argument~~ — **RESOLVED**

**The bug was deeper than the title.** `systemAudit()` took no industry argument at all AND
`TAG_TO_SYSTEM` mapped only Hospitality's nine tags — so even passing an industry would have
counted **zero across every system** for Manufacturing, whose eleven tags shared none of that
vocabulary. Two bugs, not one.

Fixed with `TAG_TO_SYSTEM_BY_INDUSTRY` (per-industry vocabularies, Manufacturing's mapped from its
real 75-project tag distribution), an industry-aware `systemAudit(industryId)`, a derived
`systemProfile()`, and `unmappedTags()` so a future unmapped tag surfaces immediately instead of
silently counting zero.

Also removed a duplicate `TAG_TO_SYSTEM` declaration and guarded a genuine TDZ hazard —
`systemAudit` references `INDUSTRIES`, declared ~10,000 lines later — with a `typeof` check.

**The audit now tells the truth, and the result is informative:**

| system | Hospitality | Manufacturing |
|---|---|---|
| production | 0 (dormant) | 16 (core) |
| supplyChain | 0 (dormant) | 11 (core) |
| marketing | 15 (core) | 0 (dormant) |
| strategy | 7 (standard) | 0 (dormant) |
| legal | 18 (core) | 8 (standard) |

Zero unmapped tags in either industry. 15 new tests in `economy_test.cjs` (125 total).

---

## 5. Predatory nemesis: 0% win / 91% insolvent
**Flagged:** nemesis behaviour session, N=100
**Revisit:** during a balance pass, after systems settle
**Severity:** one rival posture is unwinnable

Attack frequency at 2.68× baseline. Robust across both month-1 and realistic month-9 spawns, so
not a spawn-timing artifact. Parked deliberately: tuning before the surrounding systems stopped
moving would have meant tuning twice.

---

## 6. Analyst and Statesman cannot style-match
**Flagged:** founder redesign session
**Revisit:** content pass
**Severity:** two of five founder classes can't reach their team bonus

No authored co-founders exist in those classes, so the majority-class bonus is unreachable for
them. Their mechanics were built on founder *presence* as a deliberate bridge. Needs authored
Analyst/Statesman roster leaders per industry.

---

## 7. Late game is unreachable
**Flagged:** failure-mode diagnostic, N=160
**Revisit:** deferred to live playtesters by explicit direction
**Severity:** roughly half the designed content is never seen

0 of 160 runs reached the final stage of either industry. Hospitality never reaches `seriesB`;
Manufacturing reaches `expansion` 1.3% of the time and `exit` never. Every win is an early exit.
