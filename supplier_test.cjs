// SUPPLIERS & INVENTORY — build order item 3. Unit tests for the pure functions, then a live
// integration section driving real contracts/disruption/acquisition through actual handlers.
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

const SUPPLIERS = window.__SUPPLIER_CHARACTERS;
const SUPPLIER_BY_ID = window.__SUPPLIER_BY_ID;
const CONTRACT_TYPES = window.__CONTRACT_TYPES;
const INVENTORY_STRATEGIES = window.__INVENTORY_STRATEGIES;
const suppliersForMaterial = window.__suppliersForMaterial;
const contractType = window.__contractType;
const contractMonthlyCost = window.__contractMonthlyCost;
const contractMonthlyUnits = window.__contractMonthlyUnits;
const inventoryHoldingCost = window.__inventoryHoldingCost;
const supplierDisruptionChance = window.__supplierDisruptionChance;
const supplierRelationshipBand = window.__supplierRelationshipBand;
const supplierSlotLimit = window.__supplierSlotLimit;
const internationalSourcingUnlocked = window.__internationalSourcingUnlocked;
const backwardIntegrationUnlocked = window.__backwardIntegrationUnlocked;
const ACQUIRE_THRESHOLD = window.__ACQUIRE_SUPPLIER_RELATIONSHIP_THRESHOLD;
const activeMaterialTags = window.__activeMaterialTags;
const materialQualityFloor = window.__materialQualityFloor;
const companyResourceProfile = window.__companyResourceProfile;
const getIndustry = window.__getIndustry2;

// ================================================================ catalog integrity
section('Supplier catalog');
ok('ten suppliers, two per material', SUPPLIERS.length === 10, `${SUPPLIERS.length}`);
const materials = [...new Set(SUPPLIERS.map(s => s.material))];
ok('five distinct materials', materials.length === 5, materials.join(','));
materials.forEach(m => {
  const pair = suppliersForMaterial(m);
  ok(`${m} has exactly 2 suppliers`, pair.length === 2, `${pair.length}`);
  ok(`${m}: one domestic, one international`,
    pair.some(s => s.origin === 'domestic') && pair.some(s => s.origin === 'international'));
});
ok('every supplier is bilingual (bio, tell)', SUPPLIERS.every(s => s.bio.en && s.bio.es && s.tell.en && s.tell.es));
ok('reliability is a valid probability', SUPPLIERS.every(s => s.reliability > 0 && s.reliability <= 1));
ok('qualityGrade is on the 1-10 scale', SUPPLIERS.every(s => s.qualityGrade >= 1 && s.qualityGrade <= 10));
ok('international suppliers are cheaper than their domestic counterpart, same material',
  materials.every(m => {
    const [a, b] = suppliersForMaterial(m);
    const intl = a.origin === 'international' ? a : b;
    const dom = a.origin === 'international' ? b : a;
    return intl.priceIndex < dom.priceIndex;
  }));
ok('international suppliers are less reliable than their domestic counterpart, same material',
  materials.every(m => {
    const [a, b] = suppliersForMaterial(m);
    const intl = a.origin === 'international' ? a : b;
    const dom = a.origin === 'international' ? b : a;
    return intl.reliability < dom.reliability;
  }));
ok('international suppliers have a longer lead time than domestic', materials.every(m => {
  const [a, b] = suppliersForMaterial(m);
  const intl = a.origin === 'international' ? a : b;
  const dom = a.origin === 'international' ? b : a;
  return intl.leadTimeMonths >= dom.leadTimeMonths;
}));
ok('no universally dominant supplier: none beats its counterpart on BOTH price and reliability',
  materials.every(m => {
    const [a, b] = suppliersForMaterial(m);
    const aDominates = a.priceIndex <= b.priceIndex && a.reliability >= b.reliability && (a.priceIndex < b.priceIndex || a.reliability > b.reliability);
    const bDominates = b.priceIndex <= a.priceIndex && b.reliability >= a.reliability && (b.priceIndex < a.priceIndex || b.reliability > a.reliability);
    return !aDominates && !bDominates;
  }));

// ================================================================ contract types
section('Contract types');
ok('five contract types exist', Object.keys(CONTRACT_TYPES).length === 5);
ok('longTerm and exclusive are cheaper than spot',
  CONTRACT_TYPES.longTerm.priceMult < CONTRACT_TYPES.spot.priceMult
  && CONTRACT_TYPES.exclusive.priceMult < CONTRACT_TYPES.spot.priceMult);
