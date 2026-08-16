// Business Model layer (strategic commitments) — direct correctness tests.
// Per the project's standing posture: verify WHY something passes, with real numbers, not just
// that a boolean came back true.
global.window = global;
require('./build/harness.cjs');

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${label}${detail ? '  — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? '  — ' + detail : ''}`); }
}
function section(s) { console.log(`\n${s}`); }

const AXES = window.__BUSINESS_MODEL_AXES;
const activeModelEffects = window.__activeModelEffects;
const pendingModelAxis = window.__pendingModelAxis;
const retoolCost = window.__retoolCost;
const findModelOption = window.__findModelOption;
const getIndustry = window.__getIndustry2;

// ---------------------------------------------------------------- structure
section('Structure — 27 paths');
ok('three axes declared', AXES.length === 3, `got ${AXES.length}`);
ok('every axis has exactly 3 options', AXES.every(a => a.options.length === 3),
  AXES.map(a => `${a.id}:${a.options.length}`).join(' '));
const totalPaths = AXES.reduce((acc, a) => acc * a.options.length, 1);
ok('27 total strategic paths', totalPaths === 27, `${totalPaths} paths`);

const allIds = AXES.flatMap(a => a.options.map(o => o.id));
ok('no duplicate option ids', new Set(allIds).size === allIds.length);
ok('every option is bilingual', AXES.every(a => a.options.every(o =>
  o.name.en && o.name.es && o.blurb.en && o.blurb.es && o.detail.en && o.detail.es)));
ok('every axis question is bilingual', AXES.every(a => a.question.en && a.question.es));
ok('every option is philosophy-tagged at authoring time',
  AXES.every(a => a.options.every(o => o.philosophy && Object.keys(o.philosophy).length > 0)));
ok('every option declares mechanical effects',
  AXES.every(a => a.options.every(o => o.effects && Object.keys(o.effects).length > 0)));
ok('commit stage indices are staggered, not simultaneous',
  new Set(AXES.map(a => a.commitAtStageIndex)).size === 3,
  AXES.map(a => `${a.id}@${a.commitAtStageIndex}`).join(' '));

// ---------------------------------------------------------------- aggregation
section('activeModelEffects — neutral baseline');
const neutral = activeModelEffects({ businessModel: {} });
ok('uncommitted run is fully neutral',
  neutral.marginMultiplier === 1 && neutral.burnMultiplier === 1 &&
  neutral.projectCostMultiplier === 1 && neutral.fundraiseMultiplier === 1 &&
  neutral.demandGrowthMultiplier === 1 && neutral.attackResistance === 1);
ok('default labor burn divisor matches the legacy hardcoded 3', neutral.laborBurnDivisor === 3);
ok('no exits favored when nothing committed', neutral.favorsExits.size === 0);

section('activeModelEffects — single commitment');
const premium = activeModelEffects({ businessModel: { productStrategy: 'premiumCraft' } });
ok('premiumCraft raises margin to 1.25x', premium.marginMultiplier === 1.25, `${premium.marginMultiplier}`);
ok('premiumCraft slows demand growth to 0.75x', premium.demandGrowthMultiplier === 0.75, `${premium.demandGrowthMultiplier}`);
ok('premiumCraft leaves unrelated modifiers untouched', premium.projectCostMultiplier === 1 && premium.burnMultiplier === 1);

section('activeModelEffects — stacking across all three axes');
const stacked = activeModelEffects({ businessModel: {
  productStrategy: 'volumeScale',        // margin 0.8, demandGrowth 1.4, mktPos 1.25, repGain 0.85
  scalingStrategy: 'verticalIntegration',// projectCost 1.2, burn 0.8, attackResist 0.6
  expansionVector: 'geographicExpansion',// demandGrowth 1.35, burn 1.2, fundraise 1.25, compliance 1.3
} });
ok('burn composes multiplicatively (0.8 x 1.2 = 0.96)',
  Math.abs(stacked.burnMultiplier - 0.96) < 1e-9, `${stacked.burnMultiplier}`);
ok('demand growth composes (1.4 x 1.35 = 1.89)',
  Math.abs(stacked.demandGrowthMultiplier - 1.89) < 1e-9, `${stacked.demandGrowthMultiplier}`);
ok('margin carries from the only axis that sets it (0.8)',
  Math.abs(stacked.marginMultiplier - 0.8) < 1e-9, `${stacked.marginMultiplier}`);
ok('project cost carries (1.2)', Math.abs(stacked.projectCostMultiplier - 1.2) < 1e-9);
ok('attack resistance carries (0.6)', Math.abs(stacked.attackResistance - 0.6) < 1e-9);
ok('favored exits union across all three',
  stacked.favorsExits.has('ipo') && stacked.favorsExits.has('peBuyout') && stacked.favorsExits.has('strategicAcquisition'),
  [...stacked.favorsExits].join(','));

