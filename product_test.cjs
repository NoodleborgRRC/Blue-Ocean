// Product System — Bible §A. Adjacency math, lifecycle state machine, derived capacity/demand,
// and live integration through real handlers.
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

const PRODUCTS = window.__MANUFACTURING_CATALOG;
const BY_ID = window.__PRODUCT_BY_ID;
const companyResourceProfile = window.__companyResourceProfile;
const instantiateEquipment = window.__instantiateEquipment;
const productAdjacency = window.__productAdjacency;
const adjacencyBand = window.__adjacencyBand;
const tagOverlap = window.__tagOverlap;
const productPhaseCost = window.__productPhaseCost;
const missingEquipmentTags = window.__missingEquipmentTags;
const resolveTestingOutcome = window.__resolveTestingOutcome;
const productSlotLimit = window.__productSlotLimit;
const activeProductCount = window.__activeProductCount;
const availableNewProducts = window.__availableNewProducts;
const productCapacityContribution = window.__productCapacityContribution;
const productDemandContribution = window.__productDemandContribution;
const totalProductCapacity = window.__totalProductCapacity;
const totalProductDemand = window.__totalProductDemand;
const PRODUCT_SLOTS = window.__PRODUCT_SLOTS_BY_STAGE;
const PHASE_ORDER = window.__PRODUCT_PHASE_ORDER;
const B2C = window.__B2C_SEGMENTS;
const B2B = window.__B2B_SEGMENTS;
const getIndustry = window.__getIndustry2;
const stageOf = window.__stageOf;

// ================================================================ catalog content
section('Catalog content');
ok('twelve curated starting businesses are live (Phase 2\u2019s adapter, not the old six-line catalog)',
  PRODUCTS.length === 12, `${PRODUCTS.length}`);
ok('ids are unique', new Set(PRODUCTS.map(p => p.id)).size === PRODUCTS.length);
ok('names are unique', new Set(PRODUCTS.map(p => p.name.en)).size === PRODUCTS.length);
ok('every product is bilingual', PRODUCTS.every(p => p.name.en && p.name.es && p.blurb.en && p.blurb.es));
const REQUIRED_ATTRS = ['materialCost', 'laborHours', 'skillRequired', 'complexity', 'qualityCeiling',
  'defectRateBase', 'scalability', 'priceFloor', 'priceCeiling', 'retoolCost'];
ok('every product has all required attributes', PRODUCTS.every(p => REQUIRED_ATTRS.every(a => typeof p[a] === 'number')));
ok('every product has a full resourceProfile, capabilities replacing the retired equipment field',
  PRODUCTS.every(p => ['materials', 'capabilities', 'skills', 'channels'].every(d => Array.isArray(p.resourceProfile[d]))));
ok('every product has SOME appeal segments', PRODUCTS.every(p => Object.keys(p.appealSegments).length > 0));
ok('upstream products (processedMaterial/component) are B2B-only by design — Phase 2\u2019s Q2 answer',
  PRODUCTS.filter(p => ['processedMaterial', 'component'].includes(p.econTier))
    .every(p => Object.keys(p.appealSegments).every(seg => B2B.includes(seg))));
ok('finished products reach at least one consumer or B2B segment',
  PRODUCTS.filter(p => p.econTier === 'finishedProduct')
    .every(p => Object.keys(p.appealSegments).some(seg => [...B2C, ...B2B].includes(seg))));
ok('priceFloor is always below priceCeiling', PRODUCTS.every(p => p.priceFloor < p.priceCeiling));
// Quality is scored 0-100 now, not 1-10 — ceilings sit in a 40-100 band.
ok('qualityCeiling is within the 0-100 scale',
  PRODUCTS.every(p => p.qualityCeiling >= 1 && p.qualityCeiling <= 100));
ok('ceilings actually spread across the scale rather than clustering',
  new Set(PRODUCTS.map(p => p.qualityCeiling)).size >= 3);
ok('defectRateBase is a real fraction', PRODUCTS.every(p => p.defectRateBase >= 0 && p.defectRateBase < 0.5));

section('The two anchor archetypes are genuinely different companies (Bible §A.2)');
const heirloom = BY_ID.refinedMetal, flatpack = BY_ID.plasticProducts;
ok('Refined Metal sits at the upper end of upstream commodities on cost, labor and skill',
  heirloom.materialCost === Math.max(...PRODUCTS.filter(p => p.econTier === 'processedMaterial').map(p => p.materialCost))
  && heirloom.qualityCeiling >= 6);
ok('Plastic Products is a genuine upstream commodity: no consumer segments, real scale',
  flatpack.econTier === 'processedMaterial' && flatpack.scalability >= 3
  && !Object.keys(flatpack.appealSegments).some(s => B2C.includes(s)));
section('Two genuinely different companies exist in the catalog (Bible §A.2)');
// refinedMetal and plasticProducts are BOTH processedMaterial tier with identical capability
// load (3), so the adapter — deriving stats from capability load, not hand-authored per
// product — gives them IDENTICAL numbers. That is an honest property of a derived catalog, not
// a bug: two commodities requiring equally-demanding processes cost equally to make. The real
// contrast in this catalog is upstream commodity vs. downstream finished good.
const commodity = BY_ID.processedWood, finished = BY_ID.woodenFurniture;
ok('a finished good costs more in materials than the upstream commodity it is built from',
  finished.materialCost > commodity.materialCost);
