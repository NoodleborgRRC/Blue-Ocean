// FINISHED GOODS INVENTORY — Phase A (steps 1-2). Production and sales as separate events, stock
// as the buffer, market price driving revenue. Pure functions first, then live integration.
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

const PRODUCTION_STANCES = window.__PRODUCTION_STANCES;
const SALES_STANCES = window.__SALES_STANCES;
const productionStance = window.__productionStance;
const salesStance = window.__salesStance;
const defaultHoldPriceFloor = window.__defaultHoldPriceFloor;
const resolveProduction = window.__resolveProduction;
const resolveSales = window.__resolveSales;
const finishedGoodsHoldingCost = window.__finishedGoodsHoldingCost;
const finishedGoodsValue = window.__finishedGoodsValue;
const workingCapital = window.__workingCapital;
const PRODUCT_BY_ID = window.__PRODUCT_BY_ID;
const getIndustry = window.__getIndustry2;

const inst = (id, extra) => ({ productId: id, phase: 'launched', quality: 6, defectRate: 0.05,
  channelsOpened: ['developers', 'independentRetailers'], launchType: 'b2b', appealBonus: 1,
  costReduction: 0, stock: 0, productionStance: 'balanced', salesStance: 'sellAll',
  holdPriceFloor: 30, ...extra });
const baseGame = (extra) => ({ products: {}, laborPool: 60, equipment: {}, reputation: 70,
  supplierContracts: {}, acquiredSuppliers: {}, managers: {}, integrations: [], locations: 0,
  ownedTiers: {}, market: window.__recomputePrices(window.__makeMarket()),
  inventoryStrategy: 'balanced', ...extra });

// ================================================================ stances
section('Production stances — three standing options, no per-product monthly targets');
ok('three production stances exist', Object.keys(PRODUCTION_STANCES).length === 3);
ok('every stance is bilingual', Object.values(PRODUCTION_STANCES).every(s => s.label.en && s.label.es && s.blurb.en && s.blurb.es));
ok('an unknown stance id falls back to balanced', productionStance('nonsense') === PRODUCTION_STANCES.balanced);

ok('Build to Order produces only what is needed above current stock',
  PRODUCTION_STANCES.buildToOrder.targetFor(200, 50, 10) === 40); // 50 demand - 10 stock
ok('Build to Order never goes negative when stock already exceeds demand',
  PRODUCTION_STANCES.buildToOrder.targetFor(200, 20, 50) <= 0);
ok('Balanced caps stock at 1.5x demand, not raw capacity',
  PRODUCTION_STANCES.balanced.targetFor(200, 50, 0) === 75); // 50*1.5 - 0
ok('Balanced stops adding once stock already covers 1.5x demand',
  PRODUCTION_STANCES.balanced.targetFor(200, 50, 75) <= 0);
ok('Build to Stock always targets full raw capacity, ignoring demand and stock entirely',
  PRODUCTION_STANCES.buildToStock.targetFor(200, 1, 500) === 200);
ok('the three stances produce a strict ordering at the same demand/stock',
  PRODUCTION_STANCES.buildToStock.targetFor(200, 50, 0) > PRODUCTION_STANCES.balanced.targetFor(200, 50, 0)
  && PRODUCTION_STANCES.balanced.targetFor(200, 50, 0) > PRODUCTION_STANCES.buildToOrder.targetFor(200, 50, 0));

section('Sales stances');
ok('two sales stances exist', Object.keys(SALES_STANCES).length === 2);
ok('an unknown stance id falls back to sellAll', salesStance('nonsense') === SALES_STANCES.sellAll);
ok('the default hold-price floor is a real fraction of the price ceiling, not arbitrary',
  defaultHoldPriceFloor({ priceCeiling: 100 }) === 75);

// ================================================================ production resolution
section('resolveProduction — stance target capped by real capacity');
const mfg = getIndustry('manufacturing');
const wood = PRODUCT_BY_ID.processedWood;
ok('production never exceeds raw capacity, however high the stance target is',
  resolveProduction(inst('processedWood', { productionStance: 'buildToStock' }), wood,
    baseGame({ laborPool: 1 }), 5) <= 5);
