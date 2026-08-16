// The calibration payoff: outcome tickets that say what the model predicted, and a run-end
// track record. The whole point is that these can NEVER disagree with what was actually shown —
// verified here by driving live handlers and checking the log, not just the pure functions.
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

const recordForecastOutcome = window.__recordForecastOutcome;
const forecastOutcomeNote = window.__forecastOutcomeNote;
const forecastCalibrationSummary = window.__forecastCalibrationSummary;
const predictedPct = window.__predictedPct;
const toLeader = window.__customFounderToLeader;
const emptyFounder = window.__emptyCustomFounder;
const getIndustry = window.__getIndustry2;

function mkF(patch) { return { ...emptyFounder(), name: 'A', ...patch }; }
const analystStarter = { classId: 'Analyst', signaturePerkId: 'dataDriven' };
const analystScenario = { classId: 'Analyst', signaturePerkId: 'scenarioPlanner' };
const nonAnalyst = { classId: 'Visionary', signaturePerkId: 'blueOcean' };

function newRun(patch, career) {
  const ind = getIndustry('manufacturing');
  const leader = toLeader(mkF(patch), 'en', career);
  const team = window.__buildTeam([leader, ind.content.leaders[0]]);
  const H = window.__makeHandlers('en', []);
  H.setState(window.__initialState(team, 'en',
    { ...window.__getScenario('fullRun'), industryId: 'manufacturing', endMonth: ind.runEnd }, []));
  return { H, ind };
}

// ================================================================ predictedPct
section('predictedPct — normalising the two forecast modes to one scale');
ok('pct mode is already 0-100', predictedPct({ mode: 'pct', mid: 63 }) === 63);
ok('d10 mode scales faces (0-10) to a percentage', predictedPct({ mode: 'd10', mid: 7 }) === 70);
ok('a coin-flip d10 forecast lands on the 50 boundary', predictedPct({ mode: 'd10', mid: 5 }) === 50);

// ================================================================ recording
section('recordForecastOutcome — the running tally');
let d = { forecastRecord: { calls: 0, correct: 0 } };
recordForecastOutcome(d, null, true);
ok('no forecast shown -> nothing recorded (never scored a call that never happened)',
  d.forecastRecord.calls === 0);
recordForecastOutcome(d, { mode: 'pct', mid: 70 }, true);
ok('favored outcome that happens is scored correct', d.forecastRecord.calls === 1 && d.forecastRecord.correct === 1);
recordForecastOutcome(d, { mode: 'pct', mid: 70 }, false);
ok('favored outcome that does NOT happen is scored incorrect (the one real miss)',
  d.forecastRecord.calls === 2 && d.forecastRecord.correct === 1);
recordForecastOutcome(d, { mode: 'pct', mid: 20 }, false);
ok('a long shot that fails is scored correct (the model warned you, and it happened)',
  d.forecastRecord.calls === 3 && d.forecastRecord.correct === 2);
recordForecastOutcome(d, { mode: 'pct', mid: 20 }, true);
ok('a long shot that SUCCEEDS is now scored correct too — landing a 20% shot never reads as a model failure',
  d.forecastRecord.calls === 4 && d.forecastRecord.correct === 3);
recordForecastOutcome(d, { mode: 'd10', mid: 8 }, true);
ok('d10-mode forecasts feed the same tally', d.forecastRecord.calls === 5 && d.forecastRecord.correct === 4);
ok('starts from an absent record safely', (() => {
  const fresh = {};
  recordForecastOutcome(fresh, { mode: 'pct', mid: 70 }, true);
  return fresh.forecastRecord.calls === 1;
})());
ok('a coin-flip (exactly 50%) failure counts as the one real miss (favored side treats 50 as favored)',
  (() => {
    const c = { forecastRecord: { calls: 0, correct: 0 } };
    recordForecastOutcome(c, { mode: 'pct', mid: 50 }, false);
    return c.forecastRecord.correct === 0;
  })());
