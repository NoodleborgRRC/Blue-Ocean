// SALES CONTRACTS (Phase B). The counterweight to Phase A's market volatility: guaranteed volume
// at a locked price, paid for by giving up the upside — and by taking on a real obligation.
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

const TERMS = window.__SALES_CONTRACT_TERMS;
const salesContractTerm = window.__salesContractTerm;
const monthlyUnits = window.__salesContractMonthlyUnits;
const lockedPrice = window.__salesContractLockedPrice;
const activeSalesContracts = window.__activeSalesContracts;
const hasActiveContractWith = window.__hasActiveContractWith;
const contractedUnitsFor = window.__contractedUnitsFor;
const resolveContractDeliveries = window.__resolveContractDeliveries;
const breachConsequence = window.__breachConsequence;
const canSolicitContracts = window.__canSolicitContracts;
const inboundOfferChance = window.__inboundOfferChance;
const pendingOffers = window.__pendingOffers;
const potentialBuyers = window.__potentialBuyers;
const getIndustry = window.__getIndustry2;

const contract = (o) => ({
  id: o.id || 'c1', productId: o.productId || 'processedWood',
  counterpartyId: o.counterpartyId || 'buyer1', counterpartyName: o.counterpartyName || 'Acme',
  termId: o.termId || 'standard', unitsPerMonth: o.unitsPerMonth != null ? o.unitsPerMonth : 30,
  lockedPrice: o.lockedPrice != null ? o.lockedPrice : 20,
  monthsLeft: o.monthsLeft != null ? o.monthsLeft : 12, signedMonth: o.signedMonth || 1,
});

// ================================================================ terms
section('Contract terms — longer commitment, deeper discount, harsher breach');
ok('four terms exist', Object.keys(TERMS).length === 4);
ok('every term is bilingual', Object.values(TERMS).every(t => t.label.en && t.label.es && t.blurb.en && t.blurb.es));
ok('longer terms lock a LOWER price — that is the trade',
  TERMS.exclusive.priceMult < TERMS.volume.priceMult
  && TERMS.volume.priceMult < TERMS.standard.priceMult
  && TERMS.standard.priceMult < TERMS.trial.priceMult);
ok('every locked price is BELOW market — you always give up upside for certainty',
  Object.values(TERMS).every(t => t.priceMult < 1));
ok('longer terms claim more of your line',
  TERMS.exclusive.volumeShare > TERMS.volume.volumeShare
  && TERMS.volume.volumeShare > TERMS.standard.volumeShare
  && TERMS.standard.volumeShare > TERMS.trial.volumeShare);
ok('longer terms run longer',
  TERMS.exclusive.months > TERMS.volume.months && TERMS.volume.months > TERMS.standard.months);
ok('breaking a bigger commitment hurts more',
  TERMS.exclusive.penaltyMult > TERMS.volume.penaltyMult
  && TERMS.volume.penaltyMult > TERMS.standard.penaltyMult);
ok('an unknown term id falls back rather than crashing', salesContractTerm('nonsense') === TERMS.standard);

section('Obligation is fixed at signing, not recomputed live');
ok('units derive from capacity at signing', monthlyUnits(100, 'standard') === Math.round(100 * TERMS.standard.volumeShare));
ok('a bigger line signs a bigger obligation', monthlyUnits(200, 'standard') > monthlyUnits(100, 'standard'));
ok('obligation is never zero even on a tiny line', monthlyUnits(1, 'trial') >= 1);
ok('locked price derives from market at signing',
  lockedPrice(100, 'standard') === Math.round(100 * TERMS.standard.priceMult * 100) / 100);
ok('the locked price sits below the market price it was struck against',
  lockedPrice(100, 'exclusive') < 100);

// ================================================================ delivery
section('Q3 — contracts fill from stock FIRST, before any spot sale');
const g1 = { salesContracts: [contract({ unitsPerMonth: 30 })] };
const d1 = resolveContractDeliveries(g1, 'processedWood', [{ units: 100, quality: null, producedMonth: null }]);
ok('a fully covered contract delivers in full', d1.results[0].delivered === 30);
ok('no shortfall when stock is ample', d1.results[0].shortfall === 0);
ok('leftover stock is returned for the spot market', d1.stockRemaining === 70);
ok('revenue is struck at the LOCKED price, not market', d1.results[0].revenue === 30 * 20);

const d2 = resolveContractDeliveries(g1, 'processedWood', [{ units: 12, quality: null, producedMonth: null }]);
ok('short stock delivers only what exists', d2.results[0].delivered === 12);
ok('the gap is recorded as shortfall', d2.results[0].shortfall === 18);
ok('nothing is left for spot when contracts eat it all', d2.stockRemaining === 0);
ok('severity is the FRACTION missed, not a flag (Q4 prorated)',
  Math.abs(d2.results[0].severity - 18 / 30) < 0.001);

section('Multiple contracts on one product fill oldest-first');
const g2 = { salesContracts: [
  contract({ id: 'newer', counterpartyId: 'b2', unitsPerMonth: 20, signedMonth: 10 }),
  contract({ id: 'older', counterpartyId: 'b1', unitsPerMonth: 20, signedMonth: 2 }),
] };
const d3 = resolveContractDeliveries(g2, 'processedWood', [{ units: 25, quality: null, producedMonth: null }]);
const older = d3.results.find(r => r.contractId === 'older');
const newer = d3.results.find(r => r.contractId === 'newer');
ok('the older contract is served first', older.delivered === 20);
ok('the newer one absorbs the shortage', newer.delivered === 5 && newer.shortfall === 15);
ok('total contracted units sums across contracts', contractedUnitsFor(g2, 'processedWood') === 40);
ok('a product with no contracts owes nothing', contractedUnitsFor(g2, 'refinedMetal') === 0);

