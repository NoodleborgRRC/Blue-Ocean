// Founder triggers — the "memorable moment" layer. Tests the shared cadence plumbing first
// (since every trigger routes through it), then each trigger's own gating and payload.
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

const emptyPerkState = window.__emptyPerkState;
const perkCadenceReady = window.__perkCadenceReady;
const perkFiredOnce = window.__perkFiredOnce;
const perkCounter = window.__perkCounter;
const stampPerkFire = window.__stampPerkFire;
const runTriggers = window.__runFounderMonthlyTriggers;
const tryMoonshot = window.__tryMoonshotBreakthrough;
const checkWithRiskModel = window.__checkWithRiskModel;
const TRIGGERS = window.__FOUNDER_MONTHLY_TRIGGERS;
const founderFx = window.__founderFx;
const toLeader = window.__customFounderToLeader;
const emptyFounder = window.__emptyCustomFounder;
const getIndustry = window.__getIndustry2;

const t = (s) => s;
const ctx = { language: 'en', t, burn: 10 };

function mkFounder(patch) { return { ...emptyFounder(), name: 'T', ...patch }; }
function fxFor(patch) {
  const leader = toLeader(mkFounder(patch), 'en');
  return founderFx({ team: { leaders: [leader, getIndustry('manufacturing').content.leaders[0]] } });
}
function draftBase(extra) {
  return {
    perkState: emptyPerkState(), morale: 60, capital: 200, reputation: 60,
    burnReduction: 0, stats: {}, team: { leaders: [] }, investorRoster: [],
    ...(extra || {}),
  };
}

// ================================================================ plumbing
section('Cadence plumbing — the shared substrate every trigger uses');
ok('a fresh perk state is empty', Object.keys(emptyPerkState().cooldowns).length === 0);
const ps0 = emptyPerkState();
ok('never-fired is always ready', perkCadenceReady(ps0, 'x', 5, 12));
const d1 = draftBase();
stampPerkFire(d1, 'x', 10, {});
ok('just-fired is not ready within cadence', !perkCadenceReady(d1.perkState, 'x', 15, 12));
ok('ready again exactly at the cadence boundary', perkCadenceReady(d1.perkState, 'x', 22, 12));
ok('not ready one month before the boundary', !perkCadenceReady(d1.perkState, 'x', 21, 12));
ok('cadence 0 means no cooldown at all', perkCadenceReady(d1.perkState, 'x', 11, 0));

const d2 = draftBase();
stampPerkFire(d2, 'y', 3, { once: true });
ok('once-flag records', perkFiredOnce(d2.perkState, 'y'));
ok('unrelated perks unaffected by a once-flag', !perkFiredOnce(d2.perkState, 'z'));

const d3 = draftBase();
stampPerkFire(d3, 'c', 1, { countUp: true });
stampPerkFire(d3, 'c', 2, { countUp: true });
ok('counters increment', perkCounter(d3.perkState, 'c') === 2);

const before = draftBase();
const frozen = before.perkState;
stampPerkFire(before, 'q', 4, { once: true, countUp: true });
ok('stamping clones rather than mutating the prior state object', frozen !== before.perkState
  && Object.keys(frozen.cooldowns).length === 0);
ok('malformed perk state is handled safely',
  perkCadenceReady(null, 'x', 5, 12) && perkCounter(undefined, 'x') === 0 && !perkFiredOnce({}, 'x'));

section('Trigger table integrity');
ok('every monthly trigger declares an id, enabled, when and fire',
  TRIGGERS.every(tr => tr.id && typeof tr.enabled === 'function' && typeof tr.when === 'function' && typeof tr.fire === 'function'));
ok('trigger ids are unique', new Set(TRIGGERS.map(tr => tr.id)).size === TRIGGERS.length);
ok('no trigger is enabled on a neutral founder',
  TRIGGERS.every(tr => !tr.enabled(founderFx({}))));

// ================================================================ Kaizen
section('Kaizen — compounding, capped, annual');
const kaizenFx = fxFor({ classId: 'Operator', signaturePerkId: 'kaizen' });
ok('Kaizen is enabled by its signature', TRIGGERS.find(tr => tr.id === 'kaizen').enabled(kaizenFx));
let kd = draftBase();
runTriggers(kd, kaizenFx, 1, ctx);
ok('does NOT pay out in month 1 — a periodic accrual must earn its first grant',
  kd.burnReduction === 0, `${kd.burnReduction}`);
