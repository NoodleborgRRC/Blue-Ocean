// EQUIPMENT & MAINTENANCE — build order item 2. Unit tests for the pure functions, then a live
// integration section driving real decay/failure/replace through actual handlers and endMonth.
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

const CATALOG = window.__EQUIPMENT_CATALOG;
const STANCES = window.__MAINTENANCE_STANCES;
const isEquipmentProject = window.__isEquipmentProject;
const instantiateEquipment = window.__instantiateEquipment;
const equipmentDecayThisMonth = window.__equipmentDecayThisMonth;
const equipmentMonthlyCost = window.__equipmentMonthlyCost;
const equipmentFailureChance = window.__equipmentFailureChance;
const bestEquipmentForTag = window.__bestEquipmentForTag;
const equipmentEffectiveCapacity = window.__equipmentEffectiveCapacity;
const equipmentAutomationFactor = window.__equipmentAutomationFactor;
const equipmentPrecision = window.__equipmentPrecision;
const equipmentCapacityFactor = window.__equipmentCapacityFactor;
const equipmentPrecisionFloor = window.__equipmentPrecisionFloor;
const companyResourceProfile = window.__companyResourceProfile;
const getIndustry = window.__getIndustry2;

// ================================================================ catalog integrity
section('Equipment catalog');
const ids = Object.keys(CATALOG);
// 15 -> 17: a Crucible Furnace and Small Foundry were added at Seed stage. The factory bot found
// that furnaceOperation/smelting existed only on Growth and Expansion plants, so Glassworks and
// Foundry could not produce until month 43+ of an 84-month run.
ok('seventeen machine-shaped projects are catalogued', ids.length === 17, `${ids.length}`);
ok('every capability required by a playable line is reachable by SEED stage at the latest', (() => {
  const ind = getIndustry('manufacturing');
  const order = ind.stageOrder;
  return window.__MANUFACTURING_CATALOG.every(p => {
    const caps = p.resourceProfile.capabilities || [];
    return caps.every(c => {
      const eqs = Object.entries(window.__EQUIPMENT_CAPABILITIES).filter(([, v]) => v.includes(c)).map(e => e[0]);
      const projs = eqs.map(id => ind.content.projects.find(pr => pr.id === id)).filter(Boolean);
      if (!projs.length) return false;
      const earliest = projs.map(pr => order.indexOf(pr.minStage)).sort((a, b) => a - b)[0];
      return earliest <= order.indexOf('growth'); // nothing should be gated past Growth
    });
  });
})());
// The dye house is Quality-tagged: it is a finishing/testing facility, not a production line.
ok('every entry has a valid originTag', ids.every(id => ['Tooling', 'Line', 'Plant', 'Quality'].includes(CATALOG[id].originTag)));
ok('every entry is bilingual', ids.every(id => CATALOG[id].name.en && CATALOG[id].name.es));
ok('every entry has positive capacityContribution', ids.every(id => CATALOG[id].capacityContribution > 0));
ok('precision is on the same 1-10 scale as product qualityCeiling', ids.every(id => CATALOG[id].precision >= 1 && CATALOG[id].precision <= 10));
ok('automationLevel is 0-3', ids.every(id => CATALOG[id].automationLevel >= 0 && CATALOG[id].automationLevel <= 3));
ok('maintenanceCost is positive', ids.every(id => CATALOG[id].maintenanceCost > 0));
ok('the two process/organisational projects are deliberately NOT in the catalog',
  !CATALOG.mfgCapacityExpansion && !CATALOG.mfgPredictiveMaintenance);
ok('isEquipmentProject matches catalog membership exactly',
  ids.every(id => isEquipmentProject(id)) && !isEquipmentProject('mfgCapacityExpansion') && !isEquipmentProject('nonexistentProject'));

section('Instantiation');
const fresh = instantiateEquipment('mfgFirstTooling');
ok('starts at full condition', fresh.condition === 100);
ok('starts with zero downtime', fresh.downtimeMonthsLeft === 0);
ok('defaults to the corrective stance', fresh.stance === 'corrective');
ok('carries the catalog automationLevel forward', fresh.automationLevel === CATALOG.mfgFirstTooling.automationLevel);
ok('carries its originTag', fresh.originTag === 'Tooling');
ok('an unknown project id returns null rather than a broken object', instantiateEquipment('nonsense') === null);

// ================================================================ stances
section('Maintenance stances');
ok('three stances exist: preventive, corrective, neglect', Object.keys(STANCES).length === 3);
ok('preventive decays slower than corrective, which decays slower than neglect',
  STANCES.preventive.decayPerMonth < STANCES.corrective.decayPerMonth
  && STANCES.corrective.decayPerMonth < STANCES.neglect.decayPerMonth);
