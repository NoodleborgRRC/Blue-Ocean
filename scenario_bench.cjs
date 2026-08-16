// N-run balance batches driving the REAL shipped handlers (via harness-build).
//
// Standing lesson from this project: a green suite is only as trustworthy as the bot driving it.
// Two prior regressions passed for the wrong reason -- a bot that never fundraised and went
// insolvent by pure arithmetic, and an assertion conflating "still playing" with "reached the
// target stage." So this bot is deliberately competent, and the batch reports WHY runs ended and
// traces real numbers, never just a pass/fail boolean.
global.window = global;
require('./build/harness.cjs');

const getIndustry = window.__getIndustry2;
const stageOf = window.__stageOf;
const scaledProjectCost = window.__scaledProjectCost;
const instrumentsForStage = window.__instrumentsForStage2;

// ---------------------------------------------------------------- bot policy
// Adaptive: tracks capital runway and prioritizes differently when solvency is at risk vs when
// there's room to invest. Capacity/Demand aware for industries using the derived revenue model.
function botTakeTurn(H, ind, opts) {
  const revModel = ind.revenueModel;

  for (let guard = 0; guard < 12; guard++) {
    const g = H.getState();
    if (!g || g.gameOver || g.ap < 1) break;

    // Resolve any pending choice event first -- it blocks nothing mechanically but leaving it
    // pending across months would mean the bot never exercises choice resolution at all.
    // Options are chosen on stat/trait FIT, not at random: a random-picking bot eats every bad
    // outcome at ~50%, and several Manufacturing bad outcomes carry large negative capacity
    // deltas, which silently destroys the Capacity/Demand mechanic and makes the industry look
    // far harder than it is. This is the same "green for the wrong reason" trap as before.
    if (g.pendingChoice) {
      const opts2 = g.pendingChoice.event.options;
      const traits = new Set((g.team.leaders || []).map(l => l.trait));
      const scoredOpts = opts2.map((o, i) => {
        let s = 0;
        if (o.traitCheck) s += traits.has(o.traitCheck) ? 100 : 10; // matched trait = guaranteed good
        else s += 20 + (g.stats[o.statCheck] || 0) * 8;             // higher stat = better odds
        // Prefer options whose downside doesn't gut the production line.
        const badCap = ((o.bad && o.bad.deltas && o.bad.deltas.capacity) || 0);
        if (badCap < 0) s += badCap * 1.5;
        return { i, s };
      });
      scoredOpts.sort((a, b) => b.s - a.s);
      H.handleChoiceOption(scoredOpts[0].i);
      continue;
    }

    const stage = stageOf(g.month, ind.stages);
    const burnEst = Math.max(1, 2 + Math.ceil(g.laborPool / 3) + g.activeProjects.length
      + ((ind.scaling.stageBurnBonus || {})[stage.id] || 0) - (g.burnReduction || 0));
    const runway = burnEst > 0 ? g.capital / burnEst : 99;

    // --- Funding: instrument-based industries first, classic Fundraise otherwise ---
    // Capped at ONE funding action per month. Manufacturing's Pre-Seed grants only 2 AP and has
    // 2 Pre-Seed instruments, so an uncapped "raise until totalRaised > 0" policy consumed every
    // AP for the whole stage and the critical-path prototype was never started -- the run then
    // failed the Pre-Seed gate for a reason that had nothing to do with game balance.
    const fundedThisMonth = (opts.fundedMonth === g.month);
    const insts = instrumentsForStage(ind, stage.id)
      .filter(i => !(g.closedInstruments || []).includes(i.id))
      .filter(i => (i.cost.presence || 0) <= g.presence && (i.cost.ap || 1) <= g.ap);
    if (!fundedThisMonth && insts.length && (runway < 18 || (g.totalRaised || 0) === 0)) {
      insts.sort((a, b) => (b.capital[1] + b.capital[0]) - (a.capital[1] + a.capital[0]));
      const before = g.ap;
      H.handleFundingInstrument(insts[0].id);
      if (H.getState().ap < before) { opts.fundedMonth = g.month; continue; }
    }
    // Classic Fundraise is available in Internal Actions for EVERY industry, including ones with
    // funding instruments. Instruments are one-shot per run, so a bot that only used instruments
    // ran completely dry mid-Seed and failed for lack of capital rather than lack of strategy.
    if (!fundedThisMonth && runway < 12) {
      const before = H.getState().ap;
      H.handleFundraise();
      if (H.getState().ap < before) { opts.fundedMonth = g.month; continue; }
    }

    // --- Projects: the main engine of progress ---
    const projects = ind.content.projects;
    const stageOrder = ind.stageOrder;
    const affordable = projects.filter(p => {
      if (g.completed[p.id] || g.activeProjects.some(a => a.id === p.id)) return false;
      if (!p.requires.every(r => g.completed[r])) return false;
      if (p.minStage && stageOrder.indexOf(stage.id) < stageOrder.indexOf(p.minStage)) return false;
      const sc = scaledProjectCost(p, stage.id, g.team.style, ind.scaling);
      if (sc.capital > g.capital) return false;
      if (sc.presence > g.presence) return false;
      if ((p.labor || 0) > (g.laborPool - g.laborReserved)) return false;
      // Keep a solvency cushion: never spend into a sub-6-month runway.
      if (g.capital - sc.capital < burnEst * 6) return false;
      return true;
    });

    if (affordable.length) {
      // Score projects. Capacity/Demand industries weight whichever side is currently the
      // bottleneck, which is the whole point of the mechanic.
      const cap = g.capacity || 0, dem = g.demand || 0;
      const scored = affordable.map(p => {
        const oc = p.onComplete || {};
        let score = 0;
        score += (oc.reputation || 0) * 1.0;
        score += (oc.marketPosition || 0) * 1.0;
        score += (oc.burnReduction || 0) * 4.0;
        score += (oc.capital || 0) * 0.5;
        score += Object.values(oc.statBonus || {}).reduce((a, b) => a + b, 0) * 2.5;
        if (revModel === 'capacityDemand') {
          const needCapacity = cap <= dem;
          score += (oc.capacity || 0) * (needCapacity ? 3.0 : 0.6);
          score += (oc.demand || 0) * (needCapacity ? 0.6 : 3.0);
        } else {
          score += (oc.revenuePerMonth || 0) * 3.0;
        }
        const sc = scaledProjectCost(p, stage.id, g.team.style, ind.scaling);
        return { p, score: score / Math.max(1, sc.capital * 0.25 + sc.duration) };
      });
      scored.sort((a, b) => b.score - a.score);
      const before = g.ap;
      H.handleInvest(scored[0].p.id);
      if (H.getState().ap < before) continue;
      // Investment was refused (denyTicket doesn't spend AP) -- fall through rather than loop.
    }

    // --- Fallbacks so AP is never wasted ---
    const g2 = H.getState();
    if (g2.morale < 45 && g2.capital > burnEst * 8) { const b = g2.ap; H.handleRestCulture(); if (H.getState().ap < b) continue; }
    if ((g2.laborPool - g2.laborReserved) < 2 && g2.capital > burnEst * 10) { const b = g2.ap; H.handleRecruit(); if (H.getState().ap < b) continue; }
    if (g2.team.leaders && g2.team.leaders.length) { const b = g2.ap; H.handleOperate(g2.team.leaders[0].id); if (H.getState().ap < b) continue; }
    break;
  }

  // Try any exit that's available once we're in range.
  const g = H.getState();
  if (g && !g.gameOver && opts.tryExit) {
    const exits = ind.content.exits.length ? ind.content.exits : [];
    for (const e of exits) {
      const before = H.getState();
      H.handleAttemptExit(e.id);
      const after = H.getState();
      if (after.gameOver) break;
      if (after === before) continue;
    }
  }
}