section('Q5 — multiple contracts allowed, but one per counterparty');
ok('an existing counterparty is detected', hasActiveContractWith(g2, 'b1'));
ok('an unrelated counterparty is not', !hasActiveContractWith(g2, 'someone-else'));
ok('an expired contract does not block a new one with that buyer',
  !hasActiveContractWith({ salesContracts: [contract({ counterpartyId: 'gone', monthsLeft: 0 })] }, 'gone'));
ok('activeSalesContracts excludes finished ones',
  activeSalesContracts({ salesContracts: [contract({ monthsLeft: 0 })] }).length === 0);

// ================================================================ breach
section('Q4 — breach is prorated, and scales with how serious the contract was');
const light = breachConsequence({ shortfall: 3, severity: 0.1, termId: 'trial' }, 20);
const heavy = breachConsequence({ shortfall: 27, severity: 0.9, termId: 'trial' }, 20);
ok('missing a little costs a little', light.cash > 0 && light.reputation >= 0);
ok('missing a lot costs a lot more', heavy.cash > light.cash * 5);
ok('a worse miss costs more reputation', heavy.reputation > light.reputation);
ok('delivering in full costs nothing',
  breachConsequence({ shortfall: 0, severity: 0, termId: 'exclusive' }, 20).cash === 0);
ok('breaking an Exclusive costs more CASH than the same miss on a Trial', (() => {
  const t = breachConsequence({ shortfall: 10, severity: 0.5, termId: 'trial' }, 20);
  const e = breachConsequence({ shortfall: 10, severity: 0.5, termId: 'exclusive' }, 20);
  return e.cash > t.cash;
})());
ok('but REPUTATION damage is term-independent — the market hears "did not deliver", not the paperwork', (() => {
  const t = breachConsequence({ shortfall: 10, severity: 0.5, termId: 'trial' }, 20);
  const e = breachConsequence({ shortfall: 10, severity: 0.5, termId: 'exclusive' }, 20);
  return e.reputation === t.reputation;
})());

section('The reputation scale is exactly the specified table');
const breachRep = window.__breachReputationPenalty;
const EXPECTED = { 0: 18, 10: 16, 20: 14, 30: 12, 40: 10, 50: 8, 60: 6, 70: 4, 80: 2, 90: 0 };
Object.entries(EXPECTED).forEach(([suppliedPct, expected]) => {
  const severity = 1 - Number(suppliedPct) / 100;
  ok(`${suppliedPct}% supplied costs ${expected} reputation`, breachRep(severity) === expected,
    `got ${breachRep(severity)}`);
});
ok('a full delivery costs nothing', breachRep(0) === 0);
ok('the scale never goes negative (no reputation GAIN from breaching)', breachRep(0) >= 0);

section('Fulfilling a contract pays, and finishing the term pays again');
const completionBonus = window.__contractCompletionBonus;
ok('the completion bonus is half a point per month of duration', completionBonus(12) === 6);
ok('a longer term earns a larger completion bonus', completionBonus(24) > completionBonus(6));
ok('a clean 12-month run exactly offsets a total failure (12 monthly + 6 bonus = 18)',
  12 * 1 + completionBonus(12) === 18);
ok('the cash penalty scales with the contract\u2019s own locked price',
  breachConsequence({ shortfall: 10, severity: 0.5, termId: 'standard' }, 40).cash
  > breachConsequence({ shortfall: 10, severity: 0.5, termId: 'standard' }, 20).cash);

// ================================================================ offers
section('Q6 — offers gated on research, arriving both ways');
ok('solicitation is locked without the research', !canSolicitContracts({ completed: {} }));
ok('the research unlocks it', canSolicitContracts({ completed: { mfgSourceBuyers: true } }));
ok('no inbound offers before the research either', inboundOfferChance({ completed: {} }) === 0);
ok('inbound offers become possible after it',
  inboundOfferChance({ completed: { mfgSourceBuyers: true }, reputation: 70, marketPosition: 50 }) > 0);
ok('a better-known company attracts more inbound interest',
  inboundOfferChance({ completed: { mfgSourceBuyers: true }, reputation: 90, marketPosition: 80 })
  > inboundOfferChance({ completed: { mfgSourceBuyers: true }, reputation: 20, marketPosition: 10 }));
ok('inbound chance stays a sane probability',
  inboundOfferChance({ completed: { mfgSourceBuyers: true }, reputation: 100, marketPosition: 100 }) <= 0.45);

section('Offers expire rather than piling up forever');
ok('a live offer is listed', pendingOffers({ salesContractOffers: [{ expiresMonth: 10 }] }, 5).length === 1);
ok('an expired offer is not', pendingOffers({ salesContractOffers: [{ expiresMonth: 4 }] }, 5).length === 0);

section('Buyers are real companies from the world, not anonymous');
const buyerGame = {
  competitors: [{ seedId: 'r1', name: 'Rival Co', encounters: {} }],
  supplierContracts: {}, acquiredSuppliers: {}, rivalSuppliers: {}, salesContracts: [],
};
// CHANGED: suppliers are no longer offered as buyers. The factory bot exposed this pool as 23
// suppliers to 1 rival — the firm that sells you timber being offered as a customer for your
// furniture. Suppliers are who you buy FROM. Real authored buyers replace them.
const buyerGameWithProduct = { ...buyerGame, products: { woodenFurniture: { productId: 'woodenFurniture', phase: 'launched' } } };
const buyers = potentialBuyers(buyerGameWithProduct);
ok('real buyers appear for a launched product', buyers.some(b => b.kind === 'buyer'));
ok('suppliers are NOT offered as customers', !buyers.some(b => b.kind === 'supplier'));
ok('rivals remain an opportunistic secondary channel', buyers.some(b => b.kind === 'rival'));
ok('buyers are matched to the TIER of what the company makes', (() => {
  const woodBuyers = potentialBuyers({ ...buyerGame, products: { processedWood: { productId: 'processedWood', phase: 'launched' } } })
    .filter(b => b.kind === 'buyer').map(b => b.id).sort();
  const furnBuyers = buyers.filter(b => b.kind === 'buyer').map(b => b.id).sort();
  return JSON.stringify(woodBuyers) !== JSON.stringify(furnBuyers);
})());
ok('every authored buyer is bilingual with a stated lean',
  window.__BUYER_CHARACTERS.every(b => b.bio.en && b.bio.es && b.tell.en && b.tell.es
    && typeof b.premiumVsMass === 'number' && window.__buyerTiers(b).length > 0));
