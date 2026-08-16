// NAMED MANAGERS — build order item 4. Roster integrity and tier math first, then the
// aggregation/assignment rules, then live integration through real handlers and endMonth.
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

const ROSTER = window.__MANAGER_ROSTER;
const MANAGER_BY_ID = window.__MANAGER_BY_ID;
const TIERS = window.__MANAGER_TIERS;
const PERKS = window.__MANAGER_PERKS;
const MANAGER_UNLOCKS = window.__MANAGER_UNLOCKS;
const managerTier = window.__managerTier;
const managerPerkMagnitude = window.__managerPerkMagnitude;
const managerPerkPercent = window.__managerPerkPercent;
const managerUnlocked = window.__managerUnlocked;
const availableManagers = window.__availableManagers;
const managerFx = window.__managerFx;
const managerPayroll = window.__managerPayroll;
const assignedManagers = window.__assignedManagers;
const unmanagedLocationCount = window.__unmanagedLocationCount;
const unmanagedLocationDrag = window.__unmanagedLocationDrag;
const getIndustry = window.__getIndustry2;

// ================================================================ roster shape
section('Roster — the 3/5/7/10 spread');
ok('twenty-five managers total', ROSTER.length === 25, `${ROSTER.length}`);
const byTier = { S: 0, A: 0, B: 0, C: 0 };
ROSTER.forEach(m => { byTier[m.tier] += 1; });
ok('3 S-Tier', byTier.S === 3, `${byTier.S}`);
ok('5 A-Tier', byTier.A === 5, `${byTier.A}`);
ok('7 B-Tier', byTier.B === 7, `${byTier.B}`);
ok('10 C-Tier', byTier.C === 10, `${byTier.C}`);
ok('ids are unique', new Set(ROSTER.map(m => m.id)).size === 25);
ok('names are unique', new Set(ROSTER.map(m => m.name)).size === 25);
ok('every manager is bilingual (role, bio)', ROSTER.every(m => m.role.en && m.role.es && m.bio.en && m.bio.es));
ok('every manager has a real perk', ROSTER.every(m => !!PERKS[m.perkId]));
ok('every manager has a valid tier', ROSTER.every(m => !!TIERS[m.tier]));
ok('every perk in the catalog is actually used by at least one manager',
  Object.keys(PERKS).every(pid => ROSTER.some(m => m.perkId === pid)));

section('Tier scaling');
ok('S > A > B > C in multiplier', TIERS.S.mult > TIERS.A.mult && TIERS.A.mult > TIERS.B.mult && TIERS.B.mult > TIERS.C.mult);
ok('B-Tier is the reference point (multiplier exactly 1)', TIERS.B.mult === 1.0);
ok('hire cost rises with tier', TIERS.S.hireCost > TIERS.A.hireCost && TIERS.A.hireCost > TIERS.B.hireCost && TIERS.B.hireCost > TIERS.C.hireCost);
ok('salary rises with tier', TIERS.S.salary > TIERS.A.salary && TIERS.A.salary > TIERS.B.salary && TIERS.B.salary > TIERS.C.salary);
ok('an unknown tier falls back to C', managerTier('nonsense') === TIERS.C);

section('The three reference values land exactly at B-Tier');
// These are the numbers from the design brief; they anchor the whole scale.
const bSmallBatch = { tier: 'B', perkId: 'smallBatchQuality' };
const bSwitch = { tier: 'B', perkId: 'supplierSwitchRelief' };
const bCompliance = { tier: 'B', perkId: 'complianceShield' };
ok('B-Tier small-batch quality is +15%', managerPerkPercent(bSmallBatch) === 15, `${managerPerkPercent(bSmallBatch)}`);
ok('B-Tier supplier-switch relief is -30%', managerPerkPercent(bSwitch) === 30, `${managerPerkPercent(bSwitch)}`);
ok('B-Tier compliance shield is +10%', managerPerkPercent(bCompliance) === 10, `${managerPerkPercent(bCompliance)}`);
ok('an S-Tier of the same perk is materially stronger than B',
  managerPerkMagnitude({ tier: 'S', perkId: 'smallBatchQuality' }) > managerPerkMagnitude(bSmallBatch) * 2);
ok('a C-Tier of the same perk is materially weaker than B',
  managerPerkMagnitude({ tier: 'C', perkId: 'smallBatchQuality' }) < managerPerkMagnitude(bSmallBatch));