ok('exclusive is the cheapest', Object.values(CONTRACT_TYPES).every(ct => CONTRACT_TYPES.exclusive.priceMult <= ct.priceMult));
ok('longTerm and exclusive carry a real minimum purchase obligation',
  CONTRACT_TYPES.longTerm.minPurchaseFraction > 0 && CONTRACT_TYPES.exclusive.minPurchaseFraction > 0);
ok('spot and multiSource carry NO minimum purchase obligation (the flexible ones)',
  CONTRACT_TYPES.spot.minPurchaseFraction === 0 && CONTRACT_TYPES.multiSource.minPurchaseFraction === 0);
ok('exclusive has the highest exit cost (the "locked in" tension)',
  Object.values(CONTRACT_TYPES).every(ct => CONTRACT_TYPES.exclusive.exitCost >= ct.exitCost));
ok('exclusive is flagged as a single point of failure', CONTRACT_TYPES.exclusive.singlePointOfFailure === true);
ok('multiSource is NOT a single point of failure and improves effective reliability',
  !CONTRACT_TYPES.multiSource.singlePointOfFailure && CONTRACT_TYPES.multiSource.reliabilityMod > 1);
ok('an unknown contract type falls back to spot', contractType('nonsense') === CONTRACT_TYPES.spot);

section('Contract cost math');
const redwood = SUPPLIER_BY_ID.redwoodTimber;
ok('cost scales with the supplier\u2019s own priceIndex, at EQUAL volume',
  // Isolating priceIndex specifically: minimumOrder varies independently per supplier (Pacific
  // Rim's is 3x Redwood's, representing bulk container shipping), so comparing at each
  // supplier's own default minimum would let volume swamp the price signal being tested here.
  contractMonthlyCost(redwood, 'spot', 20) > contractMonthlyCost(SUPPLIER_BY_ID.pacificRimHardwoods, 'spot', 20));
// Contracts now carry a VOLUME as well as a price multiplier, so a longer term delivers more
// units — its monthly bill is higher even though the per-unit rate is better. Per-unit is the
// meaningful comparison, and it is what the discount actually promises.
ok('longTerm has a better PER-UNIT rate than spot, same supplier', (() => {
  const perUnit = (ct) => contractMonthlyCost(redwood, ct) / contractMonthlyUnits(redwood, ct);
  return perUnit('longTerm') < perUnit('spot');
})());
ok('longer terms commit you to more volume per month',
  contractMonthlyUnits(redwood, 'exclusive') > contractMonthlyUnits(redwood, 'longTerm')
  && contractMonthlyUnits(redwood, 'longTerm') > contractMonthlyUnits(redwood, 'spot'));
ok('every contract type declares a term or is explicitly rolling',
  Object.values(CONTRACT_TYPES).every(ct => ct.termMonths === null || ct.termMonths > 0));
ok('a longer term carries a higher exit cost', (() => {
  const CT = CONTRACT_TYPES;
  return CT.exclusive.exitCost > CT.longTerm.exitCost && CT.longTerm.exitCost > CT.shortTerm.exitCost;
})());
ok('cost respects the supplier\u2019s minimum order as a floor',
  contractMonthlyCost(redwood, 'spot', 1) === contractMonthlyCost(redwood, 'spot', redwood.minimumOrder));

// ================================================================ inventory
section('Inventory strategies');
ok('three strategies: lean, balanced, high', Object.keys(INVENTORY_STRATEGIES).length === 3);
ok('buffer months rise from lean to high',
  INVENTORY_STRATEGIES.lean.bufferMonths < INVENTORY_STRATEGIES.balanced.bufferMonths
  && INVENTORY_STRATEGIES.balanced.bufferMonths < INVENTORY_STRATEGIES.high.bufferMonths);
ok('working capital cost rises from lean to high',
  INVENTORY_STRATEGIES.lean.workingCapitalMult < INVENTORY_STRATEGIES.balanced.workingCapitalMult
  && INVENTORY_STRATEGIES.balanced.workingCapitalMult < INVENTORY_STRATEGIES.high.workingCapitalMult);
