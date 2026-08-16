// Founder redesign: seeds, 5 classes, 20 gated signature perks, 10 general perks, founderFx
// aggregation, and the engine hook sites each perk reaches.
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

const SEEDS = window.__FOUNDER_SEEDS;
const CLASSES = window.__FOUNDER_CLASSES;
const SIGS = window.__SIGNATURE_PERKS;
const SIG_BY_ID = window.__SIGNATURE_PERK_BY_ID;
const GENERALS = window.__GENERAL_PERKS;
const MARKERS = window.__UNLOCK_MARKERS;
const emptyFounder = window.__emptyCustomFounder;
const validate = window.__validateCustomFounder;
const availableSignatures = window.__availableSignatures;
const availableGeneralPerks = window.__availableGeneralPerks;
const signatureUnlocked = window.__signatureUnlocked;
const classMasteryMet = window.__classMasteryMet;
const toLeader = window.__customFounderToLeader;
const evaluateUnlocks = window.__evaluateUnlocks;
const accumulateCareer = window.__accumulateCareer;
const founderFx = window.__founderFx;
const getIndustry = window.__getIndustry2;
const Store = window.__Store;

function mkFounder(patch) {
  return { ...emptyFounder(), name: 'Test Founder', ...patch };
}
function teamWith(patch) {
  const leader = toLeader(mkFounder(patch), 'en');
  const co = getIndustry('manufacturing').content.leaders[0];
  return { name: 't', style: null, leaders: [leader, co] };
}
function gameWith(patch, extra) {
  return { team: teamWith(patch), stats: {}, ...(extra || {}) };
}

// ================================================================ content
section('Seeds');
ok('six seeds', SEEDS.length === 6, `${SEEDS.length}`);
ok('seed ids unique', new Set(SEEDS.map(s => s.id)).size === SEEDS.length);
ok('every seed is bilingual with a substantial blurb',
  SEEDS.every(s => s.name.en && s.name.es && s.blurb.en.length > 80 && s.blurb.es.length > 80));
ok('every seed has a one-time starting delta', SEEDS.every(s => s.startingDelta && Object.keys(s.startingDelta).length));
ok('every seed seeds philosophy', SEEDS.every(s => s.philosophySeed && Object.keys(s.philosophySeed).length));

section('Classes — 3 kept, 2 new');
ok('five classes', CLASSES.length === 5, CLASSES.map(c => c.id).join(','));
ok('the three legacy classes survive unchanged in id',
  ['Visionary', 'Operator', 'Hustler'].every(id => CLASSES.some(c => c.id === id)));
ok('Analyst and Statesman added', CLASSES.some(c => c.id === 'Analyst') && CLASSES.some(c => c.id === 'Statesman'));
ok('every class has tagline, blurb and mechanics text, bilingual',
  CLASSES.every(c => c.tagline.en && c.tagline.es && c.blurb.en && c.blurb.es && c.mechanics.en && c.mechanics.es));
ok('legacy classes style-match, new classes do not',
  CLASSES.filter(c => c.styleMatch).map(c => c.id).join(',') === 'Visionary,Operator,Hustler');
ok('every class leans philosophy', CLASSES.every(c => c.philosophyLean && Object.keys(c.philosophyLean).length));

section('Signature perks — 20, 4 per class, class-exclusive');
ok('twenty signatures', SIGS.length === 20, `${SIGS.length}`);
ok('ids unique', new Set(SIGS.map(p => p.id)).size === 20);
CLASSES.forEach(c => {
  const mine = SIGS.filter(p => p.classId === c.id);
  ok(`${c.id} has exactly 4 signatures`, mine.length === 4, `${mine.length}`);
  const gates = mine.map(p => p.gate.type).sort().join(',');
  ok(`${c.id} gating is 2 starters + 1 career + 1 mastery`, gates === 'career,mastery,starter,starter', gates);
});
ok('every signature has passive + active descriptions',
  SIGS.every(p => p.passiveDesc.en && p.passiveDesc.es && p.activeDesc.en && p.activeDesc.es && p.active));