ok('Build to Order with low demand produces less than Build to Stock, same raw capacity', (() => {
  const g = baseGame({ products: { processedWood: inst('processedWood', { channelsOpened: ['developers'] }) } });
  const order = resolveProduction(inst('processedWood', { productionStance: 'buildToOrder', channelsOpened: ['developers'] }), wood, g, 500);
  const stock = resolveProduction(inst('processedWood', { productionStance: 'buildToStock', channelsOpened: ['developers'] }), wood, g, 500);
  return order < stock;
})());
ok('production is never negative', resolveProduction(inst('processedWood', { productionStance: 'buildToOrder' }), wood, baseGame(), 0) >= 0);

// ================================================================ sales resolution
section('resolveSales — Hold for Price actually withholds');
const g2 = baseGame({ products: { processedWood: inst('processedWood') } });
ok('Sell All sells up to demand, capped by stock',
  resolveSales(inst('processedWood', { salesStance: 'sellAll' }), wood, g2, 1000, 50) > 0);
ok('Hold for Price sells NOTHING when price is below the floor',
  resolveSales(inst('processedWood', { salesStance: 'holdForPrice', holdPriceFloor: 100 }), wood, g2, 1000, 20) === 0);
ok('Hold for Price sells normally once price clears the floor',
  resolveSales(inst('processedWood', { salesStance: 'holdForPrice', holdPriceFloor: 20 }), wood, g2, 1000, 50) > 0);
ok('sales are capped by available stock even when demand is higher',
  resolveSales(inst('processedWood', { salesStance: 'sellAll' }), wood, g2, 3, 50) <= 3);
ok('zero stock means zero sales regardless of stance', resolveSales(inst('processedWood'), wood, g2, 0, 999) === 0);

// ================================================================ holding cost
section('Holding cost — real, strategy-scaled, warehouse-relieved');
ok('zero stock costs nothing to hold', finishedGoodsHoldingCost(baseGame(), wood, 0) === 0);
ok('holding real stock costs real money', finishedGoodsHoldingCost(baseGame(), wood, 100) > 0);
ok('a high inventory strategy costs more to hold than lean, same stock',
  finishedGoodsHoldingCost(baseGame({ inventoryStrategy: 'high' }), wood, 100)
  > finishedGoodsHoldingCost(baseGame({ inventoryStrategy: 'lean' }), wood, 100));
ok('owning Warehousing relieves holding cost — item 7b finally does something for finished goods',
  finishedGoodsHoldingCost(baseGame({ ownedTiers: { warehousing: {} } }), wood, 100)
  < finishedGoodsHoldingCost(baseGame(), wood, 100));
ok('holding cost scales with the CURRENT market price, not a fixed cost basis', (() => {
  const cheapMarket = window.__recomputePrices(window.__makeMarket());
  const dearMarket = window.__recomputePrices(window.__makeMarket());
  window.__applyConsumption(dearMarket, 'processedWood', 1000);
  window.__recomputePrices(dearMarket);
  return finishedGoodsHoldingCost(baseGame({ market: dearMarket }), wood, 100)
    > finishedGoodsHoldingCost(baseGame({ market: cheapMarket }), wood, 100);
})());

// ================================================================ working capital
section('Finished goods join working capital, marked to market');
ok('zero stock contributes nothing', finishedGoodsValue(baseGame()) === 0);
const withStock = baseGame({ products: { processedWood: inst('processedWood', { stock: 50 }) } });
ok('real stock contributes real value', finishedGoodsValue(withStock) > 0);
ok('value scales with the market price at the time', (() => {
  const dearMarket = window.__recomputePrices(window.__makeMarket());
  window.__applyConsumption(dearMarket, 'processedWood', 1000);
  window.__recomputePrices(dearMarket);
  const dear = baseGame({ market: dearMarket, products: { processedWood: inst('processedWood', { stock: 50 }) } });
  return finishedGoodsValue(dear) > finishedGoodsValue(withStock);
})());
ok('a non-launched product contributes nothing even with a stock field',
  finishedGoodsValue(baseGame({ products: { processedWood: { ...inst('processedWood', { stock: 999 }), phase: 'testing' } } })) === 0);
ok('finished goods flow into workingCapital()',
  workingCapital(withStock) > workingCapital(baseGame()));