ok('lean has ZERO buffer — a disruption is felt immediately', INVENTORY_STRATEGIES.lean.bufferMonths === 0);
ok('holding cost scales with active contract count', inventoryHoldingCost('balanced', 3) > inventoryHoldingCost('balanced', 1));
ok('holding cost scales with strategy', inventoryHoldingCost('high', 2) > inventoryHoldingCost('lean', 2));
ok('zero contracts costs nothing to hold', inventoryHoldingCost('high', 0) === 0);

// ================================================================ disruption
section('Disruption probability — compounds the same way equipment failure does');
ok('a perfectly reliable supplier on a safe contract has near-zero disruption chance',
  supplierDisruptionChance({ reliability: 1, origin: 'domestic' }, 'spot') === 0);
ok('less reliable suppliers disrupt more often, same contract',
  supplierDisruptionChance({ reliability: 0.5, origin: 'domestic' }, 'spot')
  > supplierDisruptionChance({ reliability: 0.9, origin: 'domestic' }, 'spot'));
ok('international origin raises disruption chance over domestic, same reliability figure',
  supplierDisruptionChance({ reliability: 0.8, origin: 'international' }, 'spot')
  > supplierDisruptionChance({ reliability: 0.8, origin: 'domestic' }, 'spot'));
ok('exclusive contracts raise disruption severity (single point of failure)',
  supplierDisruptionChance({ reliability: 0.7, origin: 'domestic' }, 'exclusive')
  > supplierDisruptionChance({ reliability: 0.7, origin: 'domestic' }, 'spot'));
ok('multiSource LOWERS disruption chance (redundancy)',
  supplierDisruptionChance({ reliability: 0.7, origin: 'domestic' }, 'multiSource')
  < supplierDisruptionChance({ reliability: 0.7, origin: 'domestic' }, 'spot'));
ok('disruption chance is always a valid probability', (() => {
  for (let r = 0; r <= 1; r += 0.1) {
    for (const origin of ['domestic', 'international']) {
      for (const ctId of Object.keys(CONTRACT_TYPES)) {
        const c = supplierDisruptionChance({ reliability: r, origin }, ctId);
        if (c < 0 || c > 1) return false;
      }
    }
  }
  return true;
})());

// ================================================================ relationship bands
section('Relationship bands mirror the investor standing bands');
ok('five bands', ['trusted', 'reliable', 'neutral', 'strained', 'broken'].every(id =>
  ['trusted', 'reliable', 'neutral', 'strained', 'broken'].includes(supplierRelationshipBand(
    { trusted: 90, reliable: 30, neutral: 0, strained: -30, broken: -90 }[id]).id)));
ok('the acquire threshold sits inside the trusted band', ACQUIRE_THRESHOLD >= 55);

// ================================================================ gating
section('Sourcing gate — mirrors how Tooling/Line/Plant unlock equipment');
// Changed deliberately: zero slots at start made the Pre-Seed player unable to buy ANY material,
// so the starting product could never reach production. Buying your primary input is the minimum
// to operate, not a capability you unlock; dual-sourcing is the real strategic unlock.
ok('one slot from the start — every company can source its primary input', supplierSlotLimit({ completed: {} }) === 1);
ok('two slots after mfgSupplierQual', supplierSlotLimit({ completed: { mfgSupplierQual: true } }) === 2);
ok('three slots with both sourcing projects', supplierSlotLimit({ completed: { mfgSupplierQual: true, mfgSecondSource: true } }) === 3);
ok('international sourcing needs its own gate', !internationalSourcingUnlocked({ completed: {} })
  && internationalSourcingUnlocked({ completed: { mfgOffshoreSourcing: true } }));
ok('backward integration needs its own gate', !backwardIntegrationUnlocked({ completed: {} })
  && backwardIntegrationUnlocked({ completed: { mfgBackwardIntegration: true } }));

