// FACTORY BOT — a player that actually runs a factory.
//
// The existing behaviour bot exercises six handlers: choice events, fundraise, invest, rest,
// recruit, operate. It touches NONE of the Manufacturing economy — no products, no supplier
// contracts, no sales contracts, no stances, no spot market, no chain tiers, no byproduct policy.
// Every balance figure reported for Manufacturing has therefore been measuring a company that
// never manufactures anything: it fundraises and completes projects until the clock runs out.
//
// This bot runs the actual economy, across several distinct PLAY STYLES, on EVERY starting
// business, and reports what broke rather than only who won. Its job is to find bugs and dead
// ends first, and to produce trustworthy balance data second.
//
// Direction: de-emphasise the original five actions. They were built for the game's first pass
// and are now the least interesting thing a player does; here they are a fallback, not a plan.
global.window = global;
const { makeMemoryStorage } = require('./memory_storage_stub.cjs');
window.storage = makeMemoryStorage();
require('./build/harness.cjs');

const stageOf = window.__stageOf;
const getIndustry = window.__getIndustry2;

// ============================================================ play styles
// Each style is a genuinely different company, not a difficulty slider. They disagree about what
// to spend AP on, how much stock to carry, which contracts to sign, and when to integrate — so
// they stress different parts of the economy and surface different failures.
const STYLES = {
  operator: {
    id: 'operator', label: 'Operator — production first',
    productionStance: 'balanced', salesStance: 'sellAll',
    wantsTiers: 0.4, contractAppetite: 0.5, spotTrades: false,
    projectTags: ['Tooling', 'Line', 'Plant', 'Quality'],
    launchType: 'b2b',
  },
  contractor: {
    id: 'contractor', label: 'Contractor — guaranteed volume',
    productionStance: 'balanced', salesStance: 'sellAll',
    wantsTiers: 0.2, contractAppetite: 1.0, spotTrades: false,
    projectTags: ['Channel', 'Quality', 'Line'],
    launchType: 'b2b',
  },
  speculator: {
    id: 'speculator', label: 'Speculator — plays the market',
    productionStance: 'buildToStock', salesStance: 'holdForPrice',
    wantsTiers: 0.2, contractAppetite: 0.1, spotTrades: true,
    projectTags: ['Line', 'Plant', 'Capital'],
    launchType: 'b2c',
  },
  integrator: {
    id: 'integrator', label: 'Integrator — owns the chain',
    productionStance: 'balanced', salesStance: 'sellAll',
    wantsTiers: 1.0, contractAppetite: 0.4, spotTrades: false,
    projectTags: ['Sourcing', 'Logistics', 'Plant'],
    launchType: 'b2b',
  },
  lean: {
    id: 'lean', label: 'Lean — cash over inventory',
    productionStance: 'buildToOrder', salesStance: 'sellAll',
    wantsTiers: 0.1, contractAppetite: 0.6, spotTrades: false,
    projectTags: ['Capital', 'Channel', 'Team'],
    launchType: 'b2b',
  },
  generalist: {
    id: 'generalist', label: 'Generalist — baseline',
    productionStance: 'balanced', salesStance: 'sellAll',
    wantsTiers: 0.5, contractAppetite: 0.5, spotTrades: false,
    projectTags: [],
    launchType: 'b2b',
  },
};

// ============================================================ issue reporting
// The point of this bot is to find problems, so anything anomalous is recorded with enough
// context to act on rather than being silently absorbed into a win-rate percentage.
function makeReport() {
  return { issues: [], counts: {} };
}
function flag(report, kind, detail) {
  report.counts[kind] = (report.counts[kind] || 0) + 1;
  if (report.issues.filter(i => i.kind === kind).length < 4) report.issues.push({ kind, detail });
}