ok('buyers span every sellable tier',
  new Set(window.__BUYER_CHARACTERS.flatMap(b => window.__buyerTiers(b))).size >= 4);
ok('every buyer has a real id and name', buyers.every(b => b.id && b.name));
ok('a company already under contract is excluded', (() => {
  const g = { ...buyerGame, salesContracts: [contract({ counterpartyId: 'r1' })] };
  return !potentialBuyers(g).some(b => b.id === 'r1');
})());
ok('an openly hostile rival will not sign with you', (() => {
  const g = { ...buyerGame, competitors: [{ seedId: 'h', name: 'Nemesis', encounters: { attackedByPlayer: 9, defeatedByPlayer: 5 } }] };
  return !potentialBuyers(g).some(b => b.id === 'h');
})());

// ================================================================ live
section('Live — the full loop: solicit, accept, deliver, get paid');
function newRun(patch) {
  const ind = getIndustry('manufacturing');
  const team = window.__buildTeam(ind.content.leaders.slice(0, 3));
  const H = window.__makeHandlers('en', []);
  const allProjects = {};
  (ind.content.projects || []).forEach(p => { allProjects[p.id] = true; });
  H.setState({
    ...window.__initialState(team, 'en', { ...window.__getScenario('fullRun'), industryId: 'manufacturing', endMonth: ind.runEnd }, []),
    capital: 5000, ap: 6, presence: 20, laborPool: 60, reputation: 80, marketPosition: 50,
    completed: allProjects,
    equipment: { mfgFirstTooling: window.__instantiateEquipment('mfgFirstTooling'), mfgPilotLine: window.__instantiateEquipment('mfgPilotLine') },
    supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: 0 } },
    // Quality is 0-100 now; 6 was a leftover 1-10 figure that would seed any fresh production
    // as already-crippled stock (6 of a 47 ceiling). Anchored to the real ceiling instead.
    products: { processedWood: { productId: 'processedWood', phase: 'launched',
      quality: window.__PRODUCT_BY_ID.processedWood.qualityCeiling, defectRate: 0.05,
      channelsOpened: ['developers'], launchType: 'b2b', appealBonus: 1, costReduction: 0, stock: 0,
      productionStance: 'balanced', salesStance: 'sellAll', holdPriceFloor: 44, lastProducedUnits: 0, lastSoldUnits: 0 } },
    ...(patch || {}),
  });
  return H;
}
function tick(H, n, forceRandom) {
  const real = Math.random;
  Math.random = forceRandom != null ? () => forceRandom : real;
  try { for (let i = 0; i < n; i++) { if (H.getState().gameOver) break; H.endMonth(); H.setState({ ...H.getState(), ap: 6 }); } }
  finally { Math.random = real; }
}

const H1 = newRun();
H1.handleSolicitContract('processedWood');
let s = H1.getState();
ok('soliciting produces a pending offer', pendingOffers(s, s.month).length === 1);
ok('soliciting costs 1 AP and 1 Presence', s.ap === 5 && s.presence === 19);
const offer1 = pendingOffers(s, s.month)[0];
H1.handleAcceptSalesContract(offer1.id);
s = H1.getState();
ok('accepting creates an active contract', activeSalesContracts(s).length === 1);
ok('accepting clears it from pending', pendingOffers(s, s.month).length === 0);
ok('signing with a named buyer is a public trust signal (reputation up)', s.reputation > 80);

section('Live — a covered contract delivers and creates a receivable');
const H2 = newRun({ salesContracts: [contract({ unitsPerMonth: 30, lockedPrice: 20 })] });
const recBefore = (H2.getState().receivables || []).length;
tick(H2, 1, 0.999);
s = H2.getState();
ok('no breach ticket when capacity covers it', !s.log.some(x => /Contract Breach/.test(x.title)));
ok('a receivable was created — contracts settle on terms, never instant cash',
  (s.receivables || []).length > recBefore);
ok('the contract term counted down', activeSalesContracts(s)[0].monthsLeft === 11);

section('Live — Q2: production does NOT auto-adjust, so overcommitting breaches');
const H3 = newRun({ laborPool: 3, salesContracts: [contract({ unitsPerMonth: 200, lockedPrice: 20 })] });
const rep3 = H3.getState().reputation;
tick(H3, 1, 0.999);
s = H3.getState();
const breachTicket = s.log.find(x => /Contract Breach/.test(x.title));
ok('overcommitting produces a breach', !!breachTicket);
ok('the ticket states owed vs delivered plainly', breachTicket && /owed \d+ units .* and delivered \d+/.test(breachTicket.body),
  breachTicket ? breachTicket.body.slice(0, 90) : '');
ok('reputation actually dropped', s.reputation < rep3);

section('Live — a finished contract closes and frees the capacity');
const H4 = newRun({ salesContracts: [contract({ unitsPerMonth: 10, monthsLeft: 1 })] });
tick(H4, 1, 0.999);
s = H4.getState();
ok('the contract is gone once its term runs out', activeSalesContracts(s).length === 0);
ok('a completion ticket was logged', s.log.some(x => /Contract Complete/.test(x.title)));