ok('every signature contributes passive fx', SIGS.every(p => p.fx && Object.keys(p.fx).length));
ok('every signature nudges philosophy', SIGS.every(p => p.philosophyNudge && Object.keys(p.philosophyNudge).length));
ok('every career gate names a real marker',
  SIGS.filter(p => p.gate.type === 'career').every(p => MARKERS.some(m => m.id === p.gate.markerId)));

section('General perks — 10, 2 per category, marker-gated');
ok('ten general perks', GENERALS.length === 10, `${GENERALS.length}`);
['financial', 'leadership', 'innovation', 'market', 'industrial'].forEach(cat => {
  ok(`${cat} has 2`, GENERALS.filter(p => p.category === cat).length === 2);
});
ok('every general perk is gated by a real marker',
  GENERALS.every(p => MARKERS.some(m => m.id === p.unlockedBy)));
ok('all ten markers are used exactly once across the general pool',
  new Set(GENERALS.map(p => p.unlockedBy)).size === 10);
ok('every general perk contributes fx', GENERALS.every(p => p.fx && Object.keys(p.fx).length));

// ================================================================ gating
section('Signature gating — starters open, career and mastery gated');
const blank = {};
CLASSES.forEach(c => {
  const open = availableSignatures(c.id, blank, []);
  ok(`${c.id} offers exactly 2 signatures on a blank career`, open.length === 2, open.map(p => p.id).join(','));
  ok(`${c.id}'s open pair are both starters`, open.every(p => p.gate.type === 'starter'));
});
ok('availableSignatures never leaks another class\u2019s perks',
  CLASSES.every(c => availableSignatures(c.id, blank, []).every(p => p.classId === c.id)));

section('Career-gated signatures need their marker');
SIGS.filter(p => p.gate.type === 'career').forEach(p => {
  ok(`${p.id} locked without ${p.gate.markerId}`, !signatureUnlocked(p, blank, []));
  ok(`${p.id} unlocked with ${p.gate.markerId}`, signatureUnlocked(p, blank, [p.gate.markerId]));
});

section('Mastery gates need class commitment — boundary tested');
SIGS.filter(p => p.gate.type === 'mastery').forEach(p => {
  const g = p.gate;
  const justUnder = { byClass: { [p.classId]: { runs: g.runs - 1, wins: 5, bestStageFraction: 1 } } };
  const atBar = { byClass: { [p.classId]: { runs: g.runs, wins: 5, bestStageFraction: 1 } } };
  ok(`${p.id}: ${g.runs - 1} runs is NOT enough`, !signatureUnlocked(p, justUnder, ['kingmaker']));
  ok(`${p.id}: ${g.runs} runs meets the run bar`, signatureUnlocked(p, atBar, ['kingmaker']));
});
ok('a win requirement is enforced independently of run count',
  !signatureUnlocked(SIG_BY_ID.moonshotFounder, { byClass: { Visionary: { runs: 9, wins: 0, bestStageFraction: 1 } } }, []));
ok('a stage-progress requirement is enforced independently of run count',
  !signatureUnlocked(SIG_BY_ID.masterScheduler, { byClass: { Operator: { runs: 9, wins: 9, bestStageFraction: 0.1 } } }, []));
ok('a marker requirement is enforced independently of run count',
  !signatureUnlocked(SIG_BY_ID.publicServant, { byClass: { Statesman: { runs: 9, wins: 9, bestStageFraction: 1 } } }, []));
ok('publicServant unlocks once kingmaker is also held',
  signatureUnlocked(SIG_BY_ID.publicServant, { byClass: { Statesman: { runs: 3, wins: 0, bestStageFraction: 0 } } }, ['kingmaker']));
ok('mastery in one class does not unlock another class\u2019s mastery perk',
  !signatureUnlocked(SIG_BY_ID.moonshotFounder, { byClass: { Operator: { runs: 20, wins: 20, bestStageFraction: 1 } } }, []));

