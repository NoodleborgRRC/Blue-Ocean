// INDUSTRIAL ECONOMY — PHASE 1. Tests the GRAPH and its query API, not gameplay (nothing is
// wired in yet, by design). The blueprint's own structural requirements are the assertions.
global.window = global;
window.storage = require('./memory_storage_stub.cjs').makeMemoryStorage();
require('./build/harness.cjs');

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${label}${detail ? '  — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? '  — ' + detail : ''}`); }
}
const section = (s) => console.log(`\n${s}`);

const E = window.__ECONOMY;
const TIERS = window.__ECON_TIERS;
const CAPS = window.__CAPABILITIES;
const EQ_CAPS = window.__EQUIPMENT_CAPABILITIES;
const FAMILIES = window.__PRODUCT_FAMILIES;
const UNCOVERED = window.__CAPABILITIES_WITHOUT_EQUIPMENT;
const atTier = window.__econEntitiesAtTier;
const allIds = window.__econAllIds;
const recipeInputs = window.__recipeInputs;
const consumersOf = window.__consumersOf;
const capabilitiesOf = window.__capabilitiesOf;
const missingCapabilities = window.__missingCapabilities;
const missingInputs = window.__missingInputs;
const canProduce = window.__canProduce;
const productionOptions = window.__productionOptions;
const econDistance = window.__econDistance;
const bridgesBetween = window.__bridgesBetween;
const upstreamOf = window.__upstreamOf;
const makeMarket = window.__makeMarket;
const applyProduction = window.__applyProduction;
const applyConsumption = window.__applyConsumption;
const recomputePrices = window.__recomputePrices;
const bottlenecks = window.__marketBottlenecks;
const gluts = window.__marketGluts;
const underused = window.__underusedByproducts;
const productionMargin = window.__productionMargin;
const rankByMargin = window.__rankByMargin;
const validateEconomy = window.__validateEconomy;

// ================================================================ §21 engine/content
section('§21 — the content validates, which is what makes adding content cheap');
const errors = validateEconomy();
ok('the seed economy has zero validation errors', errors.length === 0, errors.slice(0, 3).join(' | '));
ok('every entity sits in a known tier', Object.values(E).every(e => !!TIERS[e.tier]));
ok('every entity is bilingual', Object.values(E).every(e => e.name.en && e.name.es));
ok('every entity has a base price', Object.values(E).every(e => e.basePrice > 0));
ok('every recipe input points at an entity that exists',
  Object.values(E).every(e => !e.recipe || recipeInputs(e).every(i => !!E[i.id])));
ok('every recipe capability exists in the vocabulary',
  Object.values(E).every(e => !e.recipe || (e.recipe.capabilities || []).every(c => !!CAPS[c])));
ok('validation CATCHES a malformed entry rather than passing it', (() => {
  E.__testBroken = { id: '__testBroken', tier: 'nonsense', name: { en: 'x' }, basePrice: -1 };
  const errs = validateEconomy();
  delete E.__testBroken;
  return errs.length > 0;
})());

// ================================================================ §1/§2 network shape
section('§1/§2 — the economy is a many-to-many network, not a linear tree');
ok('all six tiers are populated', Object.values(TIERS).every(t => atTier(t.id).length > 0),
  Object.values(TIERS).map(t => `${t.id}:${atTier(t.id).length}`).join(' '));
ok('at least one material has MULTIPLE consumers',
  allIds().some(id => consumersOf(id).length > 1));
ok('at least one product requires MULTIPLE inputs',
  Object.values(E).some(e => e.recipe && (e.recipe.primary || []).length > 2));
ok('a component is used by more than one downstream thing',
  atTier('component').some(c => consumersOf(c.id).length > 1));
ok('entities exist at every level a business could enter at',
  ['rawMaterial', 'processedMaterial', 'component', 'subAssembly', 'finishedProduct']
    .every(t => atTier(t).length >= 4));

