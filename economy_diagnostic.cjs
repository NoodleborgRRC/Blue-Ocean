// ECONOMIC GRAPH DIAGNOSTIC — the §29 test.
// "If the six-line economy produces interesting strategic behavior, the architecture is working.
//  If it does not, adding more products will only hide the problem."
//
// This asks the blueprint's own §28 entrepreneurial questions against the seed economy and prints
// what the graph answers. It is a design instrument, not a test — the point is to READ it.
global.window = global;
window.storage = require('./memory_storage_stub.cjs').makeMemoryStorage();
require('./build/harness.cjs');

const E = window.__ECONOMY;
const tiers = window.__ECON_TIERS;
const atTier = window.__econEntitiesAtTier;
const consumersOf = window.__consumersOf;
const recipeInputs = window.__recipeInputs;
const capabilitiesOf = window.__capabilitiesOf;
const productionOptions = window.__productionOptions;
const missingInputs = window.__missingInputs;
const missingCapabilities = window.__missingCapabilities;
const econDistance = window.__econDistance;
const bridgesBetween = window.__bridgesBetween;
const makeMarket = window.__makeMarket;
const applyProduction = window.__applyProduction;
const applyConsumption = window.__applyConsumption;
const recomputePrices = window.__recomputePrices;
const bottlenecks = window.__marketBottlenecks;
const underused = window.__underusedByproducts;
const rankByMargin = window.__rankByMargin;
const productionMargin = window.__productionMargin;

const nm = (id) => (E[id] ? E[id].name.en : id);
const hr = (s) => console.log(`\n${'─'.repeat(70)}\n${s}\n${'─'.repeat(70)}`);

hr('SHAPE OF THE ECONOMY');
Object.values(tiers).sort((a, b) => a.order - b.order).forEach(t => {
  const members = atTier(t.id);
  console.log(`${t.name.en.padEnd(20)} ${String(members.length).padStart(2)}  ${members.map(m => m.id).join(', ')}`);
});

hr('§7 — DOES ANY BYPRODUCT HAVE MULTIPLE CONSUMERS?');
console.log('(the blueprint forbids hardcoding a single consumer)');
atTier('byproduct').forEach(b => {
  const c = consumersOf(b.id);
  console.log(`  ${nm(b.id).padEnd(16)} → ${c.length ? c.map(nm).join(', ') : '(nothing yet — a real gap in the economy)'}`);
});

hr('§9/§23 — DO CROSS-BRANCH PRODUCTS ACTUALLY BRIDGE THE BRANCHES?');
console.log('Distance between the six base lines (should be FAR — they are separate branches):');
const base = ['processedWood', 'paperProducts', 'textiles', 'glassProducts', 'refinedMetal', 'plasticProducts'];
base.forEach(a => {
  const row = base.filter(b => b !== a).map(b => `${b.slice(0, 6)}:${econDistance(a, b, 6)}`);
  console.log(`  ${a.padEnd(16)} ${row.join('  ')}`);
});
console.log('\nBridges between the two most distant branches:');
[['processedWood', 'refinedMetal'], ['textiles', 'glassProducts'], ['plasticProducts', 'processedWood']].forEach(([a, b]) => {
  const br = bridgesBetween(a, b);
  console.log(`  ${nm(a)} ←→ ${nm(b)}: ${br.length ? br.map(nm).join(', ') : 'NONE — branches are isolated'}`);
});

hr('§5 — WHAT CAN A COMPANY BUILD, GIVEN WHAT IT CAN DO?');
const scenarios = [
  { label: 'A sawmill (tooling only, buys timber)', equip: ['mfgFirstTooling'], have: ['timber'] },
  { label: 'A sawmill that also bought a pilot line', equip: ['mfgFirstTooling', 'mfgPilotLine'], have: ['timber'] },
  { label: 'A metalworker (plant + CNC, buys metals)', equip: ['mfgInternationalPlant', 'mfgCNCUpgrade'], have: ['metals'] },
  { label: 'Full robotics shop with components on hand', equip: ['mfgRobotics', 'mfgHighVolumeLine'],
    have: ['metals', 'refinedMetal', 'metalComponents', 'plasticComponents', 'electricalComponents', 'electronicModules'] },
];
scenarios.forEach(s => {
  const caps = capabilitiesOf(s.equip);
  const opts = productionOptions(s.have, caps);
  console.log(`\n  ${s.label}`);
  console.log(`    capabilities: ${[...caps].join(', ')}`);
  console.log(`    can produce : ${opts.length ? opts.map(nm).join(', ') : '(nothing)'}`);
});

hr('§28 — "WHY CAN\'T I MAKE THIS?" (the gate must EXPLAIN itself)');
const sawmillCaps = capabilitiesOf(['mfgFirstTooling']);
['officeChair', 'smartDesk', 'woodComponents'].forEach(id => {
  const mi = missingInputs(id, ['timber', 'processedWood']);
  const mc = missingCapabilities(id, sawmillCaps);
  console.log(`  ${nm(id)}`);
  console.log(`    missing inputs      : ${mi.length ? mi.map(nm).join(', ') : 'none'}`);
  console.log(`    missing capabilities: ${mc.length ? mc.join(', ') : 'none'}`);
});