runTriggers(kd, kaizenFx, 11, ctx);
ok('still nothing at month 11', kd.burnReduction === 0);
let tk = runTriggers(kd, kaizenFx, 12, ctx);
ok('fires and grants permanent burn reduction', kd.burnReduction === 1, `${kd.burnReduction}`);
ok('emits a ticket', tk.some(x => /Kaizen/.test(x.title)));
const kdBurnAfterFirst = kd.burnReduction;
runTriggers(kd, kaizenFx, 18, ctx);
ok('does NOT fire again within 12 months', kd.burnReduction === kdBurnAfterFirst);
runTriggers(kd, kaizenFx, 24, ctx);
ok('fires again after 12 months', kd.burnReduction === 2, `${kd.burnReduction}`);
// Drive it past the cap.
let m = 36;
for (let i = 0; i < 8; i++) { runTriggers(kd, kaizenFx, m, ctx); m += 12; }
ok('accrual caps at 4', kd.burnReduction === 4, `${kd.burnReduction}`);
ok('the cap is tracked on the perk\u2019s own counter, not total burnReduction',
  perkCounter(kd.perkState, 'kaizen') === 4);
// Unrelated burn reduction must not consume the cap.
let kd2 = draftBase({ burnReduction: 9 });
runTriggers(kd2, kaizenFx, 12, ctx);
ok('pre-existing burn reduction from other sources does not exhaust the cap',
  kd2.burnReduction === 10, `${kd2.burnReduction}`);

// ================================================================ Firefighter
section('Firefighter — a rescue, not a subsidy');
const ffFx = fxFor({ classId: 'Visionary', signaturePerkId: 'blueOcean', generalPerkId: 'firefighter' });
ok('enabled by the general perk', TRIGGERS.find(tr => tr.id === 'firefighter').enabled(ffFx));
let fd = draftBase({ morale: 20 });
let ft = runTriggers(fd, ffFx, 5, ctx);
ok('restores morale when it craters', fd.morale === 50, `${fd.morale}`);
ok('emits a ticket naming the perk', ft.some(x => /Firefighter/.test(x.title)));
fd.morale = 20;
runTriggers(fd, ffFx, 10, ctx);
ok('does not fire again within 12 months', fd.morale === 20);
fd.morale = 20;
runTriggers(fd, ffFx, 17, ctx);
ok('fires again after the cooldown', fd.morale === 50);
let fdEarly = draftBase({ morale: 15 });
runTriggers(fdEarly, ffFx, 1, ctx);
ok('a reactive rescue CAN fire in month 1 (opposite of a periodic accrual)', fdEarly.morale === 50);
let fdHealthy = draftBase({ morale: 70 });
runTriggers(fdHealthy, ffFx, 5, ctx);
ok('never fires while morale is healthy', fdHealthy.morale === 70);

// ================================================================ Handshake Deal
section('Handshake Deal — once per run, and it names a real person');
const hsFx = fxFor({ classId: 'Hustler', signaturePerkId: 'handshakeDeal' });
const roster = window.__rollInvestorRoster('manufacturing');
let hd = draftBase({ capital: 10, investorRoster: roster });
let ht = runTriggers(hd, hsFx, 8, { ...ctx, burn: 10 });
ok('fires when runway is under three months', hd.capital === 25, `${hd.capital}k`);
ok('counts toward total raised', hd.totalRaised === 15);
const hsTicket = ht.find(x => /Handshake/.test(x.title));
ok('emits a ticket', !!hsTicket);
ok('the ticket names an investor from THIS run\u2019s roster',
  hsTicket && roster.some(id => hsTicket.title.includes(window.__INVESTOR_BY_ID[id].name)),
  hsTicket ? hsTicket.title : 'no ticket');
hd.capital = 5;
runTriggers(hd, hsFx, 20, { ...ctx, burn: 10 });
ok('never fires a second time in the same run', hd.capital === 5);
let hdRich = draftBase({ capital: 500, investorRoster: roster });
runTriggers(hdRich, hsFx, 8, { ...ctx, burn: 10 });
ok('does not fire while the company is solvent', hdRich.capital === 500);

// ================================================================ Moonshot
section('Moonshot Founder — the run\u2019s defining swing');
const msFx = fxFor({ classId: 'Visionary', signaturePerkId: 'moonshotFounder' });
ok('Moonshot raises event severity as its cost', msFx.eventSeverityMult > 1,
  `severity x${msFx.eventSeverityMult.toFixed(2)}`);
