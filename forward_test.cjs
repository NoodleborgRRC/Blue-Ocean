// FORWARD INTEGRATION (7b) — Warehousing / Distribution / Retail. Each tier must land on a
// DIFFERENT system, so most of this suite is checking that they don't collapse into one dial.
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

const CHAIN_TIERS = window.__CHAIN_TIERS;
const forwardMarginMultiplier = window.__forwardMarginMultiplier;
const receivableTermsFor = window.__receivableTermsFor;
const retailChannelAppeal = window.__retailChannelAppeal;
const retailCashShare = window.__retailCashShare;
const retailMode = window.__retailMode;
const retailDistributionCost = window.__retailDistributionCost;
const warehouseBufferBonus = window.__warehouseBufferBonus;
const warehouseHoldingRelief = window.__warehouseHoldingRelief;
const reputationExposureMultiplier = window.__reputationExposureMultiplier;
const obsolescenceRisk = window.__obsolescenceRisk;
const tierBuildable = window.__tierBuildable;
const ownsTier = window.__ownsTier;
const productDemandContribution = window.__productDemandContribution;
const PRODUCT_BY_ID = window.__PRODUCT_BY_ID;
const RECEIVABLE_TERMS = window.__RECEIVABLE_TERMS_MONTHS;
const THIRD_PARTY_FEE = window.__THIRD_PARTY_DISTRIBUTION_FEE;
const COLOCATED_FEE = window.__COLOCATED_DISTRIBUTION_FEE;
const getIndustry = window.__getIndustry2;

const base = (tiers) => ({ ownedTiers: tiers || {}, acquiredSuppliers: {}, rivalSuppliers: {},
  products: {}, inventoryStrategy: 'balanced', reputation: 70, laborPool: 60, equipment: {}, supplierContracts: {} });
const own = (id, extra) => base({ [id]: { acquiredMonth: 1, ...(extra || {}) } });

// ================================================================ each tier, a different verb
section('The three tiers are live and each has a distinct job');
['warehousing', 'distribution', 'retail'].forEach(id => {
  ok(`${id} is live`, !!CHAIN_TIERS[id] && !CHAIN_TIERS[id].deferred);
  ok(`${id} is bilingual`, CHAIN_TIERS[id].name.en && CHAIN_TIERS[id].name.es
    && CHAIN_TIERS[id].desc.en && CHAIN_TIERS[id].desc.es);
  ok(`${id} carries permanent overhead`, CHAIN_TIERS[id].monthlyOverhead > 0);
});
ok('retail is the heaviest overhead of the three',
  ['warehousing', 'distribution'].every(id => CHAIN_TIERS.retail.monthlyOverhead > CHAIN_TIERS[id].monthlyOverhead));
ok('retail is also the dearest to build',
  ['warehousing', 'distribution'].every(id => CHAIN_TIERS.retail.buildCost > CHAIN_TIERS[id].buildCost));

section('Forward tiers stand alone — direction\u2019s Q2 answer');
const emptyG = base();
ok('warehousing needs nothing', tierBuildable(emptyG, 'warehousing').open);
ok('distribution needs nothing', tierBuildable(emptyG, 'distribution').open);
ok('retail needs nothing — it is PRICED, not gated', tierBuildable(emptyG, 'retail').open);
ok('the backward chain is still sequential (contrast)', !tierBuildable(emptyG, 'rawMaterials').open);

// ================================================================ warehousing
section('Warehousing → hold more, cheaper (lands on item 3\u2019s inventory system)');
ok('no warehouse means no buffer bonus', warehouseBufferBonus(emptyG) === 0);
ok('owning it adds real buffer months', warehouseBufferBonus(own('warehousing')) > 0);
ok('no warehouse means full holding cost', warehouseHoldingRelief(emptyG) === 0);
ok('owning it cuts holding cost', warehouseHoldingRelief(own('warehousing')) > 0);
ok('holding relief is partial, never free', warehouseHoldingRelief(own('warehousing')) < 1);
ok('warehousing does NOT touch margin — that is not its job',
  forwardMarginMultiplier(own('warehousing')) === 1);
ok('warehousing does NOT touch receivable terms',
  receivableTermsFor(own('warehousing')) === RECEIVABLE_TERMS);