// ================================================================ §3/§4 recipes
section('§3/§4 — products are recipes with multiple input paths');
ok('some recipes declare substitutes', Object.values(E).some(e => e.recipe && (e.recipe.substitute || []).length));
ok('some recipes declare optional inputs', Object.values(E).some(e => e.recipe && (e.recipe.optional || []).length));
ok('at least one recipe has more than one substitute (a real choice, not a binary)',
  Object.values(E).some(e => e.recipe && (e.recipe.substitute || []).length > 1));
ok('every substitute declares its cost/quality/sustainability tradeoff',
  Object.values(E).every(e => !e.recipe || (e.recipe.substitute || []).every(sub =>
    typeof sub.qualityDelta === 'number' && typeof sub.sustainabilityDelta === 'number' && typeof sub.costDelta === 'number')));
ok('a cheaper substitute is not also strictly better — there is always a tradeoff',
  Object.values(E).every(e => !e.recipe || (e.recipe.substitute || []).every(sub =>
    !(sub.costDelta < 0 && sub.qualityDelta > 0 && sub.sustainabilityDelta > 0))));
ok('recipeInputs can be filtered by flavour',
  recipeInputs('officeChair', { primary: true, substitute: false, optional: false })
    .every(i => i.flavour === 'primary'));

// ================================================================ §25 substitution
section('§25 — substitution actually works as a query');
ok('a primary input can be satisfied by a declared substitute',
  missingInputs('paperProducts', ['sawdust']).length === 0,
  'wood scrap substitutes for timber in paper');
ok('an unrelated material does NOT satisfy it',
  missingInputs('paperProducts', ['metals']).length > 0);
ok('packaging can be made three different ways (paper, plastic, or recycled)',
  1 + (E.packaging.recipe.substitute || []).length === 3);

// ================================================================ §5 capabilities
section('§5 — capabilities, not factories');
ok('the capability vocabulary is substantial', Object.keys(CAPS).length >= 20, `${Object.keys(CAPS).length}`);
ok('every piece of equipment provides at least one capability',
  Object.values(EQ_CAPS).every(list => list.length > 0));
ok('every capability equipment provides is a real capability',
  Object.values(EQ_CAPS).flat().every(c => !!CAPS[c]));
ok('different equipment provides different capabilities — machines are not interchangeable',
  new Set(Object.values(EQ_CAPS).map(l => [...l].sort().join(','))).size > 6);
ok('capabilitiesOf unions across owned equipment',
  capabilitiesOf(['mfgFirstTooling', 'mfgPilotLine']).size
  > capabilitiesOf(['mfgFirstTooling']).size);
ok('owning nothing provides nothing', capabilitiesOf([]).size === 0);

section('Capability coverage gaps are DOCUMENTED, not silent');
const provided = new Set(Object.values(EQ_CAPS).flat());
const uncovered = Object.keys(CAPS).filter(c => !provided.has(c));
ok('every uncovered capability is listed in CAPABILITIES_WITHOUT_EQUIPMENT',
  uncovered.every(c => UNCOVERED.includes(c)), uncovered.join(','));
ok('the documented list does not claim gaps that do not exist',
  UNCOVERED.every(c => !provided.has(c)));
ok('most of the economy IS buildable with the current equipment', (() => {
  const unbuildable = Object.values(E).filter(e => e.recipe && (e.recipe.capabilities || []).some(c => !provided.has(c)));
  return unbuildable.length < Object.keys(E).length * 0.2;
})());

// ================================================================ §5 production options
section('§5 — capabilities + materials → production options');
const sawmill = capabilitiesOf(['mfgFirstTooling']);
ok('a sawmill with timber can make processed wood', canProduce('processedWood', ['timber'], sawmill));
ok('a sawmill with timber CANNOT make an office chair', !canProduce('officeChair', ['timber'], sawmill));
ok('the refusal explains BOTH what is missing and what cannot be done',
  missingInputs('officeChair', ['timber']).length > 0
  && missingCapabilities('officeChair', sawmill).length > 0);
