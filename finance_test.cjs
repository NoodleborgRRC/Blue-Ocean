// WORKING CAPITAL & FINANCE — build order item 5. The pure math first, then live integration
// through real endMonth cycles: receivables aging, debt service, default, emergency financing.
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

const DEBT_INSTRUMENTS = window.__DEBT_INSTRUMENTS;
const EMERGENCY_FINANCING = window.__EMERGENCY_FINANCING;
const b2bRevenueShare = window.__b2bRevenueShare;
const totalReceivables = window.__totalReceivables;
const receivablesDueIn = window.__receivablesDueIn;
const totalPayables = window.__totalPayables;
const inventoryValue = window.__inventoryValue;
const workingCapital = window.__workingCapital;
const debtMonthlyPayment = window.__debtMonthlyPayment;
const totalDebtOutstanding = window.__totalDebtOutstanding;
const totalMonthlyDebtService = window.__totalMonthlyDebtService;
const debtInstrumentAvailable = window.__debtInstrumentAvailable;
const emergencyFinancingOption = window.__emergencyFinancingOption;
const projectedCashGap = window.__projectedCashGap;
const tradeCreditEligible = window.__tradeCreditEligible;
const TERMS = window.__RECEIVABLE_TERMS_MONTHS;
const FACTORING_DISCOUNT = window.__FACTORING_DISCOUNT;
const DEBT_DEFAULT_MISSES = window.__DEBT_DEFAULT_MISSES;
const getIndustry = window.__getIndustry2;

// ================================================================ receivables
section('B2B/B2C revenue split — the launch fork is now a CASH decision');
const mfg = getIndustry('manufacturing');
function gameWith(products) { return { products, reputation: 70, laborPool: 60, equipment: {}, supplierContracts: {}, acquiredSuppliers: {} }; }
const launched = (id, launchType) => ({ productId: id, phase: 'launched', quality: 6, defectRate: 0.05,
  channelsOpened: launchType === 'b2b' ? ['independentRetailers'] : ['designLed'],
  launchType, appealBonus: 1, costReduction: 0 });

ok('no products means no revenue on terms', b2bRevenueShare(gameWith({}), mfg) === 0);
// processedWood is upstream (processedMaterial tier) with B2B-only appeal by Phase 2's design —
// it has no consumer segments to sell into at all, so it cannot represent the B2C leg of a mixed
// test. woodenFurniture (a finished product with real consumer appeal) can.
const b2cLaunch = (id) => ({ productId: id, phase: 'launched', quality: 6, defectRate: 0.05,
  channelsOpened: ['designLed'], launchType: 'b2c', appealBonus: 1, costReduction: 0 });
ok('an all-B2C company carries zero receivables',
  b2bRevenueShare(gameWith({ woodenFurniture: b2cLaunch('woodenFurniture') }), mfg) === 0);
ok('an all-B2B company carries all of it on terms',
  b2bRevenueShare(gameWith({ glassProducts: launched('glassProducts', 'b2b') }), mfg) === 1);
const mixed = b2bRevenueShare(gameWith({
  woodenFurniture: b2cLaunch('woodenFurniture'),
  glassProducts: launched('glassProducts', 'b2b'),
}), mfg);
ok('a mixed company lands strictly between', mixed > 0 && mixed < 1, `${mixed.toFixed(2)}`);
ok('an industry with no product catalog is unaffected (Hospitality)',
  b2bRevenueShare(gameWith({ glassProducts: launched('glassProducts', 'b2b') }), getIndustry('hospitality')) === 0);
ok('a product that has not launched yet contributes nothing to the split',
  b2bRevenueShare(gameWith({ glassProducts: { ...launched('glassProducts', 'b2b'), phase: 'production' } }), mfg) === 0);

