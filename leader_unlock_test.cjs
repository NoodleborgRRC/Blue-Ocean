// Leader unlocks: 2 starters per class, everything else earned, and the two class-specific
// gates that introduce Analyst and Statesman.
global.window = global;
window.storage = require('./memory_storage_stub.cjs').makeMemoryStorage();
require('./build/harness.cjs');

let pass=0, fail=0;
const ok=(l,c,d)=>{ if(c){pass++;console.log(`  ok   ${l}${d?'  — '+d:''}`);} else {fail++;console.log(`  FAIL ${l}${d?'  — '+d:''}`);} };
const section=(s)=>console.log(`\n${s}`);

const GATES = window.__LEADER_UNLOCKS;
const unlocked = window.__leaderUnlocked;
const countFriendly = window.__countFriendlyRelationships;
const accumulate = window.__accumulateCareer;
const getIndustry = window.__getIndustry2;
const X = window.__ANALYST_UNLOCK_CHOICES;
const INDS = ['hospitality','manufacturing'];

section('Starting roster is exactly two per starting class');
INDS.forEach(id => {
  const leaders = getIndustry(id).content.leaders;
  const start = leaders.filter(l => unlocked(l, {}));
  const byClass = {};
  start.forEach(l => { byClass[l.style] = (byClass[l.style]||0)+1; });
  ok(`${id}: six available at the start`, start.length === 6, `${start.length}`);
  ['Visionary','Operator','Hustler'].forEach(c =>
    ok(`${id}: exactly 2 ${c}`, byClass[c] === 2, `${byClass[c]}`));
  ok(`${id}: no Analyst or Statesman available at the start`,
    !start.some(l => l.style === 'Analyst' || l.style === 'Statesman'));
});

section('Every leader has a distinct starting perk and trait within its industry');
INDS.forEach(id => {
  const leaders = getIndustry(id).content.leaders;
  const perks = leaders.map(l => l.operate.label);
  const traits = leaders.map(l => l.trait);
  ok(`${id}: all Operate abilities distinct`, new Set(perks).size === perks.length,
    `${new Set(perks).size}/${perks.length}`);
  ok(`${id}: all traits distinct`, new Set(traits).size === traits.length,
    `${new Set(traits).size}/${traits.length}`);
  ok(`${id}: every leader has a stat spread`, leaders.every(l => Object.keys(l.statBonus||{}).length > 0));
  ok(`${id}: every leader has a bio`, leaders.every(l => (l.bio||'').length > 40));
});

section('Locked leaders exist and name a real gate');
INDS.forEach(id => {
  const locked = getIndustry(id).content.leaders.filter(l => !unlocked(l, {}));
  ok(`${id} has locked leaders`, locked.length >= 2, `${locked.length}`);
  ok(`${id}: every gate is defined`, locked.every(l => !!GATES[l.unlockedBy]),
    locked.map(l=>l.unlockedBy).join(','));
});
ok('an Analyst exists in each industry, gated',
  INDS.every(id => getIndustry(id).content.leaders.some(l => l.style==='Analyst' && l.unlockedBy==='analystUnlock')));
ok('a Statesman exists in each industry, gated',
  INDS.every(id => getIndustry(id).content.leaders.some(l => l.style==='Statesman' && l.unlockedBy==='statesmanUnlock')));

section('Analyst gate: exit a run with enough correct choice calls');
const analyst = GATES.analystUnlock;
ok('locked on a blank career', !analyst.check({}));
ok(`X-1 correct calls in an exit is not enough`, !analyst.check({ bestChoiceWinsInExit: X-1 }), `${X-1}/${X}`);
ok(`X correct calls in an exit unlocks`, analyst.check({ bestChoiceWinsInExit: X }), `${X}/${X}`);
ok('progress reports honestly', analyst.progress({ bestChoiceWinsInExit: 3 }).have === 3);
// The metric is only recorded on WON runs, so losing with many correct calls must not count.
const lost = accumulate(null, { months: 40, won: false, outcome: 'insolvent', industry: 'hospitality', successfulChoices: 99 });
ok('a LOST run with many correct calls does not unlock the Analyst', !analyst.check(lost),
  `bestChoiceWinsInExit ${lost.bestChoiceWinsInExit || 0}`);
