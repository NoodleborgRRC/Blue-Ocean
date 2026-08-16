// Phase 4 / Items 15-16 — behavior systems and the INTERACTIONS between them.
// The point of this suite is not that each function returns a value; it's that the two systems
// compose into behaviour a player could reason about. Assertions therefore compare *scenarios*
// against each other rather than checking constants.
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

const BY_ID = window.__INVESTOR_BY_ID;
const INV = window.__INVESTOR_CHARACTERS;
const alignment = window.__investorAlignment;
const gate = window.__investorGate;
const invTerms = window.__investorTerms;
const investorTerm = window.__investorTerm;
const applyInvestorPressure = window.__applyInvestorPressure;
const settleStandings = window.__settleInvestorStandings;
const alignmentBand = window.__alignmentBand;
const dispAggression = window.__dispositionAggression;
const predatoryChoice = window.__predatoryAttackChoice;
const rivalGrowth = window.__rivalMonthlyGrowth;
const allyEffects = window.__allyEffects;
const attemptRaid = window.__attemptTalentRaid;
const rivalDefenceBonus = window.__rivalDefenceBonus;
const rivalRankPressure = window.__rivalRankPressure;
const tickCoexistence = window.__tickCoexistence;
const deriveDisposition = window.__deriveDisposition;
const makeCompetitor = window.__makeCompetitor;
const getIndustry = window.__getIndustry2;
const Store = window.__Store;

const AXES = ['growthVsSustainability', 'innovationVsExecution', 'peopleVsProfit', 'riskVsStability', 'premiumVsMass', 'centralizedVsDelegated'];
const phil = (o) => { const p = {}; AXES.forEach(a => { p[a] = o[a] || 0; }); return p; };

function newRun(industryId, patch) {
  const ind = getIndustry(industryId);
  const team = window.__buildTeam(ind.content.leaders.slice(0, 2));
  const base = window.__getScenario('fullRun');
  const H = window.__makeHandlers('en', []);
  H.setState({ ...window.__initialState(team, 'en', { ...base, industryId, endMonth: ind.runEnd }, []), ...(patch || {}) });
  return { H, ind };
}

// ================================================================ ALIGNMENT
section('Alignment — philosophy distance drives everything downstream');
const dwayne = BY_ID.dwayneBorg;
const greta = BY_ID.gretaLindqvist;

const profitFounder = phil({ growthVsSustainability: 80, peopleVsProfit: -85, riskVsStability: 45, centralizedVsDelegated: 60 });
const peopleFounder = phil({ growthVsSustainability: -75, peopleVsProfit: 80, riskVsStability: -40, premiumVsMass: 40 });

const dwayneVsProfit = alignment(dwayne, profitFounder);
const dwayneVsPeople = alignment(dwayne, peopleFounder);
ok('Dwayne aligns strongly with a profit-first founder', dwayneVsProfit > 0.75, dwayneVsProfit.toFixed(2));
ok('Dwayne aligns poorly with a people-first founder', dwayneVsPeople < 0.55, dwayneVsPeople.toFixed(2));
ok('the same investor reads differently to different founders', dwayneVsProfit > dwayneVsPeople + 0.2,
  `${dwayneVsProfit.toFixed(2)} vs ${dwayneVsPeople.toFixed(2)}`);

const gretaVsPeople = alignment(greta, peopleFounder);
const gretaVsProfit = alignment(greta, profitFounder);
ok('Greta mirrors the opposite founder (systems are not all the same axis)',
  gretaVsPeople > gretaVsProfit, `people ${gretaVsPeople.toFixed(2)} vs profit ${gretaVsProfit.toFixed(2)}`);
ok('alignment is bounded 0..1 for every investor against extreme philosophies',
  INV.every(i => { const a = alignment(i, profitFounder), b = alignment(i, peopleFounder); return a >= 0 && a <= 1 && b >= 0 && b <= 1; }));
ok('alignment bands classify across the range',
  alignmentBand(0.85).id === 'kindred' && alignmentBand(0.5).id === 'workable' && alignmentBand(0.1).id === 'irreconcilable');