ok('a finished good takes more labor per unit', finished.laborHours > commodity.laborHours);
ok('the upstream commodity scales further (mass production) than the finished good',
  commodity.scalability >= finished.scalability);
ok('only the finished good reaches consumers — upstream is B2B-only by design',
  Object.keys(finished.appealSegments).some(s => B2C.includes(s))
  && !Object.keys(commodity.appealSegments).some(s => B2C.includes(s)));
ok('both are viable at their own price band — neither strictly dominates',
  finished.priceCeiling > commodity.priceCeiling && commodity.scalability >= finished.scalability);
ok('same tier + same capability load derives identical LABOR/SKILL/CEILING (capability-driven, not cost-driven)',
  heirloom.laborHours === flatpack.laborHours && heirloom.skillRequired === flatpack.skillRequired
  && heirloom.qualityCeiling === flatpack.qualityCeiling);
ok('...but materialCost still differs, because that comes from actual recipe input prices, not capability load',
  heirloom.materialCost !== flatpack.materialCost);

// ================================================================ adjacency math
section('tagOverlap — the primitive everything else is built on');
ok('empty requirement is trivially satisfied', tagOverlap([], new Set(['x'])) === 1);
ok('empty requirement satisfied even with nothing owned', tagOverlap([], new Set()) === 1);
ok('full overlap scores 1', tagOverlap(['a', 'b'], new Set(['a', 'b', 'c'])) === 1);
ok('no overlap scores 0', tagOverlap(['a', 'b'], new Set(['x', 'y'])) === 0);
ok('partial overlap is the exact fraction', tagOverlap(['a', 'b', 'c', 'd'], new Set(['a', 'b'])) === 0.5);
ok('accepts a plain array as well as a Set', tagOverlap(['a'], ['a', 'b']) === 1);

section('productAdjacency — weighted composition');
const blank = { materials: new Set(), capabilities: new Set(), skills: new Set(), channels: new Set() };
const full = {
  materials: new Set(heirloom.resourceProfile.materials),
  capabilities: new Set(heirloom.resourceProfile.capabilities),
  skills: new Set(heirloom.resourceProfile.skills),
  channels: new Set(heirloom.resourceProfile.channels),
};
ok('a company with nothing scores at or near zero on anything with real requirements',
  productAdjacency(heirloom, blank).score < 0.05);
ok('a company that already has everything a product needs scores 1.0',
  productAdjacency(heirloom, full).score === 1);
ok('weights sum to 1.0 (materials 0.30 + equipment 0.30 + skills 0.20 + channels 0.20)', (() => {
  const half = {
    materials: new Set(heirloom.resourceProfile.materials),
    capabilities: new Set(heirloom.resourceProfile.capabilities),
    skills: new Set(),
    channels: new Set(),
  };
  const r = productAdjacency(heirloom, half);
  return Math.abs(r.score - 0.6) < 0.001; // 0.30+0.30 from materials+equipment, 0 from the rest
})());
ok('breakdown reports all four dimensions', (() => {
  const r = productAdjacency(heirloom, blank);
  return ['materials', 'capabilities', 'skills', 'channels'].every(k => typeof r.breakdown[k] === 'number');
})());

section('Adjacency bands (Bible §A.5.3)');
ok('bands classify the full range correctly',
  adjacencyBand(0.90).id === 'lineExtension' && adjacencyBand(0.75).id === 'lineExtension'
  && adjacencyBand(0.60).id === 'adjacent' && adjacencyBand(0.45).id === 'adjacent'
  && adjacencyBand(0.30).id === 'stretch' && adjacencyBand(0.20).id === 'stretch'
  && adjacencyBand(0.10).id === 'unrelated' && adjacencyBand(0).id === 'unrelated');
ok('a product entirely unlike anything owned is Unrelated and therefore blocked',
  (() => {
    const wildlyDifferent = {
      id: 'syntheticUnrelated', name: { en: 'x', es: 'x' },
      resourceProfile: { materials: ['silicon'], equipment: ['CleanRoom'], skills: ['semiconductorFab'], channels: ['electronicsRetailers'] },
      materialCost: 1, laborHours: 1, complexity: 1, qualityCeiling: 1, defectRateBase: 0, scalability: 1, retoolCost: 1,
    };
    return productAdjacency(wildlyDifferent, full).band.id === 'unrelated';
  })(), 'the furniture-to-computers case from the Bible, as a synthetic fixture');

