// SHORTFALL CONSEQUENCES — B2B breach costs reputation; B2C shortfall follows the market instead.
// Direction: "less supply than demand shouldn't gouge reputation; it should follow the
// supply/demand curve of basic economics. Not following through on CONTRACTS should."
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

function newRun(patch) {
  const ind = getIndustry('manufacturing');
  const team = window.__buildTeam(ind.content.leaders.slice(0, 3));
  const H = window.__makeHandlers('en', []);
  H.setState({
    ...window.__initialState(team, 'en', { ...window.__getScenario('fullRun'), industryId: 'manufacturing', endMonth: ind.runEnd }, []),
    capital: 5000, ap: 6, laborPool: 1, reputation: 95, boardConfidence: 95,
    equipment: {}, // deliberately no equipment: guarantees zero capacity, so demand always exceeds it
    supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: 0 } },
    ...(patch || {}),
  });
  return H;
}
function tick(H, forceRandom) {
  const real = Math.random;
  Math.random = forceRandom != null ? () => forceRandom : real;
  try { H.endMonth(); } finally { Math.random = real; }
}
const inst = (id, launchType, channels) => ({
  productId: id, phase: 'launched', quality: 6, defectRate: 0.05,
  channelsOpened: channels, launchType, appealBonus: 1, costReduction: 0,
});

section('Pure B2C shortfall: no reputation cost, a scarcity price premium instead');
const { } = (() => {
  const H = newRun({ products: { woodenFurniture: inst('woodenFurniture', 'b2c', ['designLed']) } });
  const repBefore = H.getState().reputation;
  tick(H, 0.999);
  const s = H.getState();
  const t = s.log.find(x => /Production Report/.test(x.title));
  ok('reputation is untouched by a pure-consumer shortfall', s.reputation === repBefore, `${repBefore} -> ${s.reputation}`);
  ok('a shortfall genuinely occurred (test is exercising the real path)', /short of capacity/.test(t.body));
  ok('the ticket mentions a scarcity price premium', /[Ss]carcity lifts/.test(t.body) || /escasez/.test(t.body));
  ok('the ticket explains no B2B contracts are on the line', /No B2B contracts/.test(t.body) || /Sin contratos B2B/.test(t.body));
  ok('the ticket does NOT claim a reputation penalty', !/Reputation\)/.test(t.body) && !/Reputación\)/.test(t.body));
  return {};
})();

section('Pure B2B shortfall: real reputation cost, attributed explicitly to missed contracts');
(() => {
  const H = newRun({ products: { woodenFurniture: inst('woodenFurniture', 'b2b', ['independentRetailers', 'nationalRetailChains']) } });
  const repBefore = H.getState().reputation;
  tick(H, 0.999);
  const s = H.getState();
  const t = s.log.find(x => /Production Report/.test(x.title));
  ok('reputation actually drops', s.reputation < repBefore, `${repBefore} -> ${s.reputation}`);
  ok('the ticket attributes it to missed B2B contracts', /missed those contracted orders/.test(t.body));
  ok('the ticket states the B2B share driving the hit', /100% of demand is B2B/.test(t.body));
  ok('a scarcity premium is ALSO mentioned — price and reputation are independent consequences',
    /[Ss]carcity lifts/.test(t.body));
})();

section('Mixed B2B/B2C: reputation cost scales with the B2B share, not all-or-nothing');
(() => {
  // Two products at once: one B2C, one B2B, so roughly half of demand is contracted.
  const H = newRun({ products: {
    woodenFurniture: inst('woodenFurniture', 'b2c', ['designLed']),
    metalTools: inst('metalTools', 'b2b', ['developers']),
  } });
  const repBefore = H.getState().reputation;
  tick(H, 0.999);
  const s = H.getState();
  const t = s.log.find(x => /Production Report/.test(x.title));
  ok('reputation drops, but the ticket reports a partial B2B share', s.reputation < repBefore);
  const pctMatch = t.body.match(/(\d+)% of demand is B2B/);
  ok('the reported B2B share is between 0 and 100 — a genuine mix, not a rounding artifact',
    !!pctMatch && +pctMatch[1] > 0 && +pctMatch[1] < 100, pctMatch ? pctMatch[1] : 'no match');
})();

section('No shortfall: neither consequence fires');
(() => {
  // newRun() deliberately starts with zero LEGACY capacity (most tests in this suite want that,
  // to guarantee a shortfall). This specific test wants the OPPOSITE — genuinely no shortfall
  // anywhere — and organic legacy demand growth (unrelated to products, present even with none)
  // would otherwise outrun zero legacy capacity within a single tick. Explicit legacy capacity
  // headroom here counteracts that pre-existing, unrelated quirk.
  const H = newRun({ laborPool: 200, capacity: 50,
    equipment: { mfgFirstTooling: window.__instantiateEquipment('mfgFirstTooling'), mfgPilotLine: window.__instantiateEquipment('mfgPilotLine') },
    products: { processedWood: inst('processedWood', 'b2b', ['developers']) } });
  const repBefore = H.getState().reputation;
  tick(H, 0.999);
  const s = H.getState();
  const t = s.log.find(x => /Production Report/.test(x.title));
  if (t && /idle plant/.test(t.body)) {
    ok('an oversupplied company is untouched by shortfall consequences (correctly hit idle instead)',
      s.reputation === repBefore);
  } else {
    ok('a balanced company loses no reputation', s.reputation === repBefore, `${repBefore} -> ${s.reputation}`);
  }
})();

section('The scarcity premium is bounded — cannot be exploited by starving capacity to zero');
(() => {
  const H = newRun({ laborPool: 0, // as starved as possible
    products: { woodenFurniture: inst('woodenFurniture', 'b2c', ['designLed', 'everydayValue']) } });
  const capBefore = H.getState().capital;
  tick(H, 0.999);
  const s = H.getState();
  const t = s.log.find(x => /Production Report/.test(x.title));
  const pctMatch = t.body.match(/\+(\d+)%/);
  ok('the premium is capped, not unbounded, even under total starvation',
    !pctMatch || +pctMatch[1] <= 20, pctMatch ? pctMatch[1] : 'no premium shown');
})();

section('Hospitality is unaffected — it does not use the capacityDemand revenue model at all');
(() => {
  const hospInd = getIndustry('hospitality');
  ok('Hospitality uses a different revenue model entirely', hospInd.revenueModel !== 'capacityDemand',
    hospInd.revenueModel);
  ok('Hospitality has no product catalogue for B2B/B2C to apply to', !hospInd.productCatalog);
})();

console.log(`\n${'='.repeat(62)}\nShortfall Consequences: ${pass} passed, ${fail} failed\n${'='.repeat(62)}`);
process.exit(fail ? 1 : 0);