section('Stage gates are industry-agnostic (the Hospitality trap)');
const hosp = getIndustry('hospitality');
const mfg = getIndustry('manufacturing');
ok('the two industries genuinely have different stage names',
  JSON.stringify(hosp.stageOrder) !== JSON.stringify(mfg.stageOrder),
  `${hosp.stageOrder.join('/')} vs ${mfg.stageOrder.join('/')}`);
ok('Hospitality has no stage literally named "growth" or "expansion"',
  !hosp.stageOrder.includes('growth') && !hosp.stageOrder.includes('expansion'), hosp.stageOrder.join(','));
ok('a deep Hospitality run still satisfies a 0.6 stage-fraction gate',
  classMasteryMet('Operator', { runs: 1, requireStageFraction: 0.6 },
    { byClass: { Operator: { runs: 1, wins: 0, bestStageFraction: 0.75 } } }, []));

section('General perk availability');
ok('nothing available on a blank career', availableGeneralPerks([]).length === 0);
ok('unlocking one marker reveals exactly its perk', availableGeneralPerks(['firstExit']).length === 1);
ok('all ten markers reveal all ten perks', availableGeneralPerks(MARKERS.map(m => m.id)).length === 10);

// ================================================================ validation
section('Validation');
ok('a default founder with a name is valid', validate(mkFounder(), blank, []).length === 0,
  JSON.stringify(validate(mkFounder(), blank, [])));
ok('nameless is rejected', validate(mkFounder({ name: '  ' }), blank, []).includes('name'));
ok('bad seed rejected', validate(mkFounder({ seedId: 'nope' }), blank, []).includes('seed'));
ok('bad class rejected', validate(mkFounder({ classId: 'Wizard' }), blank, []).includes('class'));
ok('a signature from the WRONG class is rejected',
  validate(mkFounder({ classId: 'Operator', signaturePerkId: 'blueOcean' }), blank, []).includes('signature'));
ok('a locked signature is rejected',
  validate(mkFounder({ classId: 'Visionary', signaturePerkId: 'futureMarket' }), blank, []).includes('signature'));
ok('the same signature passes once its marker is held',
  !validate(mkFounder({ classId: 'Visionary', signaturePerkId: 'futureMarket' }), blank, ['publicCompany']).includes('signature'));
ok('a locked general perk is rejected',
  validate(mkFounder({ generalPerkId: 'closer' }), blank, []).includes('generalPerk'));
ok('null general perk is fine', validate(mkFounder({ generalPerkId: null }), blank, []).length === 0);
ok('overspending stat points rejected',
  validate(mkFounder({ statPoints: { agility: 3, operations: 3, innovation: 3 } }), blank, []).includes('overspent'));

// ================================================================ adapter
section('Adapter into the engine leader shape');
const visLeader = toLeader(mkFounder({ classId: 'Visionary', signaturePerkId: 'blueOcean' }), 'en');
ok('legacy class sets team style (style-match path preserved)', visLeader.style === 'Visionary');
const anaLeader = toLeader(mkFounder({ classId: 'Analyst', signaturePerkId: 'dataDriven' }), 'en');
ok('Analyst sets NO style (cannot style-match, by design)', anaLeader.style === null);
ok('Analyst still carries its classId for founderFx', anaLeader.classId === 'Analyst');
ok('signature becomes the Operate ability', visLeader.operate.label === SIG_BY_ID.blueOcean.name.en);
ok('seed blurb becomes the leader bio',
  visLeader.bio === SEEDS.find(s => s.id === visLeader.seedId).blurb.en);

// ================================================================ founderFx
section('founderFx — neutral without a custom founder');
const neutral = founderFx({ team: { leaders: [getIndustry('manufacturing').content.leaders[0]] } });
ok('neutral severity', neutral.eventSeverityMult === 1);
ok('neutral fundraise floor', neutral.fundraiseChanceFloor === 4);
ok('neutral ally relief matches the long-standing constants',
  neutral.allyReliefPer === 2 && neutral.allyReliefCap === 6);