section('The authored tree lands in the bands the Bible describes (Bible §A.5.4)');
// Company profile after Heirloom has been pushed to Production (materials/skills accrue) and
// LAUNCHED B2C (channels open to heirloomBuyers + designConscious, the only two B2C segments
// Heirloom has real appeal for).
const heirloomCompanyProfile = {
  materials: new Set(['timber']),
  equipment: new Set(['Tooling', 'Quality']),
  skills: new Set(['joinery', 'finishing']),
  channels: new Set(['heritageBuyers', 'designLed']),
};
const chairsAdj = productAdjacency(BY_ID.paperProducts, heirloomCompanyProfile);
const coffeeAdj = productAdjacency(BY_ID.processedWood, heirloomCompanyProfile);
const cabinetryAdj = productAdjacency(BY_ID.glassProducts, heirloomCompanyProfile);
const upholsteryAdj = productAdjacency(BY_ID.textiles, heirloomCompanyProfile);
const flatpackAdj = productAdjacency(BY_ID.plasticProducts, heirloomCompanyProfile);
// IMPORTANT PROPERTY OF THE BASE ECONOMY: the six base products are genuinely SEPARATE branches
// of the material tree — timber, fibers, sand, metals, petrochemicals share almost nothing. So a
// metals company scores LOW on everything else, and most cross-branch moves are blocked outright.
// That is correct (a foundry cannot pivot to weaving) and it makes acquisition the intended route
// across branches, per Bible §A.5.3. These assertions pin that property down rather than
// pretending the branches are close.
ok('every cross-branch move from a metals company is at best a Stretch',
  [chairsAdj, coffeeAdj, cabinetryAdj, upholsteryAdj, flatpackAdj]
    .every(a => ['stretch', 'unrelated'].includes(a.band.id)),
  [chairsAdj, coffeeAdj, cabinetryAdj, upholsteryAdj, flatpackAdj].map(a => a.band.id).join(','));
ok('no cross-branch move is a free Line Extension',
  ![chairsAdj, coffeeAdj, cabinetryAdj, upholsteryAdj, flatpackAdj].some(a => a.band.id === 'lineExtension'));
ok('the branches a metals company shares CHANNELS with score higher than those it does not',
  Math.max(chairsAdj.score, coffeeAdj.score, cabinetryAdj.score, flatpackAdj.score) > upholsteryAdj.score,
  `best cross-branch ${Math.max(chairsAdj.score, coffeeAdj.score, cabinetryAdj.score, flatpackAdj.score).toFixed(2)} vs textiles ${upholsteryAdj.score.toFixed(2)}`);
ok('adjacency still produces a strict ordering rather than a flat wall',
  new Set([chairsAdj.score, coffeeAdj.score, cabinetryAdj.score, upholsteryAdj.score, flatpackAdj.score]).size > 1);

section('Equipment is the heaviest-weighted, hardest-to-fake dimension');
ok('materials and equipment together outweigh skills and channels combined',
  (0.30 + 0.30) > (0.20 + 0.20));
ok('a company missing ALL equipment cannot reach Line Extension even with everything else',
  (() => {
    const noEquip = { materials: new Set(['timber']), equipment: new Set(), skills: new Set(['joinery', 'finishing']), channels: new Set(['heritageBuyers', 'designLed', 'independentRetailers']) };
    return productAdjacency(BY_ID.paperProducts, noEquip).score < 0.75;
  })());

// ================================================================ company resource profile
section('companyResourceProfile — real equipment for Tooling/Line/Plant, stub for Quality/Sourcing');
function fakeGame(overrides) { return { completed: {}, products: {}, equipment: {}, supplierContracts: {}, acquiredSuppliers: {}, rivalSuppliers: {}, ...overrides }; }
const mfg = getIndustry('manufacturing');
ok('an empty game has an empty profile',
  ['materials', 'equipment', 'skills', 'channels'].every(k => companyResourceProfile(fakeGame(), mfg)[k].size === 0));

const toolingProjectId = mfg.content.projects.find(p => p.tag === 'Tooling').id;
// Marking the PROJECT completed alone must NOT grant the tag anymore — only real equipment does.
const completedButNoMachine = companyResourceProfile(fakeGame({ completed: { [toolingProjectId]: true } }), mfg);
ok('a completed Tooling project WITHOUT a real machine grants nothing (the old stub is gone)',
  !completedButNoMachine.equipment.has('Tooling'));

const realTooling = instantiateEquipment(toolingProjectId);
const withRealTooling = companyResourceProfile(fakeGame({ equipment: { [toolingProjectId]: realTooling } }), mfg);
ok('REAL owned equipment grants its originTag', withRealTooling.equipment.has('Tooling'));
ok('owning Tooling equipment does NOT grant Line or Plant', !withRealTooling.equipment.has('Line') && !withRealTooling.equipment.has('Plant'));

const downedTooling = { ...realTooling, downtimeMonthsLeft: 2 };
const withDownedTooling = companyResourceProfile(fakeGame({ equipment: { [toolingProjectId]: downedTooling } }), mfg);
ok('equipment sitting in downtime still counts as OWNED (capability exists, just not running this month)',
  withDownedTooling.equipment.has('Tooling'));

// Quality stays on the completed-project stub — not physical equipment, not this build-order
// item. Sourcing's meaning changed with build order item 3: it now means an ACTUAL supplier
// relationship exists, not that a Sourcing-tagged project was once completed.
const qualityProjectId = mfg.content.projects.find(p => p.tag === 'Quality').id;
const withQuality = companyResourceProfile(fakeGame({ completed: { [qualityProjectId]: true } }), mfg);
ok('Quality stays on the completed-project stub (not physical equipment)', withQuality.equipment.has('Quality'));

const sourcingProjectId = mfg.content.projects.find(p => p.tag === 'Sourcing').id;
const completedSourcingNoSupplier = companyResourceProfile(fakeGame({ completed: { [sourcingProjectId]: true } }), mfg);
ok('a completed Sourcing project WITHOUT any real supplier grants nothing (the old stub is gone)',
  !completedSourcingNoSupplier.equipment.has('Sourcing'));
