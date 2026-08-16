// Twelve authored rival companies — content integrity, and the spawn behaviour that decides
// when the player meets them.
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

const COMPANIES = window.__AUTHORED_COMPANIES;
const authoredSeedId = window.__authoredSeedId;
const availableAuthored = window.__availableAuthoredCompanies;
const makeCompetitor = window.__makeCompetitor;
const rollCompanyName = window.__rollCompanyName;
const getIndustry = window.__getIndustry2;
const AXES = ['growthVsSustainability', 'innovationVsExecution', 'peopleVsProfit', 'riskVsStability', 'premiumVsMass', 'centralizedVsDelegated'];

// ================================================================ content
section('Roster content');
ok('twelve authored companies', COMPANIES.length === 12, `${COMPANIES.length}`);
ok('six per industry',
  COMPANIES.filter(c => c.industry === 'hospitality').length === 6
  && COMPANIES.filter(c => c.industry === 'manufacturing').length === 6);
ok('ids unique', new Set(COMPANIES.map(c => c.id)).size === 12);
ok('names unique', new Set(COMPANIES.map(c => c.name)).size === 12);
ok('seedIds unique and stable', new Set(COMPANIES.map(authoredSeedId)).size === 12);
ok('seedIds are deterministic', COMPANIES.every(c => authoredSeedId(c) === authoredSeedId(c)));

section('Philosophy spreads');
ok('every company defines all six axes',
  COMPANIES.every(c => AXES.every(a => typeof c.philosophy[a] === 'number')));
ok('all values within -100..100',
  COMPANIES.every(c => AXES.every(a => c.philosophy[a] >= -100 && c.philosophy[a] <= 100)));
ok('no two companies share an identical spread',
  new Set(COMPANIES.map(c => AXES.map(a => c.philosophy[a]).join(','))).size === 12);
// Every axis should be meaningfully used across the roster, or the spread is decorative.
AXES.forEach(axis => {
  const vals = COMPANIES.map(c => c.philosophy[axis]);
  const range = Math.max(...vals) - Math.min(...vals);
  ok(`${axis} spans a wide range across the roster`, range >= 100,
    `${Math.min(...vals)} to ${Math.max(...vals)} (${range} wide)`);
});
ok('the roster covers both ends of every axis (no axis is one-sided)',
  AXES.every(a => COMPANIES.some(c => c.philosophy[a] <= -30) && COMPANIES.some(c => c.philosophy[a] >= 30)));

section('Mission statements');
ok('every mission is bilingual', COMPANIES.every(c => c.mission.en && c.mission.es));
ok('every mission is substantial prose, not a tagline',
  COMPANIES.every(c => c.mission.en.length > 150), `shortest ${Math.min(...COMPANIES.map(c => c.mission.en.length))} chars`);
ok('every mission is distinct', new Set(COMPANIES.map(c => c.mission.en)).size === 12);
ok('every Spanish mission is distinct', new Set(COMPANIES.map(c => c.mission.es)).size === 12);

section('Mission text corresponds to philosophy');
// Spot-check that the language of a mission tracks the axis it should. These are the specific
// pairings the roster was authored around — if someone retunes a spread without rewriting the
// mission, the correspondence that makes the Companies tab readable quietly breaks.
function byId(id) { return COMPANIES.find(c => c.id === id); }
const peopleFirst = COMPANIES.filter(c => c.philosophy.peopleVsProfit >= 60);
ok('people-first companies talk about people/communities/employees',
  peopleFirst.every(c => /people|communities|employees|member|teams/i.test(c.mission.en)),
  peopleFirst.map(c => c.id).join(','));
const profitFirst = COMPANIES.filter(c => c.philosophy.peopleVsProfit <= -55);
ok('profit-first companies talk about cost/efficiency/price',
  profitFirst.every(c => /efficien|cost|price|scale/i.test(c.mission.en)),
  profitFirst.map(c => c.id).join(','));
const innovators = COMPANIES.filter(c => c.philosophy.innovationVsExecution >= 60);
ok('innovation-led companies talk about invention/breakthrough/new',
  innovators.every(c => /breakthrough|invent|tomorrow|redefin|nobody has|new/i.test(c.mission.en)),
  innovators.map(c => c.id).join(','));
const operators = COMPANIES.filter(c => c.philosophy.innovationVsExecution <= -65);
ok('execution-led companies talk about discipline/consistency/process',
  operators.every(c => /disciplin|consisten|standardi|process|tolerance|reliable/i.test(c.mission.en)),
  operators.map(c => c.id).join(','));
const riskTakers = COMPANIES.filter(c => c.philosophy.riskVsStability >= 55);
ok('risk-taking companies use the language of boldness',
  riskTakers.every(c => /bold|risk|ambitio|decisive|shouldn|relentless/i.test(c.mission.en)),
  riskTakers.map(c => c.id).join(','));
const premium = COMPANIES.filter(c => c.philosophy.premiumVsMass >= 60);
ok('premium companies talk about exceptional/extraordinary/certainty',
  premium.every(c => /exceptional|extraordinary|certainty|character|remember/i.test(c.mission.en)),
  premium.map(c => c.id).join(','));