ok('safe on a malformed game', founderFx(null).eventSeverityMult === 1 && founderFx({}).projectCostMult === 1);

section('founderFx — class mechanics');
const anaFx = founderFx(gameWith({ classId: 'Analyst', signaturePerkId: 'dataDriven' }));
ok('Analyst reduces event severity', anaFx.eventSeverityMult === 0.8, `${anaFx.eventSeverityMult}`);
ok('Analyst raises the fundraise floor', anaFx.fundraiseChanceFloor === 12, `${anaFx.fundraiseChanceFloor}`);
ok('Analyst halves failed-raise cost', anaFx.fundraiseFailBCMult === 0.5);
const stateFx = founderFx(gameWith({ classId: 'Statesman', signaturePerkId: 'diplomat' }));
ok('Statesman adds alignment', Math.abs(stateFx.alignmentBonus - 0.08) < 1e-9);
ok('Statesman shortens coexistence', stateFx.coexistMonthsOverride === 8);
const visFx = founderFx(gameWith({ classId: 'Visionary', signaturePerkId: 'blueOcean' }));
ok('a legacy class adds no founderFx class effects (it uses team.style)',
  visFx.eventSeverityMult === 1 && visFx.fundraiseChanceFloor === 4 && visFx.alignmentBonus === 0);

section('founderFx — signature passives reach the aggregator');
[
  ['blueOcean', 'Visionary', fx => fx.frontierCostMult === 0.85 && fx.frontierSpeedBonus === 1],
  ['productEvangelist', 'Visionary', fx => fx.projectCompleteReputation === 2],
  ['futureMarket', 'Visionary', fx => fx.stageTransitionMP === 4],
  ['leanSixSigma', 'Operator', fx => fx.projectCostMult === 0.9],
  ['masterScheduler', 'Operator', fx => fx.activeProjectBurnFree === true],
  ['factoryWhisperer', 'Operator', fx => fx.idleBurnFree === true && fx.shortfallRepMult === 0.5],
  ['streetSmart', 'Hustler', fx => fx.externalPresenceDiscount === 1 && fx.externalRollBonus === 1],
  ['naturalRecruiter', 'Hustler', fx => fx.recruitBonusLabor === 1 && fx.raidBarBonus === 2],
  ['communityBuilder', 'Hustler', fx => fx.demandGenChance === 0.15],
  ['dataDriven', 'Analyst', fx => fx.choiceThresholdBonus === -1],
  ['scenarioPlanner', 'Analyst', fx => fx.stageTransitionBC === 3],
  ['predictiveAnalytics', 'Analyst', fx => fx.eventChanceMult === 0.85],
  ['diplomat', 'Statesman', fx => fx.dispositionDamageMult === 0.5 && fx.coexistCreditBonus === 1],
  ['lobbyist', 'Statesman', fx => fx.complianceDefenseBonus === 3],
  ['coalitionBuilder', 'Statesman', fx => fx.allyReliefPer === 3 && fx.allyReliefCap === 9],
  ['publicServant', 'Statesman', fx => fx.repFloor === 25],
].forEach(([sigId, classId, check]) => {
  ok(`${sigId} reaches founderFx`, check(founderFx(gameWith({ classId, signaturePerkId: sigId }))));
});

section('founderFx — general perks and non-stacking');
const gFx = founderFx(gameWith({ classId: 'Visionary', signaturePerkId: 'blueOcean', generalPerkId: 'patentPortfolio' }));
ok('general perk contributes', gFx.rivalGrowthMult === 0.85);
ok('signature and general compose independently', gFx.frontierCostMult === 0.85 && gFx.rivalGrowthMult === 0.85);
const custLeader = toLeader(mkFounder({ classId: 'Operator', signaturePerkId: 'leanSixSigma' }), 'en');
const dupLeader = { ...custLeader, id: 'other', isCustom: false };
ok('the same signature on two leaders does NOT stack',
  founderFx({ team: { leaders: [custLeader, dupLeader] } }).projectCostMult === 0.9);
