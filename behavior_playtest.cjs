// PLAYTEST: do the behavior systems actually change how a run plays?
//
// Unit tests prove each function does what it says. This asks the harder question: across many
// runs, does WHO backs you and WHO you're up against produce measurably different games? A
// system that passes its unit tests but produces statistically identical runs isn't alive, it's
// decoration.
//
// Every comparison here holds everything constant except the one variable under test, and runs
// enough samples that the difference is a signal rather than a lucky seed.
global.window = global;
const { makeMemoryStorage } = require('./memory_storage_stub.cjs');
window.storage = makeMemoryStorage();
require('./build/harness.cjs');

const getIndustry = window.__getIndustry2;
const makeCompetitor = window.__makeCompetitor;
const BY_ID = window.__INVESTOR_BY_ID;
const alignment = window.__investorAlignment;
const invTerms = window.__investorTerms;
const gateFn = window.__investorGate;
const deriveDisposition = window.__deriveDisposition;
const stageOf = window.__stageOf;
const scaledProjectCost = window.__scaledProjectCost;
const instrumentsForStage = window.__instrumentsForStage2;

const AXES = ['growthVsSustainability', 'innovationVsExecution', 'peopleVsProfit', 'riskVsStability', 'premiumVsMass', 'centralizedVsDelegated'];
const phil = (o) => { const p = {}; AXES.forEach(a => { p[a] = o[a] || 0; }); return p; };

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function pct(x) { return (x * 100).toFixed(1) + '%'; }
function fmt(n, d) { return Number(n).toFixed(d == null ? 1 : d); }

// ---------------------------------------------------------------- shared bot
// Same competent bot as scenario_bench, trimmed to what the playtest needs.
function botTurn(H, ind, opts) {
  for (let guard = 0; guard < 12; guard++) {
    const g = H.getState();
    if (!g || g.gameOver || g.ap < 1) break;
    if (g.pendingChoice) {
      const os = g.pendingChoice.event.options;
      const traits = new Set((g.team.leaders || []).map(l => l.trait));
      const scored = os.map((o, i) => {
        let s = o.traitCheck ? (traits.has(o.traitCheck) ? 100 : 10) : 20 + (g.stats[o.statCheck] || 0) * 8;
        const badCap = (o.bad && o.bad.deltas && o.bad.deltas.capacity) || 0;
        if (badCap < 0) s += badCap * 1.5;
        return { i, s };
      }).sort((a, b) => b.s - a.s);
      H.handleChoiceOption(scored[0].i);
      continue;
    }
    const stage = stageOf(g.month, ind.stages);
    const burnEst = Math.max(1, 2 + Math.ceil(g.laborPool / 3) + g.activeProjects.length
      + ((ind.scaling.stageBurnBonus || {})[stage.id] || 0) - (g.burnReduction || 0));
    const runway = g.capital / burnEst;
    const fundedThisMonth = opts.fundedMonth === g.month;

    const insts = instrumentsForStage(ind, stage.id)
      .filter(i => !(g.closedInstruments || []).includes(i.id))
      .filter(i => (i.cost.presence || 0) <= g.presence && (i.cost.ap || 1) <= g.ap);
    if (!fundedThisMonth && insts.length && (runway < 18 || (g.totalRaised || 0) === 0)) {
      insts.sort((a, b) => (b.capital[1] + b.capital[0]) - (a.capital[1] + a.capital[0]));
      const before = g.ap;
      H.handleFundingInstrument(insts[0].id);
      if (H.getState().ap < before) { opts.fundedMonth = g.month; continue; }
    }
    if (!fundedThisMonth && runway < 12) {
      const before = H.getState().ap;
      H.handleFundraise();
      if (H.getState().ap < before) { opts.fundedMonth = g.month; continue; }
    }

    const so = ind.stageOrder;
    const affordable = ind.content.projects.filter(p => {
      if (g.completed[p.id] || g.activeProjects.some(a => a.id === p.id)) return false;
      if (!p.requires.every(r => g.completed[r])) return false;
      if (p.minStage && so.indexOf(stage.id) < so.indexOf(p.minStage)) return false;
      const sc = scaledProjectCost(p, stage.id, g.team.style, ind.scaling);
      if (sc.capital > g.capital || sc.presence > g.presence) return false;
      if ((p.labor || 0) > (g.laborPool - g.laborReserved)) return false;
      if (g.capital - sc.capital < burnEst * 6) return false;
      return true;
    });
    if (affordable.length) {
      const cap = g.capacity || 0, dem = g.demand || 0;
      const scored = affordable.map(p => {
        const oc = p.onComplete || {};
        let s = (oc.reputation || 0) + (oc.marketPosition || 0) + (oc.burnReduction || 0) * 4 + (oc.capital || 0) * 0.5
          + Object.values(oc.statBonus || {}).reduce((a, b) => a + b, 0) * 2.5;
        if (ind.revenueModel === 'capacityDemand') {
          const needCap = cap <= dem;
          s += (oc.capacity || 0) * (needCap ? 3 : 0.6) + (oc.demand || 0) * (needCap ? 0.6 : 3);
        } else s += (oc.revenuePerMonth || 0) * 3;
        const sc = scaledProjectCost(p, stage.id, g.team.style, ind.scaling);
        return { p, s: s / Math.max(1, sc.capital * 0.25 + sc.duration) };
      }).sort((a, b) => b.s - a.s);
      const before = g.ap;
      H.handleInvest(scored[0].p.id);
      if (H.getState().ap < before) continue;
    }
    const g2 = H.getState();
    if (g2.morale < 45 && g2.capital > burnEst * 8) { const b = g2.ap; H.handleRestCulture(); if (H.getState().ap < b) continue; }
    if ((g2.laborPool - g2.laborReserved) < 2 && g2.capital > burnEst * 10) { const b = g2.ap; H.handleRecruit(); if (H.getState().ap < b) continue; }
    if (g2.team.leaders && g2.team.leaders.length) { const b = g2.ap; H.handleOperate(g2.team.leaders[0].id); if (H.getState().ap < b) continue; }
    break;
  }
}

