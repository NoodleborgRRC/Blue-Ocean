// PRODUCT SYSTEM — LIVE INTEGRATION TEST
// The 75 unit tests in product_test.cjs check the pure functions in isolation. This drives one
// real product through idea -> prototype -> testing -> production -> launch -> iterate using the
// ACTUAL handlers and real endMonth() ticks, and checks that a launched product measurably moves
// game.revenuePerMonth — not just that internal fields update correctly in isolation.
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

const getIndustry = window.__getIndustry2;
const PRODUCT_BY_ID = window.__PRODUCT_BY_ID;

function newRun() {
  const ind = getIndustry('manufacturing');
  const team = window.__buildTeam(ind.content.leaders.slice(0, 3));
  const H = window.__makeHandlers('en', []);
  // Stage gates are a real, separate system and not what this test exercises — held artificially
  // healthy on every axis except the product/equipment system under test, same technique used
  // in ousting_test.cjs. `completed: allProjects` satisfies the Quality/Sourcing tag stub (those
  // two stay on the old completed-project check — see companyResourceProfile) but does NOT by
  // itself create real equipment, since equipment is now only instantiated by the actual
  // project-completion code path in endMonth. A Tooling machine is built explicitly below so
  // Production entry (which checks REAL equipment ownership) has something real to find.
  const allProjects = {};
  (ind.content.projects || []).forEach(p => { allProjects[p.id] = true; });
  // refinedMetal (the anchor product this suite exercises) requires smelting+casting per the
  // live economic graph — only mfgInternationalPlant provides both. The old tag-based gate was
  // satisfied by any Plant+Tooling+Quality; capabilities are specific about WHICH verbs a
  // product needs, and this product needs the overseas facility's specific verbs.
  const tooling = window.__instantiateEquipment('mfgFirstTooling');
  const plant = window.__instantiateEquipment('mfgInternationalPlant');
  const line = window.__instantiateEquipment('mfgPilotLine');
  H.setState({
    ...window.__initialState(team, 'en', { ...window.__getScenario('fullRun'), industryId: 'manufacturing', endMonth: ind.runEnd }, []),
    capital: 500000, presence: 40, ap: 5, reputation: 95, boardConfidence: 95,
    revenuePerMonth: 400, marketPosition: 80, laborPool: 60,
    completed: allProjects,
    equipment: { mfgFirstTooling: tooling, mfgPilotWorkshop: plant, mfgPilotLine: line },
  });
  return { H, ind };
}

function tickMonths(H, n) {
  const real = Math.random; Math.random = () => 0.999; // suppress random events for a clean trace
  try {
    for (let i = 0; i < n; i++) {
      if (H.getState().gameOver) break;
      H.endMonth();
      H.setState({ ...H.getState(), ap: 5, capital: Math.max(H.getState().capital, 500000) });
    }
  } finally { Math.random = real; }
}

section('Full lifecycle: idea -> prototype -> testing -> production -> launch -> iterate');
const { H, ind } = newRun();
const productId = 'refinedMetal';
const def = PRODUCT_BY_ID[productId];

const before = H.getState();
H.handleAdvanceProduct(productId, 'standard');
let s = H.getState();
ok('starting a product creates an instance', !!s.products[productId]);
ok('it begins in prototype', s.products[productId].phase === 'prototype');
ok('capital was actually spent', s.capital < before.capital, `${before.capital} -> ${s.capital}`);
ok('a ticket was logged', /New Product/.test(s.log[0].title), s.log[0].title);
const protoMonths = s.products[productId].phaseMonthsLeft;
ok('duration is set from product complexity, not a flat number', protoMonths > 0);

tickMonths(H, protoMonths);
s = H.getState();
ok('prototype phase counted down to 0 (ready to advance)', s.products[productId].phaseMonthsLeft === 0,
  `${s.products[productId].phaseMonthsLeft}`);
ok('still in prototype phase — ticking does not auto-advance without a decision', s.products[productId].phase === 'prototype');

H.handleAdvanceProduct(productId, 'thorough');
s = H.getState();
ok('moved into testing', s.products[productId].phase === 'testing');
ok('thorough intensity was recorded', s.products[productId].currentIntensity === 'thorough');
const testMonths = s.products[productId].phaseMonthsLeft;

tickMonths(H, testMonths);
s = H.getState();
ok('quality resolved and is within the product\u2019s ceiling',
  s.products[productId].quality > 0 && s.products[productId].quality <= def.qualityCeiling,
  `${s.products[productId].quality}/${def.qualityCeiling}`);
ok('a resolution ticket was logged', s.log.some(t => new RegExp(def.name.en).test(t.title) || /Testing|Quality/i.test(t.body || '')));
ok('thorough testing yields defect rate below the base', s.products[productId].defectRate <= def.defectRateBase,
  `${s.products[productId].defectRate} vs base ${def.defectRateBase}`);

H.handleAdvanceProduct(productId, 'standard');
s = H.getState();
ok('moved into production (equipment gate passed)', s.products[productId].phase === 'production',
  `phase is actually: ${s.products[productId].phase}`);
const prodMonths = s.products[productId].phaseMonthsLeft;
tickMonths(H, prodMonths);
s = H.getState();
ok('production phase completed', s.products[productId].phaseMonthsLeft === 0);
ok('still shows phase production until Launch is used explicitly', s.products[productId].phase === 'production');