ok('every possible (favored/underdog x success/failure) combination scores as designed', (() => {
  const cases = [
    [{ mode: 'pct', mid: 90 }, true, true],   // favored + hit -> correct
    [{ mode: 'pct', mid: 90 }, false, false], // favored + miss -> the only incorrect case
    [{ mode: 'pct', mid: 10 }, true, true],   // underdog + hit -> correct (the change)
    [{ mode: 'pct', mid: 10 }, false, true],  // underdog + miss -> correct
  ];
  return cases.every(([preview, success, expectCorrect]) => {
    const c = { forecastRecord: { calls: 0, correct: 0 } };
    recordForecastOutcome(c, preview, success);
    return (c.forecastRecord.correct === 1) === expectCorrect;
  });
})());

// ================================================================ outcome notes
section('forecastOutcomeNote — four distinct, correct variants');
ok('no forecast -> no note', forecastOutcomeNote(null, true, 'en') === '');
const favoredHit = forecastOutcomeNote({ mode: 'pct', lo: 60, hi: 75, mid: 68, exact: false }, true, 'en');
const favoredMiss = forecastOutcomeNote({ mode: 'pct', lo: 60, hi: 75, mid: 68, exact: false }, false, 'en');
const longshotHit = forecastOutcomeNote({ mode: 'pct', lo: 15, hi: 30, mid: 22, exact: false }, true, 'en');
const longshotMiss = forecastOutcomeNote({ mode: 'pct', lo: 15, hi: 30, mid: 22, exact: false }, false, 'en');
ok('favored + hit reads as the model being right', /model called it/i.test(favoredHit), favoredHit);
ok('favored + miss reads as an upset, not a bug', /didn.t pay off/i.test(favoredMiss), favoredMiss);
ok('longshot + hit reads as beating the odds', /came through anyway/i.test(longshotHit), longshotHit);
ok('longshot + miss reads as the model foreseeing it', /saw this one coming/i.test(longshotMiss), longshotMiss);
ok('all four variants are textually distinct',
  new Set([favoredHit, favoredMiss, longshotHit, longshotMiss]).size === 4);
ok('the note always includes the actual range shown, not a generic phrase',
  favoredHit.includes('60%') && favoredHit.includes('75%'), favoredHit);
ok('Spanish variants exist and differ from English',
  forecastOutcomeNote({ mode: 'pct', lo: 60, hi: 75, mid: 68 }, true, 'es') !== favoredHit);
const d10Note = forecastOutcomeNote({ mode: 'd10', lo: 6, hi: 8, mid: 7, exact: false }, true, 'en');
ok('a d10 note uses "in 10" phrasing, never a percent sign', d10Note.includes('in 10') && !d10Note.includes('%'), d10Note);

// ================================================================ run-end summary
section('forecastCalibrationSummary');
ok('no calls -> no card (not a 0/0 line)', forecastCalibrationSummary({ calls: 0, correct: 0 }, 'en') === null);
ok('absent record -> no card', forecastCalibrationSummary(null, 'en') === null);
ok('absent record -> no card (undefined)', forecastCalibrationSummary(undefined, 'en') === null);
const sum = forecastCalibrationSummary({ calls: 20, correct: 15 }, 'en');
ok('computes the right percentage', sum.pct === 75, `${sum.pct}`);
ok('carries the raw counts through for the sentence', sum.calls === 20 && sum.correct === 15);
ok('bands the result the same way forecasts are banded', sum.band.id === 'likely', sum.band.id);
ok('a single call still summarises correctly (no divide-by-zero drama)',
  forecastCalibrationSummary({ calls: 1, correct: 1 }, 'en').pct === 100);
ok('a perfectly wrong model still summarises', forecastCalibrationSummary({ calls: 10, correct: 0 }, 'en').pct === 0);