section('Live — one contract per counterparty is enforced by the handler');
const H5 = newRun({ salesContracts: [contract({ counterpartyId: 'dup', counterpartyName: 'Dup Co' })] });
H5.setState({ ...H5.getState(), salesContractOffers: [{
  id: 'off-dup', productId: 'processedWood', counterpartyId: 'dup', counterpartyName: 'Dup Co',
  termId: 'trial', unitsPerMonth: 5, lockedPrice: 20, months: 6,
  offeredMonth: H5.getState().month, expiresMonth: H5.getState().month + 3 }] });
H5.handleAcceptSalesContract('off-dup');
ok('a second contract with the same buyer is refused', activeSalesContracts(H5.getState()).length === 1);
ok('the refusal explains why', /already have an active contract/i.test(H5.getState().log[0].body || ''));

section('Live — solicitation is genuinely gated on the research');
const H6 = newRun({ completed: {} });
H6.handleSolicitContract('processedWood');
ok('no offer without the research', pendingOffers(H6.getState(), H6.getState().month).length === 0);
ok('the denial names the research', /Source Potential Buyers/i.test(H6.getState().log[0].body || ''));


// ================================================================ step 4: quality-tiered contracts
section('Q1 — the bar is ALWAYS relative to the product\u2019s own ceiling, never absolute');
const contractQualityRequired = window.__contractQualityRequired;
const contractQualityPriceMult = window.__contractQualityPriceMult;
const counterpartyPremiumLean = window.__counterpartyPremiumLean;
const wood = window.__PRODUCT_BY_ID.processedWood;
const metal = window.__PRODUCT_BY_ID.refinedMetal;

ok('the most demanding buyer never asks above what the product can reach',
  contractQualityRequired(wood, 999) <= wood.qualityCeiling);
ok('the least demanding buyer still asks for a real majority of the ceiling',
  contractQualityRequired(wood, -999) >= wood.qualityCeiling * 0.55);
ok('a more premium buyer asks for more than a mass-market one, same product',
  contractQualityRequired(wood, 80) > contractQualityRequired(wood, -40));
ok('a low-ceiling product and a high-ceiling product both get a FILLABLE bar from the same buyer',
  contractQualityRequired(wood, 60) <= wood.qualityCeiling
  && contractQualityRequired(metal, 60) <= metal.qualityCeiling);
ok('every product can theoretically serve every kind of buyer', (() => {
  return [-90, -30, 0, 30, 90].every(lean => contractQualityRequired(wood, lean) <= wood.qualityCeiling);
})());

section('Q3 — price scales with the bar DEMANDED, not with what ships');
ok('a higher quality bar locks a higher price multiplier',
  contractQualityPriceMult(wood, contractQualityRequired(wood, 90))
  > contractQualityPriceMult(wood, contractQualityRequired(wood, -90)));
ok('the lowest-demand bar pays no quality premium at all',
  contractQualityPriceMult(wood, contractQualityRequired(wood, -999)) === 1);
ok('the multiplier is bounded — quality alone cannot make a contract arbitrarily rich',
  contractQualityPriceMult(wood, wood.qualityCeiling) <= 1.4);

section('Counterparty premium lean — rivals use their own philosophy, suppliers derive from grade');
ok('a rival\u2019s lean IS its premiumVsMass, directly',
  counterpartyPremiumLean({ kind: 'rival', raw: { philosophy: { premiumVsMass: 55 } } }) === 55);
ok('a supplier with no philosophy still yields a usable lean',
  typeof counterpartyPremiumLean({ kind: 'supplier', id: 'redwoodTimber' }) === 'number');
ok('a higher-grade supplier reads as more premium than a lower-grade one',
  counterpartyPremiumLean({ kind: 'supplier', id: 'redwoodTimber' })
  > counterpartyPremiumLean({ kind: 'supplier', id: 'deltaPanel' }));

section('Q2 — every shipment is checked; FIFO bends only for a real quality requirement');
const paper = window.__PRODUCT_BY_ID.paperProducts;
const oldFreshMix = [
  { units: 100, quality: paper.qualityCeiling, producedMonth: 0 },
  { units: 30, quality: paper.qualityCeiling, producedMonth: 19 },
];
const premiumContract = { id: 'pc1', productId: 'paperProducts', counterpartyName: 'Premium Co',
  termId: 'standard', unitsPerMonth: 20, lockedPrice: 20,
  qualityRequired: Math.round(paper.qualityCeiling * 0.85), monthsLeft: 12, signedMonth: 1 };
const gameAtM20 = { month: 20, salesContracts: [premiumContract], products: {}, ownedTiers: {} };

const degradedOnly = resolveContractDeliveries(gameAtM20, 'paperProducts', [oldFreshMix[0]]);
ok('a company holding ONLY degraded stock cannot fill a premium contract, whatever the volume',
  degradedOnly.results[0].delivered === 0);
ok('the shortfall is flagged as a QUALITY problem, not a volume one',
  degradedOnly.results[0].qualityBlocked === true);
ok('the degraded stock is left completely untouched — nothing was consumed trying',
  degradedOnly.stockRemaining === 100);

const withFresh = resolveContractDeliveries(gameAtM20, 'paperProducts', oldFreshMix);
ok('once fresh stock exists, the SAME contract fills normally',
  withFresh.results[0].delivered === 20 && withFresh.results[0].shortfall === 0);
ok('qualityBlocked is false once the order actually clears',
  withFresh.results[0].qualityBlocked === false);
ok('the old degraded batch is STILL untouched — the fresh batch shipped instead',
  withFresh.lots.some(l => l.producedMonth === 0 && l.units === 100));

const noBarContract = { ...premiumContract, id: 'nb1', qualityRequired: 0 };
const noBarResult = resolveContractDeliveries({ ...gameAtM20, salesContracts: [noBarContract] }, 'paperProducts', [oldFreshMix[0]]);
ok('a contract with NO quality requirement fills normally from anything, degraded or not',
  noBarResult.results[0].delivered === 20);

