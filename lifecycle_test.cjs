// COMPETITOR LIFECYCLE — build order item 6. Archetypes and selection math first, then live
// integration: does the market actually move without the player, and at the intended pace?
global.window = global;
const { makeMemoryStorage } = require('./memory_storage_stub.cjs');
window.storage = makeMemoryStorage();
require('./build/harness.cjs');

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${label}${detail ? '  — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? '  — ' + detail : ''}`); }
}
const section = (s) => console.log(`\n${s}`);

const ARCHETYPES = window.__RIVAL_ARCHETYPES;
const AUTHORED_ARCHETYPES = window.__AUTHORED_ARCHETYPES;
const AUTHORED_COMPANIES = window.__AUTHORED_COMPANIES;
const rivalArchetype = window.__rivalArchetype;
const archetypeFromPhilosophy = window.__archetypeFromPhilosophy;
const rivalFailureScore = window.__rivalFailureScore;
const failureCandidate = window.__failureCandidate;
const acquisitionPair = window.__acquisitionPair;
const alliancePair = window.__alliancePair;
const scatterTalent = window.__scatterTalent;
const rivalAsSupplier = window.__rivalAsSupplier;
const resolveSupplier = window.__resolveSupplier;
const allAvailableSuppliers = window.__allAvailableSuppliers;
const rivalSupplierCandidates = window.__rivalSupplierCandidates;
const FAILURE_THRESHOLD = window.__FAILURE_THRESHOLD;
const MIN_MO = window.__LIFECYCLE_CHECK_MIN_MONTHS;
const MAX_MO = window.__LIFECYCLE_CHECK_MAX_MONTHS;
const SUPPLIER_BY_ID = window.__SUPPLIER_BY_ID;
const getIndustry = window.__getIndustry2;

const mkRival = (o) => ({
  seedId: o.seedId || 'r1', name: o.name || 'Test Co', strength: o.strength != null ? o.strength : 40,
  marketPosition: o.marketPosition != null ? o.marketPosition : 40,
  archetype: o.archetype || 'costLeader', encounters: o.encounters || {},
  allianceWith: o.allianceWith || [], acquisitionsMade: o.acquisitionsMade || 0,
  leaders: o.leaders || [{ name: 'A Leader', role: 'CEO', trait: 'Poacher' }],
  logo: { hue: 200 }, ...o,
});

// ================================================================ archetypes
section('Strategic archetypes — the six from the Bible');
ok('six archetypes exist', Object.keys(ARCHETYPES).length === 6, Object.keys(ARCHETYPES).join(','));
ok('every archetype is bilingual', Object.values(ARCHETYPES).every(a => a.name.en && a.name.es && a.focus.en && a.focus.es));
ok('every archetype declares an explicit weakness', Object.values(ARCHETYPES).every(a => a.weakness.en && a.weakness.es));
ok('every archetype has a failure mode and a narrative for it',
  Object.values(ARCHETYPES).every(a => a.failsWhen && a.failureNarrative.en && a.failureNarrative.es));
ok('every archetype has an acquisition appetite', Object.values(ARCHETYPES).every(a => typeof a.acquisitiveness === 'number'));
ok('the conglomerate is the most acquisitive — that is its defining behaviour',
  Object.values(ARCHETYPES).every(a => ARCHETYPES.conglomerate.acquisitiveness >= a.acquisitiveness));
ok('the quality house is among the least acquisitive (it cannot scale)',
  ARCHETYPES.qualityHouse.acquisitiveness < ARCHETYPES.conglomerate.acquisitiveness);
ok('an unknown archetype falls back rather than crashing', !!rivalArchetype('nonsense'));

section('All twelve authored companies now carry an archetype');
ok('every authored company is assigned', AUTHORED_COMPANIES.every(c => !!AUTHORED_ARCHETYPES[c.id]),
  AUTHORED_COMPANIES.filter(c => !AUTHORED_ARCHETYPES[c.id]).map(c => c.id).join(',') || 'all assigned');
ok('every assignment names a real archetype',
  Object.values(AUTHORED_ARCHETYPES).every(a => !!ARCHETYPES[a]));
ok('all six archetypes are represented across the twelve',
  new Set(Object.values(AUTHORED_ARCHETYPES)).size === 6,
  `${new Set(Object.values(AUTHORED_ARCHETYPES)).size} distinct`);
ok('the spread is even — two companies per archetype', (() => {
  const counts = {};
  Object.values(AUTHORED_ARCHETYPES).forEach(a => { counts[a] = (counts[a] || 0) + 1; });
  return Object.values(counts).every(c => c === 2);
})());

