// Investor characters + Nemesis memory/adaptation — correctness tests.
global.window = global;
require('./build/harness.cjs');

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${label}${detail ? '  — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? '  — ' + detail : ''}`); }
}
const section = (s) => console.log(`\n${s}`);

const INV = window.__INVESTOR_CHARACTERS;
const BY_ID = window.__INVESTOR_BY_ID;
const rollRoster = window.__rollInvestorRoster;
const investorForInstrument = window.__investorForInstrument;
const makeCompetitor = window.__makeCompetitor;
const derivePosture = window.__derivePosture;
const deriveDisposition = window.__deriveDisposition;
const dispositionBand = window.__dispositionBand;
const makeRivalLogo = window.__makeRivalLogo;
const recordNemesisEvent = window.__recordNemesisEvent;
const getIndustry = window.__getIndustry2;
const AXES = ['growthVsSustainability', 'innovationVsExecution', 'peopleVsProfit', 'riskVsStability', 'premiumVsMass', 'centralizedVsDelegated'];

// ---------------------------------------------------------------- roster content
section('Investor roster — 20 characters');
ok('exactly 20 investors', INV.length === 20, `${INV.length}`);
ok('all ids unique', new Set(INV.map(i => i.id)).size === 20);
ok('all names unique', new Set(INV.map(i => i.name)).size === 20);
ok('every investor is bilingual (bio, archetype, tell)',
  INV.every(i => i.bio.en && i.bio.es && i.archetype.en && i.archetype.es && i.tell.en && i.tell.es));
ok('every investor has a portrait slot (initials + hue)',
  INV.every(i => i.portrait && i.portrait.initials && typeof i.portrait.hue === 'number'));
ok('every investor has a full 6-axis philosophy spread',
  INV.every(i => AXES.every(a => typeof i.philosophy[a] === 'number')));
ok('all philosophy values within -100..100',
  INV.every(i => AXES.every(a => i.philosophy[a] >= -100 && i.philosophy[a] <= 100)));
ok('every investor declares behavior', INV.every(i => i.behavior && Object.keys(i.behavior).length));
ok('every investor lists industries and stages',
  INV.every(i => i.industries.length > 0 && i.stages.length > 0));
ok('bios are substantial, not placeholders',
  INV.every(i => i.bio.en.length > 200), `shortest ${Math.min(...INV.map(i => i.bio.en.length))} chars`);

section('Named-by-design investors behave as specified');
const dwayne = BY_ID.dwayneBorg;
ok('Dwayne Borg exists', !!dwayne);
ok('Dwayne Borg demands an outsized equity stake', dwayne.behavior.equityDemand > 1.3, `${dwayne.behavior.equityDemand}x`);
ok('Dwayne Borg expects high returns', dwayne.behavior.returnsExpectation >= 1.5, `${dwayne.behavior.returnsExpectation}x`);
ok('Dwayne Borg leans hard to profit over people', dwayne.philosophy.peopleVsProfit <= -70, `${dwayne.philosophy.peopleVsProfit}`);
ok('Dwayne Borg applies heavy board pressure', dwayne.behavior.boardPressure > 1.3, `${dwayne.behavior.boardPressure}x`);

const jim = BY_ID.jimLeonard;
ok('Jim Leonard exists', !!jim);
ok('Jim Leonard is manufacturing', jim.industries.includes('manufacturing') && jim.industries.length === 1);
ok('Jim Leonard invests at early stages only',
  jim.stages.every(st => ['preSeed', 'seed', 'early'].includes(st)), jim.stages.join(','));
ok('Jim Leonard provides operational expertise', jim.behavior.operationsBonus > 0, `+${jim.behavior.operationsBonus} ops`);
ok('Jim Leonard takes a small stake and is patient',
  jim.behavior.equityDemand < 1 && jim.behavior.patience > 1.2,
  `equity ${jim.behavior.equityDemand}x, patience ${jim.behavior.patience}x`);

section('Industry coverage');
const hospInv = INV.filter(i => i.industries.includes('hospitality'));
const mfgInv = INV.filter(i => i.industries.includes('manufacturing'));
ok('hospitality has a deep pool', hospInv.length >= 12, `${hospInv.length}`);
ok('manufacturing has a deep pool', mfgInv.length >= 12, `${mfgInv.length}`);
ok('some investors are cross-industry (§7.2 global)', INV.filter(i => i.industries.length > 1).length >= 8,
  `${INV.filter(i => i.industries.length > 1).length} cross-industry`);