// ================================================================ GATING
section('Gating — refusals are characterful, not generic');
const healthy = { capital: 300, laborPool: 6, reputation: 50, boardConfidence: 70, revenuePerMonth: 20, stats: { compliance: 5 }, philosophy: profitFounder, investorStandings: {} };

ok('an ordinary investor opens for a healthy company', gate(dwayne, healthy, 'seed').open);

const walter = BY_ID.walterKrumm;
ok('Walter Krumm declines a healthy company (rescue capital only)', !gate(walter, healthy, 'growth').open,
  gate(walter, healthy, 'growth').reason);
const desperate = { ...healthy, capital: 15, boardConfidence: 30 };
ok('Walter Krumm opens once you are actually desperate', gate(walter, desperate, 'growth').open);

const chandra = BY_ID.chandraMalhotra;
ok('Chandra opens for an unknown company', gate(chandra, { ...healthy, reputation: 30 }, 'seed').open);
ok('Chandra loses interest once you are popular', !gate(chandra, { ...healthy, reputation: 85 }, 'seed').open,
  gate(chandra, { ...healthy, reputation: 85 }, 'seed').reason);

ok('Greta cannot bend her mandate for a misaligned founder',
  !gate(greta, { ...healthy, philosophy: profitFounder }, 'growth').open,
  gate(greta, { ...healthy, philosophy: profitFounder }, 'growth').reason);
ok('Greta opens for an aligned founder',
  gate(greta, { ...healthy, philosophy: peopleFounder }, 'growth').open);

const howard = BY_ID.howardPryce;
ok('Howard Pryce declines a pre-revenue company', !gate(howard, { ...healthy, revenuePerMonth: 0 }, 'seed').open,
  gate(howard, { ...healthy, revenuePerMonth: 0 }, 'seed').reason);
ok('Howard Pryce opens once revenue exists', gate(howard, healthy, 'seed').open);

const omar = BY_ID.omarBenSalah;
ok('Omar declines when compliance would not survive audit',
  !gate(omar, { ...healthy, stats: { compliance: 1 } }, 'seed').open);
ok('Omar opens with adequate compliance', gate(omar, healthy, 'seed').open);

ok('a burned relationship closes the door regardless of fit',
  !gate(dwayne, { ...healthy, investorStandings: { dwayneBorg: -80 } }, 'seed').open,
  gate(dwayne, { ...healthy, investorStandings: { dwayneBorg: -80 } }, 'seed').reason);
ok('every refusal carries an in-character explanation',
  [walter, chandra, greta, howard].every(i => {
    const g = gate(i, i.id === 'walterKrumm' ? healthy : (i.id === 'chandraMalhotra' ? { ...healthy, reputation: 85 } : (i.id === 'gretaLindqvist' ? { ...healthy, philosophy: profitFounder } : { ...healthy, revenuePerMonth: 0 })), 'growth');
    return g.open || (g.reasonText && g.reasonText.en.length > 40 && g.reasonText.es.length > 40);
  }));

// ================================================================ TERMS
section('Terms — the same instrument, a different deal');
const fakeInst = { capital: [100, 140], dilution: 10, successBase: 70 };

const dwayneAligned = invTerms(dwayne, fakeInst, { ...healthy, philosophy: profitFounder });
const dwayneMisaligned = invTerms(dwayne, fakeInst, { ...healthy, philosophy: peopleFounder });
ok('an aligned founder gets more capital from the same instrument',
  dwayneAligned.capitalHi > dwayneMisaligned.capitalHi, `${dwayneMisaligned.capitalHi}k -> ${dwayneAligned.capitalHi}k`);
ok('an aligned founder gives up less equity',
  dwayneAligned.dilution < dwayneMisaligned.dilution, `${dwayneMisaligned.dilution}% -> ${dwayneAligned.dilution}%`);
ok('a misaligned investor sits heavier on the board',
  dwayneMisaligned.boardPressure > dwayneAligned.boardPressure,
  `${dwayneAligned.boardPressure.toFixed(2)} -> ${dwayneMisaligned.boardPressure.toFixed(2)}`);
ok('a misaligned investor is also less patient',
  dwayneMisaligned.patience < dwayneAligned.patience,
  `${dwayneAligned.patience.toFixed(2)} -> ${dwayneMisaligned.patience.toFixed(2)}`);