// ============================================================ the factory turn
function factoryTurn(H, ind, style, memo, report) {
  for (let guard = 0; guard < 16; guard++) {
    const g = H.getState();
    if (!g || g.gameOver || g.ap < 1) break;
    const before = g.ap;

    // Choice events still have to be answered — they block the turn otherwise.
    if (g.pendingChoice) {
      const os = g.pendingChoice.event.options;
      const traits = new Set((g.team.leaders || []).map(l => l.trait));
      const scored = os.map((o, i) => ({
        i, s: o.traitCheck ? (traits.has(o.traitCheck) ? 100 : 10) : 20 + (g.stats[o.statCheck] || 0) * 8,
      })).sort((a, b) => b.s - a.s);
      H.handleChoiceOption(scored[0].i);
      continue;
    }

    const stage = stageOf(g.month, ind.stages);
    const burnEst = Math.max(1, (g.burnPerMonth || 0) || 6);
    const runway = g.capital / burnEst;

    // ---- 1. PRODUCT: the whole point. Advance and launch before anything else. ----
    const myProduct = memo.productId;
    const inst = (g.products || {})[myProduct];
    const def = window.__PRODUCT_BY_ID[myProduct];
    if (inst && def) {
      if (inst.phase !== 'launched' && inst.phase !== 'retired' && inst.phaseMonthsLeft <= 0) {
        if (inst.phase === 'production') {
          H.handleLaunchProduct(myProduct, style.launchType);
          if (H.getState().products[myProduct].phase === 'launched') { memo.launchedMonth = g.month; continue; }
          // Launch refused with the product sitting ready — that is a real dead end.
          flag(report, 'launch-refused', `${myProduct} stuck in production at month ${g.month}`);
        } else {
          H.handleAdvanceProduct(myProduct, 'standard');
          if (H.getState().ap < before) continue;
          // Refused while ready. Work out WHY, in the order the handler itself checks — being
          // wrong about the cause is worse than not reporting it, since it sends the next
          // session hunting a bug that is not there.
          const prof = window.__companyResourceProfile(g, ind);
          const missCap = window.__missingEquipmentTags(def, prof);
          const missMat = (def.resourceProfile.materials || []).filter(m => !prof.materials.has(m));
          const phaseCost = Math.round(def.materialCost * 3 + def.complexity * 3);
          if (missCap.length || missMat.length) {
            memo.blockedOn = { caps: missCap, mats: missMat, month: g.month };
          } else if (g.capital < phaseCost) {
            // Ordinary poverty, not a content gap. Tracked separately so it does not masquerade
            // as a bug — but still counted, since a business that can NEVER afford its own first
            // phase would be a real balance problem.
            memo.brokeAtPhase = (memo.brokeAtPhase || 0) + 1;
          } else {
            flag(report, 'advance-refused-unexplained',
              `${myProduct} at month ${g.month}: caps ok, mats ok, capital ${Math.round(g.capital)} >= cost ${phaseCost}`);
          }
        }
      }
    }

    // ---- 2. MATERIALS: a line with no input can never produce. ----
    if (def) {
      const prof = window.__companyResourceProfile(g, ind);
      const needed = (def.resourceProfile.materials || []).filter(m => !prof.materials.has(m));
      if (needed.length) {
        const slots = window.__supplierSlotLimit(g);
        const active = Object.values(g.supplierContracts || {}).filter(c => c.active !== false).length;
        if (active < slots) {
          const cands = window.__allAvailableSuppliers(g)
            .filter(sp => needed.includes(sp.material))
            .filter(sp => sp.origin === 'domestic' || window.__internationalSourcingUnlocked(g))
            .sort((a, b) => a.priceIndex - b.priceIndex);
          if (cands.length) {
            H.handleContractSupplier(cands[0].id, 'spot');
            if (H.getState().ap < before) continue;
          } else {
            flag(report, 'no-supplier-for-material', `${myProduct} needs ${needed.join(',')} — none contractable`);
          }
        } else if (active === 0) {
          flag(report, 'no-supplier-slots', `month ${g.month}: needs ${needed.join(',')} but 0 slots`);
        }
      }
    }

    // ---- 3. SALES CONTRACTS: the counterweight to market volatility. ----
    if (style.contractAppetite > 0) {
      const offers = window.__pendingOffers(g, g.month);
      if (offers.length && Math.random() < style.contractAppetite) {
        // Only sign what capacity can actually cover — overcommitting is a real mistake, and a
        // bot that always overcommits would report breach noise instead of real balance data.
        const viable = offers.filter(o => {
          const i2 = (g.products || {})[o.productId];
          const d2 = window.__PRODUCT_BY_ID[o.productId];
          if (!i2 || !d2 || i2.phase !== 'launched') return false;
          const cap = window.__productCapacityContribution(i2, d2, g);
          const owed = window.__contractedUnitsFor(g, o.productId) + o.unitsPerMonth;
          return owed <= cap * 0.9;
        });
        if (viable.length) {
          H.handleAcceptSalesContract(viable[0].id);
          if (H.getState().salesContracts.length > (g.salesContracts || []).length) { memo.signedContracts++; continue; }
        }
      }
      // Go looking for buyers once the research is done.
      if (window.__canSolicitContracts(g) && inst && inst.phase === 'launched'
          && g.presence >= 2 && Math.random() < style.contractAppetite * 0.5) {
        H.handleSolicitContract(myProduct);
        if (H.getState().ap < before) continue;
      }
    }

    // ---- 4. SUPPLY CHAIN TIERS ----
    if (Math.random() < style.wantsTiers) {
      const tiers = Object.values(window.__CHAIN_TIERS)
        .filter(t => !t.alwaysOwned && !t.deferred)
        .filter(t => window.__tierBuildable(g, t.id).open)
        .filter(t => g.capital - t.buildCost > burnEst * 10)
        .sort((a, b) => a.buildCost - b.buildCost);
      if (tiers.length && g.ap >= 2) {
        H.handleBuildTier(tiers[0].id, true);
        if (H.getState().ap < before) { memo.tiersBought++; continue; }
      }
    }

    // ---- 5. SPOT MARKET (speculators only) ----
    if (style.spotTrades && inst && inst.phase === 'launched' && g.market) {
      const cell = g.market[myProduct];
      const base = window.__ECONOMY[myProduct] ? window.__ECONOMY[myProduct].basePrice : null;
      if (cell && base) {
        const held = window.__totalStock(inst);
        // Sell into a spike; the stance already holds stock back the rest of the time.
        if (cell.price > base * 1.3 && held > 20) {
          H.handleSpotSell(myProduct, Math.round(held * 0.5));
          memo.spotSells++;
        }
      }
    }

    // ---- 6. PROJECTS, filtered to what this style actually cares about ----
    const so = ind.stageOrder;
    const affordable = ind.content.projects.filter(p => {
      if (g.completed[p.id] || g.activeProjects.some(a => a.id === p.id)) return false;
      if (!p.requires.every(r => g.completed[r])) return false;
      if (p.minStage && so.indexOf(stage.id) < so.indexOf(p.minStage)) return false;
      const sc = window.__scaledProjectCost(p, stage.id, g.team.style, ind.scaling);
      if (sc.capital > g.capital || sc.presence > g.presence) return false;
      if ((p.labor || 0) > (g.laborPool - g.laborReserved)) return false;
      if (g.capital - sc.capital < burnEst * 6) return false;
      return true;
    });
    if (affordable.length) {
      const scored = affordable.map(p => {
        let s = 1;
        // Style preference dominates: this is what makes an Integrator's factory look different
        // from a Contractor's rather than both converging on the same optimal build.
        if (style.projectTags.includes(p.tag)) s += 12;
        // Everyone wants the contract research once they have something to sell.
        if (p.id === 'mfgSourceBuyers' && style.contractAppetite > 0.3) s += 20;
        const oc = p.onComplete || {};
        s += (oc.capacity || 0) * 0.4 + (oc.demand || 0) * 0.4
          + Object.values(oc.statBonus || {}).reduce((a, b) => a + b, 0) * 2;
        const sc = window.__scaledProjectCost(p, stage.id, g.team.style, ind.scaling);
        return { p, s: s / Math.max(1, sc.capital * 0.15 + sc.duration) };
      }).sort((a, b) => b.s - a.s);
      H.handleInvest(scored[0].p.id);
      if (H.getState().ap < before) continue;
    }

    // ---- 7. FUNDING: only when actually needed, not as a default move ----
    if (runway < 10 && memo.fundedMonth !== g.month) {
      const insts = window.__instrumentsForStage(ind, stage.id)
        .filter(i => !(g.closedInstruments || []).includes(i.id))
        .filter(i => (i.cost.presence || 0) <= g.presence);
      if (insts.length) {
        insts.sort((a, b) => (b.capital[1] + b.capital[0]) - (a.capital[1] + a.capital[0]));
        H.handleFundingInstrument(insts[0].id);
        if (H.getState().ap < before) { memo.fundedMonth = g.month; continue; }
      }
      H.handleFundraise();
      if (H.getState().ap < before) { memo.fundedMonth = g.month; continue; }
    }

    // ---- 8. THE OLD FIVE, deliberately last: a fallback, not a plan ----
    const g2 = H.getState();
    if (g2.morale < 40) { H.handleRestCulture(); if (H.getState().ap < before) continue; }
    if ((g2.laborPool - g2.laborReserved) < 2) { H.handleRecruit(); if (H.getState().ap < before) continue; }
    if (g2.team.leaders && g2.team.leaders.length) {
      H.handleOperate(g2.team.leaders[0].id);
      if (H.getState().ap < before) continue;
    }
    break;
  }
}

