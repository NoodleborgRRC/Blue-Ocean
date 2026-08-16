// VERTICAL INTEGRATION (7a) — chain tiers and player acquisitions. Pure math first, then live
// integration: does owning the chain actually change how the company runs, and does it cost?
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

const CHAIN_TIERS = window.__CHAIN_TIERS;
const BACKWARD_TIERS = window.__BACKWARD_TIERS;
const chainTier = window.__chainTier;
const tierIsLive = window.__tierIsLive;
const tierForMaterial = window.__tierForMaterial;
const ownedTiers = window.__ownedTiers;
const ownsTier = window.__ownsTier;
const tierBuildable = window.__tierBuildable;
const tierMonthlyOverhead = window.__tierMonthlyOverhead;
const tierMaterialRelief = window.__tierMaterialRelief;
const integrationMonthsFor = window.__integrationMonthsFor;
const integrationDrag = window.__integrationDrag;
const rivalAcquisitionCost = window.__rivalAcquisitionCost;
const rivalAcquirable = window.__rivalAcquirable;
const inheritedProductFrom = window.__inheritedProductFrom;
const inheritedDebtFrom = window.__inheritedDebtFrom;
const selloffValue = window.__selloffValue;
const getIndustry = window.__getIndustry2;

const mkRival = (o) => ({
  id: o.id || 'c1', seedId: o.seedId || 'r1', name: o.name || 'Test Co',
  strength: o.strength != null ? o.strength : 40,
  marketPosition: o.marketPosition != null ? o.marketPosition : 30,
  archetype: o.archetype || 'costLeader', encounters: o.encounters || {},
  runsSeen: 1, leaders: o.leaders || [{ name: 'A Leader', role: 'CEO', trait: 'Poacher' }],
  logo: { hue: 100 }, allianceWith: [], acquisitionsMade: 0, ...o,
});

// ================================================================ the chain
section('Chain tiers — the Bible\u2019s seven, backward half live');
ok('all seven tiers are defined', Object.keys(CHAIN_TIERS).length === 7, `${Object.keys(CHAIN_TIERS).length}`);
ok('three backward tiers are live now', BACKWARD_TIERS.length === 3, BACKWARD_TIERS.map(t => t.id).join(','));
ok('the player\u2019s own position is in the chain but never purchasable',
  CHAIN_TIERS.manufacturing.alwaysOwned === true && !tierBuildable({ ownedTiers: {}, acquiredSuppliers: {} }, 'manufacturing').open);
ok('forward tiers are now live (7b shipped)',
  ['warehousing', 'distribution', 'retail'].every(id => CHAIN_TIERS[id] && !CHAIN_TIERS[id].deferred));
ok('every tier is bilingual', Object.values(CHAIN_TIERS).every(t => t.name.en && t.name.es && t.desc.en && t.desc.es));
ok('every PURCHASABLE tier carries a permanent monthly overhead — obligation-with-capability',
  Object.values(CHAIN_TIERS).filter(t => !t.alwaysOwned).every(t => t.monthlyOverhead > 0));
ok('every purchasable tier has a build cost',
  Object.values(CHAIN_TIERS).filter(t => !t.alwaysOwned).every(t => t.buildCost > 0));
ok('the always-owned tier costs nothing to hold', CHAIN_TIERS.manufacturing.monthlyOverhead === 0);
ok('tiers are ordered along the chain',
  BACKWARD_TIERS.every((t, i) => i === 0 || t.order >= BACKWARD_TIERS[i - 1].order));
ok('every non-deferred tier reports as live', tierIsLive('retail') && tierIsLive('processing'));
ok('an unknown tier resolves to null rather than crashing', chainTier('nonsense') === null);
ok('further upstream costs more — the forest is dearer than the mill',
  CHAIN_TIERS.rawMaterials.buildCost > CHAIN_TIERS.processing.buildCost);
ok('further upstream also relieves more material cost',
  CHAIN_TIERS.rawMaterials.materialCostReduction > CHAIN_TIERS.processing.materialCostReduction);

section('Materials map onto tiers');
ok('wood materials sit in processing',
  tierForMaterial('timber') === 'processing' && tierForMaterial('sand') === 'processing');
ok('parts sit in components',
  ['metals', 'petrochemicals', 'fibers'].every(m => tierForMaterial(m) === 'components'));
ok('an unknown material still maps somewhere rather than returning undefined',
  !!chainTier(tierForMaterial('unobtanium')));

