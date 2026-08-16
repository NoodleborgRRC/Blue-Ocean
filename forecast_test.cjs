// Analyst "Forewarned" — forecast ranges, sharpening with mastery, and (most importantly)
// parity between what the preview promises and what the resolution actually does.
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

const previewChance = window.__previewChance;
const forecastText = window.__forecastText;
const forecastHalfWidth = window.__forecastHalfWidth;
const forecastBand = window.__forecastBand;
const fundraiseChanceBounds = window.__fundraiseChanceBounds;
const instrumentChance = window.__instrumentChance;
const d10Faces = window.__d10SuccessFaces;
const MIN_HALF = window.__FORECAST_MIN_HALF_WIDTH;
const toLeader = window.__customFounderToLeader;
const emptyFounder = window.__emptyCustomFounder;
const getIndustry = window.__getIndustry2;
const founderFx = window.__founderFx;

function mkF(patch) { return { ...emptyFounder(), name: 'A', ...patch }; }
function runFor(patch, career) {
  const ind = getIndustry('manufacturing');
  const leader = toLeader(mkF(patch), 'en', career);
  const team = window.__buildTeam([leader, ind.content.leaders[0]]);
  const H = window.__makeHandlers('en', []);
  H.setState(window.__initialState(team, 'en',
    { ...window.__getScenario('fullRun'), industryId: 'manufacturing', endMonth: ind.runEnd }, []));
  return { H, ind, state: H.getState() };
}
const analyst = { classId: 'Analyst', signaturePerkId: 'scenarioPlanner' };
const analystSharp = { classId: 'Analyst', signaturePerkId: 'dataDriven' };
const nonAnalyst = { classId: 'Visionary', signaturePerkId: 'blueOcean' };

// ================================================================ gating
section('Who can forecast at all');
const nonState = runFor(nonAnalyst).state;
ok('a non-Analyst gets no forecast, not a placeholder',
  previewChance('fundraise', nonState, { industry: getIndustry('manufacturing') }) === null);
ok('founderFx reports forecasting disabled for non-Analysts', founderFx(nonState).forecastEnabled === false);
const anaState = runFor(analyst).state;
ok('an Analyst gets a forecast', previewChance('fundraise', anaState, { industry: getIndustry('manufacturing') }) !== null);
ok('founderFx reports forecasting enabled', founderFx(anaState).forecastEnabled === true);
ok('an unknown forecast kind returns null', previewChance('nonsense', anaState, {}) === null);

// ================================================================ sharpening
section('Nobody predicts perfectly — but skill narrows the band');
const green = forecastHalfWidth({}, false);
const withDD = forecastHalfWidth({}, true);
const veteran = forecastHalfWidth({ byClass: { Analyst: { runs: 8, wins: 2 } } }, false);
const master = forecastHalfWidth({ byClass: { Analyst: { runs: 20, wins: 9 } } }, true);
ok('a green Analyst has the widest band', green > withDD && green > veteran, `${green}`);
ok('Data Driven sharpens the read', withDD < green, `${green} -> ${withDD}`);
ok('class mastery sharpens the read', veteran < green, `${green} -> ${veteran}`);
ok('a master Analyst is sharpest', master <= veteran && master <= withDD, `${master}`);
ok('the band NEVER closes completely — no one sees the future exactly',
  master >= MIN_HALF, `floor ${MIN_HALF}, master ${master}`);
ok('sharpening is monotonic across mastery',
  [0, 2, 4, 8, 20].map(r => forecastHalfWidth({ byClass: { Analyst: { runs: r, wins: 0 } } }, false))
    .every((v, i, a) => i === 0 || v <= a[i - 1]));

section('The band narrows in the actual displayed forecast');
const ind = getIndustry('manufacturing');
const greenState = runFor(analyst, {}).state;
const masterState = runFor(analystSharp, { byClass: { Analyst: { runs: 20, wins: 9 } } }).state;
const gP = previewChance('fundraise', greenState, { industry: ind });
const mP = previewChance('fundraise', masterState, { industry: ind });
ok('a green Analyst sees a wider range than a master',
  (gP.hi - gP.lo) > (mP.hi - mP.lo),
  `green ${gP.lo}–${gP.hi} (${gP.hi - gP.lo}pp) vs master ${mP.lo}–${mP.hi} (${mP.hi - mP.lo}pp)`);
ok('both are still ranges, not points', gP.hi > gP.lo && mP.hi > mP.lo);

// ================================================================ formats
section('Percentage systems vs d10 systems render differently — on purpose');
ok('fundraise is a percentage forecast', gP.mode === 'pct');
ok('percentage text reads as a range', /%–\d+%$/.test(forecastText(gP, 'en')), forecastText(gP, 'en'));
const choiceP = previewChance('choiceOption', greenState, { statTotal: 4, bar: 10 });
ok('a choice event is a d10 forecast', choiceP.mode === 'd10');
ok('d10 text reads "in 10", never a percentage',
  /in 10$/.test(forecastText(choiceP, 'en')) && !forecastText(choiceP, 'en').includes('%'),
  forecastText(choiceP, 'en'));
const choiceMaster = previewChance('choiceOption', masterState, { statTotal: 4, bar: 10 });
ok('a master Analyst reads a d10 EXACTLY (dice are genuinely knowable)',
  choiceMaster.exact === true, forecastText(choiceMaster, 'en'));
ok('but her percentage forecast is still a range (models are not)',
  mP.lo !== mP.hi, forecastText(mP, 'en'));