hr('§25 — SUBSTITUTION: CAN THE SAME PRODUCT BE MADE DIFFERENT WAYS?');
['paperProducts', 'packaging', 'officeChair'].forEach(id => {
  const prim = recipeInputs(id, { primary: true, substitute: false, optional: false });
  const subs = recipeInputs(id, { primary: false, substitute: true, optional: false });
  const opt = recipeInputs(id, { primary: false, substitute: false, optional: true });
  console.log(`  ${nm(id)}`);
  console.log(`    primary   : ${prim.map(i => nm(i.id)).join(' + ')}`);
  console.log(`    substitute: ${subs.length ? subs.map(i => `${nm(i.id)} (qual ${i.qualityDelta >= 0 ? '+' : ''}${i.qualityDelta}, sust +${i.sustainabilityDelta}, cost ${i.costDelta > 0 ? '+' : ''}${Math.round(i.costDelta * 100)}%)`).join('; ') : '—'}`);
  console.log(`    optional  : ${opt.length ? opt.map(i => nm(i.id)).join(', ') : '—'}`);
});

hr('§24 — DOES A DEMAND SHOCK CASCADE THROUGH THE GRAPH?');
console.log('The blueprint\'s own worked example: furniture demand rises. Watch it propagate.\n');
let market = makeMarket();
recomputePrices(market);
const watch = ['timber', 'processedWood', 'woodComponents', 'furnitureFrames', 'woodenFurniture', 'woodScrap', 'recycledWood'];
const snap = (label) => {
  recomputePrices(market);
  console.log(`  ${label.padEnd(26)} ` + watch.map(id => `${id.slice(0, 8)}:${String(market[id].price).padStart(6)}`).join(' '));
};
snap('baseline');
// Demand for furniture rises sharply.
applyConsumption(market, 'woodenFurniture', 260);
snap('furniture demand +260');
// Manufacturers respond by producing more, which pulls their inputs.
applyProduction(market, 'woodenFurniture', 200);
applyProduction(market, 'furnitureFrames', 200);
applyProduction(market, 'woodComponents', 240);
applyProduction(market, 'processedWood', 300);
snap('...producers respond');

hr('§27 — WHAT WOULD AN ENTREPRENEUR SEE RIGHT NOW?');
recomputePrices(market);
console.log('\nBottlenecks (demand outstripping supply — someone should enter here):');
bottlenecks(market, 1.15).slice(0, 6).forEach(b =>
  console.log(`  ${nm(b.id).padEnd(24)} ratio ${b.ratio.toFixed(2)}  price ${b.price}`));

console.log('\nUnderused byproducts (surplus waste that something CAN consume):');
const uu = underused(market);
if (uu.length) uu.slice(0, 6).forEach(u =>
  console.log(`  ${nm(u.id).padEnd(24)} ratio ${u.ratio.toFixed(2)}  consumers: ${u.consumers.map(nm).join(', ')}`));
else console.log('  (none in surplus)');

console.log('\nHighest-margin things to produce at current prices:');
rankByMargin(market).slice(0, 6).forEach(m =>
  console.log(`  ${nm(m.entityId).padEnd(24)} revenue ${String(m.revenue).padStart(6)}  inputs ${String(m.inputCost).padStart(6)}  margin ${String(m.margin).padStart(6)}`));

console.log('\nWorst-margin things (someone is about to exit these):');
rankByMargin(market).slice(-4).forEach(m =>
  console.log(`  ${nm(m.entityId).padEnd(24)} revenue ${String(m.revenue).padStart(6)}  inputs ${String(m.inputCost).padStart(6)}  margin ${String(m.margin).padStart(6)}`));

hr('§8 — ARE THE CLOSED LOOPS ACTUALLY CLOSED?');
[['woodScrap', 'recycledWood', 'woodComponents'],
 ['metalScrap', 'recycledMetal', 'metalComponents'],
 ['cullet', 'recycledGlass', 'glassPanels'],
 ['plasticScrap', 'recycledPlastic', 'plasticComponents']].forEach(([waste, recycled, back]) => {
  const closes = consumersOf(waste).includes(recycled)
    && recipeInputs(back).some(i => i.id === recycled);
  console.log(`  ${nm(waste).padEnd(18)} → ${nm(recycled).padEnd(26)} → ${nm(back).padEnd(20)} ${closes ? '✓ closed' : '✗ OPEN'}`);
});

console.log(`\n${'═'.repeat(70)}`);
console.log('§29 VERDICT — read the above. The architecture is working if you can see');
console.log('opportunities in it that nobody hardcoded.');
console.log('═'.repeat(70));