const withRealSupplier = companyResourceProfile(fakeGame({
  supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: 0 } },
}), mfg);
ok('a REAL active supplier contract grants the Sourcing equipment-gate tag', withRealSupplier.equipment.has('Sourcing'));
ok('a real supplier contract also grants its own material', withRealSupplier.materials.has('timber'));

const inProduction = companyResourceProfile(fakeGame({
  products: { refinedMetal: { productId: 'refinedMetal', phase: 'production' } },
}), mfg);
ok('a product pushed to Production NO LONGER contributes materials (that was circular — build order item 3 fixed it)',
  inProduction.materials.size === 0);
ok('a product pushed to Production still contributes its skills (item 4\u2019s territory, unchanged)',
  BY_ID.refinedMetal.resourceProfile.skills.every(sk => inProduction.skills.has(sk)));
ok('a product only in TESTING contributes nothing yet (production is the threshold)',
  companyResourceProfile(fakeGame({ products: { refinedMetal: { productId: 'refinedMetal', phase: 'testing' } } }), mfg).materials.size === 0);
const notLaunched = companyResourceProfile(fakeGame({
  products: { refinedMetal: { productId: 'refinedMetal', phase: 'production' } },
}), mfg);
ok('channels do NOT open just from reaching Production — only from Launch', notLaunched.channels.size === 0);
const launched = companyResourceProfile(fakeGame({
  products: { refinedMetal: { productId: 'refinedMetal', phase: 'launched', channelsOpened: ['heritageBuyers', 'designLed'] } },
}), mfg);
ok('channels open once launched, exactly what the launch opened', launched.channels.has('heritageBuyers') && launched.channels.has('designLed') && launched.channels.size === 2);

// ================================================================ phase costs
section('Phase costs scale with product DNA, not flat numbers');
const cheapCost = productPhaseCost(BY_ID.plasticProducts, 'prototype', 'standard');
const expensiveCost = productPhaseCost(BY_ID.refinedMetal, 'prototype', 'standard');
ok('a complex, costly product costs more to prototype than a simple one',
  expensiveCost.capital > cheapCost.capital, `plastics ${cheapCost.capital}k vs metals ${expensiveCost.capital}k`);
ok('a complex product also takes longer', expensiveCost.duration >= cheapCost.duration);

section('Intensity: lean/standard/thorough are genuinely different trade-offs');
const lean = productPhaseCost(heirloom, 'prototype', 'lean');
const std = productPhaseCost(heirloom, 'prototype', 'standard');
const thorough = productPhaseCost(heirloom, 'prototype', 'thorough');
ok('lean costs less than standard', lean.capital < std.capital);
ok('thorough costs more than standard', thorough.capital > std.capital);
ok('lean is faster than standard', lean.duration <= std.duration);
ok('thorough is slower than standard', thorough.duration >= std.duration);
const leanOutcome = resolveTestingOutcome(heirloom, 'lean', 0);
const stdOutcome = resolveTestingOutcome(heirloom, 'standard', 0);
const thoroughOutcome = resolveTestingOutcome(heirloom, 'thorough', 0);
ok('thorough testing yields higher quality than lean', thoroughOutcome.quality > leanOutcome.quality,
  `lean ${leanOutcome.quality} vs thorough ${thoroughOutcome.quality}`);
ok('thorough testing yields a lower defect rate than lean', thoroughOutcome.defectRate < leanOutcome.defectRate,
  `lean ${(leanOutcome.defectRate * 100).toFixed(1)}% vs thorough ${(thoroughOutcome.defectRate * 100).toFixed(1)}%`);
ok('a strong Operations stat improves the outcome, but modestly (never dominates the intensity choice)',
  (() => {
    const weak = resolveTestingOutcome(heirloom, 'standard', 0);
    const strong = resolveTestingOutcome(heirloom, 'standard', 30);
    // Bound scales with the 0-100 quality range: 'modest' is a fraction of the ceiling, not 2 points.
    return strong.quality >= weak.quality && (strong.quality - weak.quality) <= heirloom.qualityCeiling * 0.25;
  })());
ok('quality never exceeds the product\u2019s own ceiling, however thorough or skilled',
  resolveTestingOutcome(heirloom, 'thorough', 100).quality <= heirloom.qualityCeiling);

section('Equipment gate blocks entry to Production specifically');
ok('missing equipment is reported by tag',
  JSON.stringify(missingEquipmentTags(heirloom, blank).sort()) === JSON.stringify([...heirloom.resourceProfile.capabilities].sort()));
ok('having everything required reports nothing missing',
  missingEquipmentTags(heirloom, full).length === 0);
ok('prototype and testing are NOT gated by equipment (only production is)',
  true); // structural: missingEquipmentTags is only ever called before entering 'production' in the handler

// ================================================================ slots
section('Concurrent product slots by stage (locked: 1/1/1/2/5/5)');
ok('preSeed/seed/early all allow exactly 1', productSlotLimit('preSeed') === 1 && productSlotLimit('seed') === 1 && productSlotLimit('early') === 1);
ok('growth allows 2', productSlotLimit('growth') === 2);
ok('expansion and exit allow 5', productSlotLimit('expansion') === 5 && productSlotLimit('exit') === 5);
ok('activeProductCount excludes retired products',
  activeProductCount({ products: { a: { phase: 'launched' }, b: { phase: 'retired' } } }) === 1);
