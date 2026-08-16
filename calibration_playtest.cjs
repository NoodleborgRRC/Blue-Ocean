// CALIBRATION PLAYTEST — does "65%" actually mean "happens about 65% of the time"?
//
// The in-game forecastRecord tracks aggregate directional hit-rate (did the model call the
// favorite?), which is useful for the run-end line but doesn't answer the harder question: is
// the MODEL ITSELF calibrated? A model that's 100% confident every time and right 50% of the
// time would still score a reasonable-looking hit-rate on lopsided calls while being worthless.
//
// This instruments every forecasted decision across many real bot-driven runs, bins outcomes by
// predicted probability decile, and checks whether the observed success rate in each bin tracks
// the predicted one — the same diagnostic technique behind weather forecasting's "70% chance of
// rain" scoring.
global.window = global;
const { makeMemoryStorage } = require('./memory_storage_stub.cjs');
window.storage = makeMemoryStorage();
require('./build/harness.cjs');

const getIndustry = window.__getIndustry2;
const toLeader = window.__customFounderToLeader;
const emptyFounder = window.__emptyCustomFounder;
const previewChance = window.__previewChance;
const founderFx = window.__founderFx;
const stageOf = window.__stageOf;
const rivalDefenceBonus = window.__rivalDefenceBonus;
const EVENT_THRESHOLD_BONUS_BY_STAGE = window.__EVENT_THRESHOLD_BONUS_BY_STAGE;
const scaledProjectCost = window.__scaledProjectCost;
const instrumentsForStage = window.__instrumentsForStage2;
const investorForInstrument = window.__investorForInstrument;
const rollInvestorRoster = window.__rollInvestorRoster;

function mkF(patch) { return { ...emptyFounder(), name: 'Cal', ...patch }; }