const wonRun = accumulate(null, { months: 40, won: true, outcome: 'acquisition', industry: 'hospitality', successfulChoices: X });
ok('a WON run with enough correct calls does unlock it', analyst.check(wonRun));
ok('best-ever is kept, not overwritten by a later worse run',
  accumulate(wonRun, { months: 10, won: true, outcome: 'assetSale', industry: 'hospitality', successfulChoices: 1 }).bestChoiceWinsInExit === X);

section('Statesman gate: two warm investors AND two friendly rivals in ONE run');
const statesman = GATES.statesmanUnlock;
ok('locked on a blank career', !statesman.check({}));
const bothInOne = accumulate(null, { months: 40, won: false, outcome: 'stageTimeout', industry: 'hospitality',
  friendlyInvestors: 2, friendlyCompanies: 2 });
ok('one run with both halves unlocks it', statesman.check(bothInOne));
// The important negative: satisfying each half in SEPARATE runs must not unlock it.
let split = accumulate(null, { months: 40, won: false, outcome: 'insolvent', industry: 'hospitality',
  friendlyInvestors: 4, friendlyCompanies: 0 });
split = accumulate(split, { months: 40, won: false, outcome: 'insolvent', industry: 'hospitality',
  friendlyInvestors: 0, friendlyCompanies: 4 });
ok('the two halves achieved in SEPARATE runs does NOT unlock it', !statesman.check(split),
  `bests: ${split.bestFriendlyInvestors} investors, ${split.bestFriendlyCompanies} companies`);
ok('...even though both bests individually clear the bar',
  split.bestFriendlyInvestors >= 2 && split.bestFriendlyCompanies >= 2);
const onlyInvestors = accumulate(null, { months: 40, won: false, outcome: 'insolvent', industry: 'hospitality',
  friendlyInvestors: 2, friendlyCompanies: 1 });
ok('two investors but only one friendly rival is not enough', !statesman.check(onlyInvestors));
ok('a losing run still counts (it asks you to FINISH a run, not win one)', statesman.check(bothInOne));

section('countFriendlyRelationships measures against the real bands');
const g = { competitors: [
  { encounters: { coexistedRuns: 20 } },          // ally
  { encounters: { coexistedRuns: 5 } },           // cordial-ish
  { encounters: { attackedByPlayer: 5 } },        // hostile
] };
const res = countFriendly(g, { a: 60, b: 20, c: 0, d: -80 });
ok('warm+ investors counted', res.friendlyInvestors === 2, `${res.friendlyInvestors}`);
ok('cordial+ rivals counted, hostile excluded', res.friendlyCompanies >= 1 && res.friendlyCompanies <= 2,
  `${res.friendlyCompanies}`);
ok('handles an empty game safely',
  countFriendly({ competitors: [] }, {}).friendlyInvestors === 0);

section('Veteran gates');
ok('veteranOperator needs 3 Operator runs',
  !GATES.veteranOperator.check({ byClass: { Operator: { runs: 2 } } })
  && GATES.veteranOperator.check({ byClass: { Operator: { runs: 3 } } }));
ok('veteranHustler needs 300k raised',
  !GATES.veteranHustler.check({ totalRaised: 299 }) && GATES.veteranHustler.check({ totalRaised: 300 }));
ok('every gate is bilingual and has a requirement line',
  Object.values(GATES).every(gt => gt.name.en && gt.name.es && gt.requirement.en && gt.requirement.es));
ok('every gate exposes a progress function', Object.values(GATES).every(gt => typeof gt.progress === 'function'));

section('leaderUnlocked behaviour');
ok('a leader with no gate is always available', unlocked({ id: 'x' }, {}));
ok('an unknown gate fails OPEN rather than hiding content forever',
  unlocked({ id: 'x', unlockedBy: 'nonexistentGate' }, {}));

console.log(`\n${'='.repeat(58)}\nLeader unlocks: ${pass} passed, ${fail} failed\n${'='.repeat(58)}`);
process.exit(fail?1:0);