// ================================================================ materials & quality derivation
section('activeMaterialTags — real contracts, not the old production-phase stub');
ok('no contracts, no materials', activeMaterialTags({ supplierContracts: {}, acquiredSuppliers: {} }).size === 0);
const oneContract = { supplierContracts: { redwoodTimber: { active: true } }, acquiredSuppliers: {} };
ok('an active contract grants its material', activeMaterialTags(oneContract).has('timber'));
const inactiveContract = { supplierContracts: { redwoodTimber: { active: false } }, acquiredSuppliers: {} };
ok('a CANCELLED contract grants nothing', activeMaterialTags(inactiveContract).size === 0);
const disruptedContract = { supplierContracts: { redwoodTimber: { active: true, disruptedMonthsLeft: 2 } }, acquiredSuppliers: {} };
ok('a DISRUPTED contract grants nothing while disrupted (the actual halt effect)', activeMaterialTags(disruptedContract).size === 0);
const acquired = { supplierContracts: {}, acquiredSuppliers: { redwoodTimber: {} } };
ok('an acquired (owned) supplier grants its material with no contract needed', activeMaterialTags(acquired).has('timber'));

section('materialQualityFloor — the weakest-link rule, now spanning materials too');
ok('no required materials means no constraint', materialQualityFloor({ supplierContracts: {}, acquiredSuppliers: {} }, []) === 10);
ok('a missing required material defaults to neutral rather than crashing',
  materialQualityFloor({ supplierContracts: {}, acquiredSuppliers: {} }, ['timber']) === 100);
const mixedQuality = { supplierContracts: {
  redwoodTimber: { active: true },
  shenzhenHardware: { active: true },
}, acquiredSuppliers: {} };
ok('across two materials, the WORSE grade wins, not the average',
  materialQualityFloor(mixedQuality, ['timber', 'metals']) === SUPPLIER_BY_ID.shenzhenHardware.qualityGrade * 10);
ok('a single strong material alone reports its own grade',
  materialQualityFloor(mixedQuality, ['timber']) === SUPPLIER_BY_ID.redwoodTimber.qualityGrade * 10);

section('companyResourceProfile — Sourcing tag now means a real relationship');
const mfg = getIndustry('manufacturing');
ok('no contracts: no Sourcing tag', !companyResourceProfile({ completed: {}, products: {}, equipment: {}, supplierContracts: {}, acquiredSuppliers: {} }, mfg).equipment.has('Sourcing'));
ok('an active contract grants the Sourcing tag',
  companyResourceProfile({ completed: {}, products: {}, equipment: {}, supplierContracts: { redwoodTimber: { active: true } }, acquiredSuppliers: {} }, mfg).equipment.has('Sourcing'));