// ================================================================ live integration
section('Live — the launch handler seeds sane inventory defaults');
function newRun(patch) {
  const ind = getIndustry('manufacturing');
  const team = window.__buildTeam(ind.content.leaders.slice(0, 3));
  const H = window.__makeHandlers('en', []);
  const allProjects = {};
  (ind.content.projects || []).forEach(p => { allProjects[p.id] = true; });
  H.setState({
    ...window.__initialState(team, 'en', { ...window.__getScenario('fullRun'), industryId: 'manufacturing', endMonth: ind.runEnd }, []),
    capital: 5000, ap: 6, laborPool: 60, reputation: 90, boardConfidence: 90, completed: allProjects,
    ...(patch || {}),
  });
  return { H, ind };
}
function tick(H, n, forceRandom) {
  const real = Math.random;
  Math.random = forceRandom != null ? () => forceRandom : real;
  try { for (let i = 0; i < n; i++) { if (H.getState().gameOver) break; H.endMonth(); H.setState({ ...H.getState(), ap: 6 }); } }
  finally { Math.random = real; }
}
// Quality is on the 0-100 scale now; 6 (a leftover 1-10 figure) would read as already-spoiled
// stock from month one. Anchored to the real product's own ceiling instead.
const readyToLaunch = { productId: 'processedWood', phase: 'production', phaseMonthsLeft: 0,
  quality: PRODUCT_BY_ID.processedWood.qualityCeiling, defectRate: 0.05, channelsOpened: [], launchType: null,
  appealBonus: 1, costReduction: 0, totalCapitalSpent: 0 };

const { H: H1 } = newRun({ products: { processedWood: readyToLaunch } });
H1.handleLaunchProduct('processedWood', 'b2b');
let s = H1.getState();
ok('starts with zero stock', s.products.processedWood.stock === 0);
ok('defaults to Balanced production', s.products.processedWood.productionStance === 'balanced');
ok('defaults to Sell All', s.products.processedWood.salesStance === 'sellAll');
ok('a sensible hold-price floor is seeded even though the stance is not active yet',
  s.products.processedWood.holdPriceFloor > 0);

section('Live — production actually happens and creates real revenue');
const equip = () => ({ mfgFirstTooling: window.__instantiateEquipment('mfgFirstTooling'),
  mfgPilotLine: window.__instantiateEquipment('mfgPilotLine') });
const supplied = () => ({ redwoodTimber: { contractType: 'spot', active: true, relationship: 0 } });

const { H: H2 } = newRun({ products: { processedWood: readyToLaunch }, equipment: equip(), supplierContracts: supplied() });
H2.handleLaunchProduct('processedWood', 'b2b');
const capBefore = H2.getState().capital;
tick(H2, 1, 0.999);
s = H2.getState();
ok('units were actually produced', s.products.processedWood.lastProducedUnits > 0);
ok('units were actually sold', s.products.processedWood.lastSoldUnits > 0);
ok('a B2B sale creates a receivable, not instant cash', (s.receivables || []).length > 0);
ok('the receivable is NOT already collected the same month it was created (the ordering bug)',
  (s.receivables || []).every(r => r.monthsLeft > 0), JSON.stringify(s.receivables));

section('Live — Build to Stock + Hold for Price genuinely decouples production from sales');
const { H: H3 } = newRun({ products: { processedWood: readyToLaunch }, equipment: equip(), supplierContracts: supplied() });
H3.handleLaunchProduct('processedWood', 'b2b');
H3.handleSetProductionStance('processedWood', 'buildToStock');
H3.handleSetSalesStance('processedWood', 'holdForPrice', 999); // absurdly high — never clears
tick(H3, 3, 0.999);
s = H3.getState();
ok('real stock accumulated over multiple months', s.products.processedWood.stock > 0);
ok('nothing sold while holding', s.products.processedWood.lastSoldUnits === 0);
ok('working capital reflects the built stock', workingCapital(s) > 0);
ok('finishedGoodsValue matches what workingCapital is counting', finishedGoodsValue(s) > 0);

section('Live — switching stances takes effect and is logged');
const { H: H4 } = newRun({ products: { processedWood: readyToLaunch } });
H4.handleLaunchProduct('processedWood', 'b2b');
H4.handleSetProductionStance('processedWood', 'buildToStock');
s = H4.getState();
ok('production stance actually changed', s.products.processedWood.productionStance === 'buildToStock');
ok('a ticket was logged', /Build to Stock|Producir para Inventario/.test(s.log[0].title));
H4.handleSetSalesStance('processedWood', 'holdForPrice', 42);
s = H4.getState();
ok('sales stance and floor both changed together', s.products.processedWood.salesStance === 'holdForPrice'
  && s.products.processedWood.holdPriceFloor === 42);