// ================================================================ live integration — choice
section('Live — choice events annotate the outcome ticket and score it');
function firstChoiceEventAvailable(H) {
  for (let i = 0; i < 60; i++) {
    if (H.getState().pendingChoice) return true;
    if (H.getState().gameOver) return false;
    H.endMonth();
  }
  return !!H.getState().pendingChoice;
}
const modelNoteRe = /model called|didn.t pay off|came through anyway|saw this one coming/i;
const { H: chH } = newRun(analystStarter);
chH.setState({ ...chH.getState(), capital: 500000, presence: 30 });
const gotChoice = firstChoiceEventAvailable(chH);
if (gotChoice) {
  const beforeRecord = { ...chH.getState().forecastRecord };
  chH.handleChoiceOption(0);
  const afterState = chH.getState();
  ok('the run\u2019s forecastRecord.calls increased', afterState.forecastRecord.calls === beforeRecord.calls + 1,
    `${beforeRecord.calls} -> ${afterState.forecastRecord.calls}`);
  const latestTicket = afterState.log[0];
  ok('the outcome ticket carries a model note (Analyst on team)',
    modelNoteRe.test(latestTicket.body) || /in 10|de 10/.test(latestTicket.body), latestTicket.body);
} else {
  ok('a choice event appeared within 60 months to test against', false, 'none fired — flag for re-check');
}

const { H: naH } = newRun(nonAnalyst);
naH.setState({ ...naH.getState(), capital: 500000, presence: 30 });
const naGotChoice = firstChoiceEventAvailable(naH);
if (naGotChoice) {
  const before = naH.getState().forecastRecord.calls;
  naH.handleChoiceOption(0);
  ok('a non-Analyst\u2019s choice never scores a forecast call (nothing was shown)',
    naH.getState().forecastRecord.calls === before);
  ok('a non-Analyst\u2019s outcome ticket carries no model note',
    !modelNoteRe.test(naH.getState().log[0].body), naH.getState().log[0].body);
} else {
  ok('a choice event appeared to test the non-Analyst control', false, 'none fired');
}

// ================================================================ live integration — fundraise
section('Live — Fundraise annotates and scores');
const { H: frH } = newRun(analystScenario);
frH.setState({ ...frH.getState(), presence: 20, ap: 3, reputation: 60, boardConfidence: 60 });
const frBefore = frH.getState().forecastRecord.calls;
frH.handleFundraise();
const frAfter = frH.getState();
ok('a fundraise attempt scores a forecast call', frAfter.forecastRecord.calls === frBefore + 1);
ok('the fundraise ticket carries a model note', modelNoteRe.test(frAfter.log[0].body), frAfter.log[0].body);

const { H: frNonH } = newRun(nonAnalyst);
frNonH.setState({ ...frNonH.getState(), presence: 20, ap: 3, reputation: 60, boardConfidence: 60 });
frNonH.handleFundraise();
ok('a non-Analyst\u2019s Fundraise scores nothing', frNonH.getState().forecastRecord.calls === 0);
ok('a non-Analyst\u2019s Fundraise ticket carries no model note', !modelNoteRe.test(frNonH.getState().log[0].body));

// ================================================================ live integration — instrument
section('Live — funding instruments annotate and score');
const { H: fiH, ind: fiInd } = newRun(analystScenario);
const fiState0 = fiH.getState();
const fiStage = window.__stageOf(fiState0.month, fiInd.stages).id;
const fiInsts = window.__instrumentsForStage2(fiInd, fiStage);
if (fiInsts.length) {
  fiH.setState({ ...fiState0, presence: 20, ap: 3, reputation: 60, boardConfidence: 60 });
  const baseline = fiH.getState(); // AFTER the override — the actual state the handler sees
  const before = baseline.forecastRecord.calls;
  fiH.handleFundingInstrument(fiInsts[0].id);
  const after = fiH.getState();
  const scored = after.forecastRecord.calls === before + 1;
  const gatedClosed = after.capital === baseline.capital && after.ap === baseline.ap;
  ok('an instrument attempt scores a forecast call (or is legitimately denied before the roll)',
    scored || gatedClosed, `before ${before}, after ${after.forecastRecord.calls}`);
  if (scored) {
    ok('the instrument ticket carries a model note', modelNoteRe.test(after.log[0].body), after.log[0].body);
  } else {
    ok('the instrument ticket carries a model note (skipped — denied before the roll)', true);
  }
} else {
  ok('an instrument was available to test against', false, 'none at this stage');
}