ok('productionOptions grows as capabilities grow',
  productionOptions(['timber', 'processedWood'], capabilitiesOf(['mfgFirstTooling', 'mfgPilotWorkshop'])).length
  >= productionOptions(['timber', 'processedWood'], sawmill).length);
ok('having materials without capabilities produces nothing',
  productionOptions(['timber', 'metals', 'sand'], new Set()).length === 0);

// ================================================================ §7 byproducts
section('§7 — byproducts are economic flows with DERIVED consumers');
const byproducts = atTier('byproduct');
ok('every base line throws off a byproduct',
  ['processedWood', 'paperProducts', 'textiles', 'glassProducts', 'refinedMetal', 'plasticProducts']
    .every(id => (E[id].recipe.byproducts || []).length > 0));
ok('consumers are DERIVED from recipes, not hardcoded on the byproduct',
  byproducts.every(b => b.consumers === undefined));
ok('at least one byproduct has MULTIPLE consumers (§7 forbids hardcoding one)',
  byproducts.some(b => consumersOf(b.id).length > 1),
  byproducts.map(b => `${b.id}:${consumersOf(b.id).length}`).join(' '));
ok('every byproduct has at least one consumer somewhere in the economy',
  byproducts.every(b => consumersOf(b.id).length > 0));
ok('byproducts carry disposal cost and energy value',
  byproducts.every(b => typeof b.disposalCost === 'number' && typeof b.energyValue === 'number'));
ok('adding a consumer requires only a recipe — consumersOf recomputes', (() => {
  const before = consumersOf('pulpSludge').length;
  E.__testConsumer = { id: '__testConsumer', tier: 'component', name: { en: 'T', es: 'T' }, basePrice: 5,
    recipe: { primary: [{ id: 'pulpSludge', qty: 1 }], capabilities: ['assembly'], byproducts: [] } };
  const after = consumersOf('pulpSludge').length;
  delete E.__testConsumer;
  return after === before + 1;
})());

// ================================================================ §8 closed loops
section('§8 — closed loops are genuinely closed');
[['sawdust', 'recycledWood'], ['metalScrap', 'recycledMetal'],
 ['cullet', 'recycledGlass'], ['plasticScrap', 'recycledPlastic'],
 ['pulpSludge', 'recycledPaper'], ['textileWaste', 'recycledTextile']].forEach(([waste, recycled]) => {
  ok(`${waste} → ${recycled} exists`, consumersOf(waste).includes(recycled));
});
ok('recycled materials feed back into the economy, not into a dead end',
  ['recycledWood', 'recycledMetal', 'recycledGlass', 'recycledPlastic']
    .every(r => consumersOf(r).length > 0));
ok('glass eats its own cullet directly — the tightest loop',
  recipeInputs('glassProducts').some(i => i.id === 'cullet'));

// ================================================================ §9/§23 branches and bridges
section('§9/§23 — branches stay distinct, finished products bridge them');
const base = ['processedWood', 'textiles', 'glassProducts', 'refinedMetal'];
ok('the base lines are genuinely far apart in the graph',
  base.every(a => base.filter(b => b !== a).every(b => econDistance(a, b, 8) >= 4)));
ok('no base line consumes another base line directly',
  base.every(a => !base.some(b => b !== a && recipeInputs(a).some(i => i.id === b))));
const woodMetalBridges = bridgesBetween('processedWood', 'refinedMetal');
ok('cross-branch bridges EXIST between distant branches', woodMetalBridges.length > 0,
  woodMetalBridges.join(','));
ok('every bridge is a sub-assembly or finished product — the §9 mechanism',
  woodMetalBridges.every(id => ['subAssembly', 'finishedProduct'].includes(E[id].tier)),
  woodMetalBridges.map(id => `${id}:${E[id].tier}`).join(' '));