ok('magnitude scales monotonically across all four tiers, for every perk',
  Object.keys(PERKS).every(pid => {
    const vals = ['C', 'B', 'A', 'S'].map(tier => managerPerkMagnitude({ tier, perkId: pid }));
    return vals.every((v, i) => i === 0 || v > vals[i - 1]);
  }));

// ================================================================ unlocks
section('Unlocks — all C-Tier open, everything above earned');
const blank = {};
const openNow = availableManagers(blank, []);
ok('exactly the ten C-Tier managers are available on a blank career', openNow.length === 10, `${openNow.length}`);
ok('all of them are C-Tier', openNow.every(m => m.tier === 'C'));
ok('no S-Tier is available on a blank career', !openNow.some(m => m.tier === 'S'));
ok('every gated manager names a resolvable gate', ROSTER.filter(m => m.unlockedBy).every(m =>
  !!MANAGER_UNLOCKS[m.unlockedBy] || typeof m.unlockedBy === 'string'));
ok('a manager with no gate is always available', managerUnlocked({ id: 'x' }, blank, []));
ok('an existing-marker gate resolves from unlockedIds',
  managerUnlocked({ id: 'x', unlockedBy: 'firstExit' }, blank, ['firstExit'])
  && !managerUnlocked({ id: 'x', unlockedBy: 'firstExit' }, blank, []));
ok('a manager-specific gate resolves from the career record',
  managerUnlocked({ id: 'x', unlockedBy: 'scaleOperator' }, { totalMonths: 500 }, [])
  && !managerUnlocked({ id: 'x', unlockedBy: 'scaleOperator' }, { totalMonths: 499 }, []));
ok('veteranIndustrialist needs 2 Manufacturing wins',
  MANAGER_UNLOCKS.veteranIndustrialist.check({ winsByIndustry: { manufacturing: 2 } })
  && !MANAGER_UNLOCKS.veteranIndustrialist.check({ winsByIndustry: { manufacturing: 1 } }));
ok('peoplePerson needs 3 allies',
  MANAGER_UNLOCKS.peoplePerson.check({ alliesFormed: 3 }) && !MANAGER_UNLOCKS.peoplePerson.check({ alliesFormed: 2 }));
ok('every manager unlock exposes a progress function', Object.values(MANAGER_UNLOCKS).every(u => typeof u.progress === 'function'));
ok('a fully-unlocked career opens the whole roster', (() => {
  const fullCareer = { winsByIndustry: { manufacturing: 5 }, totalMonths: 900, alliesFormed: 5 };
  const allMarkers = ['firstExit', 'restaurateur', 'dealmaker', 'publicCompany', 'nemesis',
    'industrialist', 'turnaroundSpecialist', 'kingmaker', 'peacemaker', 'endurance'];
  return availableManagers(fullCareer, allMarkers).length === 25;
})());

// ================================================================ aggregation
section('managerFx — only ASSIGNED managers contribute');
const neutral = managerFx({ managers: {} });
ok('an empty roster is fully neutral', Object.values(neutral).every(v => v === 0));
const benched = managerFx({ managers: { mgrDeshawn: { managerId: 'mgrDeshawn', assignedLocation: null } } });
ok('a BENCHED manager contributes nothing', benched.throughput === 0);
const assigned = managerFx({ managers: { mgrDeshawn: { managerId: 'mgrDeshawn', assignedLocation: 0 } } });
ok('an ASSIGNED manager contributes their perk', assigned.throughput > 0, `${assigned.throughput}`);
ok('the contribution equals their tier-scaled magnitude',
  Math.abs(assigned.throughput - managerPerkMagnitude(MANAGER_BY_ID.mgrDeshawn)) < 1e-9);

section('Same-perk stacking is additive but clamped');
const twoThroughput = managerFx({ managers: {
  mgrDeshawn: { managerId: 'mgrDeshawn', assignedLocation: 0 },   // B-Tier throughput
  mgrJonah: { managerId: 'mgrJonah', assignedLocation: 1 },       // C-Tier throughput
} });
ok('two throughput managers stack additively', twoThroughput.throughput > assigned.throughput,
  `${assigned.throughput} -> ${twoThroughput.throughput}`);
ok('reduction perks are clamped at 80% so nothing ever becomes free', (() => {
  // Stack every maintenance manager at once and confirm the clamp holds.
  const all = {};
  ROSTER.filter(m => m.perkId === 'maintenanceDiscipline').forEach((m, i) => {
    all[m.id] = { managerId: m.id, assignedLocation: i };
  });
  return managerFx({ managers: all }).maintenanceDiscipline <= 0.8;
})());
ok('bonus perks are clamped at +150%', (() => {
  const all = {};
  ROSTER.filter(m => m.perkId === 'throughput').forEach((m, i) => { all[m.id] = { managerId: m.id, assignedLocation: i }; });
  return managerFx({ managers: all }).throughput <= 1.5;
})());
ok('a bogus manager id in state is ignored rather than crashing',
  managerFx({ managers: { nonsense: { managerId: 'nonsense', assignedLocation: 0 } } }).throughput === 0);