const jim = BY_ID.jimLeonard;
const jimTerms = invTerms(jim, fakeInst, healthy);
const dwayneTerms = invTerms(dwayne, fakeInst, healthy);
ok('Dwayne demands markedly more equity than Jim for the same round',
  dwayneTerms.dilution > jimTerms.dilution * 1.5, `Jim ${jimTerms.dilution}% vs Dwayne ${dwayneTerms.dilution}%`);
ok('Dwayne writes a bigger cheque than Jim', dwayneTerms.capitalHi > jimTerms.capitalHi,
  `Jim ${jimTerms.capitalHi}k vs Dwayne ${dwayneTerms.capitalHi}k`);

const highStanding = invTerms(dwayne, fakeInst, { ...healthy, investorStandings: { dwayneBorg: 80 } });
const lowStanding = invTerms(dwayne, fakeInst, { ...healthy, investorStandings: { dwayneBorg: -40 } });
ok('a champion standing improves the deal', highStanding.capitalHi > lowStanding.capitalHi,
  `${lowStanding.capitalHi}k -> ${highStanding.capitalHi}k`);
ok('a cool standing costs you equity', lowStanding.dilution > highStanding.dilution,
  `${highStanding.dilution}% -> ${lowStanding.dilution}%`);

section('Contrarian inverts the usual reputation relationship');
const chandraLowRep = invTerms(chandra, fakeInst, { ...healthy, reputation: 20 });
const chandraHighRep = invTerms(chandra, fakeInst, { ...healthy, reputation: 70 });
const dwayneLowRep = invTerms(dwayne, fakeInst, { ...healthy, reputation: 20 });
const dwayneHighRep = invTerms(dwayne, fakeInst, { ...healthy, reputation: 70 });
ok('for a normal investor, higher reputation raises success odds',
  dwayneHighRep.successBase > dwayneLowRep.successBase,
  `${dwayneLowRep.successBase.toFixed(1)} -> ${dwayneHighRep.successBase.toFixed(1)}`);
ok('for Chandra the relationship is INVERTED — low reputation is the draw',
  chandraLowRep.successBase > chandraHighRep.successBase,
  `rep20 ${chandraLowRep.successBase.toFixed(1)} vs rep70 ${chandraHighRep.successBase.toFixed(1)}`);

// ================================================================ PRESSURE
section('Board pressure — grace periods, and meeting the number buys silence');
const patientTerm = investorTerm(BY_ID.terrenceOkafor, invTerms(BY_ID.terrenceOkafor, fakeInst, healthy), 10);
const borgTerm = investorTerm(dwayne, invTerms(dwayne, fakeInst, healthy), 10);
ok('patient, hands-off money installs no pressure term at all', patientTerm === null);
ok('Dwayne installs a pressure term', !!borgTerm && borgTerm.kind === 'investorPressure');
ok('the term names the investor', borgTerm.investorName === 'Dwayne Borg');
ok('pressure begins only after a grace period', borgTerm.activeFromMonth > borgTerm.startedMonth,
  `month ${borgTerm.startedMonth} -> bites at ${borgTerm.activeFromMonth}`);

const kovac = BY_ID.ireneKovac;
const kovacTerm = investorTerm(kovac, invTerms(kovac, fakeInst, healthy), 10);
ok('a heavier investor bites sooner than a lighter one',
  kovacTerm.activeFromMonth <= borgTerm.activeFromMonth,
  `Kovac ${kovacTerm.activeFromMonth} vs Borg ${borgTerm.activeFromMonth}`);
ok('a heavier investor costs more board confidence per month',
  Math.abs(kovacTerm.monthlyBoardConfidence) >= Math.abs(borgTerm.monthlyBoardConfidence),
  `Kovac ${kovacTerm.monthlyBoardConfidence} vs Borg ${borgTerm.monthlyBoardConfidence}`);

function pressureAt(revenue, month) {
  const d = { activeTerms: [borgTerm], revenuePerMonth: revenue, boardConfidence: 60, stats: {}, log: [] };
  return applyInvestorPressure(d, month);
}
ok('no pressure before the grace period expires', pressureAt(0, borgTerm.activeFromMonth - 1) === null);
ok('missing the number after grace costs board confidence', pressureAt(0, borgTerm.activeFromMonth + 12) !== null);
ok('meeting the number buys complete silence', pressureAt(500, borgTerm.activeFromMonth + 12) === null,
  'high revenue -> no complaint');