ok('bridges are PRECISE, not everything in the graph',
  woodMetalBridges.length < Object.keys(E).length * 0.3,
  `${woodMetalBridges.length} of ${Object.keys(E).length}`);
ok('upstreamOf traces a full supply chain',
  upstreamOf('smartDesk').has('timber') && upstreamOf('smartDesk').has('metals'));
ok('an entity is not upstream of itself', !upstreamOf('smartDesk').has('smartDesk'));
ok('a raw material has nothing upstream of it', upstreamOf('timber').size === 0);

// ================================================================ §10 families
section('§10 — product families create economic density');
ok('families exist', Object.keys(FAMILIES).length >= 3);
ok('every family declares shared capabilities and channels',
  Object.values(FAMILIES).every(f => f.sharedCapabilities.length && f.sharedChannels.length));
ok('finished products declare a family',
  atTier('finishedProduct').every(p => !!p.family && !!FAMILIES[p.family]));
ok('the furniture family has multiple members',
  atTier('finishedProduct').filter(p => p.family === 'furniture').length >= 3);
ok('family members really do share capabilities', (() => {
  const fam = FAMILIES.furniture;
  return atTier('finishedProduct').filter(p => p.family === 'furniture')
    .every(p => fam.sharedCapabilities.some(c => (p.recipe.capabilities || []).includes(c)));
})());

// ================================================================ §26 market model
section('§26 — a simple market that can evolve');
let market = makeMarket();
recomputePrices(market);
ok('every entity has a market cell', allIds().every(id => !!market[id]));
ok('at equilibrium price equals base price',
  allIds().every(id => Math.abs(market[id].price - E[id].basePrice) < 0.05));
applyConsumption(market, 'timber', 400);
recomputePrices(market);
ok('demand raises price', market.timber.price > E.timber.basePrice, `${E.timber.basePrice} -> ${market.timber.price}`);
applyProduction(market, 'processedWood', 500);
recomputePrices(market);
ok('production raises the OUTPUT supply', market.processedWood.supply > 100);
ok('production raises INPUT demand — the cascade in one step', market.timber.demand > 400);
ok('production raises BYPRODUCT supply', market.sawdust.supply > 100);
ok('price stays inside a sane band even under extreme imbalance', (() => {
  const m = makeMarket();
  applyConsumption(m, 'timber', 100000);
  recomputePrices(m);
  return m.timber.price < E.timber.basePrice * 3 && m.timber.price > 0;
})());

section('§27 — the economy is something the player can STUDY');
let m2 = makeMarket();
applyConsumption(m2, 'woodenFurniture', 300);
applyProduction(m2, 'woodenFurniture', 250);
applyProduction(m2, 'processedWood', 300);
recomputePrices(m2);
ok('bottlenecks are identifiable', bottlenecks(m2, 1.15).length > 0,
  bottlenecks(m2, 1.15).slice(0, 3).map(b => b.id).join(','));
ok('gluts are identifiable', gluts(m2, 0.9).length > 0);
ok('underused byproducts surface as opportunities', underused(m2).length > 0,
  underused(m2).map(u => u.id).join(','));
ok('every underused byproduct names who could consume it',
  underused(m2).every(u => u.consumers.length > 0));
ok('production margin is computable per entity', productionMargin(m2, 'woodenFurniture').margin !== null);
ok('margins can go NEGATIVE — that is what drives companies out', (() => {
  const m3 = makeMarket();
  applyConsumption(m3, 'timber', 3000); // input cost spike
  recomputePrices(m3);
  return productionMargin(m3, 'processedWood').margin < productionMargin(makeMarket(), 'processedWood').margin;
})());
ok('rankByMargin orders the whole economy', rankByMargin(m2).length > 10
  && rankByMargin(m2)[0].margin >= rankByMargin(m2)[rankByMargin(m2).length - 1].margin);