// ---------------------------------------------------------------- one run
function runOnce(industryId, opts = {}) {
  const ind = getIndustry(industryId);
  const allLeaders = ind.content.leaders;
  // Random 2-leader team, so a batch samples across founders rather than testing one build.
  const shuffled = [...allLeaders].sort(() => Math.random() - 0.5).slice(0, 2);
  const team = window.__buildTeam(shuffled);

  const base = window.__getScenario('fullRun');
  const scenario = { ...base, industryId, endMonth: ind.runEnd };
  const st = window.__initialState(team, 'en', scenario, []);

  const H = window.__makeHandlers('en', []);
  H.setState(st);

  const trace = [];
  let months = 0;
  const maxMonths = ind.runEnd + 3;

  while (months < maxMonths) {
    const g = H.getState();
    if (!g || g.gameOver) break;
    const inExitRange = g.month >= Math.floor(ind.runEnd * 0.75);
    botTakeTurn(H, ind, { tryExit: inExitRange });
    const g1 = H.getState();
    if (!g1 || g1.gameOver) break;
    if (opts.trace) {
      const s = stageOf(g1.month, ind.stages);
      trace.push({
        month: g1.month, stage: s.id, capital: Math.round(g1.capital), rev: g1.revenuePerMonth,
        cap: Math.round(g1.capacity || 0), dem: Math.round(g1.demand || 0),
        rep: Math.round(g1.reputation), bc: Math.round(g1.boardConfidence),
        raised: g1.totalRaised || 0, done: Object.keys(g1.completed).length,
      });
    }
    H.endMonth();
    months++;
  }

  const g = H.getState();
  const stage = stageOf(Math.min(g.month, ind.runEnd), ind.stages);
  return {
    won: !!(g.gameOver && g.gameOver.won),
    reason: g.gameOver ? (g.gameOver.reason || g.gameOver.headline) : 'ran-out-of-loop',
    headline: g.gameOver ? g.gameOver.headline : '(no game over)',
    month: g.month,
    stageReached: stage.id,
    capital: Math.round(g.capital),
    revenue: g.revenuePerMonth,
    capacity: Math.round(g.capacity || 0),
    demand: Math.round(g.demand || 0),
    totalRaised: g.totalRaised || 0,
    reputation: Math.round(g.reputation),
    projectsDone: Object.keys(g.completed).length,
    valuation: Math.round(g.companyValuation || 0),
    trace,
  };
}