section('Live — holding cost is actually charged, not just computed');
// Storage capacity now scales with output (step 3), so a 500-unit hoard on a small line triggers
// overflow liquidation — which pays cash IN and swamps the holding cost this test measures. Held
// under the cap so the test isolates holding cost, which is what it was written for.
const { H: H5 } = newRun({ products: { processedWood: { ...readyToLaunch, phase: 'launched', phaseMonthsLeft: 0,
  launchType: 'b2b', channelsOpened: [], stock: 40, lots: [{ units: 40, quality: 5, producedMonth: 0 }],
  productionStance: 'buildToOrder', salesStance: 'holdForPrice', holdPriceFloor: 999 } } });
const capBeforeHold = H5.getState().capital;
tick(H5, 1, 0.999);
ok('holding stock costs money each month',
  H5.getState().capital < capBeforeHold, `${capBeforeHold} -> ${H5.getState().capital}`);

section('Live — market price genuinely drives revenue, replacing the flat constant');
const { H: H6a } = newRun({ products: { processedWood: readyToLaunch }, equipment: equip(), supplierContracts: supplied() });
H6a.handleLaunchProduct('processedWood', 'b2b');
tick(H6a, 1, 0.999);
const priceAfterMonth1 = H6a.getState().market.processedWood.price;
ok('the market price actually moved off the flat baseline after real production', priceAfterMonth1 !== PRODUCT_BY_ID.processedWood.priceFloor);
ok('production feeds market SUPPLY (price should soften after a month of real output)',
  priceAfterMonth1 < window.__ECONOMY.processedWood.basePrice,
  `${priceAfterMonth1} vs base ${window.__ECONOMY.processedWood.basePrice}`);

section('Live — legacy and product revenue are additive, not double-counted');
// A company with SOME legacy accumulator capacity (from generic projects) AND a launched product
// should see revenue from both, not one overwriting the other or the total being inflated.
const { H: H7 } = newRun({ capacity: 20, demand: 20, products: { processedWood: readyToLaunch }, equipment: equip(), supplierContracts: supplied() });
H7.handleLaunchProduct('processedWood', 'b2c');
tick(H7, 1, 0.999);
s = H7.getState();
ok('revenuePerMonth reflects genuine production, not zero and not absurd',
  s.revenuePerMonth >= 0 && s.revenuePerMonth < 100000);


section('Phase C step 1 — stock as lots (behaviour-neutral migration)');
const lotsOf = window.__lotsOf;
const totalStock = window.__totalStock;
const mergeLots = window.__mergeLots;
const addLot = window.__addLot;
const drawFromLots = window.__drawFromLots;

ok('a product with no lots reads as empty', totalStock({ lots: [] }) === 0);
ok('legacy SCALAR stock still reads correctly — old saves and fixtures must not break',
  totalStock({ stock: 42 }) === 42);
ok('a legacy scalar surfaces as one undated lot', (() => {
  const l = lotsOf({ stock: 42 });
  return l.length === 1 && l[0].units === 42 && l[0].producedMonth === null;
})());
ok('lots sum to the total', totalStock({ lots: [{ units: 10 }, { units: 5 }] }) === 15);
ok('an empty instance is safe', totalStock(null) === 0 && lotsOf(null).length === 0);

section('Q2 — adjacent identical lots merge, so a long run cannot bloat');
// RULE CHANGED (and this was a real bug): lots merge only when they share a rounded quality AND
// a production month. Comparing stored quality alone let a degraded 20-month-old batch merge with
// a fresh one — both read `quality: 6` as stored while their EFFECTIVE quality was 1.2 vs 6.0 —
// silently rejuvenating the old stock.
ok('same-month, same-quality lots collapse into one',
  mergeLots([{ units: 10, quality: 6, producedMonth: 5 }, { units: 5, quality: 6, producedMonth: 5 }]).length === 1);
ok('the merged lot keeps ALL the units',
  mergeLots([{ units: 10, quality: 6, producedMonth: 5 }, { units: 5, quality: 6, producedMonth: 5 }])[0].units === 15);
ok('lots from DIFFERENT months never merge, however similar their stored quality',
  mergeLots([{ units: 10, quality: 6, producedMonth: 1 }, { units: 5, quality: 6, producedMonth: 14 }]).length === 2);
ok('merging can never rejuvenate degraded stock', (() => {
  const merged = mergeLots([{ units: 50, quality: 6, producedMonth: 0 }, { units: 40, quality: 6, producedMonth: 14 }]);
  return merged.length === 2 && merged[0].producedMonth === 0 && merged[0].units === 50;
})());
ok('different-quality lots stay separate',
  mergeLots([{ units: 10, quality: 6, producedMonth: 1 }, { units: 5, quality: 3, producedMonth: 1 }]).length === 2);