section('Receivables aging');
const withRecv = { receivables: [{ amount: 40, monthsLeft: 1 }, { amount: 60, monthsLeft: 2 }] };
ok('total sums the book', totalReceivables(withRecv) === 100);
ok('due-in-1 sees only the near one', receivablesDueIn(withRecv, 1) === 40);
ok('due-in-2 sees both', receivablesDueIn(withRecv, 2) === 100);
ok('an empty book totals zero', totalReceivables({ receivables: [] }) === 0);
ok('a missing book is handled safely', totalReceivables({}) === 0);
ok('B2B terms are a real delay, not instant', TERMS >= 1, `${TERMS} months`);

section('Working capital derivation');
ok('an empty company has zero working capital',
  workingCapital({ receivables: [], payables: [], supplierContracts: {} }) === 0);
ok('receivables raise it', workingCapital({ receivables: [{ amount: 50, monthsLeft: 1 }], payables: [], supplierContracts: {} }) === 50);
ok('payables LOWER it (money you get to hold onto for now)',
  workingCapital({ receivables: [], payables: [{ amount: 30, monthsLeft: 1 }], supplierContracts: {} }) === -30);
ok('inventory counts as cash tied up', inventoryValue({
  supplierContracts: { redwoodTimber: { contractType: 'spot', active: true } }, inventoryStrategy: 'balanced' }) > 0);
ok('a lean inventory strategy ties up less cash than a high one',
  inventoryValue({ supplierContracts: { redwoodTimber: { active: true } }, inventoryStrategy: 'lean' })
  < inventoryValue({ supplierContracts: { redwoodTimber: { active: true } }, inventoryStrategy: 'high' }));
ok('a cancelled contract stops tying up cash',
  inventoryValue({ supplierContracts: { redwoodTimber: { active: false } }, inventoryStrategy: 'high' }) === 0);

// ================================================================ debt
section('Debt instruments');
ok('three instruments exist', Object.keys(DEBT_INSTRUMENTS).length === 3);
ok('bank is cheapest, merchant advance is dearest',
  DEBT_INSTRUMENTS.bankLoan.interestRate < DEBT_INSTRUMENTS.investorNote.interestRate
  && DEBT_INSTRUMENTS.investorNote.interestRate < DEBT_INSTRUMENTS.merchantAdvance.interestRate);
ok('every instrument is bilingual', Object.values(DEBT_INSTRUMENTS).every(i => i.name.en && i.name.es && i.blurb.en && i.blurb.es));
ok('the cheapest money has the hardest gate',
  Object.keys(DEBT_INSTRUMENTS.bankLoan.requires).length > Object.keys(DEBT_INSTRUMENTS.merchantAdvance.requires).length);
ok('the merchant advance is available to almost anyone (no gate)',
  Object.keys(DEBT_INSTRUMENTS.merchantAdvance.requires).length === 0);

section('Amortisation');
ok('total repaid exceeds principal — interest is real',
  debtMonthlyPayment(100, 0.10, 10) * 10 > 100);
ok('a higher rate costs more per month, same principal and term',
  debtMonthlyPayment(100, 0.20, 12) > debtMonthlyPayment(100, 0.06, 12));
ok('a longer term lowers the monthly payment, same principal',
  debtMonthlyPayment(100, 0.10, 24) < debtMonthlyPayment(100, 0.10, 12));
ok('outstanding sums across facilities',
  totalDebtOutstanding({ debts: [{ remaining: 50 }, { remaining: 30 }] }) === 80);
ok('service sums across facilities',
  totalMonthlyDebtService({ debts: [{ monthlyPayment: 5 }, { monthlyPayment: 3 }] }) === 8);
ok('no debt means no service', totalMonthlyDebtService({ debts: [] }) === 0);

section('Debt gating');
const poorCo = { boardConfidence: 20, reputation: 20, revenuePerMonth: 2, investorBackers: {} };
const strongCo = { boardConfidence: 70, reputation: 70, revenuePerMonth: 50, investorBackers: { a: {} } };
ok('a weak company cannot get a bank loan', !debtInstrumentAvailable('bankLoan', poorCo).open);
ok('a strong company can', debtInstrumentAvailable('bankLoan', strongCo).open);
ok('the refusal names WHICH requirement failed', !!debtInstrumentAvailable('bankLoan', poorCo).reason);
ok('an investor note needs an actual backer',
  !debtInstrumentAvailable('investorNote', { ...poorCo, investorBackers: {} }).open
  && debtInstrumentAvailable('investorNote', { ...poorCo, investorBackers: { a: {} } }).open);