// ============================================================ a single run
function runFactory(businessId, styleId, report) {
  const ind = getIndustry('manufacturing');
  const style = STYLES[styleId];
  const business = window.__STARTING_BUSINESS_BY_ID[businessId];
  const leaders = [...ind.content.leaders].sort(() => Math.random() - 0.5).slice(0, 3);
  const team = window.__buildTeam(leaders);
  const H = window.__makeHandlers('en', []);
  H.setState(window.__initialState(team, 'en', {
    ...window.__getScenario('fullRun'), industryId: 'manufacturing',
    endMonth: ind.runEnd, startingProductId: business.entityId,
  }, []));

  const memo = { productId: business.entityId, fundedMonth: -1, signedContracts: 0,
    tiersBought: 0, spotSells: 0, launchedMonth: null, blockedOn: null, stanceSet: false };

  let months = 0;
  while (months < ind.runEnd) {
    const g = H.getState();
    if (!g || g.gameOver) break;

    // Set stances once, on the launch turn — a standing policy, exactly as a player would.
    const li = (g.products || {})[memo.productId];
    if (li && li.phase === 'launched' && !memo.stanceSet) {
      H.handleSetProductionStance(memo.productId, style.productionStance);
      if (style.salesStance === 'holdForPrice') {
        const d = window.__PRODUCT_BY_ID[memo.productId];
        H.handleSetSalesStance(memo.productId, 'holdForPrice', Math.round(d.priceCeiling * 0.8));
      }
      // Sell scrap by default rather than paying to dispose of it.
      const d2 = window.__PRODUCT_BY_ID[memo.productId];
      if (d2 && d2.byproduct) H.handleSetByproductPolicy(d2.byproduct.id, 'sell');
      memo.stanceSet = true;
    }

    factoryTurn(H, ind, style, memo, report);
    H.endMonth();
    months++;

    // Try to exit once eligible.
    const g3 = H.getState();
    if (g3 && !g3.gameOver && stageOf(g3.month, ind.stages).id === 'exit') {
      const exits = ind.content.exits.filter(e => window.__exitEligible ? window.__exitEligible(g3, e) : false);
      if (exits.length) { H.handleAttemptExit(exits[exits.length - 1].id); }
    }
  }

  const end = H.getState();
  const launched = !!memo.launchedMonth;
  // ---- anomaly detection: the actual point of this bot ----
  if (!launched && (memo.brokeAtPhase || 0) > 6) {
    flag(report, 'never-afforded-development',
      `${businessId}/${styleId}: could not afford a phase advance on ${memo.brokeAtPhase} occasions`);
  }
  if (!launched) {
    flag(report, 'never-launched',
      `${businessId}/${styleId}: never reached launch${memo.blockedOn ? ` — blocked on caps[${memo.blockedOn.caps}] mats[${memo.blockedOn.mats}]` : ''}`);
  }
  if (launched && (end.revenuePerMonth || 0) === 0 && !end.gameOver) {
    flag(report, 'launched-but-zero-revenue', `${businessId}/${styleId}: launched month ${memo.launchedMonth}, still 0 revenue at end`);
  }
  if (launched && window.__totalStock((end.products || {})[memo.productId] || {}) > 5000) {
    flag(report, 'runaway-stock', `${businessId}/${styleId}: ${Math.round(window.__totalStock(end.products[memo.productId]))} units held`);
  }

  return {
    businessId, styleId,
    survived: !end.gameOver,
    won: !!(end.gameOver && end.gameOver.win),
    endMonth: end.month,
    endReason: end.gameOver ? (end.gameOver.reason || end.gameOver.kind || 'over') : 'clock',
    launchedMonth: memo.launchedMonth,
    revenue: Math.round(end.revenuePerMonth || 0),
    capital: Math.round(end.capital),
    contracts: memo.signedContracts,
    tiers: memo.tiersBought,
    stock: Math.round(window.__totalStock((end.products || {})[memo.productId] || {})),
    blockedOn: memo.blockedOn,
  };
}