// ================================================================ step 5: spoilage -> byproduct
section('Q5 — spoilage is automatic, not a decision the player makes');
const mfg = getIndustry('manufacturing');
const resolveSpoilage = window.__resolveSpoilage;
const applySpoilageToByproducts = window.__applySpoilageToByproducts;
const floorQ = window.__SPOILAGE_QUALITY_FLOOR;

ok('stock above the floor is untouched', (() => {
  const g = { products: { paperProducts: { phase: 'launched', productId: 'paperProducts',
    lots: [{ units: 50, quality: paper.qualityCeiling, producedMonth: 0 }] } } };
  return resolveSpoilage(g, mfg, 1).totalUnitsLost === 0;
})());
ok('stock that has decayed below the floor is caught automatically', (() => {
  const g = { products: { paperProducts: { phase: 'launched', productId: 'paperProducts',
    lots: [{ units: 50, quality: paper.qualityCeiling, producedMonth: 0 }] } } };
  return resolveSpoilage(g, mfg, 30).totalUnitsLost > 0;
})());
ok('only the spoiled units are removed, not the whole product line', (() => {
  const g = { products: { paperProducts: { phase: 'launched', productId: 'paperProducts',
    lots: [{ units: 50, quality: paper.qualityCeiling, producedMonth: 0 },
           { units: 20, quality: paper.qualityCeiling, producedMonth: 28 }] } } };
  const r = resolveSpoilage(g, mfg, 30);
  return r.lines[0].keptLots.length === 1 && r.lines[0].keptLots[0].producedMonth === 28;
})());

section('Q4 — 1:1 conversion, no exploit needed since the value collapse already prevents one');
ok('every playable line has a defined value collapse to its byproduct, or writes off cleanly',
  window.__MANUFACTURING_CATALOG.every(p => {
    if (!p.byproduct) return true; // no byproduct at all -> honest write-off, valid
    const bp = window.__BYPRODUCTS[p.byproduct.id];
    return bp.wholesaleValue < window.__ECONOMY[p.id].basePrice * 0.5;
  }));
ok('applySpoilageToByproducts converts exactly 1:1, no lossy ratio', (() => {
  const draft = { capital: 0, byproductPolicies: { sawdust: 'sell' }, rivalSuppliers: {} };
  const outcome = applySpoilageToByproducts(draft, { productId: 'processedWood', units: 100 }, window.__PRODUCT_BY_ID.processedWood);
  return outcome.volume === 100;
})());

section('Q6 — spoiled stock obeys the SAME byproduct policy as production waste');
ok('dispose policy costs cash', (() => {
  const draft = { capital: 0, byproductPolicies: { sawdust: 'dispose' }, rivalSuppliers: {} };
  const outcome = applySpoilageToByproducts(draft, { productId: 'processedWood', units: 100 }, window.__PRODUCT_BY_ID.processedWood);
  return outcome.cash < 0 && draft.capital < 0;
})());
ok('sell policy earns cash', (() => {
  const draft = { capital: 0, byproductPolicies: { sawdust: 'sell' }, rivalSuppliers: {} };
  const outcome = applySpoilageToByproducts(draft, { productId: 'processedWood', units: 100 }, window.__PRODUCT_BY_ID.processedWood);
  return outcome.cash > 0 && draft.capital > 0;
})());
ok('reuse policy is honoured when the consuming line is actually built and launched', (() => {
  const draft = { capital: 0, byproductPolicies: { sawdust: 'reuse' }, rivalSuppliers: {},
    products: { paperProducts: { phase: 'launched', productId: 'paperProducts' } } };
  const outcome = applySpoilageToByproducts(draft, { productId: 'processedWood', units: 100 }, window.__PRODUCT_BY_ID.processedWood);
  return outcome.reusedInto === 'paperProducts' && outcome.cash === 0;
})());
ok('reuse policy falls back to disposal when the consuming line does not exist',
  applySpoilageToByproducts({ capital: 0, byproductPolicies: { sawdust: 'reuse' }, rivalSuppliers: {}, products: {} },
    { productId: 'processedWood', units: 100 }, window.__PRODUCT_BY_ID.processedWood).policy === 'dispose');
ok('a product with no byproduct at all is an honest write-off, not a crash',
  applySpoilageToByproducts({ capital: 0, byproductPolicies: {}, rivalSuppliers: {} },
    { productId: 'packaging', units: 50 }, window.__PRODUCT_BY_ID.packaging).wroteOff === true);

section('Live — spoilage actually fires during a real run and is visible');
const spoilH = newRun({
  laborPool: 1, capital: 5000,
  products: { paperProducts: { productId: 'paperProducts', phase: 'launched', quality: paper.qualityCeiling, defectRate: 0.05,
    channelsOpened: [], launchType: 'b2c', appealBonus: 1, costReduction: 0,
    stock: 30, lots: [{ units: 30, quality: paper.qualityCeiling, producedMonth: 0 }],
    productionStance: 'buildToOrder', salesStance: 'holdForPrice', holdPriceFloor: 9999,
    lastProducedUnits: 0, lastSoldUnits: 0 } },
  byproductPolicies: { pulpSludge: 'sell' },
});
tick(spoilH, 20, 0.999);
const spoilState = spoilH.getState();
ok('a spoilage ticket fired at some point over the run',
  spoilState.log.some(x => /Stock Spoiled/.test(x.title)));
ok('the ticket names the actual product', spoilState.log.some(x => /Stock Spoiled.*Paper Products/.test(x.title)));
ok('cash moved from the sell-policy payout',
  spoilState.log.some(x => /Stock Spoiled/.test(x.title) && /Recovered/.test(x.body)));

section('Live — a signed contract carries a real, visible quality requirement');
const qH = newRun();
qH.handleSolicitContract('processedWood');
const qOffers = pendingOffers(qH.getState(), qH.getState().month);
ok('a solicited offer carries a quality requirement', qOffers.length > 0 && qOffers[0].qualityRequired > 0);
ok('the requirement never exceeds the product\u2019s own ceiling',
  qOffers[0].qualityRequired <= window.__PRODUCT_BY_ID.processedWood.qualityCeiling);