ok('Spanish formatting differs', forecastText(choiceP, 'es').includes('de 10'));

section('d10 face maths');
ok('needing a 4+ succeeds on 7 faces', d10Faces(0, 4) === 7);
ok('an impossible bar succeeds on 0 faces', d10Faces(0, 20) === 0);
ok('a trivial bar succeeds on all 10', d10Faces(15, 4) === 10);
ok('stat total shifts the odds', d10Faces(3, 10) === 4 && d10Faces(0, 10) === 1);
ok('faces stay within 0..10 across a wide sweep',
  Array.from({ length: 60 }, (_, i) => d10Faces(i % 15, (i % 25) + 1)).every(f => f >= 0 && f <= 10));

// ================================================================ parity (the important one)
section('Preview and resolution read the SAME math');
// The forecast must bracket the chance the handler actually computes. Because
// handleFundraise now calls bounds.shape() itself, a drift here is structurally impossible —
// this test guards against someone re-inlining the math later.
const bounds = fundraiseChanceBounds(greenState, ind);
ok('bounds lo <= hi', bounds.lo <= bounds.hi, `${bounds.lo.toFixed(1)}–${bounds.hi.toFixed(1)}`);
ok('the displayed range brackets the real achievable band',
  gP.lo <= Math.round(bounds.lo) && gP.hi >= Math.round(bounds.hi),
  `shown ${gP.lo}–${gP.hi}, real ${bounds.lo.toFixed(1)}–${bounds.hi.toFixed(1)}`);
ok('the real band is itself a range (fundraise uncertainty is genuine, not simulated)',
  bounds.hi > bounds.lo, `${bounds.lo.toFixed(1)} vs ${bounds.hi.toFixed(1)}`);

// Sample the live handler many times; every realised chance must sit inside the forecast.
function sampleFundraiseOutcomes(patch, trials) {
  let successes = 0;
  for (let i = 0; i < trials; i++) {
    const { H } = runFor(patch);
    H.setState({ ...H.getState(), presence: 15, ap: 3, reputation: 70, boardConfidence: 70 });
    const before = H.getState().capital;
    H.handleFundraise();
    if (H.getState().capital > before) successes++;
  }
  return successes / trials;
}
const anaTuned = runFor(analyst);
anaTuned.H.setState({ ...anaTuned.H.getState(), presence: 15, ap: 3, reputation: 70, boardConfidence: 70 });
const tunedPreview = previewChance('fundraise', anaTuned.H.getState(), { industry: ind });
const observed = sampleFundraiseOutcomes(analyst, 600) * 100;
ok('observed success rate falls inside the forecast range',
  observed >= tunedPreview.lo - 6 && observed <= tunedPreview.hi + 6,
  `forecast ${tunedPreview.lo}–${tunedPreview.hi}%, observed ${observed.toFixed(1)}% over 600 raises`);

section('The Analyst floor shows up in the forecast, not just the resolution');
const desperate = runFor(analyst);
desperate.H.setState({ ...desperate.H.getState(), reputation: 1, boardConfidence: 1 });
const floorP = previewChance('fundraise', desperate.H.getState(), { industry: ind });
const floorBounds = fundraiseChanceBounds(desperate.H.getState(), ind);
ok('a hopeless-looking raise still respects the Analyst floor', floorBounds.lo >= 12,
  `${floorBounds.lo.toFixed(1)}%`);
ok('and the forecast reflects that floor rather than showing near-zero', floorP.hi >= 12,
  forecastText(floorP, 'en'));

section('Instrument forecasts');
const instState = runFor(analyst).state;
const stageId = window.__stageOf(instState.month, ind.stages).id;
const insts = window.__instrumentsForStage2(ind, stageId);
if (insts.length) {
  const inv = window.__investorForInstrument(instState, insts[0].id, stageId);
  const iP = previewChance('instrument', instState, { instrument: insts[0], investor: inv });
  ok('an instrument produces a percentage forecast', iP && iP.mode === 'pct');
  const trueChance = instrumentChance(instState, insts[0], inv);
  ok('the forecast brackets the deterministic true chance',
    iP.lo <= Math.round(trueChance) && iP.hi >= Math.round(trueChance),
    `shown ${iP.lo}–${iP.hi}%, true ${trueChance.toFixed(1)}%`);
} else {
  ok('an instrument produces a percentage forecast', false, 'no instruments at this stage');
  ok('the forecast brackets the deterministic true chance', false);
}

section('Bands');
ok('bands classify across the range',
  forecastBand(90).id === 'nearCertain' && forecastBand(70).id === 'likely'
  && forecastBand(50).id === 'even' && forecastBand(30).id === 'unlikely' && forecastBand(5).id === 'longShot');
ok('every band is bilingual', ['nearCertain', 'likely', 'even', 'unlikely', 'longShot']
  .every(id => { const b = forecastBand({ nearCertain: 90, likely: 70, even: 50, unlikely: 30, longShot: 5 }[id]); return b.label.en && b.label.es; }));
ok('forecasts stay within displayable bounds across extreme states',
  [{ reputation: 0, boardConfidence: 0 }, { reputation: 100, boardConfidence: 100 }].every(patch => {
    const r = runFor(analyst);
    r.H.setState({ ...r.H.getState(), ...patch });
    const p = previewChance('fundraise', r.H.getState(), { industry: ind });
    return p.lo >= 1 && p.hi <= 99 && p.lo <= p.hi;
  }));

console.log(`\n${'='.repeat(60)}\nForewarned forecasts: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