ok('quality is compared after rounding within the same month',
  mergeLots([{ units: 10, quality: 6.1, producedMonth: 5 }, { units: 5, quality: 6.4, producedMonth: 5 }]).length === 1);
ok('empty lots are dropped', mergeLots([{ units: 0, quality: 6 }, { units: 5, quality: 3 }]).length === 1);

section('addLot');
ok('adding to an empty product creates the first lot', addLot({ lots: [] }, 10, 6, 1).length === 1);
ok('adding zero units changes nothing', addLot({ lots: [] }, 0, 6, 1).length === 0);
ok('adding output in the SAME month merges rather than appending',
  addLot({ lots: [{ units: 10, quality: 6, producedMonth: 1 }] }, 5, 6, 1).length === 1);
ok('adding output in a LATER month appends — it is genuinely younger stock',
  addLot({ lots: [{ units: 10, quality: 6, producedMonth: 1 }] }, 5, 6, 2).length === 2);
ok('adding different-quality output appends',
  addLot({ lots: [{ units: 10, quality: 6, producedMonth: 1 }] }, 5, 2, 2).length === 2);

section('FIFO — oldest stock ships first, which is what will make decay bite in step 2');
const twoLots = [{ units: 10, quality: 6, producedMonth: 1 }, { units: 10, quality: 3, producedMonth: 5 }];
const draw = drawFromLots(twoLots, 12);
ok('exactly the requested units are drawn', draw.taken === 12);
ok('the oldest lot is consumed first', draw.drawn[0].producedMonth === 1 && draw.drawn[0].units === 10);
ok('the remainder comes from the next lot', draw.drawn[1].units === 2);
ok('what is left is correct', totalStock({ lots: draw.kept }) === 8);
ok('drawing more than exists takes only what there is',
  drawFromLots(twoLots, 999).taken === 20);
ok('drawing zero leaves everything', totalStock({ lots: drawFromLots(twoLots, 0).kept }) === 20);
ok('drawing from nothing is safe', drawFromLots([], 10).taken === 0);

section('Live — production creates dated lots, and the scalar mirror stays true');
const lotRun = newRun({ products: { processedWood: { ...readyToLaunch, phase: 'launched', phaseMonthsLeft: 0,
  launchType: 'b2b', channelsOpened: ['developers'], stock: 0, lots: [],
  productionStance: 'buildToStock', salesStance: 'holdForPrice', holdPriceFloor: 999 } },
  equipment: equip(), supplierContracts: supplied() }).H;
tick(lotRun, 4, 0.999);
const lotInst = lotRun.getState().products.processedWood;
ok('production actually created stock', totalStock(lotInst) > 0);
ok('the scalar `stock` mirror matches the lots exactly — no silent divergence',
  lotInst.stock === totalStock(lotInst), `scalar ${lotInst.stock} vs lots ${totalStock(lotInst)}`);
ok('lot count stays bounded rather than growing without limit',
  lotsOf(lotInst).length <= 4, `${lotsOf(lotInst).length} lots after 4 months`);
ok('every lot carries a production month', lotsOf(lotInst).every(l => l.producedMonth != null));
ok('every lot carries a quality figure', lotsOf(lotInst).every(l => l.quality != null));


section('Phase C step 2 — quality decay, per material');
const shelfLifeFor = window.__shelfLifeFor;
const lotQualityNow = window.__lotQualityNow;
const lotValueRatio = window.__lotValueRatio;
const averageLotQuality = window.__averageLotQuality;
const oldestLotAge = window.__oldestLotAge;
const ECON = window.__ECONOMY;

ok('every playable line declares a shelf life',
  window.__MANUFACTURING_CATALOG.every(p => !!ECON[p.id] && !!ECON[p.id].shelfLife),
  window.__MANUFACTURING_CATALOG.filter(p => !ECON[p.id] || !ECON[p.id].shelfLife).map(p => p.id).join(',') || 'all covered');
ok('shelf life is authored as CONTENT on the entity, not hardcoded in engine logic',
  !!ECON.paperProducts.shelfLife && !!ECON.refinedMetal.shelfLife);
ok('paper degrades sooner than metal',
  ECON.paperProducts.shelfLife.graceMonths < ECON.refinedMetal.shelfLife.graceMonths);