function playRun(industryId, patch, opts = {}) {
  const ind = getIndustry(industryId);
  const leaders = [...ind.content.leaders].sort(() => Math.random() - 0.5).slice(0, 2);
  const team = window.__buildTeam(leaders);
  const base = window.__getScenario('fullRun');
  const rawH = window.__makeHandlers('en', []);
  const H = opts.wrapH ? opts.wrapH(rawH) : rawH;
  H.setState({ ...window.__initialState(team, 'en', { ...base, industryId, endMonth: ind.runEnd }, []), ...(patch || {}) });

  const turnOpts = {};
  let months = 0;
  const maxMonths = opts.maxMonths || ind.runEnd;
  let raidsSuffered = 0, attacksSuffered = 0, pressureTickets = 0, refusals = 0;

  while (months < maxMonths) {
    const g = H.getState();
    if (!g || g.gameOver) break;
    botTurn(H, ind, turnOpts);
    if (H.getState().gameOver) break;
    // Attempt exits once in range. Without this every cell reported 0% wins — an artifact of the
    // harness never trying to finish, not a property of the behaviour systems under test.
    if (H.getState().month >= Math.floor(ind.runEnd * 0.6)) {
      for (const e of (ind.content.exits || [])) {
        H.handleAttemptExit(e.id);
        if (H.getState().gameOver) break;
      }
    }
    if (H.getState().gameOver) break;
    const logBefore = H.getState().log.length;
    H.endMonth();
    const after = H.getState();
    const newTickets = (after.pendingSummary && after.pendingSummary.tickets) || [];
    newTickets.forEach(t => {
      if (/Talent Raid/.test(t.title)) raidsSuffered++;
      if (/Board Pressure|Uncomfortable Question/.test(t.title)) pressureTickets++;
    });
    after.log.slice(0, Math.max(0, after.log.length - logBefore)).forEach(t => {
      if (/Blocked|does not return|cannot write|wants to see|passes|lost interest|runs a public/.test((t.body || '') + t.title)) refusals++;
    });
    months++;
  }
  const g = H.getState();
  const comp = g.competitors || [];
  comp.forEach(c => { attacksSuffered += (c.encounters || {}).attackedPlayer || 0; });
  return {
    won: !!(g.gameOver && g.gameOver.won),
    outcome: g.gameOver ? (g.gameOver.reason || 'unknown') : 'timeout',
    months: g.month, capital: g.capital, revenue: g.revenuePerMonth,
    reputation: g.reputation, boardConfidence: g.boardConfidence, morale: g.morale,
    valuation: g.companyValuation, totalRaised: g.totalRaised || 0,
    equityGiven: g.equityGiven || 0, laborPool: g.laborPool,
    projectsDone: Object.keys(g.completed).length,
    backers: Object.keys(g.investorBackers || {}),
    raidsSuffered, attacksSuffered, pressureTickets, refusals,
    competitors: comp,
  };
}

function batch(n, industryId, patch, opts) {
  return Array.from({ length: n }, () => playRun(industryId, patch, opts));
}