const rosterSig = { ...getIndustry('manufacturing').content.leaders[0], signaturePerkId: 'lobbyist' };
const rosterFx = founderFx({ team: { leaders: [custLeader, rosterSig] } });
ok('a roster founder\u2019s equipped signature reaches founderFx',
  rosterFx.complianceDefenseBonus === 3 && rosterFx.projectCostMult === 0.9);

// ================================================================ live engine hooks
section('Live hooks — measured against real engine behaviour');
function newRun(founderPatch, industryId) {
  const id = industryId || 'manufacturing';
  const ind = getIndustry(id);
  const leader = founderPatch ? toLeader(mkFounder(founderPatch), 'en') : null;
  const co = ind.content.leaders[0];
  const team = window.__buildTeam(leader ? [leader, co] : [co, ind.content.leaders[1]]);
  const base = window.__getScenario('fullRun');
  const H = window.__makeHandlers('en', []);
  H.setState(window.__initialState(team, 'en', { ...base, industryId: id, endMonth: ind.runEnd }, []));
  return { H, ind };
}

function burnWithProjects(founderPatch) {
  const { H } = newRun(founderPatch);
  const st = H.getState();
  H.setState({ ...st, activeProjects: [{ id: 'a', monthsLeft: 9, labor: 0 }, { id: 'b', monthsLeft: 9, labor: 0 }], capital: 5000 });
  const before = H.getState().capital;
  const realRandom = Math.random;
  Math.random = () => 0.999; // suppress events so burn is measured alone
  try { H.endMonth(); } finally { Math.random = realRandom; }
  return before - H.getState().capital;
}
const plainBurn = burnWithProjects({ classId: 'Operator', signaturePerkId: 'leanSixSigma' });
const schedBurn = burnWithProjects({ classId: 'Operator', signaturePerkId: 'masterScheduler' });
ok('Master Scheduler measurably lowers burn with projects running',
  schedBurn < plainBurn, `${plainBurn}k -> ${schedBurn}k with 2 active projects`);

const capSeedRun = newRun({ seedId: 'immigrantStriver', classId: 'Visionary', signaturePerkId: 'blueOcean' });
const noSeedRun = newRun({ seedId: 'laidOffEngineer', classId: 'Visionary', signaturePerkId: 'blueOcean' });
ok('Immigrant Striver\u2019s +10 capital reaches the live run',
  capSeedRun.H.getState().capital === noSeedRun.H.getState().capital + 10,
  `${noSeedRun.H.getState().capital}k vs ${capSeedRun.H.getState().capital}k`);
ok('Laid-Off Engineer\u2019s +1 Operations reaches live stats', noSeedRun.H.getState().stats.operations > 0);

const philRun = newRun({ seedId: 'academyProdigy', classId: 'Visionary', signaturePerkId: 'blueOcean' });
const phil = philRun.H.getState().philosophy;
ok('seed + class + signature all move philosophy at run start',
  phil.innovationVsExecution >= 12 + 12 + 6 - 1, `innovationVsExecution ${phil.innovationVsExecution}`);

function firstProjectCost(founderPatch) {
  const { H, ind } = newRun(founderPatch);
  const frontier = ind.content.projects.find(p => (p.requires || []).length === 0);
  H.setState({ ...H.getState(), capital: 100000, presence: 15, laborPool: 40 });
  const before = H.getState().capital;
  H.handleInvest(frontier.id);
  return before - H.getState().capital;
}
const baseCost = firstProjectCost({ classId: 'Statesman', signaturePerkId: 'diplomat' });
const leanCost = firstProjectCost({ classId: 'Operator', signaturePerkId: 'leanSixSigma' });
const blueCost = firstProjectCost({ classId: 'Visionary', signaturePerkId: 'blueOcean' });
ok('Lean Six Sigma lowers project cost', leanCost < baseCost, `${baseCost}k -> ${leanCost}k`);
ok('Blue Ocean lowers frontier project cost', blueCost < baseCost, `${baseCost}k -> ${blueCost}k`);