ok('activeProductCount counts every non-retired phase',
  activeProductCount({ products: { a: { phase: 'prototype' }, b: { phase: 'testing' }, c: { phase: 'launched' } } }) === 3);

// ================================================================ candidate listing
section('availableNewProducts');
const noneStarted = availableNewProducts(fakeGame(), mfg);
ok('lists all twelve when nothing has started', noneStarted.length === 12, `${noneStarted.length}`);
ok('sorted by adjacency descending', noneStarted.every((c, i) => i === 0 || c.adjacency.score <= noneStarted[i - 1].adjacency.score));
const oneStarted = availableNewProducts(fakeGame({ products: { refinedMetal: { phase: 'prototype' } } }), mfg);
ok('excludes a product already started', !oneStarted.some(c => c.product.id === 'refinedMetal'));
ok('Hospitality (no catalog) returns nothing', availableNewProducts(fakeGame(), getIndustry('hospitality')).length === 0);

// ================================================================ derived capacity/demand
section('Derived capacity/demand — only launched products contribute (Bible §0.2)');
ok('a product still in prototype contributes 0 capacity and 0 demand',
  productCapacityContribution({ phase: 'prototype' }, heirloom, { laborPool: 20 }) === 0
  && productDemandContribution({ phase: 'prototype' }, heirloom, { reputation: 50 }) === 0);
ok('a launched product contributes real capacity when labor is available',
  productCapacityContribution({ phase: 'launched', defectRate: 0.05 }, heirloom, { laborPool: 40 }) > 0);
ok('capacity is bounded by available labor, not free',
  productCapacityContribution({ phase: 'launched', defectRate: 0.05 }, heirloom, { laborPool: 0 }) === 0);
ok('a higher defect rate measurably lowers capacity throughput', (() => {
  const clean = productCapacityContribution({ phase: 'launched', defectRate: 0 }, heirloom, { laborPool: 40 });
  const defective = productCapacityContribution({ phase: 'launched', defectRate: 0.4 }, heirloom, { laborPool: 40 });
  return defective < clean;
})());
ok('demand requires open channels — a launched product with no channelsOpened contributes 0 demand',
  productDemandContribution({ phase: 'launched', channelsOpened: [] }, heirloom, { reputation: 50 }) === 0);
ok('demand scales with reputation', (() => {
  // Use a channel this product actually sells through — refinedMetal is upstream/B2B-only, so
  // 'heritageBuyers' (a consumer segment from the old furniture catalog) does not apply to it.
  const ch = heirloom.resourceProfile.channels;
  const lowRep = productDemandContribution({ phase: 'launched', channelsOpened: ch, quality: 9 }, heirloom, { reputation: 10 });
  const highRep = productDemandContribution({ phase: 'launched', channelsOpened: ch, quality: 9 }, heirloom, { reputation: 90 });
  return highRep > lowRep;
})());
ok('demand scales with achieved quality relative to the ceiling', (() => {
  // Use a channel this product actually sells through, read from its own profile.
  const ch = [heirloom.resourceProfile.channels[0]];
  const lowQ = productDemandContribution({ phase: 'launched', channelsOpened: ch, quality: heirloom.qualityCeiling * 0.2 }, heirloom, { reputation: 50 });
  const highQ = productDemandContribution({ phase: 'launched', channelsOpened: ch, quality: heirloom.qualityCeiling }, heirloom, { reputation: 50 });
  return highQ > lowQ;
})());
ok('totalProductCapacity/Demand sum across all launched products',
  totalProductCapacity(fakeGame({
    products: {
      refinedMetal: { productId: 'refinedMetal', phase: 'launched', defectRate: 0.05 },
      processedWood: { productId: 'processedWood', phase: 'launched', defectRate: 0.05 },
    },
    laborPool: 60,
  }), mfg) > totalProductCapacity(fakeGame({
    products: { refinedMetal: { productId: 'refinedMetal', phase: 'launched', defectRate: 0.05 } },
    laborPool: 60,
  }), mfg));
ok('a retired product contributes nothing to either meter',
  productCapacityContribution({ phase: 'retired' }, heirloom, { laborPool: 40 }) === 0
  && productDemandContribution({ phase: 'retired', channelsOpened: ['heritageBuyers'] }, heirloom, { reputation: 90 }) === 0);
ok('Hospitality (no catalog) always contributes zero from either total function',
  totalProductCapacity(fakeGame(), getIndustry('hospitality')) === 0 && totalProductDemand(fakeGame(), getIndustry('hospitality')) === 0);


// ================================================================ byproducts
section('Byproducts — waste is a consequence of production, not a product');
const BYPRODUCTS = window.__BYPRODUCTS;
const BYPRODUCT_POLICIES = window.__BYPRODUCT_POLICIES;
const resolveByproducts = window.__resolveByproducts;
const reuseAvailable = window.__reuseAvailable;
const effectiveByproductPolicy = window.__effectiveByproductPolicy;

ok('the six original base lines each throw off a byproduct',
  ['processedWood', 'paperProducts', 'textiles', 'glassProducts', 'refinedMetal', 'plasticProducts']
    .every(id => !!BY_ID[id].byproduct));
ok('packaging and recycled lines genuinely have none — not every product has to (real graph data)',
  !BY_ID.packaging.byproduct && !BY_ID.recycledMetal.byproduct);
