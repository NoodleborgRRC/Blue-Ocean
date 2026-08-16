// Ousting is now a JOINT morale + board-confidence failure with hysteresis. This suite exists
// because the previous rule (morale alone) was killing measurably healthy companies — 35% of all
// Hospitality runs — and the replacement has enough moving parts to be worth pinning down.
global.window = global;
window.storage = require('./memory_storage_stub.cjs').makeMemoryStorage();
require('./build/harness.cjs');

let pass=0, fail=0;
const ok=(l,c,d)=>{ if(c){pass++;console.log(`  ok   ${l}${d?'  — '+d:''}`);} else {fail++;console.log(`  FAIL ${l}${d?'  — '+d:''}`);} };
const section=(s)=>console.log(`\n${s}`);
const O = window.__OUST;
const getIndustry = window.__getIndustry2;

// Drives whole quarters, holding morale/BC pinned, and reports the streak and whether ousted.
function driveQuarters(morale, bc, quarters, startStreak) {
  const ind = getIndustry('hospitality');
  const team = window.__buildTeam(ind.content.leaders.slice(0,2));
  const H = window.__makeHandlers('en', []);
  // Stage gates would end these runs by timeout long before three quarters elapse, so the
  // company is held artificially healthy on every axis EXCEPT the two under test. That keeps
  // morale/BC the only thing that can end the run, which is the whole point of the measurement.
  const allProjects = {};
  (ind.content.projects || []).forEach(pr => { allProjects[pr.id] = true; });
  const healthy = {
    capital: 900000, revenuePerMonth: 400, reputation: 95, marketPosition: 80,
    completed: allProjects, laborPool: 40, presence: 30,
  };
  H.setState({ ...window.__initialState(team,'en',{...window.__getScenario('fullRun'),industryId:'hospitality',endMonth:ind.runEnd},[]),
    ...healthy, lowMoraleStreak: startStreak || 0 });
  const real = Math.random; Math.random = () => 0.999; // suppress events so meters stay pinned
  try {
    for (let q=0; q<quarters; q++) {
      for (let m=0; m<3; m++) {
        if (H.getState().gameOver) break;
        // Re-pin every month; events are suppressed but burn/revenue still move things.
        H.setState({ ...H.getState(), ...healthy, morale, boardConfidence: bc });
        H.endMonth();
      }
    }
  } finally { Math.random = real; }
  const s = H.getState();
  return { streak: s.lowMoraleStreak, ousted: !!(s.gameOver && s.gameOver.reason==='ousted') };
}

section('Thresholds are configured as specified');
ok('entry: morale 40 / BC 50', O.moraleEnter===40 && O.bcEnter===50);
ok('recovery: morale 45 / BC 55', O.moraleExit===45 && O.bcExit===55);
ok('recovery bar sits ABOVE the entry bar (hysteresis, not a single line)',
  O.moraleExit > O.moraleEnter && O.bcExit > O.bcEnter);
ok('three quarters to oust', O.quarters===3);

section('The core fix: low morale alone no longer ends a healthy company');
const healthyBoard = driveQuarters(10, 90, 5);
ok('morale 10 with BC 90 never starts the clock', healthyBoard.streak===0 && !healthyBoard.ousted,
  `streak ${healthyBoard.streak}`);
ok('...and never ousts, however long it runs', !healthyBoard.ousted);
const lowBcGoodMorale = driveQuarters(95, 10, 5);
ok('low BC with high morale also never starts the clock', lowBcGoodMorale.streak===0 && !lowBcGoodMorale.ousted,
  `streak ${lowBcGoodMorale.streak}`);

section('Both low: the clock runs and the board acts');
const both = driveQuarters(20, 20, 3);
ok('three quarters with both low ousts the founder', both.ousted);
const twoQ = driveQuarters(20, 20, 2);
ok('two quarters is not yet enough', !twoQ.ousted, `streak ${twoQ.streak}`);

section('Hysteresis: clearing the entry bar is not enough to stop the clock');
// Already in danger, then climb to just above the ENTRY marks but below the RECOVERY marks.
const partial = driveQuarters(42, 52, 2, 1);
ok('morale 42 / BC 52 (above entry, below recovery) does NOT reset the clock',
  partial.streak > 1, `streak ${partial.streak}`);
const recovered = driveQuarters(50, 60, 2, 1);
ok('morale 50 / BC 60 (clear of both recovery marks) DOES reset the clock',
  recovered.streak === 0, `streak ${recovered.streak}`);
ok('a recovered company is not ousted', !recovered.ousted);

section('Boundary values');
ok('exactly at the recovery marks counts as recovered',
  driveQuarters(O.moraleExit, O.bcExit, 2, 1).streak === 0);
ok('exactly at the entry marks does not trigger (strictly below required)',
  driveQuarters(O.moraleEnter, O.bcEnter, 3).streak === 0);

console.log(`\n${'='.repeat(56)}\nOusting rule: ${pass} passed, ${fail} failed\n${'='.repeat(56)}`);
process.exit(fail?1:0);