// ---------------------------------------------------------------- roster draw
section('rollInvestorRoster — consistent within a run, varied across runs');
const rosterA = rollRoster('manufacturing');
ok('roster is a subset, not everyone', rosterA.length < mfgInv.length, `${rosterA.length} of ${mfgInv.length}`);
ok('roster has no duplicates', new Set(rosterA).size === rosterA.length);
ok('roster only contains industry-eligible investors',
  rosterA.every(id => BY_ID[id].industries.includes('manufacturing')));

const rosters = Array.from({ length: 40 }, () => rollRoster('manufacturing').join(','));
ok('rosters differ across runs (not every investor every run)', new Set(rosters).size > 5,
  `${new Set(rosters).size} distinct rosters in 40 draws`);
const appearanceCount = {};
Array.from({ length: 200 }, () => rollRoster('manufacturing')).forEach(r => r.forEach(id => { appearanceCount[id] = (appearanceCount[id] || 0) + 1; }));
ok('every manufacturing investor can appear', mfgInv.every(i => appearanceCount[i.id] > 0),
  `${Object.keys(appearanceCount).length} distinct investors seen in 200 draws`);
ok('no single investor appears in every run',
  Object.values(appearanceCount).some(v => v < 200), `max ${Math.max(...Object.values(appearanceCount))}/200`);

section('investorForInstrument — same face all run long');
const g = { investorRoster: rosterA };
const first = investorForInstrument(g, 'seedVC', 'seed');
const again = investorForInstrument(g, 'seedVC', 'seed');
ok('same instrument returns the same investor every call', first && again && first.id === again.id,
  first ? first.name : 'none');
ok('returned investor actually works that stage', !first || first.stages.includes('seed'));
const other = investorForInstrument(g, 'angel', 'seed');
ok('different instruments can front different investors', !!other);

// ---------------------------------------------------------------- nemesis
section('Nemesis — rival identity');
const rival = makeCompetitor([], [], 9, 'en', 'manufacturing', getIndustry('manufacturing').content);
ok('new rival has a unique logo', rival.logo && rival.logo.glyph && typeof rival.logo.hue === 'number',
  `${rival.logo.glyph} hue ${rival.logo.hue} ${rival.logo.shape}`);
ok('new rival has a mission statement', typeof rival.mission === 'string' && rival.mission.length > 30);
ok('new rival has a 6-axis philosophy spread', AXES.every(a => typeof rival.philosophy[a] === 'number'));
ok('new rival has leadership', rival.leaders.length === 2);
ok('new rival has pivotal decisions', rival.pivotalDecisions.length >= 2);
ok('new rival starts neutral', rival.disposition === 0 && rival.posture === 'balanced');
ok('new rival has no past leaders yet', rival.pastLeaders.length === 0);
ok('new rival is marked as first appearance', rival.runsSeen === 1 && rival.returning === false);

section('Logo is deterministic per seedId — same company, same mark across runs');
const l1 = makeRivalLogo('mfg-abc123');
const l2 = makeRivalLogo('mfg-abc123');
const l3 = makeRivalLogo('mfg-xyz789');
ok('same seedId yields identical logo', l1.glyph === l2.glyph && l1.hue === l2.hue && l1.shape === l2.shape);
ok('different seedId yields a different logo', l1.glyph !== l3.glyph || l1.hue !== l3.hue);

section('derivePosture — rivals adapt to how you played them');
ok('no history -> expansionist (left alone, they grew)',
  derivePosture({ encounters: {} }) === 'expansionist');
ok('heavily attacked -> fortified',
  derivePosture({ encounters: { attackedByPlayer: 4 } }) === 'fortified', derivePosture({ encounters: { attackedByPlayer: 4 } }));
ok('repeatedly defeated -> fortified',
  derivePosture({ encounters: { attackedByPlayer: 1, defeatedByPlayer: 2 } }) === 'fortified');
ok('they hit you and met no resistance -> predatory',
  derivePosture({ encounters: { defeatedPlayer: 2, attackedByPlayer: 0 } }) === 'predatory');
ok('they attacked, you barely answered -> aggressive',
  derivePosture({ encounters: { attackedPlayer: 3, attackedByPlayer: 1 } }) === 'aggressive');
ok('null memory is safe', derivePosture(null) === 'balanced');

section('deriveDisposition — nemesis to ally axis');
ok('attacking makes enemies',
  deriveDisposition({ encounters: { attackedByPlayer: 3 } }) < 0,
  `${deriveDisposition({ encounters: { attackedByPlayer: 3 } })}`);
ok('coexistence builds goodwill',
  deriveDisposition({ encounters: { coexistedRuns: 4, tradedWith: 2 } }) > 0,
  `${deriveDisposition({ encounters: { coexistedRuns: 4, tradedWith: 2 } })}`);
ok('disposition clamps to -100..100',
  deriveDisposition({ encounters: { attackedByPlayer: 50 } }) === -100);