// ================================================================ STANDINGS
section('Standings settle on how the run ended');
const backed = { investorBackers: { dwayneBorg: {}, jimLeonard: {} }, investorStandings: {} };
const afterWin = settleStandings(backed, true, 'acquisition');
const afterBust = settleStandings(backed, false, 'insolvent');
ok('a win raises standing for every backer', afterWin.dwayneBorg > 0 && afterWin.jimLeonard > 0,
  `${afterWin.dwayneBorg}`);
ok('insolvency lowers it', afterBust.dwayneBorg < 0, `${afterBust.dwayneBorg}`);
const evelyn = BY_ID.evelynAshcroft;
const ipoBacked = { investorBackers: { evelynAshcroft: {}, jimLeonard: {} }, investorStandings: {} };
const afterIPO = settleStandings(ipoBacked, true, 'ipo');
ok('hitting an investor\u2019s PREFERRED exit pleases them more than a generic win',
  afterIPO.evelynAshcroft > afterIPO.jimLeonard,
  `Evelyn (ipo bias) ${afterIPO.evelynAshcroft} vs Jim ${afterIPO.jimLeonard}`);
ok('standings accumulate onto prior values',
  settleStandings({ investorBackers: { jimLeonard: {} }, investorStandings: { jimLeonard: 40 } }, true, 'acquisition').jimLeonard > 40);
ok('standings clamp at 100',
  settleStandings({ investorBackers: { jimLeonard: {} }, investorStandings: { jimLeonard: 95 } }, true, 'ipo').jimLeonard === 100);

// ================================================================ NEMESIS BEHAVIOR
section('Disposition gates aggression');
ok('allies do not attack at all', dispAggression(80) === 0);
ok('cordial rivals attack rarely', dispAggression(35) > 0 && dispAggression(35) < 0.5);
ok('neutral is the baseline', dispAggression(0) === 1);
ok('nemeses attack far more often', dispAggression(-80) > 1.5, `${dispAggression(-80)}x`);
ok('aggression rises monotonically as disposition falls',
  dispAggression(80) < dispAggression(35) && dispAggression(35) < dispAggression(0) &&
  dispAggression(0) < dispAggression(-40) && dispAggression(-40) < dispAggression(-80));

section('Posture drives growth and durability');
const expansionist = { posture: 'expansionist' };
const fortified = { posture: 'fortified' };
let expTotal = 0, fortTotal = 0;
for (let i = 0; i < 400; i++) {
  expTotal += rivalGrowth(expansionist, 1).marketPosition;
  fortTotal += rivalGrowth(fortified, 1).marketPosition;
}
ok('expansionist rivals outgrow fortified ones measurably', expTotal > fortTotal * 1.2,
  `${(expTotal / 400).toFixed(2)}/mo vs ${(fortTotal / 400).toFixed(2)}/mo over 400 samples`);
ok('a fortified rival is harder for the player to hit', rivalDefenceBonus(fortified) > 0,
  `+${rivalDefenceBonus(fortified)} to the bar`);
ok('an expansionist rival is not extra-defended', rivalDefenceBonus(expansionist) <= 0);
ok('balanced posture is neutral on defence', rivalDefenceBonus({ posture: 'balanced' }) === 0);

section('Predatory rivals target your weakest stat');
const pool = [
  { defendStat: 'agility', title: 'a' }, { defendStat: 'cybersecurity', title: 'b' },
  { defendStat: 'compliance', title: 'c' }, { defendStat: 'innovation', title: 'd' },
];
const weakCyber = { agility: 7, cybersecurity: 1, compliance: 6, innovation: 5 };
const weakCompliance = { agility: 7, cybersecurity: 8, compliance: 0, innovation: 5 };
ok('picks the cyber attack against a cyber-weak company',
  predatoryChoice(pool, weakCyber).defendStat === 'cybersecurity');
ok('picks the compliance attack against a compliance-weak company',
  predatoryChoice(pool, weakCompliance).defendStat === 'compliance');