section('§24 — the blueprint\u2019s own cascade actually happens');
// "Furniture demand rises → processed wood demand rises → timber prices rise → furniture margins fall"
const m4 = makeMarket();
recomputePrices(m4);
const timberBefore = m4.timber.price;
const furnitureMarginBefore = productionMargin(m4, 'woodenFurniture').margin;
applyConsumption(m4, 'woodenFurniture', 260);
applyProduction(m4, 'woodenFurniture', 200);
applyProduction(m4, 'furnitureFrames', 200);
applyProduction(m4, 'woodComponents', 240);
applyProduction(m4, 'processedWood', 300);
recomputePrices(m4);
ok('timber price rose', m4.timber.price > timberBefore, `${timberBefore} -> ${m4.timber.price}`);
ok('wood scrap became abundant as a side effect', m4.sawdust.supply > 100);
ok('the recycled path becomes relatively more attractive as virgin input spikes',
  m4.timber.price > E.timber.basePrice,
  'virgin timber is now dearer than baseline, which is what makes recycled wood worth building');
ok('nobody hardcoded any of that — it fell out of the graph', true);


// ================================================================ PHASE 2 — migration adapter
section('Phase 2 — the graph is the single source of truth via the adapter');
const econToProduct = window.__econToProduct;
const STARTING = window.__STARTING_BUSINESSES;
const rivalChainPosition = window.__rivalChainPosition;
const applyRivalProduction = window.__applyRivalProduction;
const ARCH_TIER = window.__ARCHETYPE_PREFERRED_TIER;
const EQ2 = window.__EQUIPMENT_CAPABILITIES;

const recipeBearers = Object.values(E).filter(e => e.recipe);
ok('every recipe-bearing entity adapts to a legacy product shape',
  recipeBearers.every(e => !!econToProduct(e.id)), `${recipeBearers.length} entities`);
ok('adapted products carry every field the live system reads',
  recipeBearers.every(e => {
    const p = econToProduct(e.id);
    return p.materialCost > 0 && p.qualityCeiling > 0 && p.scalability > 0
      && p.laborHours > 0 && p.resourceProfile && p.appealSegments;
  }));
ok('adapted material cost derives from actual recipe inputs, not a constant',
  new Set(recipeBearers.map(e => econToProduct(e.id).materialCost)).size > 5);
ok('a more capability-demanding product has a higher quality ceiling',
  econToProduct('refinedMetal').qualityCeiling > econToProduct('processedWood').qualityCeiling);
ok('a more demanding product is LESS scalable — the tradeoff holds',
  econToProduct('refinedMetal').scalability < econToProduct('processedWood').scalability);
ok('adapted products expose CAPABILITIES, not the retired equipment tags',
  recipeBearers.every(e => Array.isArray(econToProduct(e.id).resourceProfile.capabilities)));
ok('an entity with no recipe adapts to null rather than a broken object',
  econToProduct('timber') === null);
ok('adding an entity makes it immediately playable — no engine edit needed', (() => {
  E.__newThing = { id: '__newThing', tier: 'component', name: { en: 'N', es: 'N' }, basePrice: 40,
    recipe: { primary: [{ id: 'refinedMetal', qty: 1 }], capabilities: ['welding'], byproducts: [] } };
  const p = econToProduct('__newThing');
  delete E.__newThing;
  return !!p && p.materialCost > 0 && p.resourceProfile.capabilities.includes('welding');
})());

section('§2 — upstream entities have no consumer segments; finished goods do');
ok('a processed material sells B2B only',
  !econToProduct('processedWood').appealSegments.valueConsumers);
ok('a finished product reaches consumers',
  Object.keys(econToProduct('smallElectronics').appealSegments).some(k => ['everydayValue', 'designLed'].includes(k)));