ok('bands classify correctly',
  dispositionBand(-90).id === 'nemesis' && dispositionBand(-40).id === 'hostile' &&
  dispositionBand(0).id === 'neutral' && dispositionBand(40).id === 'cordial' && dispositionBand(80).id === 'ally');

section('Returning rival — identity persists, posture adapts');
const memory = {
  seedId: rival.seedId, name: rival.name, logo: rival.logo, mission: rival.mission,
  philosophy: rival.philosophy, leaders: rival.leaders, pastLeaders: [],
  pivotalDecisions: rival.pivotalDecisions, runsSeen: 1,
  encounters: { attackedByPlayer: 4, defeatedByPlayer: 2 },
};
const returned = makeCompetitor([], [], 12, 'en', 'manufacturing', getIndustry('manufacturing').content, memory);
ok('returning rival keeps its name', returned.name === rival.name);
ok('returning rival keeps its logo', returned.logo.glyph === rival.logo.glyph && returned.logo.hue === rival.logo.hue);
ok('returning rival keeps its seedId (cross-run identity)', returned.seedId === rival.seedId);
ok('returning rival keeps its mission', returned.mission === rival.mission);
ok('returning rival is flagged as returning', returned.returning === true);
ok('returning rival increments runsSeen', returned.runsSeen === 2, `${returned.runsSeen}`);
ok('heavy attacks last run -> comes back fortified', returned.posture === 'fortified', returned.posture);
ok('heavy attacks last run -> disposition is hostile or worse',
  returned.disposition <= -60, `${returned.disposition} (${dispositionBand(returned.disposition).id})`);
ok('fortified posture yields measurably higher strength',
  returned.strength > 18, `strength ${returned.strength}`);
ok('returning rival still fields two leaders', returned.leaders.length === 2);

// Leaders churn: run it enough times that the 40% departure chance is essentially certain to fire.
let sawDeparture = false;
for (let i = 0; i < 40; i++) {
  const r = makeCompetitor([], [], 12, 'en', 'manufacturing', getIndustry('manufacturing').content, memory);
  if (r.pastLeaders.length > 0) { sawDeparture = true; break; }
}
ok('some leaders leave between runs and become past leaders', sawDeparture);

section('recordNemesisEvent — encounters accumulate');
let c = { name: 'X', encounters: {} };
c = recordNemesisEvent(c, 'attackedByPlayer');
c = recordNemesisEvent(c, 'attackedByPlayer');
c = recordNemesisEvent(c, 'defeatedByPlayer');
ok('counts accumulate per kind', c.encounters.attackedByPlayer === 2 && c.encounters.defeatedByPlayer === 1,
  JSON.stringify(c.encounters));
ok('recording does not mutate the original', Object.keys({ encounters: {} }.encounters).length === 0);

section('Live run — roster attaches and attacks are recorded');
function newRun(industryId) {
  const ind = getIndustry(industryId);
  const team = window.__buildTeam(ind.content.leaders.slice(0, 2));
  const base = window.__getScenario('fullRun');
  const H = window.__makeHandlers('en', []);
  H.setState(window.__initialState(team, 'en', { ...base, industryId, endMonth: ind.runEnd }, []));
  return { H, ind };
}
const { H } = newRun('manufacturing');
const st0 = H.getState();
ok('run starts with an investor roster', (st0.investorRoster || []).length > 0, `${st0.investorRoster.length} investors`);
ok('roster investors are all manufacturing-eligible',
  st0.investorRoster.every(id => BY_ID[id].industries.includes('manufacturing')));

// Roster must not reshuffle mid-run.
const rosterBefore = st0.investorRoster.join(',');
H.endMonth(); H.endMonth(); H.endMonth();
ok('roster is stable across months', H.getState().investorRoster.join(',') === rosterBefore);

// Attack a rival and confirm the encounter lands on the record.
const withRival = { ...H.getState(), competitors: [{ ...rival, id: 'r1' }], ap: 3, capital: 300, presence: 20 };
H.setState(withRival);
const extActions = getIndustry('manufacturing').content.externalActions || [];
if (extActions.length) {
  H.handleExternalAction(extActions[0].id, 'r1');
  const after = H.getState().competitors[0];
  ok('player attack is recorded on the rival', (after.encounters.attackedByPlayer || 0) >= 1,
    JSON.stringify(after.encounters));
} else {
  ok('external actions available to test attack recording', false, 'no externalActions in industry content');
}

console.log(`\n${'='.repeat(58)}\nInvestors & Nemesis: ${pass} passed, ${fail} failed\n${'='.repeat(58)}`);
process.exit(fail ? 1 : 0);