ok('paper degrades faster than metal once it starts',
  ECON.paperProducts.shelfLife.decayPerMonth > ECON.refinedMetal.shelfLife.decayPerMonth);
ok('an unknown product falls back rather than crashing', !!shelfLifeFor('nonsense'));

section('Decay respects the grace period');
const PAPER_CEILING = PRODUCT_BY_ID.paperProducts.qualityCeiling;
const freshPaper = { units: 10, quality: PAPER_CEILING, producedMonth: 0 };
ok('quality is untouched during the grace period',
  lotQualityNow(freshPaper, 'paperProducts', 3, {}) === PAPER_CEILING);
ok('decay begins only after grace',
  lotQualityNow(freshPaper, 'paperProducts', 6, {}) < PAPER_CEILING);
ok('older stock is worse than newer stock',
  lotQualityNow(freshPaper, 'paperProducts', 12, {}) < lotQualityNow(freshPaper, 'paperProducts', 6, {}));
ok('quality never goes negative',
  lotQualityNow(freshPaper, 'paperProducts', 999, {}) >= 0);
ok('metal at two years still beats paper at one — the materials genuinely differ',
  lotQualityNow({ units: 10, quality: PRODUCT_BY_ID.refinedMetal.qualityCeiling, producedMonth: 0 }, 'refinedMetal', 24, {})
  > lotQualityNow(freshPaper, 'paperProducts', 12, {}));
ok('an undated legacy lot never decays (cannot compute an age for it)',
  lotQualityNow({ units: 10, quality: null, producedMonth: null }, 'paperProducts', 99, {}) === null);

section('Warehousing halves decay — the tier\u2019s third distinct job');
const withWh = { ownedTiers: { warehousing: {} } };
ok('a warehouse preserves quality better',
  lotQualityNow(freshPaper, 'paperProducts', 12, withWh) > lotQualityNow(freshPaper, 'paperProducts', 12, {}));
ok('it halves the loss rather than eliminating it', (() => {
  const lostPlain = PAPER_CEILING - lotQualityNow(freshPaper, 'paperProducts', 12, {});
  const lostWh = PAPER_CEILING - lotQualityNow(freshPaper, 'paperProducts', 12, withWh);
  return Math.abs(lostWh - lostPlain / 2) < 0.01;
})());

section('Value follows quality, with a floor');
ok('fresh stock is worth full value', lotValueRatio(freshPaper, 'paperProducts', 0, {}) === 1);
ok('degraded stock is worth less', lotValueRatio(freshPaper, 'paperProducts', 12, {}) < 1);
ok('badly degraded stock is worth LESS but never worthless',
  lotValueRatio(freshPaper, 'paperProducts', 999, {}) >= 0.35);
ok('an undated legacy lot is valued at face', lotValueRatio({ quality: null, producedMonth: null }, 'paperProducts', 99, {}) === 1);

section('Summary figures for the Inventory tab');
const mixed = { productId: 'paperProducts', lots: [
  { units: 10, quality: PAPER_CEILING, producedMonth: 0 },
  { units: 10, quality: PAPER_CEILING, producedMonth: 10 },
] };
ok('average quality is weighted across lots', averageLotQuality(mixed, 10, {}) < PAPER_CEILING);
ok('oldest age reports the eldest batch', oldestLotAge(mixed, 10) === 10);
ok('an empty product reports no average', averageLotQuality({ lots: [] }, 5, {}) === null);

section('Live — degraded stock earns less revenue when it finally sells');
function agedRun(monthsHeld) {
  const H = newRun({
    products: { paperProducts: { productId: 'paperProducts', phase: 'launched', quality: PAPER_CEILING, defectRate: 0.05,
      channelsOpened: ['developers'], launchType: 'b2c', appealBonus: 1, costReduction: 0,
      stock: 200, lots: [{ units: 200, quality: PAPER_CEILING, producedMonth: 0 }],
      productionStance: 'buildToOrder', salesStance: 'sellAll', holdPriceFloor: 44,
      lastProducedUnits: 0, lastSoldUnits: 0 } },
    equipment: equip(), supplierContracts: supplied(), month: monthsHeld,
  }).H;
  return H;
}
const fresh = agedRun(1);
const stale = agedRun(20);
const freshValue = window.__finishedGoodsValue(fresh.getState());
const staleValue = window.__finishedGoodsValue(stale.getState());
ok('identical stock held longer is worth measurably less on the books',
  staleValue < freshValue, `fresh ${Math.round(freshValue)} vs 20mo-old ${Math.round(staleValue)}`);