// ================================================================ ownership
section('Two routes into a tier (direction\u2019s option C)');
const emptyGame = { ownedTiers: {}, acquiredSuppliers: {}, rivalSuppliers: {} };
ok('a fresh company owns nothing', ownedTiers(emptyGame).size === 0);
const builtGame = { ownedTiers: { processing: { acquiredMonth: 5 } }, acquiredSuppliers: {}, rivalSuppliers: {} };
ok('route 1: building the tier directly grants it', ownsTier(builtGame, 'processing'));
const viaSupplier = { ownedTiers: {}, acquiredSuppliers: { redwoodTimber: { acquiredMonth: 5 } }, rivalSuppliers: {} };
ok('route 2: acquiring a supplier grants ITS tier (reuses item 3 rather than duplicating it)',
  ownsTier(viaSupplier, 'processing'), [...ownedTiers(viaSupplier)].join(','));
ok('acquiring a hardwood supplier does NOT grant the components tier',
  !ownsTier(viaSupplier, 'components'));
ok('acquiring a hardware supplier grants components',
  ownsTier({ ownedTiers: {}, acquiredSuppliers: { ironcladFasteners: {} }, rivalSuppliers: {} }, 'components'));

section('The ladder: upstream tiers require the one below');
ok('processing is buildable from nothing', tierBuildable(emptyGame, 'processing').open);
ok('components is buildable from nothing', tierBuildable(emptyGame, 'components').open);
ok('rawMaterials is NOT buildable without processing', !tierBuildable(emptyGame, 'rawMaterials').open);
ok('the refusal names what is missing', tierBuildable(emptyGame, 'rawMaterials').need === 'processing');
ok('rawMaterials becomes buildable once processing is owned', tierBuildable(builtGame, 'rawMaterials').open);
ok('...including when processing came via a supplier acquisition',
  tierBuildable(viaSupplier, 'rawMaterials').open);
ok('an already-owned tier cannot be bought again', !tierBuildable(builtGame, 'processing').open);
ok('forward tiers stand alone — retail does not require distribution (it is PRICED, not gated)',
  tierBuildable(builtGame, 'retail').open);

section('Obligations scale with what you own');
ok('owning nothing costs nothing', tierMonthlyOverhead(emptyGame) === 0);
ok('owning one tier bills monthly', tierMonthlyOverhead(builtGame) === CHAIN_TIERS.processing.monthlyOverhead);
ok('owning two tiers bills for both', tierMonthlyOverhead({
  ownedTiers: { processing: {}, components: {} }, acquiredSuppliers: {}, rivalSuppliers: {},
}) === CHAIN_TIERS.processing.monthlyOverhead + CHAIN_TIERS.components.monthlyOverhead);

section('Capabilities are real and tier-scoped');
const reliefNone = tierMaterialRelief(emptyGame, 'timber');
ok('owning nothing gives no relief and no immunity', reliefNone.costReduction === 0 && !reliefNone.immune);
const reliefOwned = tierMaterialRelief(builtGame, 'timber');
ok('owning processing cuts wood material cost', reliefOwned.costReduction > 0);
ok('owning processing makes wood immune to disruption', reliefOwned.immune === true);
ok('but does NOT help a material from another tier',
  tierMaterialRelief(builtGame, 'metals').costReduction === 0);

// ================================================================ integration periods
section('Integration periods — eased by Agility, never eliminated');
ok('a low-agility company integrates slowly', integrationMonthsFor({ stats: { agility: 0 } }) >= 4);
ok('a high-agility company integrates faster',
  integrationMonthsFor({ stats: { agility: 9 } }) < integrationMonthsFor({ stats: { agility: 0 } }));
ok('integration is never instant, however agile', integrationMonthsFor({ stats: { agility: 99 } }) >= 2);
ok('no active integration means no drag', integrationDrag({ integrations: [] }) === 0);
ok('an active integration drags production', integrationDrag({ integrations: [{ monthsLeft: 2 }] }) > 0);
ok('a finished integration stops dragging', integrationDrag({ integrations: [{ monthsLeft: 0 }] }) === 0);

// ================================================================ rival acquisition
section('Rival acquisition gating');
const capableGame = { ownedTiers: { processing: {} }, acquiredSuppliers: {}, rivalSuppliers: {},
  marketPosition: 60, completed: {}, competitors: [] };
const incapable = { ownedTiers: {}, acquiredSuppliers: {}, rivalSuppliers: {}, marketPosition: 60, completed: {} };
ok('a company with no chain position cannot acquire',
  !rivalAcquirable(incapable, mkRival({})).open);
ok('...unless it has the backward-integration capability project',
  rivalAcquirable({ ...incapable, completed: { mfgBackwardIntegration: true } }, mkRival({})).open);
ok('a company that owns a tier can acquire', rivalAcquirable(capableGame, mkRival({})).open);
ok('a hostile rival will not sell at any price',
  !rivalAcquirable(capableGame, mkRival({ encounters: { attackedByPlayer: 8, defeatedByPlayer: 4 } })).open);
ok('a rival bigger than you cannot be swallowed',
  !rivalAcquirable(capableGame, mkRival({ marketPosition: 95 })).open);