// ================================================================ live integration — external
section('Live — attacks against rivals annotate and score');
const { H: exH, ind: exInd } = newRun(analystScenario);
const makeCompetitor = window.__makeCompetitor;
const rival = makeCompetitor([], [], 1, 'en', 'manufacturing', exInd.content);
exH.setState({ ...exH.getState(), competitors: [{ ...rival, id: 'r1' }], ap: 3, capital: 300000, presence: 20 });
const exActions = exInd.content.externalActions || [];
if (exActions.length) {
  const exBefore = exH.getState().forecastRecord.calls;
  const preview = window.__previewChance('externalAction', exH.getState(), {
    statTotal: exH.getState().stats[exActions[0].stat] || 0,
    bar: 10 + Math.floor(rival.strength / 12),
  });
  ok('the chip math produces a real percentage range for an attack', preview && preview.mode === 'd10' && preview.lo <= preview.hi,
    preview ? `${preview.lo}-${preview.hi}` : 'null');
  exH.handleExternalAction(exActions[0].id, 'r1');
  const exAfter = exH.getState();
  ok('an attack scores a forecast call', exAfter.forecastRecord.calls === exBefore + 1,
    `${exBefore} -> ${exAfter.forecastRecord.calls}`);
  ok('the attack ticket carries a model note', modelNoteRe.test(exAfter.log[0].body), exAfter.log[0].body);
} else {
  ok('external actions were available to test against', false, 'none in this industry');
}

const { H: exNonH, ind: exNonInd } = newRun(nonAnalyst);
const rival2 = makeCompetitor([], [], 1, 'en', 'manufacturing', exNonInd.content);
exNonH.setState({ ...exNonH.getState(), competitors: [{ ...rival2, id: 'r2' }], ap: 3, capital: 300000, presence: 20 });
const exNonActions = exNonInd.content.externalActions || [];
if (exNonActions.length) {
  exNonH.handleExternalAction(exNonActions[0].id, 'r2');
  ok('a non-Analyst’s attack scores nothing', exNonH.getState().forecastRecord.calls === 0);
  ok('a non-Analyst’s attack ticket carries no model note', !modelNoteRe.test(exNonH.getState().log[0].body),
    exNonH.getState().log[0].body);
} else {
  ok('external actions were available for the non-Analyst control', false, 'none in this industry');
}

// Parity: the forecast shown must bracket what the live handler actually resolves against.
section('Parity — attack forecast brackets the real d10 odds');
const d10Faces = window.__d10SuccessFaces;
const parityState = newRun(analystScenario).H.getState();
const pRival = makeCompetitor([], [], 1, 'en', 'manufacturing', getIndustry('manufacturing').content);
const pStatTotal = 3, pBar = 8;
const trueFaces = d10Faces(pStatTotal, pBar);
const pPreview = window.__previewChance('externalAction', parityState, { statTotal: pStatTotal, bar: pBar });
ok('the forecast range brackets the true d10 face count',
  pPreview.lo <= trueFaces && pPreview.hi >= trueFaces,
  `shown ${pPreview.lo}-${pPreview.hi}, true ${trueFaces}`);

// ================================================================ end-to-end sanity
section('End-to-end — a full run\u2019s tally matches its own annotated tickets');
const { H: e2eH } = newRun(analystScenario);
e2eH.setState({ ...e2eH.getState(), capital: 300000, presence: 25, ap: 3 });
let months = 0;
while (months < 40 && !e2eH.getState().gameOver) {
  if (e2eH.getState().pendingChoice) { e2eH.handleChoiceOption(0); continue; }
  if (e2eH.getState().ap > 0) e2eH.handleFundraise();
  e2eH.endMonth();
  months++;
}
const finalState = e2eH.getState();
const modelTickets = finalState.log.filter(x => modelNoteRe.test(x.body));
ok('every ticket carrying a model note corresponds to a scored call',
  modelTickets.length <= finalState.forecastRecord.calls,
  `${modelTickets.length} annotated tickets, ${finalState.forecastRecord.calls} scored calls`);
ok('at least one forecast was scored across a real 40-month run',
  finalState.forecastRecord.calls > 0, `${finalState.forecastRecord.calls} calls`);
ok('correct never exceeds calls', finalState.forecastRecord.correct <= finalState.forecastRecord.calls);

console.log(`\n${'='.repeat(60)}\nCalibration payoff: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