function recruitGain(founderPatch) {
  const { H } = newRun(founderPatch);
  H.setState({ ...H.getState(), capital: 5000 });
  const before = H.getState().laborPool;
  H.handleRecruit();
  return H.getState().laborPool - before;
}
ok('Natural Recruiter hires one more than baseline',
  recruitGain({ classId: 'Hustler', signaturePerkId: 'naturalRecruiter' })
    === recruitGain({ classId: 'Hustler', signaturePerkId: 'streetSmart' }) + 1);

section('Closer eases numeric exit targets');
const exitDef = getIndustry('manufacturing').content.exits[0];
const plainState = newRun({ classId: 'Visionary', signaturePerkId: 'blueOcean' }).H.getState();
const closerState = newRun({ classId: 'Visionary', signaturePerkId: 'blueOcean', generalPerkId: 'closer' }).H.getState();
const plainExit = window.__exitProgress(plainState, exitDef, 'en');
const closerExit = window.__exitProgress(closerState, exitDef, 'en');
const plainNum = plainExit.checks.find(c => c.key !== 'marketRank' && typeof c.target === 'number' && c.target > 0);
const closerNum = closerExit.checks.find(c => c.key === (plainNum || {}).key);
ok('Closer lowers a numeric exit target',
  plainNum && closerNum && closerNum.target < plainNum.target,
  plainNum ? `${plainNum.key}: ${plainNum.target} -> ${closerNum.target}` : 'no numeric target found');

// ================================================================ career.byClass
section('career.byClass — the mastery-gate substrate');
const c1 = accumulateCareer(null, { months: 30, won: false, outcome: 'insolvent', industry: 'manufacturing', classId: 'Analyst', stageFraction: 0.4 });
ok('a run records against its class', c1.byClass.Analyst.runs === 1);
ok('stage fraction recorded', c1.byClass.Analyst.bestStageFraction === 0.4);
const c2 = accumulateCareer(c1, { months: 40, won: true, outcome: 'ipo', industry: 'manufacturing', classId: 'Analyst', stageFraction: 0.9 });
ok('runs accumulate per class', c2.byClass.Analyst.runs === 2);
ok('wins accumulate per class', c2.byClass.Analyst.wins === 1);
ok('bestStageFraction keeps the maximum', c2.byClass.Analyst.bestStageFraction === 0.9);
const c3 = accumulateCareer(c2, { months: 10, won: false, outcome: 'insolvent', industry: 'manufacturing', classId: 'Analyst', stageFraction: 0.1 });
ok('a shallower later run does not lower bestStageFraction', c3.byClass.Analyst.bestStageFraction === 0.9);
const c4 = accumulateCareer(c3, { months: 20, won: true, outcome: 'acquisition', industry: 'manufacturing', classId: 'Operator', stageFraction: 0.5 });
ok('a different class gets its own record', c4.byClass.Operator.runs === 1 && c4.byClass.Analyst.runs === 3);
const cNoClass = accumulateCareer(null, { months: 10, won: false, outcome: 'insolvent', industry: 'manufacturing' });
ok('a run with no custom founder records no class (Quickplay)', Object.keys(cNoClass.byClass).length === 0);
ok('global career totals still accumulate regardless of class', cNoClass.runs === 1 && cNoClass.totalMonths === 10);

section('Unlock markers still work unchanged');
ok('blank career unlocks nothing', evaluateUnlocks({}).length === 0);
ok('three insolvencies unlocks turnaroundSpecialist',
  evaluateUnlocks({ byOutcome: { insolvent: 3 } }).includes('turnaroundSpecialist'));
ok('marker grants name general perks that exist',
  MARKERS.every(m => (m.grants.perks || []).every(id => GENERALS.some(g => g.id === id))));