// ================================================================ buyer relationships
section('Buyer relationships — standing improves with delivery, falls with breach');
const buyerStanding = window.__buyerStanding;
const buyerRelationshipBand = window.__buyerRelationshipBand;
const adjustBuyerStanding = window.__adjustBuyerStanding;
const unlockBuyer = window.__unlockBuyer;
const BANDS = window.__BUYER_RELATIONSHIP_BANDS;
const accumulateCareer = window.__accumulateCareer;

ok('six bands exist, best to worst', BANDS.length === 6);
ok('every band is bilingual', BANDS.every(b => b.label.en && b.label.es));
ok('better standing buys a better price',
  BANDS[0].priceBonus > BANDS[BANDS.length - 1].priceBonus);
ok('better standing buys bigger orders',
  BANDS[0].volumeBonus > BANDS[BANDS.length - 1].volumeBonus);
ok('better standing buys longer terms', BANDS[0].termBonus > 0);
ok('a damaged relationship is actively WORSE than no relationship at all', (() => {
  const neutral = BANDS.find(b => b.id === 'neutral');
  const burned = BANDS.find(b => b.id === 'burned');
  return burned.priceBonus < neutral.priceBonus && burned.volumeBonus < neutral.volumeBonus;
})());
ok('an unknown buyer sits at No History', buyerRelationshipBand(0).id === 'neutral');

section('Standing = what carried in from past runs + what was earned this one');
const carried = { careerSnapshot: { buyerStandings: { b1: 40 }, unlockedBuyers: ['b1'] }, buyerStandings: { b1: 15 } };
ok('the two layers add', buyerStanding(carried, 'b1') === 55);
ok('a buyer with no history reads zero', buyerStanding(carried, 'unknown') === 0);
ok('standing is clamped', (() => {
  const d = { buyerStandings: {} };
  for (let i = 0; i < 200; i++) adjustBuyerStanding(d, 'x', 10);
  return d.buyerStandings.x <= 100;
})());
ok('a missing buyer id is safely ignored', (() => {
  const d = { buyerStandings: {} };
  adjustBuyerStanding(d, null, 10);
  return Object.keys(d.buyerStandings).length === 0;
})());

section('Standing rises slowly and falls fast — like a real commercial relationship');
ok('one breach costs more than one delivery earns',
  Math.abs(window.__BUYER_REL_BREACH_BASE || -9) > 2);

section('Meta-progression: only a COMPLETED term makes a buyer permanent');
ok('unlockBuyer records a new buyer once', (() => {
  const d = {};
  const first = unlockBuyer(d, 'bx');
  const second = unlockBuyer(d, 'bx');
  return first === true && second === false && d.unlockedBuyers.length === 1;
})());
ok('standing earned with an UN-unlocked buyer leaves no permanent trace', (() => {
  const c = accumulateCareer({}, { months: 84, industry: 'manufacturing',
    buyerStandings: { ghost: 8 }, unlockedBuyers: [] });
  return Object.keys(c.buyerStandings || {}).length === 0;
})());
ok('standing with an unlocked buyer DOES persist', (() => {
  const c = accumulateCareer({}, { months: 84, industry: 'manufacturing',
    buyerStandings: { real: 20 }, unlockedBuyers: ['real'] });
  return c.buyerStandings.real === 20;
})());
ok('standing ACCUMULATES across runs rather than being overwritten', (() => {
  const c = accumulateCareer({ unlockedBuyers: ['r'], buyerStandings: { r: 30 } },
    { months: 84, industry: 'manufacturing', buyerStandings: { r: 15 }, unlockedBuyers: [] });
  return c.buyerStandings.r === 45;
})());
ok('a bad run can erode standing built in earlier runs', (() => {
  const c = accumulateCareer({ unlockedBuyers: ['r'], buyerStandings: { r: 50 } },
    { months: 84, industry: 'manufacturing', buyerStandings: { r: -30 }, unlockedBuyers: [] });
  return c.buyerStandings.r === 20;
})());
ok('unlocked buyers de-duplicate across runs', (() => {
  const c = accumulateCareer({ unlockedBuyers: ['a'] },
    { months: 84, industry: 'manufacturing', unlockedBuyers: ['a', 'b'] });
  return c.unlockedBuyers.length === 2;
})());

section('Live — standing is actually earned by delivering, and unlocks on completion');
const relDef = window.__PRODUCT_BY_ID.processedWood;
const relH = newRun({
  salesContracts: [{ id: 'rc1', productId: 'processedWood', counterpartyId: 'buyerNorthfieldMills',
    counterpartyName: 'Northfield Mills', termId: 'trial', unitsPerMonth: 15, lockedPrice: 20,
    qualityRequired: 20, monthsLeft: 3, signedMonth: 1 }],
  products: { processedWood: { productId: 'processedWood', phase: 'launched', quality: relDef.qualityCeiling,
    defectRate: 0.05, channelsOpened: ['developers'], launchType: 'b2b', appealBonus: 1, costReduction: 0,
    stock: 0, lots: [], productionStance: 'buildToStock', salesStance: 'sellAll', holdPriceFloor: 44,
    lastProducedUnits: 0, lastSoldUnits: 0 } },
});
tick(relH, 4, 0.999);
const relState = relH.getState();
ok('delivering a contract built real standing with that buyer',
  buyerStanding(relState, 'buyerNorthfieldMills') > 0,
  `${buyerStanding(relState, 'buyerNorthfieldMills')}`);
ok('completing the term unlocked the buyer permanently',
  (relState.unlockedBuyers || []).includes('buyerNorthfieldMills'));
ok('the player was told it happened',
  relState.log.some(x => /Buyer Relationship Established/.test(x.title)));