function summarize(label, rs) {
  return {
    label, n: rs.length,
    winRate: rs.filter(r => r.won).length / rs.length,
    months: mean(rs.map(r => r.months)),
    raised: mean(rs.map(r => r.totalRaised)),
    equity: mean(rs.map(r => r.equityGiven)),
    bc: mean(rs.map(r => r.boardConfidence)),
    rep: mean(rs.map(r => r.reputation)),
    val: mean(rs.map(r => r.valuation)),
    attacks: mean(rs.map(r => r.attacksSuffered)),
    // Per active month. Raw totals are confounded by survival time: a predatory nemesis that
    // kills the run at month 15 logs FEWER total attacks than a balanced rival you survive to
    // month 40 alongside, which reads backwards. Rate is the honest comparison.
    atkRate: mean(rs.map(r => r.attacksSuffered / Math.max(1, r.months))),
    raids: mean(rs.map(r => r.raidsSuffered)),
    pressure: mean(rs.map(r => r.pressureTickets)),
  };
}

function table(rows, cols) {
  const head = ['scenario', ...cols.map(c => c[0])];
  const widths = head.map(h => h.length);
  const body = rows.map(r => {
    const cells = [r.label, ...cols.map(c => c[1](r))];
    cells.forEach((c, i) => { widths[i] = Math.max(widths[i], String(c).length); });
    return cells;
  });
  console.log('  ' + head.map((h, i) => h.padEnd(widths[i])).join('  '));
  console.log('  ' + widths.map(w => '-'.repeat(w)).join('  '));
  body.forEach(cells => console.log('  ' + cells.map((c, i) => String(c).padEnd(widths[i])).join('  ')));
}

const COLS = [
  ['win%', r => pct(r.winRate)],
  ['months', r => fmt(r.months)],
  ['raised', r => fmt(r.raised, 0) + 'k'],
  ['equity', r => fmt(r.equity) + '%'],
  ['boardCf', r => fmt(r.bc)],
  ['rep', r => fmt(r.rep)],
  ['atk/mo', r => fmt(r.atkRate, 2)],
  ['raids', r => fmt(r.raids)],
  ['press', r => fmt(r.pressure)],
];

module.exports = { playRun, botTurn, getIndustry, batch, summarize };

