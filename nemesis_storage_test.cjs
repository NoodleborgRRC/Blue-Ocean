// Nemesis storage round-trip: commitRun persists rivals, getCompaniesForIndustry reads them
// back, and a revived rival across a SIMULATED multi-run sequence carries identity and adapts
// posture/disposition correctly with no double-counting.
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

const Store = window.__Store;
const getIndustry = window.__getIndustry2;
const makeCompetitor = window.__makeCompetitor;
const deriveDisposition = window.__deriveDisposition;
const derivePosture = window.__derivePosture;
const dispositionBand = window.__dispositionBand;

function newRun(industryId, knownRivals) {
  const ind = getIndustry(industryId);
  const team = window.__buildTeam(ind.content.leaders.slice(0, 2));
  const base = window.__getScenario('fullRun');
  const H = window.__makeHandlers('en', []);
  const st = window.__initialState(team, 'en', { ...base, industryId, endMonth: ind.runEnd }, []);
  H.setState({ ...st, knownRivals: knownRivals || [] });
  return { H, ind };
}

(async () => {
  section('Store API surface');
  ok('Store is exposed', !!Store);
  ok('getCompaniesForIndustry exists', typeof Store.getCompaniesForIndustry === 'function');
  ok('upsertCompaniesFromRun exists', typeof Store.upsertCompaniesFromRun === 'function');
  ok('commitRun exists', typeof Store.commitRun === 'function');

  section('Empty store, first read');
  const before = await Store.getCompaniesForIndustry('manufacturing');
  ok('fresh install returns an empty list, not an error', Array.isArray(before) && before.length === 0);

  section('Run 1 — a rival spawns, gets attacked, run ends, and commitRun persists it');
  const { H: H1 } = newRun('manufacturing', []);
  const ind = getIndustry('manufacturing');
  const rival = makeCompetitor([], [], 9, 'en', 'manufacturing', ind.content);
  let s1 = { ...H1.getState(), competitors: [{ ...rival, id: 'r1' }], ap: 3, capital: 400, presence: 20 };
  H1.setState(s1);

  const extActions = ind.content.externalActions || [];
  ok('manufacturing has external actions to attack with', extActions.length > 0);
  if (extActions.length) {
    H1.handleExternalAction(extActions[0].id, 'r1');
    H1.handleExternalAction(extActions[0].id, 'r1');
  }
  const afterAttacks = H1.getState().competitors[0];
  ok('two attacks recorded on the live competitor', (afterAttacks.encounters.attackedByPlayer || 0) === 2,
    JSON.stringify(afterAttacks.encounters));

  const commit1 = await Store.commitRun({
    game: H1.getState(), industry: 'manufacturing', bucket: 'full',
    outcome: 'insolvent', won: false, headline: 'Run 1 ended',
  });
  ok('commitRun returns a runId', !!commit1.runId);

  section('Persisted after run 1');
  const afterRun1 = await Store.getCompaniesForIndustry('manufacturing');
  ok('exactly one company persisted', afterRun1.length === 1, `${afterRun1.length}`);
  const persisted1 = afterRun1[0];
  ok('persisted seedId matches the live rival', persisted1.seedId === rival.seedId);
  ok('persisted name matches', persisted1.name === rival.name);
  ok('persisted logo matches (same mark will show next time)', persisted1.logo.glyph === rival.logo.glyph && persisted1.logo.hue === rival.logo.hue);
  ok('persisted mission carried through', persisted1.mission === rival.mission);
  ok('persisted encounters match what happened this run', persisted1.encounters.attackedByPlayer === 2,
    JSON.stringify(persisted1.encounters));
  ok('persisted disposition matches a fresh derive from its own encounters', persisted1.disposition === deriveDisposition(persisted1),
    `${persisted1.disposition}`);
  ok('persisted posture reflects the attack pattern', persisted1.posture === derivePosture(persisted1),
    persisted1.posture);
  ok('runsSeen is 1 after the first run', persisted1.runsSeen === 1);
  ok('firstSeenRun and lastSeenRun are set', !!persisted1.firstSeenRun && !!persisted1.lastSeenRun);
  ok('encounterCount is 1', persisted1.encounterCount === 1);

  section('Run 2 — hydrate knownRivals from the store, revive the same company, attack again');
  const { H: H2 } = newRun('manufacturing', afterRun1);
  ok('run 2 starts with the persisted rival available to revive', H2.getState().knownRivals.length === 1);

  // Directly exercise the revival path the way endMonth's spawn logic does.
  const revived = makeCompetitor([], [], 9, 'en', 'manufacturing', ind.content, afterRun1[0]);
  ok('revived rival keeps the same seedId', revived.seedId === rival.seedId);
  ok('revived rival keeps the same logo', revived.logo.glyph === rival.logo.glyph && revived.logo.hue === rival.logo.hue);
  ok('revived rival is flagged returning', revived.returning === true);
  ok('revived posture matches derivePosture\u2019s own recompute for the persisted encounters',
    revived.posture === derivePosture(afterRun1[0]), revived.posture);
  ok('runsSeen increments to 2 on revival', revived.runsSeen === 2, `${revived.runsSeen}`);

  let s2 = { ...H2.getState(), competitors: [{ ...revived, id: 'r1b' }], ap: 3, capital: 400, presence: 20 };
  H2.setState(s2);
  if (extActions.length) H2.handleExternalAction(extActions[0].id, 'r1b');
  const afterRun2Attacks = H2.getState().competitors[0];
  ok('encounters carry forward AND accumulate (not reset) across the revival', afterRun2Attacks.encounters.attackedByPlayer === 3,
    JSON.stringify(afterRun2Attacks.encounters));

  const commit2 = await Store.commitRun({
    game: H2.getState(), industry: 'manufacturing', bucket: 'full',
    outcome: 'insolvent', won: false, headline: 'Run 2 ended',
  });
  ok('run 2 commits successfully', !!commit2.runId);

  section('Persisted after run 2 — no double-counting');
  const afterRun2 = await Store.getCompaniesForIndustry('manufacturing');
  ok('still exactly one company (matched by seedId, not duplicated)', afterRun2.length === 1, `${afterRun2.length}`);
  const persisted2 = afterRun2[0];
  ok('cumulative attacks are 3, not 5 (this is the double-count regression check)',
    persisted2.encounters.attackedByPlayer === 3, JSON.stringify(persisted2.encounters));
  // A successful attack records BOTH attackedByPlayer and defeatedByPlayer (see
  // handleExternalAction), so whether attack #2 also lands a hit is a real RNG outcome, not
  // something this test should hardcode. Assert against derivePosture/deriveDisposition's own
  // output for the ACTUAL accumulated encounters, which is what makes this test meaningful
  // regardless of which rolls landed, and still catches the double-counting bug it exists for.
  const expectedDisposition2 = deriveDisposition(persisted2);
  ok('disposition matches deriveDisposition\u2019s own recompute of the actual cumulative encounters (double-count check)',
    persisted2.disposition === expectedDisposition2,
    `persisted ${persisted2.disposition}, freshly derived ${expectedDisposition2} from ${JSON.stringify(persisted2.encounters)}`);
  ok('posture is now fortified (3 attacks crosses the threshold)', persisted2.posture === 'fortified',
    persisted2.posture);
  ok('runsSeen is 2', persisted2.runsSeen === 2);
  ok('firstSeenRun preserved from run 1', persisted2.firstSeenRun === persisted1.firstSeenRun);
  ok('lastSeenRun advanced to run 2', persisted2.lastSeenRun === commit2.runId);
  ok('encounterCount incremented to 2', persisted2.encounterCount === 2);
  ok('history has two entries, newest first', persisted2.history.length === 2 && persisted2.history[0].event === 're-encountered');

  section('Run 3 — revive again directly from the doubly-persisted record, confirm idempotence');
  const revived2 = makeCompetitor([], [], 9, 'en', 'manufacturing', ind.content, persisted2);
  ok('a third revival still carries the same seedId/logo/mission', revived2.seedId === rival.seedId && revived2.logo.glyph === rival.logo.glyph && revived2.mission === rival.mission);
  ok('third revival is fortified from the start (posture recomputed fresh, not drifted)', revived2.posture === 'fortified');
  ok('runsSeen advances to 3', revived2.runsSeen === 3);
  // No new attacks this time — commit immediately and confirm disposition stays exactly -36.
  let s3 = { ...newRun('manufacturing', afterRun2).H.getState(), competitors: [{ ...revived2, id: 'r1c' }] };
  const commit3 = await Store.commitRun({ game: s3, industry: 'manufacturing', bucket: 'full', outcome: 'stageTimeout', won: false, headline: 'Run 3 ended' });
  const afterRun3 = await Store.getCompaniesForIndustry('manufacturing');
  const persisted3 = afterRun3.find(c => c.seedId === rival.seedId);
  ok('three commits, still exactly one persisted entity', afterRun3.length === 1);
  ok('disposition is UNCHANGED with no new attacks (idempotence check)', persisted3.disposition === persisted2.disposition,
    `run2 ${persisted2.disposition} -> run3 ${persisted3.disposition} (must be identical — no new encounters happened)`);
  ok('runsSeen is 3', persisted3.runsSeen === 3);

  section('Deterministic double-count regression guard (no RNG)');
  // The actual bug this file exists to catch, isolated from any attack-roll randomness: calling
  // deriveDisposition twice in a row on the SAME encounters must return the SAME number. The
  // original bug read a stored `disposition` as a base and re-applied the full cumulative delta
  // on top of it every call, so a second call on unchanged encounters would drift further.
  const fixedMemory = { disposition: -9999, encounters: { attackedByPlayer: 3, defeatedByPlayer: 1 } };
  const d1 = deriveDisposition(fixedMemory);
  const d2 = deriveDisposition({ ...fixedMemory, disposition: d1 }); // simulates persisting d1, then re-deriving
  const d3 = deriveDisposition({ ...fixedMemory, disposition: d2 });
  ok('deriveDisposition ignores any stored disposition and is pure w.r.t. encounters', d1 === -44, `${d1}`);
  ok('re-deriving after "persisting" the result is idempotent (the actual regression)', d1 === d2 && d2 === d3,
    `${d1} -> ${d2} -> ${d3}`);


  const rival2 = makeCompetitor([rival.name], [], 9, 'en', 'manufacturing', ind.content, null, [rival.seedId]);
  ok('a company that never spawned in any committed run is simply absent', !afterRun3.some(c => c.seedId === rival2.seedId));

  section('Industry scoping (§7.2) — a hospitality rival never leaks into manufacturing\u2019s list');
  const { H: Hh } = newRun('hospitality', []);
  const hInd = getIndustry('hospitality');
  const hRival = makeCompetitor([], [], 9, 'en', 'hospitality', hInd.content);
  const hGame = { ...Hh.getState(), competitors: [{ ...hRival, id: 'h1' }] };
  await Store.commitRun({ game: hGame, industry: 'hospitality', bucket: 'full', outcome: 'insolvent', won: false, headline: 'Hosp run' });
  const mfgList = await Store.getCompaniesForIndustry('manufacturing');
  const hospList = await Store.getCompaniesForIndustry('hospitality');
  ok('hospitality rival lands in the hospitality list', hospList.some(c => c.seedId === hRival.seedId));
  ok('hospitality rival does NOT leak into manufacturing\u2019s list', !mfgList.some(c => c.seedId === hRival.seedId));
  ok('manufacturing list is unaffected by the hospitality commit', mfgList.length === 1);

  section('getAllCompanyNames still works alongside the richer entity shape');
  const names = await Store.getAllCompanyNames('manufacturing');
  ok('name lookup returns the persisted rival\u2019s name', names.includes(rival.name), names.join(','));

  console.log(`\n${'='.repeat(60)}\nNemesis storage round-trip: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
  process.exit(fail ? 1 : 0);
})();