section('Procedural rivals derive an archetype from their philosophy');
ok('a premium philosophy reads as a quality house',
  archetypeFromPhilosophy({ premiumVsMass: 70 }) === 'qualityHouse');
ok('an innovation-led philosophy reads as an innovator',
  archetypeFromPhilosophy({ innovationVsExecution: 70 }) === 'innovator');
ok('a delegated philosophy reads as an outsourcing specialist',
  archetypeFromPhilosophy({ centralizedVsDelegated: -70 }) === 'outsourcingSpecialist');
ok('a sustainability-led philosophy reads as a vertical integrator',
  archetypeFromPhilosophy({ growthVsSustainability: -70 }) === 'verticalIntegrator');
ok('an empty philosophy still yields a valid archetype', !!ARCHETYPES[archetypeFromPhilosophy({})]);
ok('a freshly spawned rival carries an archetype', (() => {
  const ind = getIndustry('manufacturing');
  const c = window.__makeCompetitor([], [], 9, 'en', 'manufacturing', ind.content, null, []);
  return !!c.archetype && !!ARCHETYPES[c.archetype];
})());

// ================================================================ failure scoring
section('Failure scoring — the player\u2019s pressure is the heaviest term (Q5 answer C)');
const field = [mkRival({ seedId: 'a', strength: 50 }), mkRival({ seedId: 'b', strength: 50 }), mkRival({ seedId: 'c', strength: 50 })];
const healthy = mkRival({ seedId: 'h', strength: 50, marketPosition: 50 });
ok('a healthy untouched rival scores low', rivalFailureScore(healthy, field) < FAILURE_THRESHOLD,
  `${rivalFailureScore(healthy, field)}`);
const beaten = mkRival({ seedId: 'h', strength: 50, marketPosition: 50, encounters: { defeatedByPlayer: 4, attackedByPlayer: 6 } });
ok('a rival the player has repeatedly beaten scores much higher',
  rivalFailureScore(beaten, field) > rivalFailureScore(healthy, field) + 40,
  `${rivalFailureScore(healthy, field)} -> ${rivalFailureScore(beaten, field)}`);
ok('player defeats outweigh mere attacks', (() => {
  const defeats = mkRival({ seedId: 'x', encounters: { defeatedByPlayer: 3 } });
  const attacks = mkRival({ seedId: 'y', encounters: { attackedByPlayer: 3 } });
  return rivalFailureScore(defeats, field) > rivalFailureScore(attacks, field);
})());
ok('a weak rival scores higher than a strong one, all else equal',
  rivalFailureScore(mkRival({ seedId: 'w', strength: 10, marketPosition: 10 }), field)
  > rivalFailureScore(healthy, field));
ok('an alliance props a company up (relationships keep companies alive)',
  rivalFailureScore(mkRival({ seedId: 'z', strength: 10, marketPosition: 10, allianceWith: ['other'] }), field)
  < rivalFailureScore(mkRival({ seedId: 'z', strength: 10, marketPosition: 10 }), field));
ok('score never goes negative', rivalFailureScore(mkRival({ seedId: 'q', strength: 99, marketPosition: 99, allianceWith: ['a', 'b'] }), field) >= 0);

section('Archetypes die their own deaths');
ok('a conglomerate that over-acquired is at risk from overextension',
  rivalFailureScore(mkRival({ seedId: 'k', archetype: 'conglomerate', acquisitionsMade: 3, strength: 50, marketPosition: 50 }), field)
  > rivalFailureScore(mkRival({ seedId: 'k', archetype: 'conglomerate', acquisitionsMade: 0, strength: 50, marketPosition: 50 }), field));
ok('a cost leader is punished for losing market position specifically',
  rivalFailureScore(mkRival({ seedId: 'cl', archetype: 'costLeader', strength: 50, marketPosition: 15 }), field)
  > rivalFailureScore(mkRival({ seedId: 'cl', archetype: 'costLeader', strength: 50, marketPosition: 60 }), field));
ok('an innovator carries structural fragility even when healthy',
  rivalFailureScore(mkRival({ seedId: 'in', archetype: 'innovator', strength: 50, marketPosition: 50 }), field)
  > rivalFailureScore(mkRival({ seedId: 'in', archetype: 'qualityHouse', strength: 50, marketPosition: 50 }), field));