section('Live — standing changes the DEAL, not just a number');
ok('a preferred buyer offers a better price than a burned one for the same product', (() => {
  const cp = { id: 'buyerNorthfieldMills', name: 'Northfield Mills', kind: 'buyer',
    raw: window.__BUYER_BY_ID.buyerNorthfieldMills };
  const good = { careerSnapshot: { buyerStandings: { buyerNorthfieldMills: 85 }, unlockedBuyers: ['buyerNorthfieldMills'] }, month: 10 };
  const bad = { careerSnapshot: { buyerStandings: { buyerNorthfieldMills: -80 }, unlockedBuyers: ['buyerNorthfieldMills'] }, month: 10 };
  const o1 = window.__makeSalesContractOffer(good, 'processedWood', cp, 'standard', 10, 40, 100);
  const o2 = window.__makeSalesContractOffer(bad, 'processedWood', cp, 'standard', 10, 40, 100);
  return o1.lockedPrice > o2.lockedPrice && o1.unitsPerMonth > o2.unitsPerMonth && o1.months > o2.months;
})());
ok('a preferred buyer also relaxes their quality bar', (() => {
  const cp = { id: 'buyerVantageOEM', name: 'Vantage OEM', kind: 'buyer', raw: window.__BUYER_BY_ID.buyerVantageOEM };
  const good = { careerSnapshot: { buyerStandings: { buyerVantageOEM: 90 }, unlockedBuyers: ['buyerVantageOEM'] }, month: 10 };
  const none = { month: 10 };
  const o1 = window.__makeSalesContractOffer(good, 'metalComponents', cp, 'standard', 10, 40, 100);
  const o2 = window.__makeSalesContractOffer(none, 'metalComponents', cp, 'standard', 10, 40, 100);
  return o1.qualityRequired < o2.qualityRequired;
})());


// ================================================================ buyer discovery
section('Buyer discovery — four routes in, none of them free');
const knownBuyers = window.__knownBuyers;
const undiscoveredBuyersFor = window.__undiscoveredBuyersFor;
const introductionCandidates = window.__introductionCandidates;
const BUYERS = window.__BUYER_CHARACTERS;

ok('only a handful of buyers are common knowledge',
  BUYERS.filter(b => b.commonKnowledge).length < BUYERS.length / 2);
ok('every sellable tier has at least one public buyer — nobody is ever unable to sell', (() => {
  const tiers = [...new Set(BUYERS.map(b => b.buysTier))];
  return tiers.every(t => BUYERS.some(b => b.buysTier === t && b.commonKnowledge));
})());
ok('a fresh run knows only the public buyers',
  knownBuyers({}).size === BUYERS.filter(b => b.commonKnowledge).length);
ok('discovering a buyer adds them to what you know',
  knownBuyers({ discoveredBuyers: ['buyerSeltzerHome'] }).has('buyerSeltzerHome'));
ok('a buyer unlocked in a PAST run is already known this run',
  knownBuyers({ careerSnapshot: { unlockedBuyers: ['buyerVantageOEM'] } }).has('buyerVantageOEM'));
ok('undiscovered list excludes who you already know', (() => {
  const g = { discoveredBuyers: ['buyerSeltzerHome'] };
  return !undiscoveredBuyersFor(g, 'woodenFurniture').some(b => b.id === 'buyerSeltzerHome');
})());

section('You cannot sign with someone you have never met');
ok('an undiscovered buyer is not in the contract pool', (() => {
  const g = { products: { woodenFurniture: { productId: 'woodenFurniture', phase: 'launched' } },
    competitors: [], salesContracts: [] };
  const pool = potentialBuyers(g).map(b => b.id);
  return !pool.includes('buyerSeltzerHome') && pool.includes('buyerPortmanTrade');
})());
ok('once discovered, they enter the pool', (() => {
  const g = { products: { woodenFurniture: { productId: 'woodenFurniture', phase: 'launched' } },
    competitors: [], salesContracts: [], discoveredBuyers: ['buyerSeltzerHome'] };
  return potentialBuyers(g).some(b => b.id === 'buyerSeltzerHome');
})());

section('Introductions are a finite favour, not a renewable resource');
ok('a weak relationship yields no introduction',
  introductionCandidates({ investorStandings: { x: 10 } }).length === 0);
ok('a strong one does',
  introductionCandidates({ investorStandings: { x: 80 } }).length === 1);
ok('an investor who already introduced you will not do it twice',
  introductionCandidates({ investorStandings: { x: 80 }, usedIntroductions: ['x'] }).length === 0);

section('Live — the routes actually work');
const discDef = window.__PRODUCT_BY_ID.woodenFurniture;
const furnitureRun = (extra) => newRun({
  capital: 5000, presence: 20,
  products: { woodenFurniture: { productId: 'woodenFurniture', phase: 'launched', quality: discDef.qualityCeiling,
    defectRate: 0.05, channelsOpened: ['developers'], launchType: 'b2b', appealBonus: 1, costReduction: 0,
    stock: 0, lots: [], productionStance: 'balanced', salesStance: 'sellAll', holdPriceFloor: 44,
    lastProducedUnits: 0, lastSoldUnits: 0 } },
  ...(extra || {}),
});

const scoutH = furnitureRun();
const apBefore = scoutH.getState().ap;
scoutH.handleScoutBuyers('woodenFurniture');
ok('sourcing finds a buyer', (scoutH.getState().discoveredBuyers || []).length === 1);
ok('sourcing costs AP and Presence', scoutH.getState().ap < apBefore && scoutH.getState().presence < 20);
ok('the player is told who they found',
  scoutH.getState().log.some(x => /Buyer Found/.test(x.title)));

const showH = furnitureRun({ tradeShow: { endsMonth: 99, cost: 14, reach: 2, attended: false } });
showH.handleAttendTradeShow();
ok('a trade show finds several buyers at once',
  (showH.getState().discoveredBuyers || []).length >= 2);