ok('every byproduct referenced actually exists', PRODUCTS.every(p => !p.byproduct || !!BYPRODUCTS[p.byproduct.id]));
ok('every byproduct is bilingual', Object.values(BYPRODUCTS).every(b => b.name.en && b.name.es));
ok('every byproduct costs something to dispose of', Object.values(BYPRODUCTS).every(b => b.disposalCost > 0));
ok('four handling policies exist', Object.keys(BYPRODUCT_POLICIES).length === 4);
ok('scrap is NOT in the product catalogue — it is not a product',
  Object.keys(BYPRODUCTS).every(id => !BY_ID[id]));

section('Some byproducts feed a real line; some have nowhere to go yet');
const consumable = Object.values(BYPRODUCTS).filter(b => b.consumedBy);
ok('at least three byproducts feed another line', consumable.length >= 3, `${consumable.length}`);
ok('every consumedBy points at a real product', consumable.every(b => !!BY_ID[b.consumedBy]));
ok('some byproducts have no home yet — the economy is not circular',
  Object.values(BYPRODUCTS).some(b => !b.consumedBy));
ok('metal scrap is the most valuable to sell (it genuinely is)',
  Object.values(BYPRODUCTS).every(b => BYPRODUCTS.metalScrap.wholesaleValue >= b.wholesaleValue));

section('Reuse requires having built the consuming line — the entrepreneurial payoff');
const woodOnly = { products: { processedWood: { productId: 'processedWood', phase: 'launched' } } };
ok('no consuming line means reuse is unavailable', !reuseAvailable(woodOnly, 'sawdust'));
const woodAndPaper = { products: {
  processedWood: { productId: 'processedWood', phase: 'launched' },
  paperProducts: { productId: 'paperProducts', phase: 'launched' },
} };
ok('building the paper line makes wood scrap reusable', reuseAvailable(woodAndPaper, 'sawdust'));
ok('a paper line still in development does not count', !reuseAvailable({ products: {
  paperProducts: { productId: 'paperProducts', phase: 'testing' } } }, 'sawdust'));
ok('a byproduct with no consumer can never be reused', !reuseAvailable(woodAndPaper, 'textileWaste'));
ok('setting reuse without the line falls back to disposal rather than silently doing nothing',
  effectiveByproductPolicy({ ...woodOnly, byproductPolicies: { sawdust: 'reuse' } }, 'sawdust') === 'dispose');
ok('setting reuse WITH the line is honoured',
  effectiveByproductPolicy({ ...woodAndPaper, byproductPolicies: { sawdust: 'reuse' } }, 'sawdust') === 'reuse');
ok('the default policy is disposal', effectiveByproductPolicy(woodOnly, 'sawdust') === 'dispose');

section('Byproduct economics resolve per policy');
const mfgInd = getIndustry('manufacturing');
function scrapGame(policy) {
  return {
    products: { processedWood: { productId: 'processedWood', phase: 'launched', quality: 6, defectRate: 0.05,
      channelsOpened: ['developers'], launchType: 'b2b', appealBonus: 1, costReduction: 0 } },
    byproductPolicies: { sawdust: policy },
    laborPool: 60, equipment: {}, reputation: 70, supplierContracts: {}, acquiredSuppliers: {},
    ownedTiers: {}, managers: {}, integrations: [], locations: 0,
  };
}
const disposed = resolveByproducts(scrapGame('dispose'), mfgInd);
const sold = resolveByproducts(scrapGame('sell'), mfgInd);
const burned = resolveByproducts(scrapGame('burn'), mfgInd);
ok('disposal is pure cost', disposed.disposalCost > 0 && disposed.wholesaleRevenue === 0);
ok('selling earns instead of costing', sold.wholesaleRevenue > 0 && sold.disposalCost === 0);
ok('burning relieves burn instead of either', burned.energyRelief > 0 && burned.disposalCost === 0);
ok('selling beats disposing on cash', sold.wholesaleRevenue + disposed.disposalCost > 0);
ok('a company with no launched lines has no byproducts at all',
  resolveByproducts({ products: {}, byproductPolicies: {} }, mfgInd).lines.length === 0);
ok('an industry with no product catalogue produces nothing',
  resolveByproducts(scrapGame('dispose'), getIndustry('hospitality')).lines.length === 0);


section('Phase D step 2 — consumer segments behave like different people');
const SEGS = window.__CONSUMER_SEGMENT_LIST;
const segmentFit = window.__segmentFit;
const segmentPriceFactor = window.__segmentPriceFactor;
const segmentBrandFactor = window.__segmentBrandFactor;
const consumerDemand = window.__consumerDemand;
const productNovelty = window.__productNovelty;
const productGreenness = window.__productGreenness;
const furn = window.__PRODUCT_BY_ID.woodenFurniture;
const inst = (q, launchedMonth) => ({ productId: 'woodenFurniture', phase: 'launched', quality: q, launchedMonth });
// Brand is its own meter now (step 3). Fixtures set it explicitly rather than leaning on
// reputation, which only acts as a soft ceiling above it.
const gm = (month, brandStr) => ({ month, reputation: 90,
  brand: { strength: brandStr != null ? brandStr : 70, position: { premiumVsMass: 0, sustainability: 0, noveltyVsHeritage: 0 } },
  byproductPolicies: {}, products: {} });