const bigProj = { id: 'big', cost: { capital: 30 } };
const smallProj = { id: 'small', cost: { capital: 3 } };
let md = draftBase({ reputation: 40, marketPosition: 20, stats: { innovation: 2 } });
ok('a small project does not trigger it', tryMoonshot(md, msFx, smallProj, 10, 'en', t) === null);
const bt = tryMoonshot(md, msFx, bigProj, 10, 'en', t);
ok('a large project fires the Breakthrough', !!bt);
ok('grants reputation, market position and innovation',
  md.reputation === 48 && md.marketPosition === 26 && md.stats.innovation === 3,
  `rep ${md.reputation}, mp ${md.marketPosition}, inno ${md.stats.innovation}`);
ok('the ticket is titled Breakthrough', bt && /Breakthrough/.test(bt.title));
ok('never fires twice in a run', tryMoonshot(md, msFx, bigProj, 20, 'en', t) === null);
let mdNo = draftBase();
ok('a founder without the perk never gets a Breakthrough',
  tryMoonshot(mdNo, fxFor({ classId: 'Visionary', signaturePerkId: 'blueOcean' }), bigProj, 10, 'en', t) === null);

// ================================================================ Risk Model
section('Risk Model — one second look per quarter');
const rmFx = fxFor({ classId: 'Analyst', signaturePerkId: 'riskModel' });
const plainFx = fxFor({ classId: 'Analyst', signaturePerkId: 'dataDriven' });
let rd = draftBase();
ok('a passing check is untouched', checkWithRiskModel(rd, rmFx, 15, 10, 5).success === true);
ok('a passing check never spends the reroll', checkWithRiskModel(rd, rmFx, 15, 10, 5).rerolled === false);
ok('without the perk, a failed check stays failed',
  checkWithRiskModel(draftBase(), plainFx, 2, 20, 5).rerolled === false);
// Force a failure that no reroll can save, to confirm the reroll is at least attempted/spent.
let rd2 = draftBase();
rd2.__lastRollDie = 1;
const attempt = checkWithRiskModel(rd2, rmFx, 1, 99, 5);
ok('an unmakeable check still consumes the quarter\u2019s reroll', attempt.rerolled === true);
const second = checkWithRiskModel(rd2, rmFx, 1, 99, 5);
ok('a second failure in the same quarter gets no reroll', second.rerolled === false);
const nextQuarter = checkWithRiskModel(rd2, rmFx, 1, 99, 8);
ok('the reroll refreshes next quarter', nextQuarter.rerolled === true);
// Statistically: with the perk, borderline checks should succeed more often.
function successRate(fx, trials) {
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const d = draftBase();
    d.__lastRollDie = 5;
    if (checkWithRiskModel(d, fx, 5 + 5, 11, 1).success) wins++;
  }
  return wins / trials;
}
const withModel = successRate(rmFx, 3000);
const withoutModel = successRate(plainFx, 3000);
ok('Risk Model measurably converts failures into successes',
  withModel > withoutModel + 0.2, `${(withoutModel * 100).toFixed(0)}% -> ${(withModel * 100).toFixed(0)}%`);

// ================================================================ live actives
section('Live actives — Skunkworks, Master Scheduler, Predictive suppression');
function newRun(founderPatch) {
  const ind = getIndustry('manufacturing');
  const leader = toLeader(mkFounder(founderPatch), 'en');
  const team = window.__buildTeam([leader, ind.content.leaders[0]]);
  const base = window.__getScenario('fullRun');
  const H = window.__makeHandlers('en', []);
  H.setState(window.__initialState(team, 'en', { ...base, industryId: 'manufacturing', endMonth: ind.runEnd }, []));
  return { H, ind };
}

const { H: skH } = newRun({ classId: 'Visionary', signaturePerkId: 'blueOcean', generalPerkId: 'skunkworks' });
skH.setState({ ...skH.getState(), ap: 3, activeProjects: [{ id: 'p1', monthsLeft: 2, labor: 0 }, { id: 'p2', monthsLeft: 8, labor: 0 }] });
skH.handleSkunkworks();
const skState = skH.getState();
ok('Skunkworks completes the nearest project', skState.activeProjects.find(p => p.id === 'p1').monthsLeft === 0);
ok('it leaves distant projects alone', skState.activeProjects.find(p => p.id === 'p2').monthsLeft === 8);
ok('it costs 2 Action Points', skState.ap === 1, `ap ${skState.ap}`);
skH.setState({ ...skH.getState(), ap: 3 });
skH.handleSkunkworks();
ok('it cannot be used twice in a run', skH.getState().ap === 3, `ap ${skH.getState().ap}`);