// ---------------------------------------------------------------- batch
function batch(industryId, n) {
  const results = [];
  for (let i = 0; i < n; i++) {
    try { results.push(runOnce(industryId)); }
    catch (e) { results.push({ won: false, reason: 'CRASH: ' + e.message, month: 0, stageReached: '?', crash: true, stack: e.stack }); }
  }
  return results;
}

function summarize(label, results) {
  const n = results.length;
  const wins = results.filter(r => r.won).length;
  const crashes = results.filter(r => r.crash);
  console.log(`\n${'='.repeat(64)}\n${label} — ${n} runs\n${'='.repeat(64)}`);
  console.log(`Win rate: ${wins}/${n} (${(100 * wins / n).toFixed(1)}%)`);
  if (crashes.length) {
    console.log(`\n!! ${crashes.length} CRASHES !!`);
    console.log(crashes[0].stack.split('\n').slice(0, 6).join('\n'));
  }

  const byReason = {};
  results.forEach(r => { byReason[r.reason] = (byReason[r.reason] || 0) + 1; });
  console.log('\nOutcomes:');
  Object.entries(byReason).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  ${k}`));

  const byStage = {};
  results.forEach(r => { byStage[r.stageReached] = (byStage[r.stageReached] || 0) + 1; });
  console.log('\nStage reached:');
  Object.entries(byStage).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}  ${k}`));

  const avg = (f) => (results.reduce((a, r) => a + (f(r) || 0), 0) / n);
  const med = (f) => { const s = results.map(f).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  console.log('\nAverages:');
  console.log(`  month reached : ${avg(r => r.month).toFixed(1)}  (median ${med(r => r.month)})`);
  console.log(`  projects done : ${avg(r => r.projectsDone).toFixed(1)}`);
  console.log(`  total raised  : ${avg(r => r.totalRaised).toFixed(0)}k`);
  console.log(`  end revenue   : ${avg(r => r.revenue).toFixed(1)}k/mo`);
  console.log(`  end capacity  : ${avg(r => r.capacity).toFixed(1)}`);
  console.log(`  end demand    : ${avg(r => r.demand).toFixed(1)}`);
  console.log(`  end reputation: ${avg(r => r.reputation).toFixed(1)}`);
  console.log(`  valuation     : ${avg(r => r.valuation).toFixed(0)}k`);
  return { n, wins, winRate: wins / n, byReason, byStage, crashes: crashes.length };
}

module.exports = { runOnce, batch, summarize };

if (require.main === module) {
  const N = parseInt(process.argv[3] || '50', 10);
  const which = process.argv[2] || 'both';
  if (which === 'both' || which === 'hospitality') summarize('HOSPITALITY (full run, 45mo)', batch('hospitality', N));
  if (which === 'both' || which === 'manufacturing') summarize('MANUFACTURING (full run, 84mo)', batch('manufacturing', N));
}