// ---------------------------------------------------------------- instrumented bot
function botTurn(H, ind, opts, samples) {
  for (let guard = 0; guard < 12; guard++) {
    const g = H.getState();
    if (!g || g.gameOver || g.ap < 1) break;
    const fx = founderFx(g);

    if (g.pendingChoice) {
      const os = g.pendingChoice.event.options;
      const traits = new Set((g.team.leaders || []).map(l => l.trait));
      const scored = os.map((o, i) => {
        let s = o.traitCheck ? (traits.has(o.traitCheck) ? 100 : 10) : 20 + (g.stats[o.statCheck] || 0) * 8;
        return { i, s, o };
      }).sort((a, b) => b.s - a.s);
      const pick = scored[0];
      if (!pick.o.traitCheck) {
        const stageId = stageOf(g.pendingChoice.month, ind.stages).id;
        const bar = 10 + (((ind.scaling && ind.scaling.eventThresholdBonus) || EVENT_THRESHOLD_BONUS_BY_STAGE)[stageId] || 0) + fx.choiceThresholdBonus;
        const statTotal = g.stats[pick.o.statCheck] || 0;
        const preview = previewChance('choiceOption', g, { statTotal, bar });
        if (preview) {
          const before = g.log.length;
          H.handleChoiceOption(pick.i);
          const after = H.getState();
          if (after.log.length > before) samples.push({ kind: 'choice', preview, success: after.log[0].tone === 'good' });
          continue;
        }
      }
      H.handleChoiceOption(pick.i);
      continue;
    }

    const stage = stageOf(g.month, ind.stages);
    const burnEst = Math.max(1, 2 + Math.ceil(g.laborPool / 3) + g.activeProjects.length
      + ((ind.scaling.stageBurnBonus || {})[stage.id] || 0));
    const runway = g.capital / burnEst;
    const fundedThisMonth = opts.fundedMonth === g.month;

    const insts = instrumentsForStage(ind, stage.id)
      .filter(i => !(g.closedInstruments || []).includes(i.id))
      .filter(i => (i.cost.presence || 0) <= g.presence && (i.cost.ap || 1) <= g.ap);
    if (!fundedThisMonth && insts.length && (runway < 18 || (g.totalRaised || 0) === 0)) {
      insts.sort((a, b) => (b.capital[1] + b.capital[0]) - (a.capital[1] + a.capital[0]));
      const inst = insts[0];
      const investor = investorForInstrument(g, inst.id, stage.id);
      const preview = previewChance('instrument', g, { instrument: inst, investor });
      const before = g.log.length;
      const beforeAp = g.ap;
      H.handleFundingInstrument(inst.id);
      const after = H.getState();
      if (after.ap < beforeAp) {
        opts.fundedMonth = g.month;
        if (preview && after.log.length > before) samples.push({ kind: 'instrument', preview, success: after.log[0].tone === 'good' });
        continue;
      }
    }
    // Fundraise gets its OWN cadence, decoupled from the instrument flag above — widened
    // deliberately for calibration sampling (a real player economizing AP would not chase both
    // in the same month this often). Runway gate loosened from <12 to <30, which fires across
    // nearly the whole run rather than only when genuinely desperate, so fundraise gets sampled
    // at a much wider range of reputation/board-confidence/stage combinations, not just the
    // narrow "about to go under" slice.
    const fundraiseCooldownOk = opts.lastFundraiseMonth !== g.month;
    if (fundraiseCooldownOk && g.ap > 0 && g.presence >= 1 && runway < 30) {
      const preview = previewChance('fundraise', g, { industry: ind });
      const before = g.log.length;
      const beforeAp = g.ap;
      H.handleFundraise();
      const after = H.getState();
      if (after.ap < beforeAp) {
        opts.lastFundraiseMonth = g.month;
        if (preview && after.log.length > before) samples.push({ kind: 'fundraise', preview, success: after.log[0].tone === 'good' });
        continue;
      }
    }

    const rivals = g.competitors || [];
    if (rivals.length && Math.random() < 0.3 && g.ap > 0) {
      const target = rivals.reduce((a, b) => (b.strength > a.strength ? b : a));
      const actions = (ind.content.externalActions && ind.content.externalActions.length) ? ind.content.externalActions : [];
      const affordable = actions.filter(a => (a.cost.ap || 1) <= g.ap && (a.cost.capital || 0) <= g.capital && (a.cost.presence || 0) <= g.presence);
      if (affordable.length) {
        const a = affordable[0];
        const bar = 10 + (((ind.scaling && ind.scaling.eventThresholdBonus) || EVENT_THRESHOLD_BONUS_BY_STAGE)[stage.id] || 0) + Math.floor(target.strength / 12) + rivalDefenceBonus(target);
        const firstStrike = !((target.encounters || {}).attackedByPlayer) ? fx.firstStrikeBonus : 0;
        const statTotal = (g.stats[a.stat] || 0) + fx.externalRollBonus + firstStrike;
        const preview = previewChance('externalAction', g, { statTotal, bar });
        const before = g.log.length;
        const beforeAp = g.ap;
        H.handleExternalAction(a.id, target.id);
        const after = H.getState();
        if (after.ap < beforeAp) {
          if (preview && after.log.length > before) samples.push({ kind: 'external', preview, success: after.log[0].tone === 'good' });
          continue;
        }
      }
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

function playRun(founderPatch, career, samples) {
  const ind = getIndustry('manufacturing');
  const leader = toLeader(mkF(founderPatch), 'en', career);
  const co = ind.content.leaders[0];
  const team = window.__buildTeam([leader, co]);
  const base = window.__getScenario('fullRun');
  const H = window.__makeHandlers('en', []);
  H.setState({ ...window.__initialState(team, 'en', { ...base, industryId: 'manufacturing', endMonth: ind.runEnd }, []),
    investorRoster: rollInvestorRoster('manufacturing') });
  const opts = {};
  let months = 0;
  while (months < ind.runEnd) {
    if (H.getState().gameOver) break;
    botTurn(H, ind, opts, samples);
    if (H.getState().gameOver) break;
    H.endMonth();
    months++;
  }
  return H.getState().forecastRecord;
}

function bin10(pct) { return Math.min(90, Math.floor(pct / 10) * 10); }

function runBatch(label, founderPatch, career, n) {
  const samples = [];
  const records = [];
  for (let i = 0; i < n; i++) {
    records.push(playRun(founderPatch, career, samples));
  }
  console.log(`\n${'='.repeat(70)}\n${label} — N=${n} runs, ${samples.length} forecasted decisions captured\n${'='.repeat(70)}`);

  const totalCalls = records.reduce((a, r) => a + r.calls, 0);
  const totalCorrect = records.reduce((a, r) => a + r.correct, 0);
  console.log(`Player-felt hit-rate (the in-game line — success is never scored against the model, only a favored call that fails is a miss): ${totalCorrect}/${totalCalls} = ${totalCalls ? (100 * totalCorrect / totalCalls).toFixed(1) : 0}%`);

  const bins = {};
  samples.forEach(s => {
    const pct = s.preview.mode === 'd10' ? s.preview.mid * 10 : s.preview.mid;
    const b = bin10(pct);
    if (!bins[b]) bins[b] = { n: 0, hits: 0 };
    bins[b].n++;
    if (s.success) bins[b].hits++;
  });
  console.log('\nCalibration curve (predicted bucket -> observed success rate):');
  console.log('  bucket     n    observed   |  predicted vs observed');
  Object.keys(bins).map(Number).sort((a, b) => a - b).forEach(b => {
    const stat = bins[b];
    const obs = 100 * stat.hits / stat.n;
    const mid = b + 5;
    const diff = obs - mid;
    const bar = '#'.repeat(Math.round(Math.abs(diff) / 2));
    console.log(`  ${String(b).padStart(3)}-${b + 9}%  ${String(stat.n).padStart(4)}   ${obs.toFixed(1).padStart(6)}%   |  ${mid}% predicted, ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}pp ${bar}`);
  });

  console.log('\nBy action kind (aggregate, then each kind\'s OWN calibration curve):');
  ['choice', 'external', 'fundraise', 'instrument'].forEach(kind => {
    const ks = samples.filter(s => s.kind === kind);
    if (!ks.length) { console.log(`  ${kind.padEnd(11)} 0 samples`); return; }
    const hits = ks.filter(s => s.success).length;
    console.log(`  ${kind.padEnd(11)} n=${ks.length}, ${(100 * hits / ks.length).toFixed(1)}% actually succeeded (aggregate)`);
    const kbins = {};
    ks.forEach(s => {
      const pct = s.preview.mode === 'd10' ? s.preview.mid * 10 : s.preview.mid;
      const b = bin10(pct);
      if (!kbins[b]) kbins[b] = { n: 0, hits: 0 };
      kbins[b].n++;
      if (s.success) kbins[b].hits++;
    });
    Object.keys(kbins).map(Number).sort((a, b) => a - b).forEach(b => {
      const st = kbins[b];
      const obs = 100 * st.hits / st.n;
      console.log(`      ${b}-${b + 9}% predicted (n=${st.n}): ${obs.toFixed(1)}% observed`);
    });
  });

  return { samples, records, bins, totalCalls, totalCorrect };
}

const N = parseInt(process.argv[2] || '60', 10);

// Signature is held CONSTANT between the two batches on purpose. An earlier version compared
// scenarioPlanner (green) against dataDriven (master) and found a large, statistically real gap
// (z~7.7 at N=100) — which turned out to be a confound in the experiment, not a finding about
// forecasting: Data Driven has its own mechanical effect (choiceThresholdBonus: -1, genuinely
// easier choice checks) entirely independent of forecast sharpness. Comparing two different
// signatures mixed "does sharpness change hit-rate" with "is dataDriven's own bonus stronger
// than scenarioPlanner's". Both batches now use dataDriven, varying ONLY career mastery — which
// is the one thing that actually changes forecastHalfWidth — so this isolates sharpness alone.
const sig = 'dataDriven';
const green = runBatch('GREEN Analyst (no mastery)',
  { classId: 'Analyst', signaturePerkId: sig }, {}, N);

const master = runBatch('MASTER Analyst (20 runs / 9 wins mastery, same signature)',
  { classId: 'Analyst', signaturePerkId: sig },
  { byClass: { Analyst: { runs: 20, wins: 9, bestStageFraction: 1 } } }, N);

console.log(`\n${'='.repeat(70)}\nVERDICT\n${'='.repeat(70)}`);
const greenRate = 100 * green.totalCorrect / Math.max(1, green.totalCalls);
const masterRate = 100 * master.totalCorrect / Math.max(1, master.totalCalls);
console.log(`Green player-felt hit-rate:  ${greenRate.toFixed(1)}%  (${green.totalCorrect}/${green.totalCalls})`);
console.log(`Master player-felt hit-rate: ${masterRate.toFixed(1)}% (${master.totalCorrect}/${master.totalCalls})`);
console.log(`Difference: ${(masterRate - greenRate).toFixed(1)}pp`);

// Under the new asymmetric rule, EVERY underdog call (favored < 50%) scores correct regardless
// of outcome — only a favored call that fails is a miss. That means the aggregate rate is driven
// by two things: (1) how often favored calls actually pay off, and (2) what SHARE of all calls
// were underdog calls to begin with, since those are free points under this rule. Reporting the
// mix directly rather than just asserting parity, since the old "sharpness shouldn't move
// hit-rate" claim was written for the strict direction-matching rule and needs re-checking here.
function favoredShare(samples) {
  const favored = samples.filter(s => {
    const pct = s.preview.mode === 'd10' ? s.preview.mid * 10 : s.preview.mid;
    return pct >= 50;
  });
  const favoredHits = favored.filter(s => s.success).length;
  return { total: samples.length, favoredCount: favored.length, favoredHitRate: favored.length ? 100 * favoredHits / favored.length : 0 };
}
const gShare = favoredShare(green.samples);
const mShare = favoredShare(master.samples);
console.log(`\nFavored-call share (the only calls that can score a miss):`);
console.log(`  Green:  ${gShare.favoredCount}/${gShare.total} calls were favored, ${gShare.favoredHitRate.toFixed(1)}% of THOSE paid off`);
console.log(`  Master: ${mShare.favoredCount}/${mShare.total} calls were favored, ${mShare.favoredHitRate.toFixed(1)}% of THOSE paid off`);
console.log(`If the favored share and favored-hit-rate are both close between batches, sharpness`);
console.log(`genuinely doesn't move the player-felt score — any gap traces to one of those two`);
console.log(`numbers instead, not to band width itself.`);

console.log(`\nWhat sharpness DOES reliably buy the player is a narrower band around the same call —`);
console.log(`that's a band-width comparison, not a hit-rate one:`);
function avgWidth(samples) {
  const widths = samples.map(s => s.preview.hi - s.preview.lo);
  return widths.reduce((a, b) => a + b, 0) / Math.max(1, widths.length);
}
console.log(`  Green avg band width:  ${avgWidth(green.samples).toFixed(1)}pp`);
console.log(`  Master avg band width: ${avgWidth(master.samples).toFixed(1)}pp`);