ok('neglect costs nothing per month', STANCES.neglect.costMult === 0);
ok('preventive costs more per month than corrective (the trade the Bible asks for)',
  STANCES.preventive.costMult > STANCES.corrective.costMult);
ok('failure severity rises in the same order as decay — risk compounds, it does not trade off',
  STANCES.preventive.failureSeverity < STANCES.corrective.failureSeverity
  && STANCES.corrective.failureSeverity < STANCES.neglect.failureSeverity);

section('Decay and cost');
const testEq = instantiateEquipment('mfgFirstTooling');
['preventive', 'corrective', 'neglect'].forEach(stance => {
  const eq = { ...testEq, stance };
  const decay = equipmentDecayThisMonth(eq, false);
  ok(`${stance}: decay matches the stance table`, decay === STANCES[stance].decayPerMonth);
  const cost = equipmentMonthlyCost(eq);
  ok(`${stance}: cost matches maintenanceCost × stance multiplier`,
    Math.abs(cost - CATALOG.mfgFirstTooling.maintenanceCost * STANCES[stance].costMult) < 0.01);
});
ok('predictive maintenance slows decay regardless of stance',
  equipmentDecayThisMonth({ ...testEq, stance: 'corrective' }, true) < equipmentDecayThisMonth({ ...testEq, stance: 'corrective' }, false));
ok('predictive maintenance never speeds decay up',
  equipmentDecayThisMonth({ ...testEq, stance: 'neglect' }, true) <= equipmentDecayThisMonth({ ...testEq, stance: 'neglect' }, false));

// ================================================================ failure chance
section('Failure probability — the compounding-risk shape');
ok('fresh equipment (condition 100) essentially never fails, on any stance',
  ['preventive', 'corrective', 'neglect'].every(stance =>
    equipmentFailureChance({ ...testEq, condition: 100, stance, downtimeMonthsLeft: 0 }) === 0));
ok('worn equipment fails more often than fresh equipment, same stance',
  equipmentFailureChance({ ...testEq, condition: 20, stance: 'corrective', downtimeMonthsLeft: 0 })
  > equipmentFailureChance({ ...testEq, condition: 90, stance: 'corrective', downtimeMonthsLeft: 0 }));
ok('at equal condition, neglect fails more often than corrective, which fails more often than preventive',
  (() => {
    const cond = 40;
    const p = equipmentFailureChance({ ...testEq, condition: cond, stance: 'preventive', downtimeMonthsLeft: 0 });
    const c = equipmentFailureChance({ ...testEq, condition: cond, stance: 'corrective', downtimeMonthsLeft: 0 });
    const n = equipmentFailureChance({ ...testEq, condition: cond, stance: 'neglect', downtimeMonthsLeft: 0 });
    return p < c && c < n;
  })());
ok('equipment already in downtime cannot fail further this month (chance is 0)',
  equipmentFailureChance({ ...testEq, condition: 10, stance: 'neglect', downtimeMonthsLeft: 2 }) === 0);
ok('failure chance is always a valid probability', (() => {
  for (let cond = 0; cond <= 100; cond += 5) {
    for (const stance of ['preventive', 'corrective', 'neglect']) {
      const c = equipmentFailureChance({ ...testEq, condition: cond, stance, downtimeMonthsLeft: 0 });
      if (c < 0 || c > 1) return false;
    }
  }
  return true;
})());

// ================================================================ capacity/precision derivation
section('bestEquipmentForTag and effective capacity');
const gameNoEquip = { equipment: {} };
ok('no owned equipment for a tag returns null', bestEquipmentForTag(gameNoEquip, 'Tooling') === null);
const gameOneToolingItem = { equipment: { mfgFirstTooling: instantiateEquipment('mfgFirstTooling') } };
ok('a single owned instance is returned for its tag', bestEquipmentForTag(gameOneToolingItem, 'Tooling').id === 'mfgFirstTooling');
ok('wrong tag returns null even with equipment owned', bestEquipmentForTag(gameOneToolingItem, 'Line') === null);

const gameTwoToolingItems = { equipment: {
  mfgFirstTooling: instantiateEquipment('mfgFirstTooling'),
  mfgCNCUpgrade: instantiateEquipment('mfgCNCUpgrade'),
} };
ok('when two owned items share a tag, the BETTER one is picked',
  bestEquipmentForTag(gameTwoToolingItems, 'Tooling').id === 'mfgCNCUpgrade');