// ================================================================ live integration
section('Live — contracting a supplier actually makes the material available');
function newRun() {
  const ind = getIndustry('manufacturing');
  const team = window.__buildTeam(ind.content.leaders.slice(0, 3));
  const H = window.__makeHandlers('en', []);
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
function tickMonths(H, n, forceRandom) {
  const real = Math.random;
  Math.random = forceRandom != null ? () => forceRandom : real;
  try {
    for (let i = 0; i < n; i++) {
      if (H.getState().gameOver) break;
      H.endMonth();
      H.setState({ ...H.getState(), ap: 5, capital: Math.max(H.getState().capital, 500000) });
    }
  } finally { Math.random = real; }
}
// No capital floor — for tests that need to actually SEE a capital deduction, which the floor
// above would otherwise mask. Same lesson from the equipment test suite.
function tickMonthsNoFloor(H, n, forceRandom) {
  const real = Math.random;
  Math.random = forceRandom != null ? () => forceRandom : real;
  try {
    for (let i = 0; i < n; i++) {
      if (H.getState().gameOver) break;
      H.endMonth();
      H.setState({ ...H.getState(), ap: 5 });
    }
  } finally { Math.random = real; }
}

const { H } = newRun();
ok('no materials before any contract', !companyResourceProfile(H.getState(), getIndustry('manufacturing')).materials.has('timber'));
H.handleContractSupplier('redwoodTimber', 'spot');
let s = H.getState();
ok('the contract was actually created', !!s.supplierContracts.redwoodTimber);
ok('a New Supplier ticket was logged', /New Supplier/.test(s.log[0].title));
ok('the material is now available', companyResourceProfile(s, getIndustry('manufacturing')).materials.has('timber'));

section('Live — slot limit is enforced');
const { H: H2 } = newRun();
// Base limit is now 1 (nothing completed), so the SECOND contract is the one that gets refused.
H2.setState({ ...H2.getState(), completed: {} });
H2.handleContractSupplier('redwoodTimber', 'spot');
H2.handleContractSupplier('ironcladFasteners', 'spot');
s = H2.getState();
ok('the first contract succeeds at base slot limit', !!s.supplierContracts.redwoodTimber);
ok('a second material contract is refused when the slot limit is 1', !s.supplierContracts.ironcladFasteners);

section('Live — one contract per MATERIAL, not per supplier');
const { H: H3 } = newRun();
H3.handleContractSupplier('redwoodTimber', 'spot');
H3.handleContractSupplier('pacificRimHardwoods', 'spot');
ok('a second supplier for the SAME material is refused', !H3.getState().supplierContracts.pacificRimHardwoods);

section('Live — international sourcing needs its own unlock');
const { H: H4 } = newRun();
H4.setState({ ...H4.getState(), completed: { mfgSupplierQual: true, mfgSecondSource: true } });
H4.handleContractSupplier('pacificRimHardwoods', 'spot');
ok('an international supplier is refused without mfgOffshoreSourcing', !H4.getState().supplierContracts.pacificRimHardwoods);
H4.setState({ ...H4.getState(), completed: { ...H4.getState().completed, mfgOffshoreSourcing: true } });
H4.handleContractSupplier('pacificRimHardwoods', 'spot');
ok('...and succeeds once it\u2019s unlocked', !!H4.getState().supplierContracts.pacificRimHardwoods);

section('Live — cancelling pays the contract type\u2019s exit cost');
const { H: H5 } = newRun();
H5.handleContractSupplier('redwoodTimber', 'longTerm');
const capBeforeCancel = H5.getState().capital;
H5.handleCancelSupplierContract('redwoodTimber');
s = H5.getState();
ok('longTerm cancellation costs real capital', s.capital < capBeforeCancel - 1, `${capBeforeCancel} -> ${s.capital}`);
ok('the contract is now inactive', s.supplierContracts.redwoodTimber.active === false);
ok('materials no longer available after cancelling', !companyResourceProfile(s, getIndustry('manufacturing')).materials.has('timber'));
ok('a Contract Ended ticket was logged', s.log.some(t => /Contract Ended/.test(t.title)));

section('Live — decay/relationship actually build month over month');
const { H: H6 } = newRun();
H6.handleContractSupplier('redwoodTimber', 'spot');
const capBefore6 = H6.getState().capital;
tickMonthsNoFloor(H6, 1, 0.999);
s = H6.getState();
ok('the monthly contract cost was actually charged', s.capital < capBefore6, `${capBefore6} -> ${s.capital}`);
ok('relationship grows with a clean month', s.supplierContracts.redwoodTimber.relationship > 0,
  `${s.supplierContracts.redwoodTimber.relationship}`);

section('Live — the disruption cascade actually fires and does real things');
const { H: H7 } = newRun();
H7.setState({ ...H7.getState(),
  completed: { ...H7.getState().completed, mfgOffshoreSourcing: true },
  supplierContracts: { shenzhenHardware: { contractType: 'exclusive', active: true, relationship: 0 } },
  inventoryStrategy: 'lean',
});
tickMonths(H7, 1, 0.001);
s = H7.getState();
ok('the contract enters disruption', s.supplierContracts.shenzhenHardware.disruptedMonthsLeft > 0,
  `${s.supplierContracts.shenzhenHardware.disruptedMonthsLeft}`);
ok('relationship takes a hit from the disruption', s.supplierContracts.shenzhenHardware.relationship < 0,
  `${s.supplierContracts.shenzhenHardware.relationship}`);
ok('the material is unavailable while disrupted', !companyResourceProfile(s, getIndustry('manufacturing')).materials.has('metals'));
ok('a Supply Disruption ticket was logged', s.log.some(t => /Supply Disruption/.test(t.title)));

section('Live — a high inventory buffer can fully absorb a short disruption');
const { H: H8 } = newRun();
H8.setState({ ...H8.getState(),
  supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: 0 } },
  inventoryStrategy: 'high',
});
tickMonths(H8, 1, 0.001);
s = H8.getState();
ok('a high buffer absorbs a short domestic disruption entirely (no downtime set)',
  !s.supplierContracts.redwoodTimber.disruptedMonthsLeft, `${s.supplierContracts.redwoodTimber.disruptedMonthsLeft}`);