section('Warehousing\u2019s obligation: stock you own can go stale');
ok('no warehouse means no obsolescence exposure', obsolescenceRisk(emptyG) === 0);
ok('owning it creates real exposure', obsolescenceRisk(own('warehousing')) > 0);
ok('a high-inventory strategy is more exposed than a lean one',
  obsolescenceRisk({ ...own('warehousing'), inventoryStrategy: 'high' })
  > obsolescenceRisk({ ...own('warehousing'), inventoryStrategy: 'lean' }));

// ================================================================ distribution
section('Distribution → cut the middleman AND get paid sooner');
ok('no distribution means baseline margin', forwardMarginMultiplier(emptyG) === 1);
ok('owning it raises margin', forwardMarginMultiplier(own('distribution')) > 1);
ok('owning it shortens receivable terms',
  receivableTermsFor(own('distribution')) < RECEIVABLE_TERMS,
  `${RECEIVABLE_TERMS} -> ${receivableTermsFor(own('distribution'))}`);
ok('terms never go to zero — someone still has to be invoiced',
  receivableTermsFor(own('distribution')) >= 1);
ok('distribution does NOT grant a retail channel', retailChannelAppeal(own('distribution'), PRODUCT_BY_ID.processedWood) === 0);

// ================================================================ retail
section('Retail → sell direct, to anyone');
ok('no retail means no shelf', retailChannelAppeal(emptyG, PRODUCT_BY_ID.processedWood) === 0);
ok('owning it puts every product on a shelf',
  window.__FURNITURE_PRODUCTS.every(p => retailChannelAppeal(own('retail'), p) > 0));
ok('the shelf is uniform across the catalogue', (() => {
  const vals = window.__FURNITURE_PRODUCTS.map(p => retailChannelAppeal(own('retail'), p));
  return new Set(vals).size === 1;
})());
ok('the shelf is MODEST — a stranded product becomes viable, never optimal',
  retailChannelAppeal(own('retail'), PRODUCT_BY_ID.refinedMetal) < 1);
ok('retail raises margin more than distribution does',
  forwardMarginMultiplier(own('retail')) > forwardMarginMultiplier(own('distribution')));

section('Retail rescues a product with no open channel at all');
const mfg = getIndustry('manufacturing');
const stranded = { productId: 'processedWood', phase: 'launched', quality: 6, defectRate: 0.05,
  channelsOpened: [], launchType: 'b2c', appealBonus: 1, costReduction: 0 };
const noRetail = { ...base(), products: { processedWood: stranded } };
const withRetail = { ...own('retail'), products: { processedWood: stranded } };
ok('a product with no open channel sells nothing without retail',
  productDemandContribution(stranded, PRODUCT_BY_ID.processedWood, noRetail) === 0);
ok('...but becomes viable once you own shelves',
  productDemandContribution(stranded, PRODUCT_BY_ID.processedWood, withRetail) > 0,
  `${productDemandContribution(stranded, PRODUCT_BY_ID.processedWood, withRetail)}`);
// processedWood is upstream (processedMaterial tier) with B2B-only appeal by design — no
// consumer segments exist for it to have opened in the first place. Real B2B channels instead.
const wellChanneled = { ...stranded, channelsOpened: ['developers', 'independentRetailers'] };
ok('a well-channeled product still outsells a retail-only one',
  productDemandContribution(wellChanneled, PRODUCT_BY_ID.processedWood, withRetail)
  > productDemandContribution(stranded, PRODUCT_BY_ID.processedWood, withRetail));

section('Retail settles as CASH, not receivables (direction\u2019s Q1)');
const b2bProduct = { productId: 'glassProducts', phase: 'launched', quality: 6, defectRate: 0.05,
  channelsOpened: ['independentRetailers'], launchType: 'b2b', appealBonus: 1, costReduction: 0 };
