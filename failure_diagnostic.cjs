// FAILURE-MODE DIAGNOSTIC — why do runs actually end?
//
// The standing rule has been: no number tuning until the systems exist and have been playtested.
// That's now met, and a specific unexplained gap has been accumulating for many sessions:
// Hospitality wins 7.5-25% across batches while Manufacturing wins 50-75% in the same runs.
// Nobody has ever measured WHY.
//
// This deliberately changes no numbers. It answers three questions first:
//   1. What ends a run — insolvency, ousting, stage timeout, or the clock?
//   2. WHERE does it end — which stage is the wall?
//   3. What did the company look like at the moment it died?
//
// Tuning before knowing those is how you fix a symptom and hide the cause.
global.window = global;
const { makeMemoryStorage } = require('./memory_storage_stub.cjs');
window.storage = makeMemoryStorage();
require('./build/harness.cjs');

const { botTurn, getIndustry } = require('./behavior_playtest.cjs');
const stageOf = window.__stageOf;

// Same loop as the standard playtest, but capturing a full autopsy rather than a summary.
function autopsyRun(industryId) {
  const ind = getIndustry(industryId);
  const leaders = [...ind.content.leaders].sort(() => Math.random() - 0.5).slice(0, 2);
  const team = window.__buildTeam(leaders);
  const base = window.__getScenario('fullRun');
  const H = window.__makeHandlers('en', []);
  H.setState(window.__initialState(team, 'en', { ...base, industryId, endMonth: ind.runEnd }, []));

  const turnOpts = {};
  let months = 0;
  // Snapshot the run's state at each stage boundary, so attrition can be read per stage rather
  // than only at the moment of death.
  const stageEntry = {};
  let peakCapital = 0, everFundraised = false, raisesAttempted = 0, raisesLanded = 0;

  while (months < ind.runEnd) {
    const g = H.getState();
    if (!g || g.gameOver) break;
    const sid = stageOf(g.month, ind.stages).id;
    if (!stageEntry[sid]) {
      stageEntry[sid] = {
        month: g.month, capital: Math.round(g.capital), revenue: Math.round(g.revenuePerMonth || 0),
        bc: Math.round(g.boardConfidence), morale: Math.round(g.morale), rep: Math.round(g.reputation),
        projects: Object.keys(g.completed).length, raised: g.totalRaised || 0,
      };
    }
    peakCapital = Math.max(peakCapital, g.capital);
    const raisedBefore = g.totalRaised || 0;

    botTurn(H, ind, turnOpts);
    if (H.getState().gameOver) break;
    if (H.getState().month >= Math.floor(ind.runEnd * 0.6)) {
      for (const e of (ind.content.exits || [])) {
        H.handleAttemptExit(e.id);
        if (H.getState().gameOver) break;
      }
    }
    if (H.getState().gameOver) break;

    const afterTurn = H.getState();
    if ((afterTurn.totalRaised || 0) > raisedBefore) { everFundraised = true; raisesLanded++; }
    H.endMonth();
    months++;
  }

  const g = H.getState();
  const endStage = stageOf(Math.min(g.month, ind.runEnd), ind.stages).id;
  const reason = g.gameOver ? (g.gameOver.reason || 'unknown') : 'ranOutTheClock';
  const won = !!(g.gameOver && g.gameOver.won);
  return {
    industry: industryId, reason, won,
    month: g.month, endStage,
    capital: Math.round(g.capital), revenue: Math.round(g.revenuePerMonth || 0),
    bc: Math.round(g.boardConfidence), morale: Math.round(g.morale), rep: Math.round(g.reputation),
    marketPosition: Math.round(g.marketPosition || 0),
    projects: Object.keys(g.completed).length,
    totalRaised: g.totalRaised || 0,
    capacity: Math.round(g.capacity || 0), demand: Math.round(g.demand || 0),
    rivals: (g.competitors || []).length,
    peakCapital: Math.round(peakCapital), everFundraised, raisesLanded,
    stageEntry,
  };
}