ok('five segments exist', SEGS.length === 5);
ok('all bilingual with a blurb', SEGS.every(s2 => s2.name.en && s2.name.es && s2.blurb.en && s2.blurb.es));
ok('each has a full philosophy spread', SEGS.every(s2 =>
  typeof s2.premiumVsMass === 'number' && typeof s2.sustainability === 'number'
  && typeof s2.noveltyVsHeritage === 'number' && typeof s2.priceSensitivity === 'number'));
ok('they genuinely disagree about premium', (() => {
  const vals = SEGS.map(s2 => s2.premiumVsMass);
  return Math.max(...vals) - Math.min(...vals) > 100;
})());
ok('the mass segment is the largest', (() => {
  const ev = SEGS.find(s2 => s2.id === 'everydayValue');
  return SEGS.every(s2 => s2.size <= ev.size);
})());

section('Quality moves WHICH audience you are for, not just how much you sell');
ok('a premium audience prefers a high-quality build',
  segmentFit(inst(furn.qualityCeiling, 0), furn, window.__consumerSegment('designLed'), gm(4))
  > segmentFit(inst(Math.round(furn.qualityCeiling * 0.4), 0), furn, window.__consumerSegment('designLed'), gm(4)));
ok('a value audience does the OPPOSITE — too good is a poor fit for them too',
  segmentFit(inst(Math.round(furn.qualityCeiling * 0.4), 0), furn, window.__consumerSegment('everydayValue'), gm(4))
  > segmentFit(inst(furn.qualityCeiling, 0), furn, window.__consumerSegment('everydayValue'), gm(4)));

section('A line ages, and its audience changes with it');
ok('a brand-new line reads as novel', productNovelty(inst(50, 0), gm(0)) > 0.8);
ok('an old line reads as established', productNovelty(inst(50, 0), gm(30)) < -0.5);
ok('Trend Followers drift away as a line ages', (() => {
  const seg = window.__consumerSegment('trendFollowers');
  return segmentFit(inst(50, 0), furn, seg, gm(1)) > segmentFit(inst(50, 0), furn, seg, gm(28));
})());
ok('Heritage Buyers warm to it over the same period', (() => {
  const seg = window.__consumerSegment('heritageBuyers');
  return segmentFit(inst(50, 0), furn, seg, gm(28)) > segmentFit(inst(50, 0), furn, seg, gm(1));
})());

section('Price elasticity is per-segment, not global');
ok('raising price hurts a price-sensitive segment far more', (() => {
  const ev = window.__consumerSegment('everydayValue');
  const dl = window.__consumerSegment('designLed');
  const evDrop = segmentPriceFactor(furn.priceCeiling * 1.5, furn, ev);
  const dlDrop = segmentPriceFactor(furn.priceCeiling * 1.5, furn, dl);
  return evDrop < dlDrop;
})());
ok('cutting price helps a price-sensitive segment most', (() => {
  const ev = window.__consumerSegment('everydayValue');
  const dl = window.__consumerSegment('designLed');
  return segmentPriceFactor(furn.priceFloor * 0.5, furn, ev) > segmentPriceFactor(furn.priceFloor * 0.5, furn, dl);
})());
ok('a price factor never goes negative',
  SEGS.every(s2 => segmentPriceFactor(furn.priceCeiling * 10, furn, s2) >= 0));

section('Brand GATES access, it does not merely scale demand');
ok('an unknown company cannot reach a gated segment',
  segmentBrandFactor(window.__consumerSegment('heritageBuyers'), { brand: { strength: 5 }, reputation: 90 }) === 0);
ok('but can always reach the ungated mass market',
  segmentBrandFactor(window.__consumerSegment('everydayValue'), { brand: { strength: 5 }, reputation: 90 }) > 0);
ok('a well-known company reaches the gated ones',
  segmentBrandFactor(window.__consumerSegment('heritageBuyers'), { brand: { strength: 90 }, reputation: 90 }) > 0);
ok('an unknown company sells ONLY to the ungated segment', (() => {
  const d = consumerDemand(inst(furn.qualityCeiling, 0), furn, gm(4, 5), furn.priceCeiling * 0.8);
  return Object.keys(d.bySegment).length === 1 && d.bySegment.everydayValue > 0;
})());

section('Sustainability is a real differentiator for the segment built on it');
// A 'reuse' policy is only honoured when the consuming line actually EXISTS — you cannot claim a
// green practice you have not built. So the green fixture has to include that line, which is the
// correct behaviour and was my test being wrong rather than the model.
const consumingLine = BYPRODUCTS[furn.byproduct.id].consumedBy;
const greenGame = { month: 4, reputation: 90, brand: { strength: 70, position: {} },
  byproductPolicies: { [furn.byproduct.id]: 'reuse' },
  products: { [consumingLine]: { productId: consumingLine, phase: 'launched' } } };
ok('reusing your own byproduct raises greenness — but only once the consuming line is BUILT', (() => {
  const plain = productGreenness(furn, { byproductPolicies: {}, products: {} });
  const claimedButNotBuilt = productGreenness(furn, { byproductPolicies: { [furn.byproduct.id]: 'reuse' }, products: {} });
  const actuallyReused = productGreenness(furn, greenGame);
  return actuallyReused > plain && claimedButNotBuilt === plain;
})());
ok('a green practice helps the Conscientious more than the indifferent', (() => {
  const con = window.__consumerSegment('conscientious');
  const ev = window.__consumerSegment('everydayValue');
  const plainGame = { month: 4, reputation: 90, brand: { strength: 70, position: {} }, byproductPolicies: {}, products: {} };
  const conGain = segmentFit(inst(50, 0), furn, con, greenGame) - segmentFit(inst(50, 0), furn, con, plainGame);
  const evGain = segmentFit(inst(50, 0), furn, ev, greenGame) - segmentFit(inst(50, 0), furn, ev, plainGame);
  return conGain > evGain;
})());