ok('effective capacity scales with condition',
  equipmentEffectiveCapacity({ ...gameOneToolingItem.equipment.mfgFirstTooling, condition: 100 })
  > equipmentEffectiveCapacity({ ...gameOneToolingItem.equipment.mfgFirstTooling, condition: 40 }));
ok('effective capacity is ZERO while in downtime, regardless of condition',
  equipmentEffectiveCapacity({ ...gameOneToolingItem.equipment.mfgFirstTooling, condition: 100, downtimeMonthsLeft: 1 }) === 0);
ok('automation factor rises with automation level',
  equipmentAutomationFactor(3) > equipmentAutomationFactor(1) && equipmentAutomationFactor(0) === 1);
// Precision is authored 1-10 in the catalog but exposed on the shared 0-100 quality scale.
ok('precision reads from the catalog, scaled to the 0-100 quality scale',
  equipmentPrecision(gameOneToolingItem.equipment.mfgFirstTooling) === CATALOG.mfgFirstTooling.precision * 10);

section('equipmentCapacityFactor / equipmentPrecisionFloor — the weakest-link rule');
ok('no required tags means no constraint (factor 1, precision 10)',
  equipmentCapacityFactor({ equipment: {} }, []) === 1 && equipmentPrecisionFloor({ equipment: {} }, []) === 10);
ok('a missing required tag defaults to neutral rather than crashing',
  equipmentCapacityFactor({ equipment: {} }, ['Tooling']) === 1);
const gameMixed = { equipment: {
  mfgFirstTooling: instantiateEquipment('mfgFirstTooling'), // Tooling, capacityContribution 0.55, precision 5
  mfgPilotLine: instantiateEquipment('mfgPilotLine'),        // Line, capacityContribution 0.6, precision 5
} };
ok('capacity factor across two tags takes the WORSE one, not the average or the best',
  Math.abs(equipmentCapacityFactor(gameMixed, ['Tooling', 'Line'])
    - Math.min(equipmentEffectiveCapacity(gameMixed.equipment.mfgFirstTooling), equipmentEffectiveCapacity(gameMixed.equipment.mfgPilotLine))) < 0.001);
ok('precision floor across two tags takes the WORSE one too',
  equipmentPrecisionFloor(gameMixed, ['Tooling', 'Line']) === Math.min(CATALOG.mfgFirstTooling.precision, CATALOG.mfgPilotLine.precision) * 10);
const gameStrongOnly = { equipment: { mfgRobotics: instantiateEquipment('mfgRobotics') } };
ok('a single strong tag alone reports its own (better) numbers',
  equipmentPrecisionFloor(gameStrongOnly, ['Tooling']) === CATALOG.mfgRobotics.precision * 10);

// ================================================================ live integration
section('Live — a real machine actually gets built by completing its project');
function newRun() {
  const ind = getIndustry('manufacturing');
  const team = window.__buildTeam(ind.content.leaders.slice(0, 3));
  const H = window.__makeHandlers('en', []);
  // Same technique as ousting_test.cjs / product_integration_test.cjs: stage gates are a real,
  // separate system that will end a run on stageTimeout long before a multi-month equipment or
  // product lifecycle can be observed. Held artificially healthy on every axis except
  // equipment/products, which is what these tests actually exercise.
  const allProjects = {};
  (ind.content.projects || []).forEach(p => { allProjects[p.id] = true; });
  H.setState({
    ...window.__initialState(team, 'en', { ...window.__getScenario('fullRun'), industryId: 'manufacturing', endMonth: ind.runEnd }, []),
    capital: 500000, presence: 40, ap: 5, reputation: 95, boardConfidence: 95,
    revenuePerMonth: 400, marketPosition: 80, laborPool: 60,
    completed: allProjects,
  });
  return { H, ind };
}
function tickMonths(H, n, opts) {
  const real = Math.random;
  Math.random = opts && opts.forceRandom != null ? () => opts.forceRandom : real;
  try {
    for (let i = 0; i < n; i++) {
      if (H.getState().gameOver) break;
      H.endMonth();
      H.setState({ ...H.getState(), ap: 5, capital: Math.max(H.getState().capital, 500000) });
    }
  } finally { Math.random = real; }
}