// ================================================================ locations
section('Locations are the slot mechanic');
const g2loc1mgr = { locations: 2, managers: { mgrDeshawn: { managerId: 'mgrDeshawn', assignedLocation: 0 } } };
ok('assignedManagers counts only the assigned', assignedManagers(g2loc1mgr).length === 1);
ok('unmanaged locations are counted', unmanagedLocationCount(g2loc1mgr) === 1);
ok('an unmanaged location creates real production drag', unmanagedLocationDrag(g2loc1mgr) > 0);
ok('a fully-managed company has zero drag',
  unmanagedLocationDrag({ locations: 1, managers: { mgrDeshawn: { managerId: 'mgrDeshawn', assignedLocation: 0 } } }) === 0);
ok('zero locations means zero drag (a pre-expansion company is not penalised)',
  unmanagedLocationDrag({ locations: 0, managers: {} }) === 0);
ok('drag is capped so a large unmanaged empire cannot zero out production',
  unmanagedLocationDrag({ locations: 50, managers: {} }) <= 0.6);

section('Payroll — the bench costs real money');
ok('an empty roster costs nothing', managerPayroll({ managers: {} }) === 0);
ok('a benched manager is still salaried',
  managerPayroll({ managers: { mgrDeshawn: { managerId: 'mgrDeshawn', assignedLocation: null } } }) === TIERS.B.salary);
ok('an S-Tier costs more than a C-Tier',
  managerPayroll({ managers: { mgrIsolde: { managerId: 'mgrIsolde', assignedLocation: 0 } } })
  > managerPayroll({ managers: { mgrJonah: { managerId: 'mgrJonah', assignedLocation: 0 } } }));

// ================================================================ live integration
section('Live — hiring, assigning, and the effect actually reaching the engine');
function newRun(patch) {
  const ind = getIndustry('manufacturing');
  const team = window.__buildTeam(ind.content.leaders.slice(0, 3));
  const H = window.__makeHandlers('en', []);
  const allProjects = {};
  (ind.content.projects || []).forEach(p => { allProjects[p.id] = true; });
  H.setState({
    ...window.__initialState(team, 'en', { ...window.__getScenario('fullRun'), industryId: 'manufacturing', endMonth: ind.runEnd }, []),
    capital: 500000, presence: 40, ap: 5, reputation: 95, boardConfidence: 95,
    revenuePerMonth: 400, marketPosition: 80, laborPool: 60,
    completed: allProjects, locations: 2,
    ...(patch || {}),
  });
  return { H, ind };
}
function tickNoFloor(H, n, forceRandom) {
  const real = Math.random;
  Math.random = forceRandom != null ? () => forceRandom : real;
  try {
    for (let i = 0; i < n; i++) { if (H.getState().gameOver) break; H.endMonth(); H.setState({ ...H.getState(), ap: 5 }); }
  } finally { Math.random = real; }
}

const { H } = newRun();
const capBefore = H.getState().capital;
H.handleHireManager('mgrJonah'); // C-Tier, always available
let s = H.getState();
ok('a C-Tier manager can be hired on a blank career', !!s.managers.mgrJonah);
ok('hiring costs capital', s.capital < capBefore, `${capBefore} -> ${s.capital}`);
ok('a Hired ticket was logged', /Hired/.test(s.log[0].title));
ok('they start on the bench, not assigned', s.managers.mgrJonah.assignedLocation === null);
ok('a benched manager contributes nothing to fx', managerFx(s).throughput === 0);

H.handleAssignManager('mgrJonah', 0);
s = H.getState();
ok('assigning puts them on a location', s.managers.mgrJonah.assignedLocation === 0);
ok('an Assigned ticket was logged', /Assigned/.test(s.log[0].title));
ok('an assigned manager now contributes to fx', managerFx(s).throughput > 0);

section('Live — a locked manager cannot be hired');
const { H: H2 } = newRun();
H2.handleHireManager('mgrIsolde'); // S-Tier, gated behind veteranIndustrialist
ok('an S-Tier manager is refused on a blank career', !H2.getState().managers.mgrIsolde);