ok('handles an empty pool safely', predatoryChoice([], weakCyber) === null);

section('Talent raids');
const raidBase = { laborPool: 10, laborReserved: 2, morale: 40, stats: { talentCulture: 3 } };
const poacherHostile = { strength: 30, leaders: [{ trait: 'Poacher' }], encounters: { attackedByPlayer: 4 } };
const poacherFriendly = { strength: 30, leaders: [{ trait: 'Poacher' }], encounters: { coexistedRuns: 10 } };
const nonPoacher = { strength: 30, leaders: [{ trait: 'PriceWarrior' }], encounters: { attackedByPlayer: 4 } };
// Raids are probabilistic now, so a single call proves nothing — sample.
const anyRaid = Array.from({ length: 200 }, () => attemptRaid(poacherHostile, raidBase)).some(r => r !== null);
ok('a hostile Poacher-led rival mounts raids', anyRaid);
ok('a friendly rival never raids across the same sample',
  Array.from({ length: 200 }, () => attemptRaid(poacherFriendly, raidBase)).every(r => r === null));
ok('a rival without a Poacher never raids across the same sample',
  Array.from({ length: 200 }, () => attemptRaid(nonPoacher, raidBase)).every(r => r === null));
ok('a friendly rival does not raid you', attemptRaid(poacherFriendly, raidBase) === null);
ok('a rival without a Poacher does not raid', attemptRaid(nonPoacher, raidBase) === null);
ok('no raid when there is no free labor to take',
  attemptRaid(poacherHostile, { ...raidBase, laborPool: 3, laborReserved: 3 }) === null);
// Raids must be OCCASIONAL, not a monthly tax, and defensible by investing in the right stat.
const N = 3000;
function raidStats(state) {
  let fired = 0, held = 0, landed = 0;
  for (let i = 0; i < N; i++) {
    const r = attemptRaid(poacherHostile, state);
    if (!r) continue;
    fired++;
    if (r.held) held++; else landed++;
  }
  return { fired, held, landed, rate: fired / N, holdRate: fired ? held / fired : 0 };
}
const weakRaids = raidStats(raidBase);
ok('raids are occasional, not every month', weakRaids.rate > 0.02 && weakRaids.rate < 0.35,
  `${(weakRaids.rate * 100).toFixed(1)}% of months`);
ok('a weak-culture company can still sometimes hold a raid (bar is not mathematically impossible)',
  weakRaids.held > 0, `held ${weakRaids.held} of ${weakRaids.fired} raids`);
ok('a weak-culture company loses people more often than it holds', weakRaids.landed > weakRaids.held,
  `${weakRaids.landed} landed vs ${weakRaids.held} held`);
const strongCulture = { ...raidBase, morale: 90, stats: { talentCulture: 9 } };
const strongRaids = raidStats(strongCulture);
ok('strong Talent Culture and Morale defend raids far better',
  strongRaids.holdRate > weakRaids.holdRate + 0.25,
  `hold rate ${(weakRaids.holdRate * 100).toFixed(0)}% weak vs ${(strongRaids.holdRate * 100).toFixed(0)}% strong`);
ok('investing in Talent Culture makes you majority-safe from raids', strongRaids.holdRate > 0.5,
  `${(strongRaids.holdRate * 100).toFixed(0)}% held`);

section('Allies become suppliers');
const allyComp = { name: 'Allied Co', encounters: { coexistedRuns: 20 } };
const neutralComp = { name: 'Neutral Co', encounters: {} };
ok('a long-coexisting rival reaches ally disposition', deriveDisposition(allyComp) >= 60,
  `${deriveDisposition(allyComp)}`);
ok('allies produce burn relief', allyEffects([allyComp, neutralComp]).burnRelief > 0,
  `-${allyEffects([allyComp, neutralComp]).burnRelief}k/mo`);
ok('no allies means no relief', allyEffects([neutralComp]).burnRelief === 0);
ok('relief is capped so a stable of allies cannot zero out burn',
  allyEffects([allyComp, allyComp, allyComp, allyComp, allyComp]).burnRelief <= 6,
  `${allyEffects([allyComp, allyComp, allyComp, allyComp, allyComp]).burnRelief}k`);