ok('no retail means no cash share', retailCashShare({ ...base(), products: { glassProducts: b2bProduct } }, mfg) === 0);
const retailShare = retailCashShare({ ...own('retail'), products: { glassProducts: b2bProduct } }, mfg);
ok('owning retail diverts some revenue to immediate cash', retailShare > 0, `${retailShare.toFixed(2)}`);
ok('but not all of it — B2B accounts still exist alongside your shop', retailShare < 1);
ok('an industry with no product catalogue is unaffected',
  retailCashShare({ ...own('retail'), products: { glassProducts: b2bProduct } }, getIndustry('hospitality')) === 0);

// ================================================================ co-location
section('Co-location — something has to move the goods');
ok('no retail means no logistics cost', retailDistributionCost(emptyG) === 0);
ok('standalone retail without distribution pays a third party',
  retailDistributionCost(own('retail')) === THIRD_PARTY_FEE);
ok('co-located retail pays almost nothing — goods walk across the yard',
  retailDistributionCost(own('retail', { colocated: true })) === COLOCATED_FEE);
ok('owning distribution eliminates the fee entirely',
  retailDistributionCost(base({ retail: { colocated: false }, distribution: {} })) === 0);
ok('co-location is much cheaper than a third party', COLOCATED_FEE < THIRD_PARTY_FEE);
ok('retailMode reports correctly',
  retailMode(own('retail', { colocated: true })) === 'colocated' && retailMode(own('retail')) === 'standalone');

section('Co-location trades reach for cost — a real decision, not a free win');
ok('co-located retail earns LESS margin than standalone',
  forwardMarginMultiplier(own('retail', { colocated: true })) < forwardMarginMultiplier(own('retail')));
ok('...but still more than no retail at all',
  forwardMarginMultiplier(own('retail', { colocated: true })) > 1);

// ================================================================ composition & obligations
section('Margin composes across tiers');
const both = base({ distribution: {}, retail: {} });
ok('owning both stacks multiplicatively',
  forwardMarginMultiplier(both) > forwardMarginMultiplier(own('retail')));
ok('the stack stays bounded (no runaway margin)', forwardMarginMultiplier(both) < 2);
ok('backward tiers do NOT affect forward margin — separate halves of the chain',
  forwardMarginMultiplier(base({ processing: {}, rawMaterials: {} })) === 1);

section('Retail\u2019s obligation: consumer-facing exposure');
ok('without retail, reputation exposure is baseline', reputationExposureMultiplier(emptyG) === 1);
ok('with retail, problems hit harder', reputationExposureMultiplier(own('retail')) > 1);

// ================================================================ live
section('Live — building and running forward tiers');
function newRun(patch) {
  const ind = getIndustry('manufacturing');
  const team = window.__buildTeam(ind.content.leaders.slice(0, 3));
  const H = window.__makeHandlers('en', []);
  const allProjects = {};
  (ind.content.projects || []).forEach(p => { allProjects[p.id] = true; });
  H.setState({
    ...window.__initialState(team, 'en', { ...window.__getScenario('fullRun'), industryId: 'manufacturing', endMonth: ind.runEnd }, []),
    capital: 500000, presence: 40, ap: 6, reputation: 95, boardConfidence: 95,
    revenuePerMonth: 300, marketPosition: 60, laborPool: 60, completed: allProjects,
    ...(patch || {}),
  });
  return { H, ind };
}
function tick(H, n, forceRandom) {
  const real = Math.random;
  Math.random = forceRandom != null ? () => forceRandom : real;
  try { for (let i = 0; i < n; i++) { if (H.getState().gameOver) break; H.endMonth(); H.setState({ ...H.getState(), ap: 6 }); } }
  finally { Math.random = real; }
}

const { H } = newRun();
H.handleBuildTier('retail', true); // co-located
let s = H.getState();
ok('retail can be built co-located', ownsTier(s, 'retail') && retailMode(s) === 'colocated');
ok('the ticket explains the co-location trade', /[Cc]o-located/.test(s.log[0].body), s.log[0].body.slice(0, 140));

const { H: H2 } = newRun();
H2.handleBuildTier('retail', false);
ok('retail can be built standalone', retailMode(H2.getState()) === 'standalone');
ok('the ticket explains the standalone trade', /[Ss]tandalone/.test(H2.getState().log[0].body));