section('Live — one manager per location');
const { H: H3 } = newRun();
H3.handleHireManager('mgrJonah');
H3.handleHireManager('mgrLucia');
H3.handleAssignManager('mgrJonah', 0);
H3.handleAssignManager('mgrLucia', 0); // same location, already taken
s = H3.getState();
ok('a second manager cannot take an occupied location', s.managers.mgrLucia.assignedLocation === null);
H3.handleAssignManager('mgrLucia', 1);
ok('...but can take a free one', H3.getState().managers.mgrLucia.assignedLocation === 1);

section('Live — assignment beyond the location count is refused');
const { H: H4 } = newRun({ locations: 1 });
H4.handleHireManager('mgrJonah');
H4.handleAssignManager('mgrJonah', 5);
ok('assigning to a nonexistent location is refused', H4.getState().managers.mgrJonah.assignedLocation === null);

section('Live — unassign returns them to the bench');
const { H: H5 } = newRun();
H5.handleHireManager('mgrJonah');
H5.handleAssignManager('mgrJonah', 0);
H5.handleAssignManager('mgrJonah', null);
s = H5.getState();
ok('unassigning benches them', s.managers.mgrJonah.assignedLocation === null);
ok('an Unassigned ticket was logged', /Unassigned/.test(s.log[0].title));
ok('their perk stops applying', managerFx(s).throughput === 0);

section('Live — payroll actually reaches monthly burn');
const { H: H6 } = newRun();
tickNoFloor(H6, 1, 0.999);
const burnNoManagers = H6.getState().burnPerMonth != null ? H6.getState().burnPerMonth : null;
const { H: H7 } = newRun();
H7.handleHireManager('mgrJonah');
tickNoFloor(H7, 1, 0.999);
const burnWithManager = H7.getState().burnPerMonth != null ? H7.getState().burnPerMonth : null;
if (burnNoManagers != null && burnWithManager != null) {
  ok('hiring a manager raises monthly burn', burnWithManager > burnNoManagers,
    `${burnNoManagers} -> ${burnWithManager}`);
} else {
  // burnPerMonth isn't stored on state in this engine; fall back to comparing capital drawdown.
  const { H: H6b } = newRun();
  const c0 = H6b.getState().capital; tickNoFloor(H6b, 1, 0.999);
  const drawNoMgr = c0 - H6b.getState().capital;
  const { H: H7b } = newRun();
  H7b.handleHireManager('mgrJonah');
  const c1 = H7b.getState().capital; tickNoFloor(H7b, 1, 0.999);
  const drawWithMgr = c1 - H7b.getState().capital;
  ok('hiring a manager increases the monthly capital drawdown (payroll reached burn)',
    drawWithMgr > drawNoMgr, `${drawNoMgr} -> ${drawWithMgr}`);
}

section('Live — dismissing removes them from payroll and hurts morale');
const { H: H8 } = newRun();
H8.handleHireManager('mgrJonah');
const moraleBefore = H8.getState().morale;
H8.handleDismissManager('mgrJonah');
s = H8.getState();
ok('the manager is gone', !s.managers.mgrJonah);
ok('payroll drops to zero', managerPayroll(s) === 0);
ok('morale takes a hit', s.morale < moraleBefore, `${moraleBefore} -> ${s.morale}`);
ok('a Let Go ticket was logged', /Let Go/.test(s.log[0].title));

section('Live — unmanaged locations measurably reduce production capacity');
const { H: H9 } = newRun({ locations: 3 });
H9.setState({ ...H9.getState(),
  equipment: { mfgFirstTooling: window.__instantiateEquipment('mfgFirstTooling') },
  supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: 0 } },
  products: { processedWood: { productId: 'processedWood', phase: 'launched', quality: 6, defectRate: 0.05,
    channelsOpened: ['designConscious'], appealBonus: 1, costReduction: 0 } },
});
const capUnmanaged = window.__totalProductCapacity(H9.getState(), getIndustry('manufacturing'));
H9.handleHireManager('mgrJonah'); H9.handleAssignManager('mgrJonah', 0);
H9.handleHireManager('mgrLucia'); H9.handleAssignManager('mgrLucia', 1);
H9.handleHireManager('mgrEzra'); H9.handleAssignManager('mgrEzra', 2);
const capManaged = window.__totalProductCapacity(H9.getState(), getIndustry('manufacturing'));
ok('a fully-managed company out-produces the same company with empty locations',
  capManaged > capUnmanaged, `${capUnmanaged} -> ${capManaged}`);

console.log(`\n${'='.repeat(60)}\nNamed Managers: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
