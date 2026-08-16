// AP bar dot count per stage, and investor portraits sharing the leader/rival generator.
global.window = global;
window.storage = require('./memory_storage_stub.cjs').makeMemoryStorage();
require('./build/harness.cjs');

let pass=0, fail=0;
const ok=(l,c,d)=>{ if(c){pass++;console.log(`  ok   ${l}${d?'  — '+d:''}`);} else {fail++;console.log(`  FAIL ${l}${d?'  — '+d:''}`);} };
const section=(s)=>console.log(`\n${s}`);

const getIndustry = window.__getIndustry2;
const stageOf = window.__stageOf;
const buildSVG = window.__buildPortraitSVG;
const INVESTORS = window.__INVESTOR_CHARACTERS;

section('Per-stage AP max is genuinely per-stage, not flat');
const mfg = getIndustry('manufacturing');
ok('Manufacturing apByStage varies across stages',
  new Set(Object.values(mfg.apByStage)).size > 1, JSON.stringify(mfg.apByStage));
ok('Manufacturing Pre-Seed max is 2 (the case from the bug report)', mfg.apByStage.preSeed === 2);
ok('Manufacturing Expansion max is higher than Pre-Seed',
  mfg.apByStage.expansion > mfg.apByStage.preSeed,
  `preSeed ${mfg.apByStage.preSeed} -> expansion ${mfg.apByStage.expansion}`);

const hosp = getIndustry('hospitality');
ok('Hospitality apByStage is defined for every stage',
  hosp.stageOrder.every(sid => typeof hosp.apByStage[sid] === 'number'));

section('Live run: ap actually granted matches the stage table, every stage');
function runToEachStage(industryId) {
  const ind = getIndustry(industryId);
  const team = window.__buildTeam(ind.content.leaders.slice(0, 3));
  const H = window.__makeHandlers('en', []);
  H.setState({ ...window.__initialState(team, 'en', { ...window.__getScenario('fullRun'), industryId, endMonth: ind.runEnd }, []),
    capital: 900000 });
  const seen = {};
  const real = Math.random; Math.random = () => 0.999;
  try {
    for (let m = 0; m < ind.runEnd; m++) {
      const g = H.getState();
      if (g.gameOver) break;
      const sid = stageOf(g.month, ind.stages).id;
      if (!(sid in seen)) seen[sid] = g.ap;
      H.endMonth();
    }
  } finally { Math.random = real; }
  return { ind, seen };
}
['hospitality', 'manufacturing'].forEach(id => {
  const { ind, seen } = runToEachStage(id);
  Object.entries(seen).forEach(([sid, apGranted]) => {
    ok(`${id} ${sid}: granted AP matches apByStage`, apGranted === (ind.apByStage[sid] || 3),
      `granted ${apGranted}, table says ${ind.apByStage[sid]}`);
  });
});

section('Investor portraits use the same procedural generator as leaders');
ok('every investor produces valid portrait SVG from its own id',
  INVESTORS.every(inv => { const svg = buildSVG(inv.id); return svg.startsWith('<svg') && svg.includes('</svg>'); }));
ok('two different investors get two different portraits',
  buildSVG(INVESTORS[0].id) !== buildSVG(INVESTORS[1].id));
ok('the same investor always renders identically (deterministic)',
  buildSVG('dwayneBorg') === buildSVG('dwayneBorg'));
ok('all 20 investors produce 20 distinct portraits',
  new Set(INVESTORS.map(inv => buildSVG(inv.id))).size === 20);

section('The old placeholder object is gone from the source');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'blueocean-core.jsx'), 'utf8');
ok('no remaining inv.portrait.hue references', !/inv\.portrait\.hue/.test(src));
ok('no remaining inv.portrait.initials references', !/inv\.portrait\.initials/.test(src));
ok('no remaining investorPortrait hsl rendering', !/investorPortrait\.hue/.test(src));
ok('CharacterCard no longer branches on investorPortrait', !/investorPortrait \?/.test(src));
ok('AP bar no longer hardcodes three dots', !/\[0, 1, 2\]\.map/.test(src));
ok('AP bar reads the stage max', /apMaxThisStage/.test(src));

console.log(`\n${'='.repeat(58)}\nAP bar & investor portraits: ${pass} passed, ${fail} failed\n${'='.repeat(58)}`);
process.exit(fail?1:0);