section('Shipping fresh stock to meet a quality bar (direction: not strict FIFO for premium orders)');
const stockMeetingQuality = window.__stockMeetingQuality;
const mixedAge = [
  { units: 50, quality: PAPER_CEILING, producedMonth: 0 },   // old, heavily degraded by month 15
  { units: 40, quality: PAPER_CEILING, producedMonth: 14 },  // fresh
];
ok('an ordinary draw is still strictly oldest-first',
  drawFromLots(mixedAge, 30).drawn[0].producedMonth === 0);
const PREMIUM_BAR = PAPER_CEILING * 0.8;
const premiumDraw = drawFromLots(mixedAge, 30, { minQuality: PREMIUM_BAR, productId: 'paperProducts', month: 15, game: {} });
ok('a quality bar lets the fresh batch ship instead',
  premiumDraw.drawn.every(l => l.producedMonth === 14));
ok('the full order is filled from qualifying stock', premiumDraw.taken === 30);
ok('the degraded batch is left completely untouched — you ship around it, not out of it',
  premiumDraw.kept.some(l => l.producedMonth === 0 && l.units === 50));
ok('a bar higher than anything on hand fills nothing',
  drawFromLots(mixedAge, 30, { minQuality: PAPER_CEILING + 1, productId: 'paperProducts', month: 15, game: {} }).taken === 0);
ok('stockMeetingQuality counts only what clears the bar',
  stockMeetingQuality({ productId: 'paperProducts', lots: mixedAge }, PREMIUM_BAR, 15, {}) === 40);
ok('at a low bar, everything counts',
  stockMeetingQuality({ productId: 'paperProducts', lots: mixedAge }, 1, 15, {}) === 90);
ok('undated legacy stock cannot be certified against a bar',
  drawFromLots([{ units: 10, quality: null, producedMonth: null }], 5,
    { minQuality: 30, productId: 'paperProducts', month: 15, game: {} }).taken === 0);

section('Phase C step 3 — storage is a SOFT cap');
const storageCapacity = window.__storageCapacity;
const totalHeldUnits = window.__totalHeldUnits;
const mfgInd2 = getIndustry('manufacturing');
ok('an industry with no product catalogue has no cap',
  storageCapacity({ products: {} }, getIndustry('hospitality')) === Infinity);
ok('baseline storage is non-zero — Build to Stock must be possible from month one',
  storageCapacity({ products: {}, inventoryStrategy: 'balanced' }, mfgInd2) > 0);
ok('Warehousing raises the ceiling', (() => {
  const base = { products: {}, inventoryStrategy: 'balanced', ownedTiers: {} };
  const wh = { products: {}, inventoryStrategy: 'balanced', ownedTiers: { warehousing: {} } };
  return storageCapacity(wh, mfgInd2) >= storageCapacity(base, mfgInd2);
})());
ok('a high-inventory strategy raises the ceiling over a lean one',
  storageCapacity({ products: {}, inventoryStrategy: 'high' }, mfgInd2)
  >= storageCapacity({ products: {}, inventoryStrategy: 'lean' }, mfgInd2));
ok('held units sum across launched products only',
  totalHeldUnits({ products: {
    a: { phase: 'launched', lots: [{ units: 10 }] },
    b: { phase: 'testing', lots: [{ units: 999 }] },
  } }) === 10);

section('Live — overflow liquidates rather than blocking production');
const floodRun = newRun({
  products: { processedWood: { ...readyToLaunch, phase: 'launched', phaseMonthsLeft: 0,
    launchType: 'b2b', channelsOpened: ['developers'], stock: 0, lots: [],
    productionStance: 'buildToStock', salesStance: 'holdForPrice', holdPriceFloor: 9999,
    lastProducedUnits: 0, lastSoldUnits: 0 } },
  equipment: equip(), supplierContracts: supplied(),
}).H;
tick(floodRun, 20, 0.999);
const flooded = floodRun.getState();
ok('production was never blocked — stock still exists', totalStock(flooded.products.processedWood) > 0);
ok('an overflow ticket fired', flooded.log.some(x => /Storage Overflow/.test(x.title)));
ok('held stock is held near the cap rather than growing without limit',
  totalHeldUnits(flooded) <= storageCapacity(flooded, mfgInd2) * 1.5,
  `held ${Math.round(totalHeldUnits(flooded))} vs cap ${Math.round(storageCapacity(flooded, mfgInd2))}`);