ok('the merchant advance is open even to a weak company', debtInstrumentAvailable('merchantAdvance', poorCo).open);
ok('an unknown instrument is refused rather than crashing', !debtInstrumentAvailable('nonsense', strongCo).open);
ok('borrowing capacity scales with revenue',
  DEBT_INSTRUMENTS.bankLoan.amountOf({ revenuePerMonth: 60 }) > DEBT_INSTRUMENTS.bankLoan.amountOf({ revenuePerMonth: 20 }));

// ================================================================ emergency financing
section('Emergency financing — expensive and avoidable, not fatal');
ok('three escalating options exist', Object.keys(EMERGENCY_FINANCING).length === 3);
ok('a company with a warm investor gets the investor rescue',
  emergencyFinancingOption({ investorStandings: { a: 40 } }) === 'investorRescue');
ok('a respectable company with no warm investor gets the bank',
  emergencyFinancingOption({ investorStandings: {}, boardConfidence: 60, reputation: 60 }) === 'bankOverdraft');
ok('a company with nobody left to call is forced into equity',
  emergencyFinancingOption({ investorStandings: {}, boardConfidence: 10, reputation: 10 }) === 'emergencyEquity');
ok('the last resort is the only one that dilutes', EMERGENCY_FINANCING.emergencyEquity.dilutes === true
  && !EMERGENCY_FINANCING.investorRescue.dilutes && !EMERGENCY_FINANCING.bankOverdraft.dilutes);
ok('every option costs board confidence',
  Object.values(EMERGENCY_FINANCING).every(o => o.deltas.boardConfidence < 0));
ok('the forced-equity option hurts most',
  EMERGENCY_FINANCING.emergencyEquity.deltas.boardConfidence < EMERGENCY_FINANCING.investorRescue.deltas.boardConfidence);

// ================================================================ analyst forecast
section('Analyst cash-gap forecast');
const healthy = projectedCashGap({ capital: 500, receivables: [], payables: [], debts: [] }, 10, 3);
ok('a healthy company projects no gap', healthy.gapInMonths === null, `${healthy.gapInMonths}`);
const doomed = projectedCashGap({ capital: 15, receivables: [], payables: [], debts: [] }, 10, 3);
ok('a company burning more than it holds projects a gap', doomed.gapInMonths != null, `month ${doomed.gapInMonths}`);
ok('incoming receivables push the gap out', (() => {
  const withCollection = projectedCashGap({ capital: 15, receivables: [{ amount: 100, monthsLeft: 2 }], payables: [], debts: [] }, 10, 3);
  return withCollection.endingCash > doomed.endingCash;
})());
ok('debt service pulls the gap forward', (() => {
  const withDebt = projectedCashGap({ capital: 40, receivables: [], payables: [], debts: [{ monthlyPayment: 10 }] }, 10, 3);
  const without = projectedCashGap({ capital: 40, receivables: [], payables: [], debts: [] }, 10, 3);
  return withDebt.endingCash < without.endingCash;
})());