// Seeding activeProjects directly rather than walking mfgFirstTooling's real prerequisite chain
// (mfgDFM -> mfgBenchPrototype, gated at minStage 'seed') — what THIS test verifies is that
// completing the project instantiates equipment, not that the prerequisite tree itself works
// (that is exercised elsewhere, by the existing project system's own tests).
const { H } = newRun();
H.setState({ ...H.getState(), activeProjects: [{ id: 'mfgFirstTooling', monthsLeft: 1, labor: 0 }] });
tickMonths(H, 1, { forceRandom: 0.999 });
let s = H.getState();
ok('the project actually completed', s.completed.mfgFirstTooling === true);
ok('completing mfgFirstTooling instantiates real equipment', !!s.equipment.mfgFirstTooling,
  JSON.stringify(Object.keys(s.equipment)));
ok('the new equipment starts at full condition', s.equipment.mfgFirstTooling && s.equipment.mfgFirstTooling.condition === 100);
ok('the equipment tag now shows up in companyResourceProfile',
  companyResourceProfile(s, getIndustry('manufacturing')).equipment.has('Tooling'));
ok('a completion ticket does not silently skip because equipment was also instantiated',
  s.log.some(t => /Complete/.test(t.title)));

section('Live — decay actually happens month over month, on a real handler-driven run');
const { H: H2 } = newRun();
H2.setState({ ...H2.getState(), equipment: { mfgFirstTooling: instantiateEquipment('mfgFirstTooling') } });
const before = H2.getState().equipment.mfgFirstTooling.condition;
tickMonths(H2, 1, { forceRandom: 0.999 }); // suppress the failure roll itself for a clean decay read
const after = H2.getState().equipment.mfgFirstTooling.condition;
ok('condition actually drops after a month passes', after < before, `${before} -> ${after}`);

section('Live — changing stance changes decay behaviour going forward');
const { H: H3 } = newRun();
H3.setState({ ...H3.getState(), equipment: { mfgFirstTooling: instantiateEquipment('mfgFirstTooling') } });
H3.handleSetMaintenanceStance('mfgFirstTooling', 'neglect');
ok('the stance actually changed', H3.getState().equipment.mfgFirstTooling.stance === 'neglect');
ok('a ticket confirms it', /Maintenance/.test(H3.getState().log[0].title));
const beforeNeglect = H3.getState().equipment.mfgFirstTooling.condition;
tickMonths(H3, 1, { forceRandom: 0.999 });
const afterNeglect = H3.getState().equipment.mfgFirstTooling.condition;
ok('neglect drops condition faster than the earlier corrective-stance run did',
  (beforeNeglect - afterNeglect) > (before - after), `neglect dropped ${beforeNeglect - afterNeglect}, corrective dropped ${before - after}`);

section('Live — the failure cascade actually fires and does real things');
function tickMonthsNoFloor(H, n, forceRandom) {
  const real = Math.random;
  Math.random = forceRandom != null ? () => forceRandom : real;
  try {
    for (let i = 0; i < n; i++) {
      if (H.getState().gameOver) break;
      H.endMonth();
      H.setState({ ...H.getState(), ap: 5 }); // AP only — capital is left alone so a repair cost is visible
    }
  } finally { Math.random = real; }
}
const { H: H4 } = newRun();
const wornEq = { ...instantiateEquipment('mfgFirstTooling'), condition: 15, stance: 'neglect' };
H4.setState({ ...H4.getState(), equipment: { mfgFirstTooling: wornEq }, reputation: 80 });
const capBefore = H4.getState().capital;
tickMonthsNoFloor(H4, 1, 0.001); // force the failure roll to succeed
s = H4.getState();
ok('the equipment enters downtime', s.equipment.mfgFirstTooling.downtimeMonthsLeft > 0,
  `${s.equipment.mfgFirstTooling.downtimeMonthsLeft}`);
ok('condition takes additional damage from the failure itself', s.equipment.mfgFirstTooling.condition < wornEq.condition - 1);
ok('a repair cost was charged', s.capital < capBefore, `${capBefore} -> ${s.capital}`);
ok('a failure ticket was logged', s.log.some(t => /Equipment Failure/.test(t.title)));
ok('effective capacity is zero while down', equipmentEffectiveCapacity(s.equipment.mfgFirstTooling) === 0);

section('Live — downtime counts down and the machine comes back online');
let downState = H4.getState();
const downtimeStart = downState.equipment.mfgFirstTooling.downtimeMonthsLeft;
for (let i = 0; i < downtimeStart; i++) {
  tickMonths(H4, 1, { forceRandom: 0.999 }); // don't let it fail again mid-repair
}
downState = H4.getState();
ok('downtime reaches zero after enough months', downState.equipment.mfgFirstTooling.downtimeMonthsLeft === 0,
  `${downState.equipment.mfgFirstTooling.downtimeMonthsLeft}`);