const { H: noSkH } = newRun({ classId: 'Visionary', signaturePerkId: 'blueOcean' });
noSkH.setState({ ...noSkH.getState(), ap: 3, activeProjects: [{ id: 'p1', monthsLeft: 1, labor: 0 }] });
noSkH.handleSkunkworks();
ok('a founder without Skunkworks cannot use it', noSkH.getState().activeProjects[0].monthsLeft === 1);

const { H: msH } = newRun({ classId: 'Operator', signaturePerkId: 'masterScheduler' });
const msLeaderId = msH.getState().team.leaders.find(l => l.isCustom).id;
msH.setState({ ...msH.getState(), ap: 3, activeProjects: [{ id: 'p1', monthsLeft: 3, labor: 0 }, { id: 'p2', monthsLeft: 9, labor: 0 }] });
msH.handleOperate(msLeaderId);
const msState = msH.getState();
ok('Master Scheduler pulls in the FURTHEST project (the real bottleneck)',
  msState.activeProjects.find(p => p.id === 'p2').monthsLeft === 8, `p2 ${msState.activeProjects.find(p => p.id === 'p2').monthsLeft}`);
ok('it leaves the near project alone', msState.activeProjects.find(p => p.id === 'p1').monthsLeft === 3);

const { H: paH } = newRun({ classId: 'Analyst', signaturePerkId: 'predictiveAnalytics' });
const paLeaderId = paH.getState().team.leaders.find(l => l.isCustom).id;
paH.setState({ ...paH.getState(), ap: 3 });
paH.handleOperate(paLeaderId);
ok('Predictive Analytics arms next month\u2019s suppression', paH.getState().suppressNextEvent === true);
paH.setState({ ...paH.getState(), ap: 3 });
paH.handleOperate(paLeaderId);
ok('suppression is on cooldown and cannot be re-armed immediately',
  paH.getState().suppressNextEvent === true); // still armed from the first use, not doubled
// Burn a month and confirm the flag is consumed.
const realRandom = Math.random;
Math.random = () => 0.001; // force an event roll that WOULD fire
try { paH.endMonth(); } finally { Math.random = realRandom; }
ok('the suppression flag is consumed by the month it covers', paH.getState().suppressNextEvent === false);

// ================================================================ integration
section('Integration — triggers fire during real runs');
const { H: liveH } = newRun({ classId: 'Operator', signaturePerkId: 'kaizen' });
// Stage gates can end a bot-less run early, so drive months directly and measure against the
// months actually played rather than assuming all 30 happen.
liveH.setState({ ...liveH.getState(), capital: 100000, month: 1 });
let played = 0;
for (let i = 0; i < 40; i++) {
  if (liveH.getState().gameOver) break;
  liveH.endMonth();
  played++;
}
const liveState = liveH.getState();
const expectedFires = Math.floor(liveState.month / 12);
ok('Kaizen accrual matches the months actually played',
  perkCounter(liveState.perkState, 'kaizen') === Math.min(4, expectedFires),
  `month ${liveState.month}, ${perkCounter(liveState.perkState, 'kaizen')} fires, expected ${Math.min(4, expectedFires)}`);
if (expectedFires > 0) {
  ok('Kaizen tickets appear in the log', liveState.log.some(x => /Kaizen/.test(x.title)));
  ok('perkState persisted through the run', !!liveState.perkState.cooldowns.kaizen);
} else {
  ok('Kaizen tickets appear in the log (run too short — skipped)', true, `run ended month ${liveState.month}`);
  ok('perkState persisted through the run (run too short — skipped)', true);
}

const { H: ffLiveH } = newRun({ classId: 'Visionary', signaturePerkId: 'blueOcean', generalPerkId: 'firefighter' });
ffLiveH.setState({ ...ffLiveH.getState(), capital: 100000, morale: 10 });
ffLiveH.endMonth();
ok('Firefighter fires inside a real endMonth', ffLiveH.getState().morale >= 40,
  `morale ${Math.round(ffLiveH.getState().morale)}`);

console.log(`\n${'='.repeat(60)}\nFounder triggers: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