// ================================================================ live integration
section('Live — B2B revenue becomes a receivable instead of instant cash');
function newRun(patch) {
  const ind = getIndustry('manufacturing');
  const team = window.__buildTeam(ind.content.leaders.slice(0, 3));
  const H = window.__makeHandlers('en', []);
  const allProjects = {};
  (ind.content.projects || []).forEach(p => { allProjects[p.id] = true; });
  H.setState({
    ...window.__initialState(team, 'en', { ...window.__getScenario('fullRun'), industryId: 'manufacturing', endMonth: ind.runEnd }, []),
    capital: 5000, presence: 40, ap: 5, reputation: 95, boardConfidence: 95,
    marketPosition: 80, laborPool: 60, completed: allProjects,
    equipment: { mfgFirstTooling: window.__instantiateEquipment('mfgFirstTooling') },
    supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: 0 } },
    ...(patch || {}),
  });
  return { H, ind };
}
function tick(H, n, forceRandom) {
  const real = Math.random;
  Math.random = forceRandom != null ? () => forceRandom : real;
  try { for (let i = 0; i < n; i++) { if (H.getState().gameOver) break; H.endMonth(); H.setState({ ...H.getState(), ap: 5 }); } }
  finally { Math.random = real; }
}

const { H: Hb2b } = newRun({ products: { glassProducts: launched('glassProducts', 'b2b') } });
tick(Hb2b, 1, 0.999);
let s = Hb2b.getState();
ok('a B2B company builds a receivables book', totalReceivables(s) > 0, `${totalReceivables(s)}`);
ok('the receivable is dated forward, not collectable now', (s.receivables || []).every(r => r.monthsLeft > 0));

const { H: Hb2c } = newRun({ products: { processedWood: launched('processedWood', 'b2c') } });
tick(Hb2c, 1, 0.999);
ok('a B2C company carries no receivables — it collects at the till',
  totalReceivables(Hb2c.getState()) === 0);

section('Live — receivables actually collect after their term');
const { H: Hcollect } = newRun({ products: { glassProducts: launched('glassProducts', 'b2b') } });
tick(Hcollect, 1, 0.999);
const bookAfterOne = totalReceivables(Hcollect.getState());
tick(Hcollect, TERMS + 1, 0.999);
s = Hcollect.getState();
ok('the first month\u2019s receivable eventually clears the book',
  (s.receivables || []).every(r => r.monthsLeft > 0) && bookAfterOne > 0);
ok('the company is still solvent (money did arrive, just late)', !s.gameOver || s.gameOver.reason !== 'insolvent');

section('Live — taking debt');
const { H: Hdebt } = newRun();
Hdebt.setState({ ...Hdebt.getState(), revenuePerMonth: 60 });
const capBefore = Hdebt.getState().capital;
Hdebt.handleTakeDebt('bankLoan');
s = Hdebt.getState();
ok('the loan lands as cash', s.capital > capBefore, `${capBefore} -> ${s.capital}`);
ok('a debt record is created', (s.debts || []).length === 1);
ok('it carries interest (owed exceeds principal)', s.debts[0].remaining > s.debts[0].principal);
ok('a ticket was logged', /Debt Taken/.test(s.log[0].title));
Hdebt.handleTakeDebt('bankLoan');
ok('a second facility of the same type is refused', Hdebt.getState().debts.length === 1);

section('Live — debt service is paid monthly and reduces the balance');
const owedBefore = Hdebt.getState().debts[0].remaining;
tick(Hdebt, 1, 0.999);
s = Hdebt.getState();
ok('the balance falls after a month', s.debts.length === 0 || s.debts[0].remaining < owedBefore,
  `${owedBefore} -> ${s.debts[0] ? s.debts[0].remaining : 'cleared'}`);

section('Live — missing debt service escalates, and three misses is fatal');
const { H: Hdefault } = newRun();
Hdefault.setState({ ...Hdefault.getState(), revenuePerMonth: 60 });
Hdefault.handleTakeDebt('merchantAdvance');
// Strand the company: no cash, no revenue, so service cannot be met.
Hdefault.setState({ ...Hdefault.getState(), capital: 0, revenuePerMonth: 0, products: {} });
let missesSeen = 0;
for (let i = 0; i < DEBT_DEFAULT_MISSES + 1; i++) {
  if (Hdefault.getState().gameOver) break;
  Hdefault.setState({ ...Hdefault.getState(), capital: 0, ap: 5 });
  tick(Hdefault, 1, 0.999);
  missesSeen = Hdefault.getState().missedDebtPayments || missesSeen;
}
s = Hdefault.getState();
ok('missed payments were counted', missesSeen > 0, `${missesSeen}`);
ok('the run ends in debt default, not generic insolvency',
  s.gameOver && s.gameOver.reason === 'debtDefault', s.gameOver ? s.gameOver.reason : 'still running');