ok('the material stays available through an absorbed disruption', companyResourceProfile(s, getIndustry('manufacturing')).materials.has('timber'));
ok('an Absorbed ticket was logged, not a Disruption ticket', s.log.some(t => /Disruption Absorbed/.test(t.title))
  && !s.log.some(t => /^Supply Disruption/.test(t.title)));

section('Live — downtime counts down and shipments resume');
let downState = H7.getState();
const downtimeStart = downState.supplierContracts.shenzhenHardware.disruptedMonthsLeft;
for (let i = 0; i < downtimeStart; i++) tickMonths(H7, 1, 0.999);
downState = H7.getState();
ok('downtime reaches zero', downState.supplierContracts.shenzhenHardware.disruptedMonthsLeft === 0);
ok('a Shipments Resume ticket was logged', downState.log.some(t => /Shipments Resume/.test(t.title)));
ok('the material is available again', companyResourceProfile(downState, getIndustry('manufacturing')).materials.has('metals'));

section('Live — the idle-commitment cost fires on a long-term contract nobody needs anymore');
const { H: H9 } = newRun();
H9.handleContractSupplier('cascadeFoam', 'longTerm');
const capBefore9 = H9.getState().capital;
// Real randomness here, not forced — forcing it to suppress disruption would ALSO suppress the
// idle-ticket's own 25%-chance roll, since both draw from the same Math.random. 40 months gives
// a >99.9999% chance of the ticket's 25%-per-month roll landing at least once if the mechanism
// works at all, which is what this is actually checking.
let sawIdleTicket = false;
for (let i = 0; i < 40 && !sawIdleTicket; i++) {
  tickMonthsNoFloor(H9, 1);
  sawIdleTicket = H9.getState().log.some(t => /Idle Commitment/.test(t.title));
  if (H9.getState().gameOver) break;
}
ok('an idle-commitment ticket eventually fires on an unused long-term contract', sawIdleTicket);
ok('capital was actually charged across those months', H9.getState().capital < capBefore9,
  `${capBefore9} -> ${H9.getState().capital}`);

section('Live — Acquire (vertical integration) is properly gated');
const { H: H10 } = newRun();
H10.handleContractSupplier('redwoodTimber', 'spot');
H10.handleAcquireSupplier('redwoodTimber');
ok('acquire is refused without mfgBackwardIntegration', Object.keys(H10.getState().acquiredSuppliers).length === 0);

const { H: H11 } = newRun();
H11.setState({ ...H11.getState(), completed: { ...H11.getState().completed, mfgBackwardIntegration: true } });
H11.handleContractSupplier('redwoodTimber', 'spot');
H11.handleAcquireSupplier('redwoodTimber');
ok('acquire is refused without a trusted relationship', Object.keys(H11.getState().acquiredSuppliers).length === 0);

H11.setState({ ...H11.getState(), supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: ACQUIRE_THRESHOLD } } });
const capBeforeAcquire = H11.getState().capital;
const apBeforeAcquire = H11.getState().ap;
H11.handleAcquireSupplier('redwoodTimber');
s = H11.getState();
ok('acquire succeeds once gated AND trusted', !!s.acquiredSuppliers.redwoodTimber);
ok('capital was spent', s.capital < capBeforeAcquire, `${capBeforeAcquire} -> ${s.capital}`);
ok('AP was spent', s.ap === apBeforeAcquire - 2, `${apBeforeAcquire} -> ${s.ap}`);
ok('the old contract is superseded (no longer active)', s.supplierContracts.redwoodTimber.active === false);
ok('the material remains available via ownership, not contract', companyResourceProfile(s, getIndustry('manufacturing')).materials.has('timber'));
ok('an Acquired ticket was logged', s.log.some(t => /Acquired/.test(t.title)));

section('Live — an owned (acquired) supplier is immune to future disruption ticks');
tickMonths(H11, 3, 0.001);
ok('materials stay available across months for an owned supplier regardless of "disruption" rolls',
  companyResourceProfile(H11.getState(), getIndustry('manufacturing')).materials.has('timber'));

section('Live — Inventory strategy changes take effect immediately');
const { H: H12 } = newRun();
H12.handleSetInventoryStrategy('high');
ok('strategy actually changed', H12.getState().inventoryStrategy === 'high');
ok('a ticket confirms it', /Inventory Strategy/.test(H12.getState().log[0].title));

console.log(`\n${'='.repeat(60)}\nSuppliers & Inventory: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