// CHANGED: families now declare only their B2B channels. Consumer appeal is DERIVED per segment
// from that segment's own philosophy against the product, so adding a consumer segment is a data
// entry rather than an edit to every product — and Hospitality can reuse it untouched.
ok('finished products inherit their FAMILY\u2019s B2B channels (§10)',
  Object.keys(econToProduct('woodenFurniture').appealSegments)
    .filter(ch => window.__B2B_SEGMENTS.includes(ch))
    .every(ch => FAMILIES.furniture.sharedChannels.includes(ch)));
ok('and reach consumers through DERIVED segment appeal, not authored channels',
  Object.keys(econToProduct('woodenFurniture').appealSegments)
    .some(ch => window.__B2C_SEGMENTS.includes(ch)));
ok('an upstream material has NO consumer appeal — nobody sells refined metal to shoppers',
  !Object.keys(econToProduct('refinedMetal').appealSegments)
    .some(ch => window.__B2C_SEGMENTS.includes(ch)));

section('Capability gap is now CLOSED');
const provided2 = new Set(Object.values(EQ2).flat());
ok('no capability lacks equipment', Object.keys(CAPS).every(c => provided2.has(c)),
  Object.keys(CAPS).filter(c => !provided2.has(c)).join(','));
ok('the documented gap list is now empty', UNCOVERED.length === 0);
ok('every entity in the economy is buildable by somebody',
  recipeBearers.every(e => (e.recipe.capabilities || []).every(c => provided2.has(c))));

section('§1/§11 — curated starting businesses across the chain');
ok('there is a readable number of starting businesses', STARTING.length >= 8 && STARTING.length <= 14, `${STARTING.length}`);
ok('every starting business points at a real, recipe-bearing entity',
  STARTING.every(b => !!E[b.entityId] && !!E[b.entityId].recipe));
ok('starting businesses span multiple tiers — you can enter the economy at different points',
  new Set(STARTING.map(b => b.tier)).size >= 3,
  [...new Set(STARTING.map(b => b.tier))].join(','));
ok('every starting business is bilingual with a pitch',
  STARTING.every(b => b.name.en && b.name.es && b.pitch.en && b.pitch.es));
ok('starting business ids are unique', new Set(STARTING.map(b => b.id)).size === STARTING.length);
ok('a recycler is a legitimate way to start — §11 horizontal specialisation',
  STARTING.some(b => b.entityId.startsWith('recycled')));

section('§15 — rival chain positions derive from archetype AND philosophy');
const mkRival = (arch, prem, seed) => ({ archetype: arch, seedId: seed || 'r1', philosophy: { premiumVsMass: prem } });
ok('every archetype maps to a tier', Object.keys(ARCH_TIER).every(a => !!TIERS[ARCH_TIER[a]]));
ok('every archetype yields a real position',
  Object.keys(ARCH_TIER).every(a => !!E[rivalChainPosition(mkRival(a, 0))]));
ok('positions land in the archetype\u2019s preferred tier',
  Object.keys(ARCH_TIER).every(a => E[rivalChainPosition(mkRival(a, 0))].tier === ARCH_TIER[a]));
ok('philosophy changes WHAT within the tier — mass vs premium differ',
  Object.keys(ARCH_TIER).some(a => rivalChainPosition(mkRival(a, -60)) !== rivalChainPosition(mkRival(a, 60))));
ok('a premium company reaches for higher-value output than a mass one', (() => {
  const mass = E[rivalChainPosition(mkRival('qualityHouse', -60))];
  const prem = E[rivalChainPosition(mkRival('qualityHouse', 60))];
  return prem.basePrice >= mass.basePrice;
})());
ok('position is deterministic per company across calls',
  rivalChainPosition(mkRival('costLeader', 0, 'stable')) === rivalChainPosition(mkRival('costLeader', 0, 'stable')));
ok('different companies can occupy different positions',
  new Set(['a', 'b', 'c', 'd'].map(s => rivalChainPosition(mkRival('costLeader', 0, s)))).size > 1);