ok('the refusal explains which reason applies',
  rivalAcquirable(capableGame, mkRival({ marketPosition: 95 })).reason === 'tooBig');
ok('cost scales with what they are worth',
  rivalAcquisitionCost(mkRival({ strength: 80, marketPosition: 60 }))
  > rivalAcquisitionCost(mkRival({ strength: 20, marketPosition: 15 })));

section('What transfers — including the obligations');
const mfg = getIndustry('manufacturing');
const emptyCo = { products: {}, completed: {}, equipment: {}, supplierContracts: {}, acquiredSuppliers: {}, rivalSuppliers: {} };
const inheritedProduct = inheritedProductFrom(mkRival({}), emptyCo, mfg);
ok('an acquisition brings a product line', !!inheritedProduct);
ok('the inherited product is a real catalogue entry',
  mfg.productCatalog.some(p => p.id === inheritedProduct.id));
ok('an industry with no catalogue inherits no product',
  inheritedProductFrom(mkRival({}), emptyCo, getIndustry('hospitality')) === null);
const inheritedDebt = inheritedDebtFrom(mkRival({ strength: 60, marketPosition: 50 }));
ok('an acquisition brings their debt', !!inheritedDebt);
ok('the inherited debt owes more than its principal', inheritedDebt.remaining > inheritedDebt.principal);
ok('it is flagged as inherited rather than borrowed', inheritedDebt.inherited === true);
ok('a tiny rival carries no meaningful debt', inheritedDebtFrom(mkRival({ strength: 2, marketPosition: 2 })) === null);

section('Sell-off is lossy on purpose');
ok('selling recovers less than it cost',
  selloffValue({}, 'processing') < CHAIN_TIERS.processing.buildCost);
ok('a dearer tier still returns more than a cheap one',
  selloffValue({}, 'rawMaterials') > selloffValue({}, 'processing'));