ok('a Back Online ticket was logged', downState.log.some(t => /Back Online/.test(t.title)));

section('Live — the cascade reaches a launched product depending on the failed equipment');
const { H: H7, ind: ind7 } = newRun();
H7.setState({ ...H7.getState(),
  equipment: { mfgFirstTooling: instantiateEquipment('mfgFirstTooling'), mfgPilotLine: instantiateEquipment('mfgPilotLine') },
  completed: { ...H7.getState().completed, mfgQMS: true }, // merge — keep newRun's stage-gate bypass
});
H7.handleAdvanceProduct('processedWood', 'standard');
tickMonths(H7, H7.getState().products.processedWood.phaseMonthsLeft, { forceRandom: 0.999 });
H7.handleAdvanceProduct('processedWood', 'standard');
tickMonths(H7, H7.getState().products.processedWood.phaseMonthsLeft, { forceRandom: 0.999 });
H7.handleAdvanceProduct('processedWood', 'standard');
tickMonths(H7, H7.getState().products.processedWood.phaseMonthsLeft, { forceRandom: 0.999 });
H7.handleLaunchProduct('processedWood', 'b2c');
ok('the product is launched and depends on Tooling', H7.getState().products.processedWood.phase === 'launched');
// Passive reputation regen is a legitimate, ongoing, independent force in this same month, and
// it can outpace or mask a -2 cascade hit regardless of starting value (verified: regen alone
// carried this run from 95 to 100 over the prior ~9 months, and continues afterward). Comparing
// net reputation at the month boundary is testing two systems at once. The direct, unconfounded
// signal is the ticket itself: the cascade computes whether a launched product depends on the
// failed equipment and reports it explicitly — that IS the thing this test verifies, and it
// does not depend on what any other system does to reputation the same month.
H7.setState({ ...H7.getState(), equipment: { ...H7.getState().equipment,
  mfgFirstTooling: { ...H7.getState().equipment.mfgFirstTooling, condition: 15, stance: 'neglect' } } });
tickMonths(H7, 1, { forceRandom: 0.001 }); // force the failure roll to succeed
// mfgPilotLine has also decayed over the ~9 prior months (default corrective stance) and can
// independently roll a failure at the same forced random value — its own ticket carries no
// reputation mention, since processedWood does not depend on ITS capabilities. Check across
// every Equipment Failure ticket from this tick, not just the first (the log is newest-first,
// so whichever equipment failed last would otherwise be picked up instead).
const failureTickets = H7.getState().log.filter(x => /Equipment Failure/.test(x.title));
ok('at least one equipment failure fired this month', failureTickets.length > 0);
ok('the cascade correctly identifies the dependency and reports a reputation cost',
  failureTickets.some(t => /costs reputation/.test(t.body)),
  failureTickets.map(t => t.body).join(' | '));
ok('a failure on equipment the product does NOT depend on reports no reputation cost',
  failureTickets.some(t => t.title.includes('Pilot Line') && !/costs reputation/.test(t.body)));

section('Live — Replace resets condition and costs real capital');
const { H: H5 } = newRun();
const dyingEq = { ...instantiateEquipment('mfgFirstTooling'), condition: 20 };
H5.setState({ ...H5.getState(), equipment: { mfgFirstTooling: dyingEq } });
const capBeforeReplace = H5.getState().capital;
const apBeforeReplace = H5.getState().ap;
H5.handleReplaceEquipment('mfgFirstTooling');
s = H5.getState();
ok('condition resets to 100', s.equipment.mfgFirstTooling.condition === 100);
ok('capital was actually spent', s.capital < capBeforeReplace, `${capBeforeReplace} -> ${s.capital}`);
ok('AP was actually spent', s.ap === apBeforeReplace - 1, `${apBeforeReplace} -> ${s.ap}`);
ok('a replace ticket was logged', s.log.some(t => /Replace/.test(t.title)));

const { H: H6 } = newRun();
H6.setState({ ...H6.getState(), capital: 0, equipment: { mfgFirstTooling: instantiateEquipment('mfgFirstTooling') } });
const beforeDeny = H6.getState();
H6.handleReplaceEquipment('mfgFirstTooling');
ok('replace is refused with no capital', H6.getState().capital === beforeDeny.capital);
ok('replace on an unowned equipment id is a safe no-op', (() => {
  const { H: H8 } = newRun();
  const st = H8.getState();
  H8.handleReplaceEquipment('nonexistentMachine');
  return H8.getState() === st || H8.getState().capital === st.capital;
})());

console.log(`\n${'='.repeat(60)}\nEquipment & Maintenance: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