// ================================================================ migration
section('Migration — pre-redesign saves load correctly');
const migrate = window.__migrateFounderDoc;
const legacyDoc = {
  custom: { id: 'custom', name: 'Old Founder', classId: 'Operator', perkId: 'toolmaker',
            statPoints: { operations: 2 }, portrait: { initials: 'OF', hue: 200, shape: 'round' }, createdAt: 123 },
  roster: { mfgOps: { xp: 500, allocated: {} } },
  career: { runs: 4, wins: 1, byOutcome: { insolvent: 3 } },
  unlocked: ['industrialist', 'turnaroundSpecialist'],
};
const mig = migrate(legacyDoc);
ok('legacy perkId is removed', !('perkId' in mig.custom));
ok('a seed is assigned', !!SEEDS.find(s2 => s2.id === mig.custom.seedId), mig.custom.seedId);
ok('a class-appropriate signature is assigned',
  SIG_BY_ID[mig.custom.signaturePerkId] && SIG_BY_ID[mig.custom.signaturePerkId].classId === 'Operator',
  mig.custom.signaturePerkId);
ok('the migrated founder validates against the new rules',
  validate(mig.custom, mig.career, mig.unlocked).length === 0,
  JSON.stringify(validate(mig.custom, mig.career, mig.unlocked)));
ok('legacy toolmaker maps to automationPioneer (its marker was earned)',
  mig.custom.generalPerkId === 'automationPioneer', String(mig.custom.generalPerkId));
ok('identity and history are preserved', mig.custom.name === 'Old Founder' && mig.custom.createdAt === 123);
ok('roster and career survive', mig.roster.mfgOps.xp === 500 && mig.career.runs === 4);
ok('byClass is backfilled as empty rather than undefined',
  mig.career.byClass && Object.keys(mig.career.byClass).length === 0);
ok('migration is idempotent', JSON.stringify(migrate(mig)) === JSON.stringify(mig));

const unearnedDoc = migrate({ ...legacyDoc, unlocked: [] });
ok('a legacy perk whose marker was NOT earned does not carry over',
  unearnedDoc.custom.generalPerkId === null, String(unearnedDoc.custom.generalPerkId));
const droppedDoc = migrate({ ...legacyDoc, custom: { ...legacyDoc.custom, perkId: 'supplyPartner' } });
ok('supplyPartner (now a Statesman signature) drops to null cleanly',
  droppedDoc.custom.generalPerkId === null);
ok('a doc with no custom founder migrates safely',
  migrate({ custom: null, roster: {}, career: {}, unlocked: [] }).custom === null);
ok('a current-shape doc passes through untouched',
  migrate({ custom: mkFounder(), roster: {}, career: { byClass: {} }, unlocked: [] }).custom.signaturePerkId === 'blueOcean');

// ================================================================ persistence
section('Persistence — class tracking survives a real commitRun');
(async () => {
  const { H } = newRun({ classId: 'Analyst', signaturePerkId: 'dataDriven' });
  H.setState({ ...H.getState(), month: 40, totalRaised: 120 });
  await Store.commitFounderRun({
    game: H.getState(), industry: 'manufacturing', won: false, outcome: 'insolvent', investorStandings: {},
  });
  const doc = await Store.getFounders();
  ok('byClass populated from the live custom founder', !!(doc.career.byClass && doc.career.byClass.Analyst),
    JSON.stringify(doc.career.byClass));
  ok('the class recorded matches the founder\u2019s class', doc.career.byClass.Analyst.runs === 1);
  ok('a stage fraction was derived from the run', doc.career.byClass.Analyst.bestStageFraction > 0,
    `${doc.career.byClass.Analyst.bestStageFraction}`);
  ok('global career still accumulates alongside', doc.career.runs === 1 && doc.career.totalMonths === 40);

  console.log(`\n${'='.repeat(60)}\nFounder redesign: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
  process.exit(fail ? 1 : 0);
})();