// ================================================================ live integration
section('Live — building a tier');
function newRun(patch) {
  const ind = getIndustry('manufacturing');
  const team = window.__buildTeam(ind.content.leaders.slice(0, 3));
  const H = window.__makeHandlers('en', []);
  const allProjects = {};
  (ind.content.projects || []).forEach(p => { allProjects[p.id] = true; });
  H.setState({
    ...window.__initialState(team, 'en', { ...window.__getScenario('fullRun'), industryId: 'manufacturing', endMonth: ind.runEnd }, []),
    capital: 500000, presence: 40, ap: 6, reputation: 95, boardConfidence: 95,
    revenuePerMonth: 400, marketPosition: 60, laborPool: 60, completed: allProjects,
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

const { H } = newRun();
const capBefore = H.getState().capital;
H.handleBuildTier('processing');
let s = H.getState();
ok('the tier is now owned', ownsTier(s, 'processing'));
ok('it cost real capital', s.capital < capBefore, `${capBefore} -> ${s.capital}`);
ok('an integration period started', (s.integrations || []).length === 1);
ok('a ticket was logged', /Tier Acquired/.test(s.log[0].title));
H.handleBuildTier('rawMaterials');
ok('the next tier up is now reachable', ownsTier(H.getState(), 'rawMaterials'));

section('Live — the ladder is enforced in the handler, not just the helper');
const { H: H2 } = newRun();
H2.handleBuildTier('rawMaterials');
ok('rawMaterials is refused without processing', !ownsTier(H2.getState(), 'rawMaterials'));
ok('a denial ticket explains why', /own/i.test(H2.getState().log[0].body || ''), H2.getState().log[0].body);

section('Live — owning a tier shows up in monthly burn');
const { H: Hburn } = newRun();
const c0 = Hburn.getState().capital;
tick(Hburn, 1, 0.999);
const drawNoTier = c0 - Hburn.getState().capital;
const { H: Hburn2 } = newRun();
Hburn2.handleBuildTier('processing');
const c1 = Hburn2.getState().capital;
tick(Hburn2, 1, 0.999);
const drawWithTier = c1 - Hburn2.getState().capital;
ok('owning a tier increases the monthly drawdown', drawWithTier > drawNoTier,
  `${drawNoTier} -> ${drawWithTier}`);

section('Live — owning a tier makes its materials immune to disruption');
const { H: Himm } = newRun({
  ownedTiers: { processing: { acquiredMonth: 1 } },
  supplierContracts: { redwoodTimber: { contractType: 'spot', active: true, relationship: 0 } },
  inventoryStrategy: 'lean',
});
tick(Himm, 3, 0.001); // force disruption rolls
s = Himm.getState();
ok('a tier you own is never disrupted',
  !(s.supplierContracts.redwoodTimber.disruptedMonthsLeft > 0),
  `${s.supplierContracts.redwoodTimber.disruptedMonthsLeft}`);

section('Live — acquiring a rival transfers everything, obligations included');
const target = mkRival({ id: 'c-target', seedId: 'target', name: 'Bought Out Co',
  strength: 40, marketPosition: 30, encounters: { tradedWith: 3 } });
const { H: Hacq } = newRun({ ownedTiers: { processing: { acquiredMonth: 1 } }, competitors: [target] });
const mpBefore = Hacq.getState().marketPosition;
const debtsBefore = (Hacq.getState().debts || []).length;
const productsBefore = Object.keys(Hacq.getState().products || {}).length;
Hacq.handleAcquireRival('c-target');
s = Hacq.getState();
ok('the rival is gone from the market', !(s.competitors || []).some(c => c.seedId === 'target'));
ok('it is recorded as acquired', !!s.acquiredRivals.target);
ok('market position transferred', s.marketPosition > mpBefore, `${mpBefore} -> ${s.marketPosition}`);
ok('a product line came with it', Object.keys(s.products).length > productsBefore);
ok('their people came with it', (s.scatteredTalent || []).some(p => p.joinedViaAcquisition));
ok('their DEBT came with it too', (s.debts || []).length > debtsBefore, `${debtsBefore} -> ${(s.debts || []).length}`);
ok('the inherited debt is flagged as inherited', (s.debts || []).some(d => d.inherited));
ok('an integration period started', (s.integrations || []).some(i => i.kind === 'rival'));
ok('a Company Acquired ticket was logged', /Company Acquired/.test(s.log[0].title));
ok('the ticket itemises what was gained', /Gained:/.test(s.log[0].body), s.log[0].body.slice(0, 120));

section('Live — the inherited product bypasses the adjacency block (Bible §A.5.3)');
const inheritedIds = Object.keys(s.products);
ok('the company now holds a product it did not develop',
  inheritedIds.some(id => s.products[id].inheritedFrom === 'Bought Out Co'),
  inheritedIds.join(','));
ok('it arrives already launched — you bought a going concern',
  inheritedIds.some(id => s.products[id].inheritedFrom && s.products[id].phase === 'launched'));

section('Live — integration drags production, then completes');
ok('production is dragged while integrating', integrationDrag(s) > 0);
const months = (s.integrations.find(i => i.kind === 'rival') || {}).monthsLeft;
tick(Hacq, months + 1, 0.999);
const after = Hacq.getState();
ok('the integration eventually completes', integrationDrag(after) === 0);
ok('an Integration Complete ticket was logged', after.log.some(x => /Integration Complete/.test(x.title)));

section('Live — selling an asset back');
const { H: Hsell } = newRun({ ownedTiers: { processing: { acquiredMonth: 1 } } });
const capBeforeSell = Hsell.getState().capital;
Hsell.handleSellTier('processing');
s = Hsell.getState();
ok('the tier is no longer owned', !ownsTier(s, 'processing'));
ok('capital came back', s.capital > capBeforeSell);
ok('but less than it cost to build',
  s.capital - capBeforeSell < CHAIN_TIERS.processing.buildCost);
ok('an Asset Sold ticket was logged', /Asset Sold/.test(s.log[0].title));
ok('the overhead is gone with it', tierMonthlyOverhead(s) === 0);

section('Live — a hostile rival cannot be bought at any price');
const hostile = mkRival({ id: 'c-h', seedId: 'hostile', name: 'Nemesis Co',
  marketPosition: 20, encounters: { attackedByPlayer: 9, defeatedByPlayer: 5 } });
const { H: Hhost } = newRun({ ownedTiers: { processing: {} }, competitors: [hostile] });
Hhost.handleAcquireRival('c-h');
ok('the acquisition is refused', !Hhost.getState().acquiredRivals.hostile);
ok('they are still in the market', (Hhost.getState().competitors || []).some(c => c.seedId === 'hostile'));


section('AP costs — spot trading free, tier building explicit (this session\u2019s fixes)');
const tierConversions = window.__tierConversions;
ok('Lumber Processing shows real input/output conversions', (() => {
  const c = tierConversions('processing');
  return c.length > 0 && c.some(x => x.output.id === 'processedWood' && x.input.id === 'timber');
})());
ok('conversions never include recycled-loop entities that consume byproducts, not raw materials',
  tierConversions('components').every(c => c.input.id !== undefined && !c.output.id.startsWith('recycled')));
ok('a tier with no genuine conversions returns empty rather than guessing', tierConversions('warehousing').length === 0);
ok('the always-owned player-position tier has no conversion of its own', tierConversions('manufacturing').length === 0);

console.log(`\n${'='.repeat(60)}\nVertical Integration (7a): ${pass} passed, ${fail} failed\n${'='.repeat(60)}`);
process.exit(fail ? 1 : 0);