section('activeModelEffects — laborBurnDivisor takes max, never compounds');
const auto = activeModelEffects({ businessModel: { scalingStrategy: 'automationLed' } });
ok('automationLed raises divisor 3 -> 5', auto.laborBurnDivisor === 5, `${auto.laborBurnDivisor}`);
const autoPlus = activeModelEffects({ businessModel: { scalingStrategy: 'automationLed', productStrategy: 'premiumCraft' } });
ok('divisor stays 5 rather than compounding', autoPlus.laborBurnDivisor === 5, `${autoPlus.laborBurnDivisor}`);

// ---------------------------------------------------------------- scheduling
section('pendingModelAxis — staggered scheduling per industry');
const hosp = getIndustry('hospitality');
const mfg = getIndustry('manufacturing');

function axisDueAt(ind, month, committed) {
  const a = pendingModelAxis({ month, businessModel: committed || {} }, ind);
  return a ? a.id : null;
}
ok('hospitality: nothing due in Pre-Seed (month 3)', axisDueAt(hosp, 3) === null);
ok('hospitality: productStrategy due at Seed (month 9)', axisDueAt(hosp, 9) === 'productStrategy', axisDueAt(hosp, 9));
ok('hospitality: scalingStrategy due at Series A (month 20) once product committed',
  axisDueAt(hosp, 20, { productStrategy: 'premiumCraft' }) === 'scalingStrategy');
ok('hospitality: expansionVector due at Series B (month 30) once first two committed',
  axisDueAt(hosp, 30, { productStrategy: 'premiumCraft', scalingStrategy: 'automationLed' }) === 'expansionVector');
ok('manufacturing: nothing due in Pre-Seed (month 4)', axisDueAt(mfg, 4) === null);
ok('manufacturing: productStrategy due at Seed (month 12)', axisDueAt(mfg, 12) === 'productStrategy');
ok('manufacturing: scalingStrategy due at Early (month 30)',
  axisDueAt(mfg, 30, { productStrategy: 'volumeScale' }) === 'scalingStrategy');
ok('manufacturing: expansionVector due at Growth (month 50)',
  axisDueAt(mfg, 50, { productStrategy: 'volumeScale', scalingStrategy: 'outsourcedAsset' }) === 'expansionVector');
ok('fully committed run has nothing pending',
  axisDueAt(mfg, 70, { productStrategy: 'volumeScale', scalingStrategy: 'outsourcedAsset', expansionVector: 'deepenCore' }) === null);
ok('a late-joining run is offered every axis it skipped, oldest first',
  axisDueAt(mfg, 70, {}) === 'productStrategy');

// ---------------------------------------------------------------- retool cost
section('retoolCost — compounding, not flat');
const c0 = retoolCost({ retoolCount: 0 });
const c1 = retoolCost({ retoolCount: 1 });
const c2 = retoolCost({ retoolCount: 2 });
ok('first re-tool costs base 45k', c0.capital === 45, `${c0.capital}k`);
ok('second re-tool costs more than first', c1.capital > c0.capital, `${c0.capital}k -> ${c1.capital}k`);
ok('third costs more again', c2.capital > c1.capital, `${c1.capital}k -> ${c2.capital}k`);
ok('AP cost stays constant at 2', c0.ap === 2 && c2.ap === 2);

// ---------------------------------------------------------------- live run
section('Live run — commit, effects reach the engine, re-tool');
function newRun(industryId) {
  const ind = getIndustry(industryId);
  const team = window.__buildTeam(ind.content.leaders.slice(0, 2));
  const base = window.__getScenario('fullRun');
  const H = window.__makeHandlers('en', []);
  H.setState(window.__initialState(team, 'en', { ...base, industryId, endMonth: ind.runEnd }, []));
  return { H, ind };
}

const { H } = newRun('manufacturing');
ok('new run starts with no commitments', Object.keys(H.getState().businessModel).length === 0);
ok('new run starts with retoolCount 0', H.getState().retoolCount === 0);

H.handleCommitModel('productStrategy', 'premiumCraft');
let s = H.getState();
ok('commit records the choice', s.businessModel.productStrategy === 'premiumCraft');
ok('commit costs no AP (it is a fork, not an action)', s.ap === 2, `ap=${s.ap}`);
ok('onCommit deltas applied (reputation +6 from 20)', s.reputation === 26, `rep=${s.reputation}`);
ok('commit shifts philosophy (premiumVsMass +8)', s.philosophy.premiumVsMass === 8, `${s.philosophy.premiumVsMass}`);

const before = H.getState().businessModel.productStrategy;
H.handleCommitModel('productStrategy', 'volumeScale');
ok('a committed axis cannot be silently overwritten',
  H.getState().businessModel.productStrategy === before, `still ${H.getState().businessModel.productStrategy}`);

// Re-tool needs capital + presence; Manufacturing starts at 175k / 5 presence, retool needs 5.
s = H.getState();
const rc = retoolCost(s);
ok('re-tool is affordable at run start', s.capital >= rc.capital && s.presence >= rc.presence,
  `cap ${s.capital}/${rc.capital}, pres ${s.presence}/${rc.presence}`);