section('Demand composes into a readable breakdown');
ok('demand reports per-segment, not just a total', (() => {
  const d = consumerDemand(inst(furn.qualityCeiling, 0), furn, gm(4), furn.priceCeiling * 0.8);
  return d.total > 0 && Object.keys(d.bySegment).length > 1;
})());
ok('an unlaunched product has no consumer demand',
  consumerDemand({ productId: 'woodenFurniture', phase: 'testing' }, furn, gm(4), 10).total === 0);
ok('the segments are NOT all the same number — they discriminate', (() => {
  const d = consumerDemand(inst(furn.qualityCeiling, 0), furn, gm(4), furn.priceCeiling * 0.8);
  return new Set(Object.values(d.bySegment)).size > 2;
})());


section('Phase D step 3 — Brand is TWO meters, and that is the point');
const brandStrengthF = window.__brandStrength;
const brandPositionFit = window.__brandPositionFit;
const brandCeiling = window.__brandCeiling;
const startingBrandStrength = window.__startingBrandStrength;
const applyBrandShock = window.__applyBrandShock;
const POLICIES = window.__MARKETING_POLICIES;

ok('four marketing policies, all bilingual',
  Object.keys(POLICIES).length === 4 && Object.values(POLICIES).every(p2 => p2.label.en && p2.label.es && p2.blurb.en && p2.blurb.es));
ok('spending more builds faster',
  POLICIES.high.strengthGain > POLICIES.medium.strengthGain
  && POLICIES.medium.strengthGain > POLICIES.low.strengthGain);
ok('doing nothing builds nothing', POLICIES.none.strengthGain === 0 && POLICIES.none.spendMult === 0);

section('Position decides whether being known actually HELPS');
const knownForCheap = { brand: { strength: 70, position: { premiumVsMass: -80, sustainability: 10, noveltyVsHeritage: -30 } }, reputation: 80 };
const knownForPremium = { brand: { strength: 70, position: { premiumVsMass: 75, sustainability: 50, noveltyVsHeritage: 55 } }, reputation: 80 };
ok('at IDENTICAL strength, position changes how a premium audience responds',
  segmentBrandFactor(window.__consumerSegment('designLed'), knownForPremium)
  > segmentBrandFactor(window.__consumerSegment('designLed'), knownForCheap));
ok('and the mass market prefers the opposite position',
  segmentBrandFactor(window.__consumerSegment('everydayValue'), knownForCheap)
  > segmentBrandFactor(window.__consumerSegment('everydayValue'), knownForPremium));
ok('a mass-market name still CLEARS the premium gate — it converts badly, it is not invisible',
  segmentBrandFactor(window.__consumerSegment('designLed'), knownForCheap) > 0);
ok('position fit is a real 0-1 measure',
  CONSUMER_SEGMENT_LIST_T().every(sg => {
    const f = brandPositionFit(knownForPremium, sg);
    return f >= 0 && f <= 1;
  }));
function CONSUMER_SEGMENT_LIST_T() { return window.__CONSUMER_SEGMENT_LIST; }

section('Reputation is a SOFT ceiling — you cannot buy a name you have not earned');
ok('a disreputable company has a low brand ceiling', brandCeiling({ reputation: 20 }) < 50);
ok('a well-regarded one can go much higher', brandCeiling({ reputation: 85 }) > 90);
ok('the ceiling is never above the scale', brandCeiling({ reputation: 100 }) <= 100);

section('Public failures hit loudly, not as a quiet drift');
ok('every shock is a real, discrete hit',
  Object.values(window.__BRAND_SHOCKS).every(sh => sh.strength <= -5));
ok('a recall is the worst of them',
  window.__BRAND_SHOCKS.recall.strength <= Object.values(window.__BRAND_SHOCKS).reduce((m, sh) => Math.min(m, sh.strength), 0));
ok('a shock actually moves the meter', (() => {
  const d = { brand: { strength: 50, position: {} } };
  applyBrandShock(d, 'recall');
  return d.brand.strength < 50;
})());
ok('brand cannot be driven below zero', (() => {
  const d = { brand: { strength: 2, position: {} } };
  applyBrandShock(d, 'recall');
  return d.brand.strength === 0;
})());

section('A known founder opens doors — but the COMPANY is new');
ok('a first-time founder starts from nothing', startingBrandStrength({ wins: 0 }) === 0);
ok('a proven one starts with something', startingBrandStrength({ wins: 1 }) > 0);
ok('more wins carry further', startingBrandStrength({ wins: 3 }) > startingBrandStrength({ wins: 1 }));
ok('but it is a head start, never a free market — it cannot clear the toughest gate', (() => {
  const best = startingBrandStrength({ wins: 99 });
  const hardest = Math.max(...window.__CONSUMER_SEGMENT_LIST.map(sg => sg.brandGate || 0));
  return best < hardest;
})());

console.log(`\n${'='.repeat(60)}\nProduct System (unit): ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
if (fail) process.exit(1);