section('Coexistence — the passive path to alliance');
const fresh = { appearedMonth: 1, encounters: {} };
ok('no credit before the required stretch', ((tickCoexistence(fresh, 6).encounters || {}).coexistedRuns || 0) === 0);
const ticked = tickCoexistence(fresh, 20);
ok('credit lands after a sustained peaceful stretch', (ticked.encounters.coexistedRuns || 0) === 1);
ok('the clock resets so a long peace yields several increments',
  (tickCoexistence(ticked, 40).encounters.coexistedRuns || 0) === 2);
const withFriction = { appearedMonth: 1, lastFrictionMonth: 18, encounters: {} };
ok('recent friction blocks coexistence credit',
  ((tickCoexistence(withFriction, 20).encounters || {}).coexistedRuns || 0) === 0);

// ================================================================ CROSS-SYSTEM
section('Cross-system — a rival\u2019s success becomes an investor problem');
const withPressure = { activeTerms: [borgTerm] };
const noPressure = { activeTerms: [] };
ok('being outranked with pressure investors draws a board question',
  rivalRankPressure(withPressure, { rank: 4, total: 5 }) !== null);
ok('the same rank with no pressure investors draws nothing',
  rivalRankPressure(noPressure, { rank: 4, total: 5 }) === null);
ok('leading the market draws nothing', rivalRankPressure(withPressure, { rank: 1, total: 5 }) === null);
ok('being merely second in a crowded field is not yet a problem',
  rivalRankPressure(withPressure, { rank: 2, total: 8 }) === null);
ok('the question names the specific investor asking',
  rivalRankPressure(withPressure, { rank: 5, total: 5 }).investorName === 'Dwayne Borg');

