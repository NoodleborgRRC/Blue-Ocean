// Three-leader teams: majority class bonus, mandatory custom founder, per-leader Operate limit.
global.window = global;
window.storage = require('./memory_storage_stub.cjs').makeMemoryStorage();
require('./build/harness.cjs');

let pass=0, fail=0;
const ok=(l,c,d)=>{ if(c){pass++;console.log(`  ok   ${l}${d?'  — '+d:''}`);} else {fail++;console.log(`  FAIL ${l}${d?'  — '+d:''}`);} };
const section=(s)=>console.log(`\n${s}`);

const computeTeam = window.__computeTeam;
const getIndustry = window.__getIndustry2;
const toLeader = window.__customFounderToLeader;
const emptyFounder = window.__emptyCustomFounder;
const L = (style, id) => ({ id, name: id, style, statBonus: {}, operate: { label: id, desc: '', deltas: { morale: 1 } } });

section('Class bonus is a MAJORITY rule at three leaders');
ok('3 of 3 matching grants the bonus',
  computeTeam([L('Operator','a'),L('Operator','b'),L('Operator','c')]).style === 'Operator');
ok('2 of 3 matching grants the bonus (the new rule)',
  computeTeam([L('Operator','a'),L('Operator','b'),L('Visionary','c')]).style === 'Operator');
ok('the bonus names the MAJORITY class, not the odd one out',
  computeTeam([L('Hustler','a'),L('Visionary','b'),L('Visionary','c')]).style === 'Visionary');
ok('3 different classes grants nothing',
  computeTeam([L('Operator','a'),L('Visionary','b'),L('Hustler','c')]).style === null);
ok('order does not matter',
  computeTeam([L('Visionary','a'),L('Operator','b'),L('Operator','c')]).style === 'Operator'
  && computeTeam([L('Operator','b'),L('Visionary','a'),L('Operator','c')]).style === 'Operator');

section('Two-leader scenarios are unchanged (regression)');
ok('2 of 2 matching still grants the bonus',
  computeTeam([L('Hustler','a'),L('Hustler','b')]).style === 'Hustler');
ok('2 mismatched still grants nothing',
  computeTeam([L('Hustler','a'),L('Operator','b')]).style === null);
ok('a single leader grants nothing (needs 2+ to be a shared class)',
  computeTeam([L('Hustler','a')]).style === null);

section('Ties resolve to no bonus rather than picking arbitrarily');
ok('2-2 at four leaders grants nothing',
  computeTeam([L('Operator','a'),L('Operator','b'),L('Hustler','c'),L('Hustler','d')]).style === null);

section('Null styles (Analyst/Statesman) never form a majority by accident');
ok('two null-style leaders do not count as a shared class',
  computeTeam([L(null,'a'),L(null,'b'),L('Operator','c')]).style === null);
ok('a real pair still wins alongside a null-style founder',
  computeTeam([L(null,'a'),L('Operator','b'),L('Operator','c')]).style === 'Operator');

section('Full run fields three leaders');
ok('fullRun declares teamSize 3', window.__getScenario('fullRun').teamSize === 3);

section('Each leader Operates once per month');
const ind = getIndustry('manufacturing');
const custom = toLeader({...emptyFounder(), name:'Ada', classId:'Operator', signaturePerkId:'kaizen'}, 'en');
const co1 = ind.content.leaders[0], co2 = ind.content.leaders[1];
const team = window.__buildTeam([custom, co1, co2]);
const H = window.__makeHandlers('en', []);
H.setState(window.__initialState(team,'en',{...window.__getScenario('fullRun'),industryId:'manufacturing',endMonth:ind.runEnd},[]));
H.setState({...H.getState(), ap: 9, capital: 500000});

const before = H.getState();
H.handleOperate(custom.id);
ok('a leader can operate', H.getState().ap === before.ap - 1, `ap ${before.ap} -> ${H.getState().ap}`);
ok('the leader is recorded as having acted', H.getState().operatedThisMonth.includes(custom.id));
const afterFirst = H.getState().ap;
H.handleOperate(custom.id);
ok('the SAME leader cannot operate twice in a month', H.getState().ap === afterFirst,
  `ap stayed ${H.getState().ap}`);
ok('the refusal is explained in the log', /already acted/i.test(H.getState().log[0].body || ''),
  H.getState().log[0].body);
H.handleOperate(co1.id);
ok('a DIFFERENT leader can still operate', H.getState().ap === afterFirst - 1);
H.handleOperate(co2.id);
ok('all three leaders can each act once', H.getState().operatedThisMonth.length === 3,
  H.getState().operatedThisMonth.join(','));

const realRandom = Math.random; Math.random = () => 0.999;
try { H.endMonth(); } finally { Math.random = realRandom; }
ok('the month rolling over clears every leader\u2019s cooldown',
  (H.getState().operatedThisMonth || []).length === 0);
H.setState({...H.getState(), ap: 9});
const apNewMonth = H.getState().ap;
H.handleOperate(custom.id);
ok('the same leader can operate again next month', H.getState().ap === apNewMonth - 1);

console.log(`\n${'='.repeat(56)}\nTeam & Operate rules: ${pass} passed, ${fail} failed\n${'='.repeat(56)}`);
process.exit(fail?1:0);