section('failureCandidate picks the most distressed, or nobody');
ok('a healthy field produces no candidate', failureCandidate(field) === null);
const doomedField = [...field, mkRival({ seedId: 'doomed', strength: 5, marketPosition: 5, encounters: { defeatedByPlayer: 4 } })];
ok('a genuinely distressed rival is found', failureCandidate(doomedField) !== null);
ok('the MOST distressed one is chosen', failureCandidate(doomedField).rival.seedId === 'doomed');

// ================================================================ acquisition & alliance
section('Acquisition pairing');
ok('a healthy field produces no acquisition', acquisitionPair(field) === null);
const acqField = [
  mkRival({ seedId: 'big', strength: 90, marketPosition: 70, archetype: 'conglomerate' }),
  mkRival({ seedId: 'weak', strength: 12, marketPosition: 12, encounters: { defeatedByPlayer: 2 } }),
  mkRival({ seedId: 'mid', strength: 45, marketPosition: 45 }),
];
const pair = acquisitionPair(acqField);
ok('a struggling rival attracts a buyer', pair !== null);
ok('the weak one is the target', pair && pair.target.seedId === 'weak');
ok('the buyer is genuinely stronger than the target',
  pair && pair.buyer.strength >= pair.target.strength * 1.4);
ok('the most acquisitive strong company buys', pair && pair.buyer.seedId === 'big');
ok('a company never acquires itself', pair && pair.buyer.seedId !== pair.target.seedId);

section('Alliance pairing — only the healthy partner up');
ok('two weak companies do not form an alliance',
  alliancePair([mkRival({ seedId: 'a', marketPosition: 10 }), mkRival({ seedId: 'b', marketPosition: 10 })]) === null);
const allyPair = alliancePair([
  mkRival({ seedId: 'a', strength: 80, marketPosition: 60 }),
  mkRival({ seedId: 'b', strength: 70, marketPosition: 55 }),
  mkRival({ seedId: 'c', strength: 20, marketPosition: 15 }),
]);
ok('two healthy companies do', allyPair !== null);
ok('the two strongest are chosen', allyPair && ['a', 'b'].includes(allyPair.a.seedId) && ['a', 'b'].includes(allyPair.b.seedId));
ok('a company already in an alliance is not re-paired',
  alliancePair([mkRival({ seedId: 'a', marketPosition: 60, allianceWith: ['x'] }),
    mkRival({ seedId: 'b', marketPosition: 60, allianceWith: ['y'] })]) === null);
ok('one company alone cannot form an alliance', alliancePair([mkRival({ seedId: 'a', marketPosition: 60 })]) === null);

section('Talent scatter');
const scattered = scatterTalent(mkRival({ seedId: 's', name: 'Dying Co', leaders: [{ name: 'Jane Doe', role: 'CTO', trait: 'Poacher' }] }), 20);
ok('a collapsing company produces a scattered person', scattered !== null);
ok('they remember where they came from', scattered.fromCompany === 'Dying Co');
ok('they carry their name and role', scattered.name === 'Jane Doe' && scattered.role === 'CTO');
ok('a company with no leaders scatters nobody', scatterTalent(mkRival({ seedId: 'e', leaders: [] }), 20) === null);

// ================================================================ rival as supplier
section('Rival-as-supplier is a first-class supplier, not a special case');
const strongRival = mkRival({ seedId: 'sup', name: 'Atlas Foundry Group', strength: 90 });
const asSupplier = rivalAsSupplier(strongRival, 'timber');
ok('it has a supplier id namespaced to the rival', asSupplier.id === 'rival-sup');
ok('it carries the rival\u2019s name', asSupplier.name === 'Atlas Foundry Group');
ok('it is flagged as a rival supplier', asSupplier.isRival === true);
ok('it has every field a real supplier has', ['material', 'origin', 'reliability', 'leadTimeMonths',
  'priceIndex', 'qualityGrade', 'minimumOrder', 'bio', 'tell'].every(k => asSupplier[k] !== undefined));
ok('it is bilingual like the authored ten', asSupplier.bio.en && asSupplier.bio.es && asSupplier.tell.en && asSupplier.tell.es);
ok('a strong rival makes a reliable supplier',
  asSupplier.reliability > rivalAsSupplier(mkRival({ seedId: 'w', strength: 15 }), 'timber').reliability);
ok('a strong rival is also a more expensive supplier — their company IS the product',
  asSupplier.priceIndex < rivalAsSupplier(mkRival({ seedId: 'w', strength: 15 }), 'timber').priceIndex);