const delegated = COMPANIES.filter(c => c.philosophy.centralizedVsDelegated <= -55);
ok('delegated companies talk about empowerment/autonomy/partnership',
  delegated.every(c => /empower|trust|partnership|own|hand our|decides its own/i.test(c.mission.en)),
  delegated.map(c => c.id).join(','));
const centralized = COMPANIES.filter(c => c.philosophy.centralizedVsDelegated >= 65);
ok('centralized companies talk about standardisation/control',
  centralized.every(c => /standardi|centralis|centraliz|eliminate|measure/i.test(c.mission.en)),
  centralized.map(c => c.id).join(','));

// ================================================================ availability
section('Availability filtering');
ok('a fresh industry offers all six', availableAuthored('hospitality', []).length === 6);
ok('manufacturing has its own six', availableAuthored('manufacturing', []).length === 6);
ok('availability never crosses industries',
  availableAuthored('hospitality', []).every(c => c.industry === 'hospitality'));
const oneUsed = [authoredSeedId(COMPANIES.find(c => c.industry === 'hospitality'))];
ok('a used company is excluded', availableAuthored('hospitality', oneUsed).length === 5);
const allHospUsed = COMPANIES.filter(c => c.industry === 'hospitality').map(authoredSeedId);
ok('all six used leaves none', availableAuthored('hospitality', allHospUsed).length === 0);
ok('exhausting hospitality does not affect manufacturing',
  availableAuthored('manufacturing', allHospUsed).length === 6);

// ================================================================ spawning
section('Spawning prefers authored companies');
const ind = getIndustry('manufacturing');
const first = makeCompetitor([], [], 9, 'en', 'manufacturing', ind.content, null, []);
ok('a fresh spawn is an authored company', !!first.authoredId, first.name);
ok('it carries the authored philosophy exactly',
  JSON.stringify(first.philosophy) === JSON.stringify(COMPANIES.find(c => c.id === first.authoredId).philosophy));
ok('it carries the authored mission',
  first.mission === COMPANIES.find(c => c.id === first.authoredId).mission.en);
ok('it carries the stable authored seedId',
  first.seedId === authoredSeedId(COMPANIES.find(c => c.id === first.authoredId)));
ok('it still gets leaders, logo and the usual rival fields',
  first.leaders.length === 2 && first.logo && first.logo.glyph && first.strength > 0);
ok('it records its industry', first.industry === 'manufacturing');

const spanish = makeCompetitor([], [], 9, 'es', 'manufacturing', ind.content, null, []);
ok('Spanish spawns use the Spanish mission',
  spanish.mission === COMPANIES.find(c => c.id === spanish.authoredId).mission.es);

section('Six spawns exhaust the industry without repeats');
const used = [];
const spawned = [];
for (let i = 0; i < 6; i++) {
  const c = makeCompetitor([], [], 9 + i, 'en', 'manufacturing', ind.content, null, used);
  spawned.push(c);
  used.push(c.seedId);
}
ok('six consecutive spawns are all authored', spawned.every(c => !!c.authoredId));
ok('no company spawns twice', new Set(spawned.map(c => c.seedId)).size === 6);
ok('all six manufacturing companies were used',
  new Set(spawned.map(c => c.authoredId)).size === 6, spawned.map(c => c.authoredId).join(','));
const seventh = makeCompetitor([], [], 20, 'en', 'manufacturing', ind.content, null, used);
ok('the seventh spawn falls back to a procedural rival', !seventh.authoredId, seventh.name);
ok('the procedural fallback still has a full philosophy spread',
  AXES.every(a => typeof seventh.philosophy[a] === 'number'));
ok('the procedural fallback still has a mission', typeof seventh.mission === 'string' && seventh.mission.length > 20);

section('Authored companies survive the returning-rival path');
const revived = makeCompetitor([], [], 30, 'en', 'manufacturing', ind.content, first, []);
ok('a returning authored company keeps its name', revived.name === first.name);
ok('a returning authored company keeps its philosophy',
  JSON.stringify(revived.philosophy) === JSON.stringify(first.philosophy));
ok('a returning authored company keeps its mission', revived.mission === first.mission);
ok('a returning authored company keeps its seedId', revived.seedId === first.seedId);

// ================================================================ company naming
section('Player company name roller');
const n1 = rollCompanyName('manufacturing', 'en');
ok('produces a two-part name', typeof n1 === 'string' && n1.split(' ').length >= 2, n1);
const names = Array.from({ length: 60 }, () => rollCompanyName('hospitality', 'en'));
ok('produces varied names', new Set(names).size > 10, `${new Set(names).size} distinct in 60`);
ok('Spanish rolls differ from English in suffix vocabulary',
  new Set(Array.from({ length: 40 }, () => rollCompanyName('hospitality', 'es'))).size > 5);
ok('an unknown industry falls back rather than throwing',
  typeof rollCompanyName('nonsense', 'en') === 'string');

console.log(`\n${'='.repeat(60)}\nAuthored companies: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