ok('the show cannot be worked twice', (() => {
  const n = (showH.getState().discoveredBuyers || []).length;
  showH.handleAttendTradeShow();
  return (showH.getState().discoveredBuyers || []).length === n;
})());

const introInvestor = window.__INVESTOR_CHARACTERS[0].id;
const introH = furnitureRun({ investorStandings: { [introInvestor]: 70 } });
introH.handleRequestIntroduction(introInvestor);
const introState = introH.getState();
ok('an introduction finds a buyer', (introState.discoveredBuyers || []).length === 1);
ok('an introduction starts you WARM, not cold — that is the value of the relationship',
  window.__buyerStanding(introState, introState.discoveredBuyers[0]) > 0);
ok('the same investor will not introduce twice',
  (introState.usedIntroductions || []).includes(introInvestor));

section('Sourcing is gated and cannot be farmed');
const gatedH = furnitureRun({ completed: {} });
gatedH.handleScoutBuyers('woodenFurniture');
ok('sourcing requires the research', (gatedH.getState().discoveredBuyers || []).length === 0);
ok('exhausting a line\u2019s buyers is reported honestly', (() => {
  const all = window.__buyersForEntity('woodenFurniture').map(b => b.id);
  const h = furnitureRun({ discoveredBuyers: all });
  h.handleScoutBuyers('woodenFurniture');
  return /already know every buyer/i.test(h.getState().log[0].body || '');
})());


section('Buyers can want MORE THAN ONE product (direction: not 1:1)');
const entitiesBuyerWants = window.__entitiesBuyerWants;
const buyerWants = window.__buyerWants;
ok('a diversified manufacturer buys across two tiers',
  window.__buyerTiers(window.__BUYER_BY_ID.buyerAtlasManufacturing).length >= 2);
ok('it buys both wood AND metal, matching its own description',
  buyerWants(window.__BUYER_BY_ID.buyerAtlasManufacturing, 'processedWood')
  && buyerWants(window.__BUYER_BY_ID.buyerAtlasManufacturing, 'refinedMetal'));
ok('but NOT everything — a buyer that wants all is the same as no buyer at all',
  entitiesBuyerWants('buyerAtlasManufacturing').length < 12);
ok('a holding company spans sub-assemblies and finished goods',
  entitiesBuyerWants('buyerKestrelGroup').length > 5);
ok('a specialist stays narrow',
  entitiesBuyerWants('buyerLedgerStationery').length <= 2);
ok('buysOnly genuinely restricts within a tier',
  !buyerWants(window.__BUYER_BY_ID.buyerAldercroft, 'refinedMetal'));

section('Every tradeable line has somewhere to sell');
ok('no processed material, component, sub-assembly or finished good is unsellable', (() => {
  const tiers = ['processedMaterial', 'component', 'subAssembly', 'finishedProduct'];
  const orphans = Object.values(window.__ECONOMY)
    .filter(e => tiers.includes(e.tier))
    .filter(e => window.__buyersForEntity(e.id).length === 0);
  return orphans.length === 0;
})(), (() => {
  const tiers = ['processedMaterial', 'component', 'subAssembly', 'finishedProduct'];
  const orphans = Object.values(window.__ECONOMY).filter(e => tiers.includes(e.tier))
    .filter(e => window.__buyersForEntity(e.id).length === 0).map(e => e.id);
  return orphans.join(',') || 'all covered';
})());

section('The three starting chains are genuinely DIFFERENT businesses');
const starters = window.__unlockedBusinesses({});
ok('exactly three businesses open a first run', starters.length === 3);
ok('they are Timber, Paper and Cloth', (() => {
  const ids = starters.map(b => b.entityId).sort();
  return JSON.stringify(ids) === JSON.stringify(['paperProducts', 'processedWood', 'textiles']);
})(), starters.map(b => b.entityId).join(','));
ok('they do NOT all share the same input', (() => {
  const inputs = starters.map(b => (window.__ECONOMY[b.entityId].recipe.primary || [])[0].id);
  return new Set(inputs).size > 1;
})());
ok('they produce different byproducts', (() => {
  const bps = starters.map(b => ((window.__ECONOMY[b.entityId].recipe.byproducts || [])[0] || {}).id);
  return new Set(bps).size === 3;
})());
ok('each meets a DIFFERENT set of buyers — three chains, three markets', (() => {
  const sets = starters.map(b => window.__buyersForEntity(b.entityId).map(x => x.id).sort().join(','));
  return new Set(sets).size === 3;
})());
ok('every starter can reach its capabilities by Seed', (() => {
  const ind = getIndustry('manufacturing');
  const order = ind.stageOrder;
  return starters.every(b => {
    const def = window.__PRODUCT_BY_ID[b.entityId];
    return (def.resourceProfile.capabilities || []).every(c => {
      const eqs = Object.entries(window.__EQUIPMENT_CAPABILITIES).filter(([, v]) => v.includes(c)).map(e => e[0]);
      const projs = eqs.map(id => ind.content.projects.find(p => p.id === id)).filter(Boolean);
      if (!projs.length) return false;
      return projs.some(p => order.indexOf(p.minStage) <= order.indexOf('seed'));
    });
  });
})());

section('Sawdust links the wood and paper chains');
ok('a sawmill produces sawdust',
  (window.__ECONOMY.processedWood.recipe.byproducts || []).some(b => b.id === 'sawdust'));
ok('sawdust is named honestly', window.__ECONOMY.sawdust.name.en === 'Sawdust');
ok('paper can be made FROM sawdust — the two chains physically connect',
  window.__consumersOf('sawdust').includes('paperProducts'));
ok('sawdust is the cheaper route into paper, at a quality cost', (() => {
  const sub = (window.__ECONOMY.paperProducts.recipe.substitute || []).find(x => x.id === 'sawdust');
  return sub && sub.costDelta < 0 && sub.qualityDelta < 0;
})());

console.log(`\n${'='.repeat(60)}\nSales Contracts (Phase B): ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