ok('reliability stays a valid probability across the strength range', (() => {
  for (let st = 0; st <= 100; st += 10) {
    const sp = rivalAsSupplier(mkRival({ seedId: 'x', strength: st }), 'timber');
    if (sp.reliability <= 0 || sp.reliability > 1) return false;
    if (sp.qualityGrade < 1 || sp.qualityGrade > 10) return false;
  }
  return true;
})());

section('resolveSupplier finds both authored and rival suppliers');
const gameWithRivalSupplier = { rivalSuppliers: { 'rival-sup': asSupplier } };
ok('an authored supplier resolves', resolveSupplier(gameWithRivalSupplier, 'redwoodTimber') === SUPPLIER_BY_ID.redwoodTimber);
ok('a rival supplier resolves', resolveSupplier(gameWithRivalSupplier, 'rival-sup') === asSupplier);
ok('an unknown id resolves to null rather than crashing', resolveSupplier(gameWithRivalSupplier, 'nonsense') === null);
ok('a game with no rival suppliers still resolves authored ones', resolveSupplier({}, 'redwoodTimber') === SUPPLIER_BY_ID.redwoodTimber);
ok('allAvailableSuppliers includes both sets',
  allAvailableSuppliers(gameWithRivalSupplier).length === allAvailableSuppliers({}).length + 1);

section('Only allied rivals are offered as suppliers');
ok('a neutral rival is not a candidate',
  rivalSupplierCandidates({ competitors: [mkRival({ seedId: 'n', encounters: {} })], rivalSuppliers: {} }).length === 0);
ok('an allied rival is a candidate', (() => {
  const ally = mkRival({ seedId: 'ally', encounters: { coexistedRuns: 20, tradedWith: 5 } });
  return rivalSupplierCandidates({ competitors: [ally], rivalSuppliers: {} }).length === 1;
})());
ok('a rival already converted is not offered again', (() => {
  const ally = mkRival({ seedId: 'ally', encounters: { coexistedRuns: 20, tradedWith: 5 } });
  return rivalSupplierCandidates({ competitors: [ally], rivalSuppliers: { 'rival-ally': {} } }).length === 0;
})());

// ================================================================ live integration
section('Live — the market moves without the player');
function newRun(patch) {
  const ind = getIndustry('manufacturing');
  const team = window.__buildTeam(ind.content.leaders.slice(0, 3));
  const H = window.__makeHandlers('en', []);
  const allProjects = {};
  (ind.content.projects || []).forEach(p => { allProjects[p.id] = true; });
  H.setState({
    ...window.__initialState(team, 'en', { ...window.__getScenario('fullRun'), industryId: 'manufacturing', endMonth: ind.runEnd }, []),
    capital: 500000, presence: 40, ap: 5, reputation: 95, boardConfidence: 95,
    revenuePerMonth: 400, marketPosition: 40, laborPool: 60, completed: allProjects,
    ...(patch || {}),
  });
  return { H, ind };
}
function tick(H, n, forceRandom) {
  const real = Math.random;
  Math.random = forceRandom != null ? () => forceRandom : real;
  try { for (let i = 0; i < n; i++) { if (H.getState().gameOver) break; H.endMonth(); H.setState({ ...H.getState(), ap: 5, capital: Math.max(H.getState().capital, 400000) }); } }
  finally { Math.random = real; }
}

section('Live — pacing: no lifecycle event fires before the first scheduled check');
const { H: Hpace } = newRun({ competitors: [
  mkRival({ seedId: 'a', strength: 50, marketPosition: 50 }),
  mkRival({ seedId: 'doomed', strength: 5, marketPosition: 5, encounters: { defeatedByPlayer: 5 } }),
] });
tick(Hpace, 1, 0.5);
const firstCheck = Hpace.getState().nextLifecycleCheck;
ok('a first check is scheduled 18-24 months out', firstCheck >= MIN_MO && firstCheck <= MAX_MO + 2,
  `month ${firstCheck}`);
tick(Hpace, Math.max(0, firstCheck - 4), 0.5);
ok('nothing has fired yet — significant events are NOT noise',
  (Hpace.getState().lifecycleEvents || []).length === 0,
  `${(Hpace.getState().lifecycleEvents || []).length} events`);

section('Live — a doomed rival actually collapses at the check');
tick(Hpace, 8, 0.5);
let s = Hpace.getState();
const failures = (s.lifecycleEvents || []).filter(e => e.type === 'failure');
ok('the collapse fired', failures.length >= 1, JSON.stringify((s.lifecycleEvents || []).map(e => e.type)));
ok('the collapsed rival is gone from the market',
  !(s.competitors || []).some(c => c.seedId === 'doomed'));