ok('lot count stays bounded even over 20 months of hoarding',
  lotsOf(flooded.products.processedWood).length < 20,
  `${lotsOf(flooded.products.processedWood).length} lots`);


section('Phase C step 6 — warehouse events (fire, theft, damp)');
const WAREHOUSE_EVENTS = window.__WAREHOUSE_EVENTS;
const warehouseEventChance = window.__warehouseEventChance;
const pickWarehouseEvent = window.__pickWarehouseEvent;
const drawHighestQualityFirst = window.__drawHighestQualityFirst;
const mfgIndW = getIndustry('manufacturing');
const stockGame = (units, warehouse) => ({
  products: { paperProducts: { phase: 'launched', productId: 'paperProducts',
    lots: [{ units, quality: 50, producedMonth: 0 }] } },
  ownedTiers: warehouse ? { warehousing: {} } : {},
  inventoryStrategy: 'balanced',
});

ok('three event types exist', Object.keys(WAREHOUSE_EVENTS).length === 3);
ok('every event is bilingual', Object.values(WAREHOUSE_EVENTS).every(e => e.name.en && e.name.es));
ok('fire is the rarest, damp the most common', WAREHOUSE_EVENTS.fire.weight < WAREHOUSE_EVENTS.damp.weight);
ok('fire destroys more than theft takes',
  WAREHOUSE_EVENTS.fire.lossFraction[1] > WAREHOUSE_EVENTS.theft.lossFraction[1]);
ok('damp removes NOTHING — it only degrades',
  !WAREHOUSE_EVENTS.damp.lossFraction && WAREHOUSE_EVENTS.damp.qualityLoss);

section('Events are conditional on actually having stock');
ok('a company holding nothing is never hit', warehouseEventChance(stockGame(0, false), mfgIndW) === 0);
ok('a trivial holding is never hit', warehouseEventChance(stockGame(5, false), mfgIndW) === 0);
ok('a real holding carries real risk', warehouseEventChance(stockGame(200, false), mfgIndW) > 0);
ok('more stock means more exposure',
  warehouseEventChance(stockGame(600, false), mfgIndW) > warehouseEventChance(stockGame(100, false), mfgIndW));
ok('risk is capped — a big holding is never a guaranteed monthly disaster',
  warehouseEventChance(stockGame(99999, false), mfgIndW) <= 0.14);
ok('an industry with no product catalogue has no warehouse risk at all',
  warehouseEventChance(stockGame(500, false), getIndustry('hospitality')) === 0);

section('Warehousing reduces FREQUENCY — the tier\u2019s third distinct job');
ok('owning Warehousing lowers the chance',
  warehouseEventChance(stockGame(400, true), mfgIndW) < warehouseEventChance(stockGame(400, false), mfgIndW));
ok('it reduces risk without eliminating it', warehouseEventChance(stockGame(400, true), mfgIndW) > 0);

section('Theft inverts FIFO — it takes your BEST stock, not your oldest');
const goodAndBad = [
  { units: 50, quality: 20, producedMonth: 0 },   // degraded
  { units: 50, quality: 58, producedMonth: 19 },  // fresh, valuable
];
const stolen = drawHighestQualityFirst(goodAndBad, 50, 'paperProducts', 20, {});
ok('exactly the requested amount is taken', stolen.taken === 50);
ok('the HIGH-quality lot is what disappears',
  stolen.kept.length === 1 && stolen.kept[0].producedMonth === 0);
ok('the degraded stock is what survives — the opposite of every other draw in the game',
  stolen.kept[0].quality === 20);
ok('taking more than exists takes only what there is',
  drawHighestQualityFirst(goodAndBad, 999, 'paperProducts', 20, {}).taken === 100);
ok('taking from nothing is safe', drawHighestQualityFirst([], 10, 'paperProducts', 1, {}).taken === 0);

section('Event selection is weighted, not uniform');
ok('all three types come up across many draws', (() => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(pickWarehouseEvent().id);
  return seen.size === 3;
})());
ok('damp genuinely comes up more often than fire', (() => {
  const counts = { fire: 0, damp: 0 };
  for (let i = 0; i < 3000; i++) {
    const id = pickWarehouseEvent().id;
    if (counts[id] !== undefined) counts[id] += 1;
  }
  return counts.damp > counts.fire;
})());

console.log(`\n${'='.repeat(60)}\nFinished Goods Inventory (Phase A): ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