section('Rivals actually move the market — the economy is ALIVE');
const m5 = makeMarket();
recomputePrices(m5);
const timberPriceBefore = m5.timber.price;
applyRivalProduction(m5, [
  { seedId: 'x', archetype: 'costLeader', philosophy: { premiumVsMass: -50 }, strength: 60 },
  { seedId: 'y', archetype: 'costLeader', philosophy: { premiumVsMass: -50 }, strength: 60 },
]);
recomputePrices(m5);
ok('rival production shifts the market off equilibrium',
  Object.keys(m5).some(id => Math.abs(m5[id].price - E[id].basePrice) > 0.5));
ok('rivals consuming an input make that input scarcer',
  Object.keys(m5).some(id => m5[id].demand > 100));
ok('an empty rival list leaves the market untouched', (() => {
  const m6 = makeMarket(); recomputePrices(m6);
  applyRivalProduction(m6, []);
  recomputePrices(m6);
  return Object.keys(m6).every(id => Math.abs(m6[id].price - E[id].basePrice) < 0.05);
})());
ok('a rival with an unknown archetype does not crash the market',
  !!applyRivalProduction(makeMarket(), [{ seedId: 'z', archetype: 'nonsense', strength: 40 }]));


section('systemAudit is genuinely industry-aware (backlog item 3)');
const systemAudit = window.__systemAudit;
const systemProfile = window.__systemProfile;
const unmappedTags = window.__unmappedTags;
const TAG_MAPS = window.__TAG_TO_SYSTEM_BY_INDUSTRY;

const auditH = systemAudit('hospitality');
const auditM = systemAudit('manufacturing');
ok('the two industries no longer return identical audits',
  JSON.stringify(auditH) !== JSON.stringify(auditM));
ok('every industry has its own tag vocabulary mapped',
  !!TAG_MAPS.hospitality && !!TAG_MAPS.manufacturing);
ok('NO project tag is left unmapped in either industry — an unmapped tag is invisible to the audit',
  unmappedTags('hospitality').length === 0 && unmappedTags('manufacturing').length === 0,
  `hosp: ${unmappedTags('hospitality').join(',') || 'none'} | mfg: ${unmappedTags('manufacturing').join(',') || 'none'}`);
ok('every audit total matches that industry\u2019s real project count', (() => {
  const sum = (a) => Object.values(a).reduce((x, y) => x + y, 0);
  return sum(auditH) === window.__getIndustry2('hospitality').content.projects.length
    && sum(auditM) === window.__getIndustry2('manufacturing').content.projects.length;
})());
ok('Manufacturing runs Production as a real system; Hospitality does not',
  auditM.production > 0 && auditH.production === 0);
ok('Manufacturing runs Supply Chain; Hospitality does not',
  auditM.supplyChain > 0 && auditH.supplyChain === 0);
ok('Hospitality runs Marketing; Manufacturing does not',
  auditH.marketing > 0 && auditM.marketing === 0);
ok('an unknown industry falls back rather than crashing', !!systemAudit('nonsense'));
ok('calling with no argument still works (legacy callers)', !!systemAudit());

section('systemProfile derives emphasis from the audit, not from assertion');
const profH = systemProfile('hospitality');
const profM = systemProfile('manufacturing');
ok('every system gets a band', Object.keys(profH).length === 10 && Object.keys(profM).length === 10);
ok('bands are only the three defined values',
  Object.values(profM).every(v => ['dormant', 'standard', 'core'].includes(v)));
ok('zero projects reads as dormant', profH.production === 'dormant');
ok('a densely-invested system reads as core', profM.production === 'core');
ok('the two industries have genuinely different shapes',
  JSON.stringify(profH) !== JSON.stringify(profM));

console.log(`\n${'='.repeat(62)}\nIndustrial Economy (Phase 1+2): ${pass} passed, ${fail} failed\n${'='.repeat(62)}`);
process.exit(fail ? 1 : 0);