ok('a Competitor Collapse ticket was logged', s.log.some(x => /Competitor Collapse/.test(x.title)));
ok('the ticket credits the player when the player caused it',
  s.log.some(x => /Competitor Collapse/.test(x.title) && /pressure you put on them/i.test(x.body)));
ok('the player picked up market share', s.marketPosition > 40, `40 -> ${s.marketPosition}`);
ok('their talent scattered into the pool', (s.scatteredTalent || []).length >= 1);

section('Live — at most ONE lifecycle event per check');
const { H: Hone } = newRun({ competitors: [
  mkRival({ seedId: 'x1', strength: 5, marketPosition: 5, encounters: { defeatedByPlayer: 5 } }),
  mkRival({ seedId: 'x2', strength: 6, marketPosition: 6, encounters: { defeatedByPlayer: 5 } }),
  mkRival({ seedId: 'x3', strength: 90, marketPosition: 80, archetype: 'conglomerate' }),
] });
tick(Hone, 1, 0.5);
const checkAt = Hone.getState().nextLifecycleCheck;
tick(Hone, checkAt + 1, 0.5);
const eventsAtFirstCheck = (Hone.getState().lifecycleEvents || []).length;
ok('exactly one event fired at the first check despite two doomed rivals', eventsAtFirstCheck === 1,
  `${eventsAtFirstCheck}`);

section('Live — a healthy market produces no events at all');
const { H: Hquiet } = newRun({ competitors: [
  mkRival({ seedId: 'q1', strength: 50, marketPosition: 50 }),
  mkRival({ seedId: 'q2', strength: 48, marketPosition: 20 }),
] });
tick(Hquiet, MAX_MO + 3, 0.5);
const quietEvents = (Hquiet.getState().lifecycleEvents || []).filter(e => e.type === 'failure');
ok('no rival collapsed in a healthy market', quietEvents.length === 0,
  JSON.stringify((Hquiet.getState().lifecycleEvents || []).map(e => e.type)));

section('Live — an allied rival can become a contractable supplier');
// marketPosition below the alliance threshold (30) on purpose: alliance is checked BEFORE
// supplier conversion, and a healthy allied rival would correctly consume the check by pairing
// up instead. This isolates the supplier branch rather than testing precedence by accident.
const { H: Hsup } = newRun({
  competitors: [
    mkRival({ seedId: 'ally', name: 'Friendly Rival Co', marketPosition: 20, strength: 45,
      encounters: { coexistedRuns: 25, tradedWith: 6 } }),
    mkRival({ seedId: 'other', name: 'Neutral Co', marketPosition: 20, strength: 44 }),
  ],
});
// Set the check due next month rather than ticking 22 months to reach it — rivals grow every
// month, and a long ramp would push both past the alliance threshold before the check lands,
// which would (correctly) fire an alliance instead. This isolates the branch under test.
Hsup.setState({ ...Hsup.getState(), nextLifecycleCheck: Hsup.getState().month + 1 });
tick(Hsup, 2, 0.5);
s = Hsup.getState();
const offers = (s.lifecycleEvents || []).filter(e => e.type === 'supplierOffer');
ok('a supply partnership was offered', offers.length > 0,
  `events: ${JSON.stringify((s.lifecycleEvents || []).map(e => e.type))}`);
ok('the rival supplier is now resolvable', !!resolveSupplier(s, 'rival-ally'));
ok('it appears in the full supplier list', allAvailableSuppliers(s).some(sp => sp.isRival));
ok('a Supply Partnership ticket was logged', s.log.some(x => /Supply Partnership/.test(x.title)));

section('Live — precedence: alliance outranks a supplier offer when both are eligible');
const { H: Hprec } = newRun({
  competitors: [
    mkRival({ seedId: 'ally2', marketPosition: 60, strength: 70, encounters: { coexistedRuns: 25, tradedWith: 6 } }),
    mkRival({ seedId: 'partner', marketPosition: 55, strength: 65 }),
  ],
});
Hprec.setState({ ...Hprec.getState(), nextLifecycleCheck: Hprec.getState().month + 1 });
tick(Hprec, 2, 0.5);
const precEvents = (Hprec.getState().lifecycleEvents || []).map(e => e.type);
ok('the more consequential event (alliance) wins the check', precEvents[0] === 'alliance',
  JSON.stringify(precEvents));

console.log(`\n${'='.repeat(60)}\nCompetitor Lifecycle: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