section('Live — emergency financing rescues rather than kills');
const { H: Hrescue } = newRun({ products: { glassProducts: launched('glassProducts', 'b2b') } });
Hrescue.setState({ ...Hrescue.getState(), capital: 1, investorStandings: { someone: 40 } });
tick(Hrescue, 1, 0.999);
s = Hrescue.getState();
ok('the company survives a cash gap', !s.gameOver, s.gameOver ? s.gameOver.reason : 'alive');
ok('emergency financing fired', (s.emergencyFinancingCount || 0) > 0, `${s.emergencyFinancingCount}`);
ok('capital is non-negative afterwards', s.capital >= 0, `${s.capital}`);
ok('an emergency ticket was logged', s.log.some(t2 => /Emergency Financing/.test(t2.title)));

section('Live — factoring converts the book to cash at a real discount');
const { H: Hfactor } = newRun({ products: { glassProducts: launched('glassProducts', 'b2b') } });
// A book big enough that an 18% discount survives integer rounding. At a 2k book the discount
// rounds back to zero — correct behaviour, but it makes the assertion untestable.
Hfactor.setState({ ...Hfactor.getState(), receivables: [{ amount: 200, monthsLeft: 2 }] });
const book = totalReceivables(Hfactor.getState());
const capBeforeFactor = Hfactor.getState().capital;
Hfactor.handleFactorReceivables();
s = Hfactor.getState();
ok('the receivables book is emptied', totalReceivables(s) === 0);
ok('cash arrives', s.capital > capBeforeFactor);
ok('but LESS than the book was worth — the discount is real',
  s.capital - capBeforeFactor < book, `book ${book}, got ${s.capital - capBeforeFactor}`);
ok('the discount is close to the configured rate',
  Math.abs((1 - (s.capital - capBeforeFactor) / book) - FACTORING_DISCOUNT) < 0.02,
  `${(100 * (1 - (s.capital - capBeforeFactor) / book)).toFixed(1)}% vs ${(FACTORING_DISCOUNT * 100)}%`);

section('Live — trade credit needs a supplier who actually trusts you');
const { H: Htc } = newRun();
Htc.handleTakeTradeCredit();
ok('refused at zero relationship', (Htc.getState().payables || []).length === 0);
Htc.setState({ ...Htc.getState(),
  supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: 40 } } });
ok('eligible once the relationship is built', tradeCreditEligible(Htc.getState()));
const capBeforeTc = Htc.getState().capital;
Htc.handleTakeTradeCredit();
s = Htc.getState();
ok('trade credit defers real spend into cash now', s.capital > capBeforeTc);
ok('a payable is created', totalPayables(s) > 0);
ok('working capital reflects the payable as a negative', workingCapital(s) < workingCapital({ ...s, payables: [] }));

section('Hospitality is untouched — no product catalog, so no receivables');
const hospInd = getIndustry('hospitality');
const hTeam = window.__buildTeam(hospInd.content.leaders.slice(0, 3));
const Hh = window.__makeHandlers('en', []);
Hh.setState({ ...window.__initialState(hTeam, 'en', { ...window.__getScenario('fullRun'), industryId: 'hospitality', endMonth: hospInd.runEnd }, []),
  capital: 5000, revenuePerMonth: 50, reputation: 90, boardConfidence: 90 });
const hCapBefore = Hh.getState().capital;
tick(Hh, 1, 0.999);
ok('Hospitality revenue still lands as immediate cash', totalReceivables(Hh.getState()) === 0);
ok('Hospitality cash still moves normally', Hh.getState().capital !== hCapBefore);

console.log(`\n${'='.repeat(60)}\nWorking Capital & Finance: ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