section('Live — standalone retail costs more to run than co-located');
const { H: Hcolo } = newRun({ ownedTiers: { retail: { acquiredMonth: 1, colocated: true } } });
const c0 = Hcolo.getState().capital;
tick(Hcolo, 1, 0.999);
const drawColo = c0 - Hcolo.getState().capital;
const { H: Hstand } = newRun({ ownedTiers: { retail: { acquiredMonth: 1, colocated: false } } });
const c1 = Hstand.getState().capital;
tick(Hstand, 1, 0.999);
const drawStand = c1 - Hstand.getState().capital;
ok('standalone retail draws more cash per month', drawStand > drawColo, `${drawColo} -> ${drawStand}`);

section('Live — owning distribution removes the retail logistics fee');
const { H: Hdist } = newRun({ ownedTiers: { retail: { colocated: false }, distribution: {} } });
ok('the fee is gone', retailDistributionCost(Hdist.getState()) === 0);

section('Live — distribution shortens the receivable term end to end');
const b2bLaunched = { glassProducts: { productId: 'glassProducts', phase: 'launched', quality: 6, defectRate: 0.05,
  channelsOpened: ['independentRetailers'], launchType: 'b2b', appealBonus: 1, costReduction: 0 } };
const { H: Hterms } = newRun({ products: b2bLaunched,
  equipment: { mfgFirstTooling: window.__instantiateEquipment('mfgFirstTooling') },
  supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: 0 } } });
tick(Hterms, 1, 0.999);
const longTerms = (Hterms.getState().receivables || []).map(r => r.monthsLeft);
const { H: Hterms2 } = newRun({ products: b2bLaunched, ownedTiers: { distribution: {} },
  equipment: { mfgFirstTooling: window.__instantiateEquipment('mfgFirstTooling') },
  supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: 0 } } });
tick(Hterms2, 1, 0.999);
const shortTerms = (Hterms2.getState().receivables || []).map(r => r.monthsLeft);
ok('receivables are dated sooner with distribution owned',
  longTerms.length && shortTerms.length && Math.max(...shortTerms) < Math.max(...longTerms),
  `${JSON.stringify(longTerms)} -> ${JSON.stringify(shortTerms)}`);

section('Live — retail raises revenue through margin');
// Revenue must be large enough that a 1.30x multiplier survives integer rounding — at a
// throughput of 2 the uplift rounds away, which is correct behaviour but untestable. Capacity
// and demand are set directly rather than grown, since this isolates the margin term.
const bigProducts = { glassProducts: { productId: 'glassProducts', phase: 'launched', quality: 8, defectRate: 0.02,
  channelsOpened: ['independentRetailers', 'nationalRetailChains'], launchType: 'b2b', appealBonus: 1, costReduction: 0 } };
const { H: Hrev } = newRun({ products: bigProducts, capacity: 400, demand: 400,
  equipment: { mfgFirstTooling: window.__instantiateEquipment('mfgFirstTooling') },
  supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: 0 } } });
tick(Hrev, 1, 0.999);
const revNoRetail = Hrev.getState().revenuePerMonth;
const { H: Hrev2 } = newRun({ products: bigProducts, capacity: 400, demand: 400,
  ownedTiers: { retail: { colocated: false } },
  equipment: { mfgFirstTooling: window.__instantiateEquipment('mfgFirstTooling') },
  supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: 0 } } });
tick(Hrev2, 1, 0.999);
const revRetail = Hrev2.getState().revenuePerMonth;
ok('revenue is higher with retail owned', revRetail > revNoRetail, `${revNoRetail} -> ${revRetail}`);

section('Live — warehousing absorbs a disruption that would otherwise land');
const { H: Hwh } = newRun({
  ownedTiers: { warehousing: {} },
  supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: 0 } },
  inventoryStrategy: 'lean', // zero buffer of its own — the warehouse is the only cushion
});
tick(Hwh, 1, 0.001); // force the disruption roll
ok('a lean company with a warehouse still absorbs a short disruption',
  !(Hwh.getState().supplierContracts.redwoodTimber.disruptedMonthsLeft > 0),
  `${Hwh.getState().supplierContracts.redwoodTimber.disruptedMonthsLeft}`);

console.log(`\n${'='.repeat(60)}\nForward Integration (7b): ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