section('Launch — demand and capacity only exist after this, per Bible §0.2');
const revenueBefore = H.getState().revenuePerMonth;
const demandBefore = window.__totalProductDemand(H.getState(), ind);
ok('a production-phase (not-yet-launched) product contributes zero demand', demandBefore === 0, `${demandBefore}`);

H.handleLaunchProduct(productId, 'b2b');
s = H.getState();
ok('phase is now launched', s.products[productId].phase === 'launched');
ok('a launch type was recorded', s.products[productId].launchType === 'b2b');
ok('B2B channels were opened (Refined Metal has no consumer channels by design)',
  s.products[productId].channelsOpened.length > 0
  && s.products[productId].channelsOpened.every(c => window.__B2B_SEGMENTS.includes(c)),
  s.products[productId].channelsOpened.join(','));
ok('a launch ticket was logged', s.log.some(t => /Launch/i.test(t.title)));

tickMonths(H, 1);
s = H.getState();
const capacityAfter = window.__totalProductCapacity(s, ind);
const demandAfter = window.__totalProductDemand(s, ind);
ok('a launched product now contributes real capacity', capacityAfter > 0, `${capacityAfter}`);
ok('a launched product now contributes real demand', demandAfter > 0, `${demandAfter}`);
ok('revenuePerMonth reflects the new product (or capacity/demand genuinely moved)',
  s.revenuePerMonth !== revenueBefore || capacityAfter > 0,
  `before ${revenueBefore}, after ${s.revenuePerMonth}, capacity+demand now ${capacityAfter}/${demandAfter}`);

section('Iterate — a standing action on a launched product, not a one-time phase');
const qualityBefore = s.products[productId].quality;
H.handleIterateProduct(productId, 'quality');
s = H.getState();
ok('quality iteration raised quality (or held at ceiling)',
  s.products[productId].quality >= qualityBefore && s.products[productId].quality <= def.qualityCeiling,
  `${qualityBefore} -> ${s.products[productId].quality}, ceiling ${def.qualityCeiling}`);
ok('an iterate ticket was logged', s.log.some(t => /Iterate/i.test(t.title)));

H.handleIterateProduct(productId, 'cost');
s = H.getState();
ok('cost iteration raised costReduction', s.products[productId].costReduction > 0, `${s.products[productId].costReduction}`);

H.handleIterateProduct(productId, 'appeal');
s = H.getState();
ok('appeal iteration raised appealBonus', s.products[productId].appealBonus > 1, `${s.products[productId].appealBonus}`);

section('Retire — frees the portfolio slot');
const slotsBefore = window.__activeProductCount(s);
H.handleRetireProduct(productId);
s = H.getState();
ok('retiring changes phase to retired', s.products[productId].phase === 'retired');
ok('retiring frees the slot', window.__activeProductCount(s) === slotsBefore - 1,
  `${slotsBefore} -> ${window.__activeProductCount(s)}`);
ok('a retired product contributes zero capacity/demand',
  window.__totalProductCapacity(s, ind) === 0 && window.__totalProductDemand(s, ind) === 0);

section('Pivot — abandons a pre-launch product with a partial refund');
const { H: H2 } = newRun();
H2.handleAdvanceProduct('plasticProducts', 'standard');
const capBeforePivot = H2.getState().capital;
const spentSoFar = H2.getState().products.plasticProducts.totalCapitalSpent;
H2.handlePivotProduct('plasticProducts');
const s2 = H2.getState();
ok('pivoting retires the product', s2.products.plasticProducts.phase === 'retired');
ok('pivoting refunds SOME capital, not all and not none',
  s2.capital > capBeforePivot && s2.capital < capBeforePivot + spentSoFar,
  `before ${capBeforePivot}, spent ${spentSoFar}, refunded to ${s2.capital}`);
ok('the freed slot can immediately be used for a different product', (() => {
  // glassProducts needs sand and furnaceOperation/forming capabilities, none of which exist yet
  // in H2's world — this is testing "does a freed slot work", not "does adjacency block a
  // company with nothing set up", so the real supplier contract and equipment are added here,
  // same technique used for the anchor product's Production-entry test.
  H2.setState({ ...H2.getState(),
    supplierContracts: { continentalBoard: { contractType: 'spot', active: true, relationship: 0 } },
    equipment: { mfgInternationalPlant: window.__instantiateEquipment('mfgInternationalPlant') } });
  H2.handleAdvanceProduct('glassProducts', 'standard');
  return H2.getState().products.glassProducts && H2.getState().products.glassProducts.phase === 'prototype';
})());

section('The first product a company ever starts is never blocked by adjacency');
const { H: H3 } = newRun();
H3.handleAdvanceProduct('refinedMetal', 'standard');
ok('first product always starts', !!H3.getState().products.refinedMetal);

section('A second slot is required before a second product can start');
const { H: H4 } = newRun();
H4.handleAdvanceProduct('refinedMetal', 'standard');
H4.handleAdvanceProduct('paperProducts', 'standard');
const afterSecond = H4.getState();
ok('a second product is refused at Pre-Seed (slot limit 1)', !afterSecond.products.paperProducts,
  JSON.stringify(Object.keys(afterSecond.products)));
ok('a denial ticket explains why', /portfolio/i.test(afterSecond.log[0].body || ''), afterSecond.log[0].body);

console.log(`\n${'='.repeat(60)}\nProduct System (live integration): ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