function pct(n, d) { return d ? `${(100 * n / d).toFixed(1)}%` : '—'; }
function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function report(industryId, runs) {
  const ind = getIndustry(industryId);
  console.log(`\n${'='.repeat(74)}`);
  console.log(`${industryId.toUpperCase()} — N=${runs.length}, run length ${ind.runEnd} months, stages: ${ind.stageOrder.join(' → ')}`);
  console.log('='.repeat(74));

  const wins = runs.filter(r => r.won);
  console.log(`Win rate: ${pct(wins.length, runs.length)}  (${wins.length}/${runs.length})`);
  console.log(`Median months survived: ${median(runs.map(r => r.month))} of ${ind.runEnd}`);

  // --- 1. What ends runs ---
  console.log('\n1. HOW RUNS END');
  const byReason = {};
  runs.forEach(r => { byReason[r.reason] = (byReason[r.reason] || 0) + 1; });
  Object.entries(byReason).sort((a, b) => b[1] - a[1]).forEach(([reason, n]) => {
    const these = runs.filter(r => r.reason === reason);
    console.log(`  ${String(n).padStart(4)} ${pct(n, runs.length).padStart(7)}  ${reason.padEnd(22)} median month ${median(these.map(r => r.month))}`);
  });

  // --- 2. Where they die ---
  console.log('\n2. WHERE RUNS END (the wall)');
  const byStage = {};
  runs.forEach(r => { byStage[r.endStage] = (byStage[r.endStage] || 0) + 1; });
  ind.stageOrder.forEach(sid => {
    const n = byStage[sid] || 0;
    const reached = runs.filter(r => r.stageEntry[sid]).length;
    const bar = '#'.repeat(Math.round(40 * n / Math.max(1, runs.length)));
    console.log(`  ${sid.padEnd(12)} reached by ${String(reached).padStart(4)} (${pct(reached, runs.length).padStart(6)})  ended here ${String(n).padStart(4)} ${bar}`);
  });

  // --- 3. State at death, by reason ---
  console.log('\n3. STATE AT DEATH (median, by end reason)');
  console.log('  reason                  n   month  capital  revenue    BC  morale   rep  projects  raised');
  Object.keys(byReason).sort((a, b) => byReason[b] - byReason[a]).forEach(reason => {
    const rs = runs.filter(r => r.reason === reason);
    console.log(`  ${reason.padEnd(20)} ${String(rs.length).padStart(4)}  ${String(median(rs.map(r => r.month))).padStart(5)}  ${String(median(rs.map(r => r.capital))).padStart(7)}  ${String(median(rs.map(r => r.revenue))).padStart(7)}  ${String(median(rs.map(r => r.bc))).padStart(4)}  ${String(median(rs.map(r => r.morale))).padStart(6)}  ${String(median(rs.map(r => r.rep))).padStart(4)}  ${String(median(rs.map(r => r.projects))).padStart(8)}  ${String(median(rs.map(r => r.totalRaised))).padStart(6)}`);
  });

  // --- 4. Stage entry conditions: what the company looked like ARRIVING at each stage ---
  console.log('\n4. CONDITION ON ENTERING EACH STAGE (median of runs that got there)');
  console.log('  stage         n   month  capital  revenue    BC  morale   rep  projects  raised');
  ind.stageOrder.forEach(sid => {
    const entries = runs.map(r => r.stageEntry[sid]).filter(Boolean);
    if (!entries.length) { console.log(`  ${sid.padEnd(12)} 0   — never reached`); return; }
    console.log(`  ${sid.padEnd(12)} ${String(entries.length).padStart(3)}  ${String(median(entries.map(e => e.month))).padStart(5)}  ${String(median(entries.map(e => e.capital))).padStart(7)}  ${String(median(entries.map(e => e.revenue))).padStart(7)}  ${String(median(entries.map(e => e.bc))).padStart(4)}  ${String(median(entries.map(e => e.morale))).padStart(6)}  ${String(median(entries.map(e => e.rep))).padStart(4)}  ${String(median(entries.map(e => e.projects))).padStart(8)}  ${String(median(entries.map(e => e.raised))).padStart(6)}`);
  });

  // --- 5. Fundraising behaviour: is the bot funding itself at all? ---
  console.log('\n5. FUNDING');
  console.log(`  Runs that ever raised: ${pct(runs.filter(r => r.everFundraised).length, runs.length)}`);
  console.log(`  Median total raised: ${median(runs.map(r => r.totalRaised))}k   median peak capital: ${median(runs.map(r => r.peakCapital))}k`);
  const insolvent = runs.filter(r => r.reason === 'insolvent');
  if (insolvent.length) {
    console.log(`  Of the ${insolvent.length} insolvencies: ${pct(insolvent.filter(r => r.everFundraised).length, insolvent.length)} had raised money at some point`);
    console.log(`  Median peak capital before insolvency: ${median(insolvent.map(r => r.peakCapital))}k`);
  }

  // capacityDemand industries only: is the bot balancing the two sides?
  if (ind.revenueModel === 'capacityDemand') {
    console.log(`\n6. CAPACITY vs DEMAND AT DEATH (median)`);
    console.log(`  capacity ${median(runs.map(r => r.capacity))}, demand ${median(runs.map(r => r.demand))}`);
    const capBound = runs.filter(r => r.capacity < r.demand).length;
    console.log(`  capacity-bound (turning away orders): ${pct(capBound, runs.length)}   demand-bound (idle plant): ${pct(runs.length - capBound, runs.length)}`);
  }
  return { byReason, byStage, runs };
}

const N = parseInt(process.argv[2] || '80', 10);
console.log(`Running ${N} instrumented runs per industry. No numbers are changed by this script.`);

const results = {};
['hospitality', 'manufacturing'].forEach(id => {
  const runs = Array.from({ length: N }, () => autopsyRun(id));
  results[id] = report(id, runs);
});

// --- side-by-side ---
console.log(`\n${'='.repeat(74)}\nSIDE BY SIDE\n${'='.repeat(74)}`);
const allReasons = new Set([...Object.keys(results.hospitality.byReason), ...Object.keys(results.manufacturing.byReason)]);
console.log('  reason                 hospitality   manufacturing');
[...allReasons].sort().forEach(reason => {
  const h = results.hospitality.byReason[reason] || 0;
  const m = results.manufacturing.byReason[reason] || 0;
  console.log(`  ${reason.padEnd(22)} ${pct(h, N).padStart(8)}      ${pct(m, N).padStart(8)}`);
});