// ============================================================ harness
function runAll(perCombo) {
  const report = makeReport();
  const businesses = window.__STARTING_BUSINESSES.map(b => b.id);
  const styles = Object.keys(STYLES);
  const results = [];
  businesses.forEach(b => {
    styles.forEach(st => {
      for (let n = 0; n < perCombo; n++) results.push(runFactory(b, st, report));
    });
  });
  return { results, report, businesses, styles };
}

function summarize({ results, report, businesses, styles }) {
  const pct = (n, d) => d ? `${Math.round(n / d * 100)}%` : '—';
  console.log('\n' + '='.repeat(74));
  console.log('FACTORY BOT — every starting business x every play style');
  console.log('='.repeat(74));

  console.log('\nLAUNCH RATE BY BUSINESS  (did the line ever start producing?)');
  businesses.forEach(b => {
    const rs = results.filter(r => r.businessId === b);
    const launched = rs.filter(r => r.launchedMonth).length;
    const med = rs.filter(r => r.launchedMonth).map(r => r.launchedMonth).sort((a, b2) => a - b2);
    const mark = launched === 0 ? '  <-- NEVER LAUNCHES' : launched < rs.length * 0.5 ? '  <-- unreliable' : '';
    console.log(`  ${b.padEnd(18)} ${pct(launched, rs.length).padStart(4)}  median launch month ${med.length ? med[Math.floor(med.length / 2)] : '—'}${mark}`);
  });

  console.log('\nOUTCOMES BY STYLE');
  styles.forEach(st => {
    const rs = results.filter(r => r.styleId === st);
    const won = rs.filter(r => r.won).length;
    const survived = rs.filter(r => r.survived).length;
    const avgRev = Math.round(rs.reduce((s, r) => s + r.revenue, 0) / Math.max(1, rs.length));
    const contracts = rs.reduce((s, r) => s + r.contracts, 0);
    const tiers = rs.reduce((s, r) => s + r.tiers, 0);
    console.log(`  ${STYLES[st].label.padEnd(34)} win ${pct(won, rs.length).padStart(4)}  survive ${pct(survived, rs.length).padStart(4)}  avg rev ${String(avgRev).padStart(5)}  contracts ${contracts}  tiers ${tiers}`);
  });

  console.log('\nHOW RUNS END');
  const reasons = {};
  results.forEach(r => { reasons[r.endReason] = (reasons[r.endReason] || 0) + 1; });
  Object.entries(reasons).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k.padEnd(24)} ${String(v).padStart(4)}  ${pct(v, results.length)}`));

  console.log('\n' + '-'.repeat(74));
  console.log('ISSUES FOUND');
  console.log('-'.repeat(74));
  if (!Object.keys(report.counts).length) {
    console.log('  (none)');
  } else {
    Object.entries(report.counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      console.log(`\n  ${k}  x${v}`);
      report.issues.filter(i => i.kind === k).forEach(i => console.log(`     - ${i.detail}`));
    });
  }
  console.log('');
}

if (require.main === module) {
  const per = Number(process.argv[2] || 1);
  summarize(runAll(per));
}
module.exports = { runFactory, runAll, summarize, STYLES };