const capBefore = s.capital, bcBefore = s.boardConfidence;
H.handleRetoolModel('productStrategy');
s = H.getState();
ok('re-tool clears the commitment', !s.businessModel.productStrategy);
ok('re-tool charges capital', s.capital === capBefore - rc.capital, `${capBefore} -> ${s.capital}`);
ok('re-tool spends 2 AP', s.ap === 0, `ap=${s.ap}`);
ok('re-tool damages board confidence', s.boardConfidence < bcBefore, `${bcBefore} -> ${s.boardConfidence}`);
ok('re-tool increments retoolCount', s.retoolCount === 1, `${s.retoolCount}`);
ok('second re-tool now costs more', retoolCost(s).capital > rc.capital, `${rc.capital}k -> ${retoolCost(s).capital}k`);

// ---------------------------------------------------------------- effects actually reach burn
section('Effects reach the engine — burn responds to commitments');
function burnOverOneMonth(commitments, laborPool) {
  const { H: h } = newRun('manufacturing');
  const st = h.getState();
  h.setState({ ...st, businessModel: commitments, laborPool: laborPool != null ? laborPool : st.laborPool });
  const capBefore2 = h.getState().capital;
  // Pin Math.random high so the monthly random-event roll (`Math.random() < monthlyChance`)
  // never fires. Without this, an unrelated event's own capital delta occasionally lands in the
  // same month as the measurement and contaminates the burn comparison — flaky roughly 1 run in
  // 10, and for a reason that has nothing to do with the business-model effect under test.
  const realRandom = Math.random;
  Math.random = () => 0.999;
  try { h.endMonth(); } finally { Math.random = realRandom; }
  // capital delta = revenue - burn; revenue is 0 at month 1 (no capacity/demand)
  return capBefore2 - h.getState().capital;
}
const burnNeutral = burnOverOneMonth({});
const burnPlatform = burnOverOneMonth({ productStrategy: 'platformLicensing' }); // burn 0.85x
ok('platformLicensing measurably lowers burn', burnPlatform < burnNeutral,
  `${burnNeutral}k -> ${burnPlatform}k`);

// automationLed raises the labor divisor 3 -> 5. At Manufacturing's 6-head start this is
// mathematically a NO-OP (ceil(6/3) === ceil(6/5) === 2) -- the commitment only starts paying
// from 9 heads up. That is defensible design (automation pays off at scale, not on day one),
// but it must be asserted where it can actually show, or the test proves nothing.
ok('automationLed is a deliberate no-op at the 6-head start',
  burnOverOneMonth({ scalingStrategy: 'automationLed' }, 6) === burnOverOneMonth({}, 6),
  'ceil(6/3) === ceil(6/5) === 2');
const bn18 = burnOverOneMonth({}, 18);
const ba18 = burnOverOneMonth({ scalingStrategy: 'automationLed' }, 18);
ok('automationLed measurably lowers burn at 18 heads', ba18 < bn18, `${bn18}k -> ${ba18}k`);
const bn30 = burnOverOneMonth({}, 30);
const ba30 = burnOverOneMonth({ scalingStrategy: 'automationLed' }, 30);
ok('the saving widens as headcount grows', (bn30 - ba30) > (bn18 - ba18),
  `saves ${bn18 - ba18}k at 18 heads, ${bn30 - ba30}k at 30`);

section('Effects reach the engine — project cost responds');
function firstProjectCost(commitments) {
  const { H: h, ind } = newRun('manufacturing');
  const st = h.getState();
  h.setState({ ...st, businessModel: commitments });
  const capBefore3 = h.getState().capital;
  h.handleInvest('mfgConceptStudy');
  return capBefore3 - h.getState().capital;
}
const costNeutral = firstProjectCost({});
const costOutsourced = firstProjectCost({ scalingStrategy: 'outsourcedAsset' });   // 0.8x
const costVertical = firstProjectCost({ scalingStrategy: 'verticalIntegration' }); // 1.2x
ok('outsourcedAsset makes projects cheaper', costOutsourced < costNeutral, `${costNeutral}k -> ${costOutsourced}k`);
ok('verticalIntegration makes projects dearer', costVertical > costNeutral, `${costNeutral}k -> ${costVertical}k`);

section('Hospitality regression — layer is industry-agnostic and does not disturb a neutral run');
const { H: HH } = newRun('hospitality');
ok('hospitality run also starts uncommitted', Object.keys(HH.getState().businessModel).length === 0);
const hCapBefore = HH.getState().capital;
HH.endMonth();
ok('hospitality month 1 advances normally', HH.getState().month === 2 && HH.getState().capital < hCapBefore,
  `capital ${hCapBefore} -> ${HH.getState().capital}`);
HH.handleCommitModel('productStrategy', 'volumeScale');
ok('hospitality can commit the same shared axes', HH.getState().businessModel.productStrategy === 'volumeScale');

console.log(`\n${'='.repeat(56)}\nBusiness Model layer: ${pass} passed, ${fail} failed\n${'='.repeat(56)}`);
process.exit(fail ? 1 : 0);