if (require.main === module) {
const N = parseInt(process.argv[2] || '30', 10);

console.log(`\n${'='.repeat(78)}`);
console.log(`BEHAVIOR PLAYTEST — ${N} runs per cell, Manufacturing full run (84mo)`);
console.log('='.repeat(78));

// ============================================================ 1. INVESTOR STANDING
console.log('\n\n### 1. Does cross-run investor standing change the game?');
console.log('Same industry, same bot. Only the standings the founder walks in with differ.\n');
const roster = window.__rollInvestorRoster('manufacturing');
const champions = {}; roster.forEach(id => { champions[id] = 85; });
const burned = {}; roster.forEach(id => { burned[id] = -75; });

const neutralStanding = summarize('neutral (first run)', batch(N, 'manufacturing', { investorRoster: roster }));
const championStanding = summarize('champion standing', batch(N, 'manufacturing', { investorRoster: roster, investorStandings: champions }));
const burnedStanding = summarize('burned standing', batch(N, 'manufacturing', { investorRoster: roster, investorStandings: burned }));
table([burnedStanding, neutralStanding, championStanding], COLS);

// ============================================================ 2. PHILOSOPHY ALIGNMENT
console.log('\n\n### 2. Does the founder\u2019s philosophy change what investors offer?');
console.log('Philosophy is pre-set to an extreme so alignment is unambiguous.\n');
const profitPhil = phil({ growthVsSustainability: 80, peopleVsProfit: -85, riskVsStability: 45, centralizedVsDelegated: 60 });
const peoplePhil = phil({ growthVsSustainability: -75, peopleVsProfit: 80, riskVsStability: -40, premiumVsMass: 40 });

const profitFounder = summarize('profit-first founder', batch(N, 'manufacturing', { investorRoster: roster, philosophy: profitPhil }));
const peopleFounder = summarize('people-first founder', batch(N, 'manufacturing', { investorRoster: roster, philosophy: peoplePhil }));
table([profitFounder, peopleFounder], COLS);

// Direct measurement, independent of run noise: what the SAME instrument yields to each founder.
console.log('\n  Same instrument, same investor, different founder philosophy:');
const inst = { capital: [100, 140], dilution: 10, successBase: 70 };
const baseG = { capital: 300, laborPool: 6, reputation: 50, boardConfidence: 70, revenuePerMonth: 20, stats: { compliance: 5 }, investorStandings: {} };
[['Dwayne Borg', 'dwayneBorg'], ['Jim Leonard', 'jimLeonard'], ['Greta Lindqvist', 'gretaLindqvist'], ['Terrence Okafor', 'terrenceOkafor']].forEach(([name, id]) => {
  const inv = BY_ID[id];
  const a = invTerms(inv, inst, { ...baseG, philosophy: profitPhil });
  const b = invTerms(inv, inst, { ...baseG, philosophy: peoplePhil });
  const gA = gateFn(inv, { ...baseG, philosophy: profitPhil }, 'growth');
  const gB = gateFn(inv, { ...baseG, philosophy: peoplePhil }, 'growth');
  console.log(`    ${name.padEnd(17)} profit-first: ${gA.open ? `${a.capitalHi}k @ ${a.dilution}%, align ${fmt(a.alignment, 2)}` : 'REFUSES'}`);
  console.log(`    ${''.padEnd(17)} people-first: ${gB.open ? `${b.capitalHi}k @ ${b.dilution}%, align ${fmt(b.alignment, 2)}` : 'REFUSES'}`);
});

// ============================================================ 3. NEMESIS POSTURE
console.log('\n\n### 3. Does a rival\u2019s posture change the run?');
console.log('One rival pre-placed at month 1, identical except posture and history.\n');
const ind = getIndustry('manufacturing');
function withRival(seed) {
  const r = makeCompetitor([], [], 1, 'en', 'manufacturing', ind.content);
  return { investorRoster: roster, competitors: [{ ...r, ...seed, id: 'r1' }], spawnedCompetitorStages: ['seed', 'early', 'growth', 'expansion'] };
}
const vsNone = summarize('no rival', batch(N, 'manufacturing', { investorRoster: roster, spawnedCompetitorStages: ['seed', 'early', 'growth', 'expansion'] }));
const vsBalanced = summarize('balanced rival', batch(N, 'manufacturing', withRival({ posture: 'balanced', encounters: {} })));
const vsExpansionist = summarize('expansionist rival', batch(N, 'manufacturing', withRival({ posture: 'expansionist', encounters: {} })));
const vsFortified = summarize('fortified rival', batch(N, 'manufacturing', withRival({ posture: 'fortified', encounters: { attackedByPlayer: 4 } })));
const vsPredatory = summarize('predatory nemesis', batch(N, 'manufacturing', withRival({ posture: 'predatory', encounters: { attackedByPlayer: 3, defeatedPlayer: 3 } })));
const vsAlly = summarize('allied rival', batch(N, 'manufacturing', withRival({ posture: 'balanced', encounters: { coexistedRuns: 20 } })));
table([vsNone, vsAlly, vsBalanced, vsExpansionist, vsFortified, vsPredatory], COLS);

// ============================================================ 4. COMBINED
console.log('\n\n### 4. Do the two systems compound?');
console.log('Best case: champion investors + an allied rival. Worst: burned + a predatory nemesis.\n');
const bestCase = summarize('champions + ally', batch(N, 'manufacturing',
  { ...withRival({ posture: 'balanced', encounters: { coexistedRuns: 20 } }), investorStandings: champions, philosophy: profitPhil }));
const worstCase = summarize('burned + nemesis', batch(N, 'manufacturing',
  { ...withRival({ posture: 'predatory', encounters: { attackedByPlayer: 3, defeatedPlayer: 3 } }), investorStandings: burned, philosophy: peoplePhil }));
table([worstCase, bestCase], COLS);

// ============================================================ VERDICT
console.log('\n\n### Verdict — is the system actually alive?\n');
const checks = [
  ['standing changes outcomes', Math.abs(championStanding.winRate - burnedStanding.winRate) > 0.08,
    `burned ${pct(burnedStanding.winRate)} vs champion ${pct(championStanding.winRate)}`],
  ['standing changes capital raised', championStanding.raised > burnedStanding.raised * 1.1,
    `${fmt(burnedStanding.raised, 0)}k vs ${fmt(championStanding.raised, 0)}k`],
  ['posture changes attack RATE', vsPredatory.atkRate > vsBalanced.atkRate * 1.15,
    `balanced ${fmt(vsBalanced.atkRate, 2)}/mo vs predatory ${fmt(vsPredatory.atkRate, 2)}/mo`],
  ['allies genuinely stop attacking', vsAlly.atkRate < 0.02,
    `${fmt(vsAlly.atkRate, 2)}/mo`],
  ['a nemesis measurably shortens runs', vsPredatory.months < vsBalanced.months * 0.75,
    `balanced ${fmt(vsBalanced.months)}mo vs predatory ${fmt(vsPredatory.months)}mo`],
  ['a nemesis costs board confidence', vsPredatory.bc < vsBalanced.bc,
    `balanced ${fmt(vsBalanced.bc)} vs predatory ${fmt(vsPredatory.bc)}`],
  ['best and worst case diverge sharply', bestCase.winRate - worstCase.winRate > 0.15,
    `worst ${pct(worstCase.winRate)} vs best ${pct(bestCase.winRate)}`],
];
let alive = 0;
checks.forEach(([label, cond, detail]) => {
  console.log(`  ${cond ? 'YES ' : 'NO  '} ${label.padEnd(38)} ${detail}`);
  if (cond) alive++;
});
console.log(`\n  ${alive}/${checks.length} liveness signals present.\n`);
}