// ================================================================ LIVE INTEGRATION
section('Live integration — behaviours compose over a real run');
(async () => {
  const ind = getIndustry('manufacturing');

  // A nemesis rival vs an allied rival over the same 24 months, everything else equal.
  // Stops at game over and reports how many months actually elapsed. A predatory nemesis can
  // get the founder ousted well before month 24 — which is the system working, but it leaves
  // fewer months to attack in, so any attack-count assertion has to be per-active-month rather
  // than an absolute total or it fails for the very reason it is meant to demonstrate.
  function runWith(competitorSeed, months) {
    const { H } = newRun('manufacturing');
    const rival = makeCompetitor([], [], 1, 'en', 'manufacturing', ind.content);
    H.setState({ ...H.getState(), competitors: [{ ...rival, ...competitorSeed, id: 'r1' }], capital: 2000 });
    let played = 0;
    for (let i = 0; i < months; i++) {
      if (H.getState().gameOver) break;
      H.endMonth();
      played++;
    }
    return { ...H.getState(), monthsPlayed: played };
  }
  const vsNemesis = runWith({ posture: 'predatory', encounters: { attackedByPlayer: 6 } }, 24);
  const vsAlly = runWith({ posture: 'balanced', encounters: { coexistedRuns: 20 } }, 24);

  // Measure what actually diverges. An earlier version of this compared boardConfidence with
  // `<=` and "passed" on 60 vs 60 — a tautology that proved nothing. Attack volume and capital
  // are the real signals.
  const nemesisAttacks = (vsNemesis.competitors[0].encounters || {}).attackedPlayer || 0;
  const allyAttacks = (vsAlly.competitors[0].encounters || {}).attackedPlayer || 0;
  const nemesisRate = nemesisAttacks / Math.max(1, vsNemesis.monthsPlayed);
  ok('a nemesis attacks at a high per-month rate', nemesisRate > 0.15,
    `${nemesisAttacks} attacks over ${vsNemesis.monthsPlayed} months (${(nemesisRate * 100).toFixed(0)}%/mo)`);
  ok('an ally never attacks across the same span', allyAttacks === 0,
    `${allyAttacks} attacks over ${vsAlly.monthsPlayed} months`);
  // Supplier relief is only 2k/mo, which 24 months of attacks and random events comfortably
  // swamp — comparing end-of-run capital was flaky ~1 run in 20 for reasons unrelated to the
  // mechanic. Measure ONE month with events pinned off instead, which isolates burn exactly.
  function oneMonthBurn(competitorSeed) {
    const { H } = newRun('manufacturing');
    const rival = makeCompetitor([], [], 1, 'en', 'manufacturing', ind.content);
    H.setState({ ...H.getState(), competitors: [{ ...rival, ...competitorSeed, id: 'r1' }], capital: 2000 });
    const before = H.getState().capital;
    const realRandom = Math.random;
    Math.random = () => 0.999; // no events, no attacks, no raids
    try { H.endMonth(); } finally { Math.random = realRandom; }
    return before - H.getState().capital;
  }
  const burnWithAlly = oneMonthBurn({ posture: 'balanced', encounters: { coexistedRuns: 20 } });
  const burnWithNemesis = oneMonthBurn({ posture: 'predatory', encounters: { attackedByPlayer: 6 } });
  ok('an allied supplier measurably lowers monthly burn', burnWithAlly < burnWithNemesis,
    `ally ${burnWithAlly}k/mo vs nemesis ${burnWithNemesis}k/mo`);
  ok('the allied run accumulates no new friction encounters',
    !(vsAlly.competitors[0].encounters || {}).defeatedPlayer,
    JSON.stringify(vsAlly.competitors[0].encounters));
  ok('the nemesis run records the rival\u2019s own aggression (unlocking aggressive/predatory postures)',
    ((vsNemesis.competitors[0].encounters || {}).attackedPlayer || 0) > 0,
    JSON.stringify(vsNemesis.competitors[0].encounters));

  section('Live integration — investor gating actually blocks a raise');
  const { H: Hg } = newRun('manufacturing');
  // Force a burned relationship with everyone on the roster and confirm instruments refuse.
  const st = Hg.getState();
  const burned = {};
  st.investorRoster.forEach(id => { burned[id] = -90; });
  Hg.setState({ ...st, investorStandings: burned, capital: 300, presence: 20, ap: 3 });
  const capBefore = Hg.getState().capital;
  const instId = (ind.fundingInstruments || []).filter(i => i.stages.includes('preSeed'))[0];
  if (instId) {
    Hg.handleFundingInstrument(instId.id);
    ok('a universally burned founder cannot raise', Hg.getState().capital === capBefore,
      `capital unchanged at ${Hg.getState().capital}k`);
    ok('being refused at the door costs no Action Point', Hg.getState().ap === 3, `ap=${Hg.getState().ap}`);
  } else {
    ok('a pre-seed instrument exists to test gating', false);
  }

  section('Live integration — standings round-trip through storage');
  const { H: Hs } = newRun('manufacturing');
  Hs.setState({ ...Hs.getState(), investorBackers: { jimLeonard: { amount: 50 } } });
  await Store.commitRun({ game: Hs.getState(), industry: 'manufacturing', bucket: 'full', outcome: 'acquisition', won: true, headline: 'win' });
  const standings1 = await Store.getInvestorStandings();
  ok('a backer\u2019s standing persists after a winning run', (standings1.jimLeonard || 0) > 0, `${standings1.jimLeonard}`);

  const { H: Hs2 } = newRun('manufacturing', { investorStandings: standings1 });
  Hs2.setState({ ...Hs2.getState(), investorBackers: { jimLeonard: { amount: 50 } } });
  await Store.commitRun({ game: Hs2.getState(), industry: 'manufacturing', bucket: 'full', outcome: 'acquisition', won: true, headline: 'win2' });
  const standings2 = await Store.getInvestorStandings();
  ok('a second win compounds the standing', standings2.jimLeonard > standings1.jimLeonard,
    `${standings1.jimLeonard} -> ${standings2.jimLeonard}`);

  // Idempotence: committing a run where nobody backed you must not move anybody.
  const { H: Hs3 } = newRun('manufacturing', { investorStandings: standings2 });
  await Store.commitRun({ game: Hs3.getState(), industry: 'manufacturing', bucket: 'full', outcome: 'insolvent', won: false, headline: 'no backers' });
  const standings3 = await Store.getInvestorStandings();
  ok('a run with no backers leaves standings untouched', standings3.jimLeonard === standings2.jimLeonard,
    `${standings2.jimLeonard} -> ${standings3.jimLeonard}`);

  console.log(`\n${'='.repeat(60)}\nBehavior systems: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
  process.exit(fail ? 1 : 0);
})();
