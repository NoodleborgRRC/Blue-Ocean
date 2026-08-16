# Entrepreneur Simulator — Founder Classes, Perks & Meta-Progression

Extracted from `founder-hospitality-prototype.jsx` for external review. This is the exact code
currently in the shipped source (not a draft) — one contiguous module covering:

- **3 founder classes** (Visionary / Operator / Hustler) — each maps to a real, already-wired
  engine mechanic (see comments in code)
- **13 perks** (4 starter, 9 unlockable) — each is a small stat/resource delta applied via the
  existing "Operate" action
- **10 unlock markers** — one per area of gameplay (Exits, Failure, Public Markets, Investors,
  Diplomacy, Rivalry, Manufacturing, Hospitality, Fundraising, Longevity), each gating one perk
  plus stat points
- Point-buy stat allocation config
- Roster XP/leveling curve and per-run XP formula
- Portrait seed helpers (name → initials, hue bounding)

## Context a reviewer needs

- Six company stats the perks/classes touch: `agility, operations, innovation, cybersecurity,
  compliance, talentCulture`
- Six Founder Philosophy axes some content nudges: `growthVsSustainability,
  innovationVsExecution, peopleVsProfit, riskVsStability, premiumVsMass, centralizedVsDelegated`
- `game.stats`, `game.reputation`, `game.boardConfidence`, `game.morale`, `game.capacity`,
  `game.demand` are the run-state fields perk `deltas` write into
- There is exactly **one custom founder per save file** (player-created), plus a **roster** of
  pre-authored founders who earn XP/level by being brought on runs. The custom founder does NOT
  earn roster XP — they progress via the same 10 unlock markers instead.
- Point cap per stat at creation is `FOUNDER_MAX_PER_STAT = 3`; base starting budget is
  `FOUNDER_BASE_STAT_POINTS = 4`, growing by each marker's `grants.statPoints`.

## What would be useful feedback

- Balance of the 10 unlock thresholds relative to each other (some look far easier to hit than
  others — e.g. "raise 750k career-wide" vs "3 insolvencies")
- Whether perk `deltas` are proportionate to each other (some grant flat stat bonuses, others
  grant capital/capacity — hard to compare value directly)
- Whether the 3-class model (reusing the existing Visionary/Operator/Hustler mechanics) is rich
  enough for a player-created character, or whether custom founders deserve their own exclusive
  class options
- Naming/flavor consistency across perks

---

```javascript
// ============================== FOUNDER IDENTITY & META-PROGRESSION ==============================
// The player's own founder, plus the roster of pre-authored founders who accumulate experience
// alongside them across runs.
//
// The key architectural decision: the CUSTOM founder is the memory anchor. Philosophy drift,
// investor standings and rival history were previously stored profile-wide with no owner; they
// now belong to a named person with a face and a history. Because there is exactly one save file
// and one custom founder (locked decision), the existing global stores ARE that founder's memory
// — this layer gives them an owner rather than duplicating them into a second copy that could
// silently diverge.
//
// Roster founders are different: they are pre-authored (fixed name, bio, portrait, trait) and the
// player may NOT edit those. What they accumulate is experience — Mara at your side through two
// bankruptcies and an IPO is measurably stronger than a green hire, and the player allocates the
// stat points she earned along the way.

const FOUNDER_CLASSES = [
  {
    id: 'Visionary',
    name: { en: 'Visionary', es: 'Visionario' },
    blurb: {
      en: 'Sees the thing before anyone else does. Once a month you get a move nobody budgeted for.',
      es: 'Ve la cosa antes que nadie. Una vez al mes obtienes una jugada que nadie presupuestó.',
    },
    // These describe mechanics that ALREADY exist and are wired into the engine (see
    // handleInvest / fundraise / event resolution) — this is not new balance, it's the existing
    // team.style system given a player-facing identity.
    mechanics: {
      en: 'Once per month, an Invest action costs no Action Point.',
      es: 'Una vez al mes, una acción de Invertir no cuesta Punto de Acción.',
    },
    statAffinity: { innovation: 1, agility: 1 },
    philosophyLean: { innovationVsExecution: 12, riskVsStability: 8 },
  },
  {
    id: 'Operator',
    name: { en: 'Operator', es: 'Operador' },
    blurb: {
      en: 'Has run the floor. Things get built faster and break less often.',
      es: 'Ha dirigido la planta. Las cosas se construyen más rápido y se rompen menos.',
    },
    mechanics: {
      en: 'Every project finishes one month sooner. Fundraising is harder (-15 to the roll).',
      es: 'Cada proyecto termina un mes antes. Recaudar es más difícil (-15 a la tirada).',
    },
    statAffinity: { operations: 1, compliance: 1 },
    philosophyLean: { innovationVsExecution: -12, riskVsStability: -8 },
  },
  {
    id: 'Hustler',
    name: { en: 'Hustler', es: 'Emprendedor' },
    blurb: {
      en: 'Gets in the room. Costs less, absorbs bad news better, talks their way through the rest.',
      es: 'Entra a la sala. Cuesta menos, absorbe peores noticias, y habla para salir del resto.',
    },
    mechanics: {
      en: 'Fundraise costs 1 less Presence. Morale losses are softened by 2.',
      es: 'Recaudar cuesta 1 Presencia menos. Las pérdidas de Moral se reducen en 2.',
    },
    statAffinity: { talentCulture: 1, agility: 1 },
    philosophyLean: { premiumVsMass: -8, peopleVsProfit: 6 },
  },
];
const FOUNDER_CLASS_BY_ID = FOUNDER_CLASSES.reduce((a, c) => { a[c.id] = c; return a; }, {});

// ---------------------------------------------------------------- the 10 unlock markers
// One per area of gameplay, so progression pulls the player across the whole game rather than
// rewarding a single optimal loop. Each names the perk or capability it grants.
//
// `check` receives the accumulated meta record, NOT a single run — these are career milestones.
// Every one is derived from data the engine already records, so nothing here needs new tracking
// plumbing bolted onto the run loop.
const UNLOCK_MARKERS = [
  {
    id: 'firstExit', area: { en: 'Exits', es: 'Salidas' },
    name: { en: 'First Exit', es: 'Primera Salida' },
    requirement: { en: 'Win a run by any exit.', es: 'Gana una partida por cualquier salida.' },
    grants: { perks: ['closer'], statPoints: 1 },
    check: (m) => (m.wins || 0) >= 1,
  },
  {
    id: 'turnaroundSpecialist', area: { en: 'Failure', es: 'Fracaso' },
    name: { en: 'Turnaround Specialist', es: 'Especialista en Reestructuración' },
    requirement: { en: 'Go insolvent in three separate runs.', es: 'Cae en insolvencia en tres partidas distintas.' },
    // Straight from the brief: "Multiple bankruptcies unlock Turnaround Specialist."
    grants: { perks: ['turnaround'], statPoints: 1 },
    check: (m) => (m.byOutcome.insolvent || 0) >= 3,
  },
  {
    id: 'publicCompany', area: { en: 'Public Markets', es: 'Mercados Públicos' },
    name: { en: 'Public Company', es: 'Empresa Pública' },
    requirement: { en: 'Take a company public.', es: 'Saca una empresa a bolsa.' },
    grants: { perks: ['bellRinger'], statPoints: 1 },
    check: (m) => (m.byOutcome.ipo || 0) >= 1,
  },
  {
    id: 'kingmaker', area: { en: 'Investors', es: 'Inversionistas' },
    name: { en: 'Kingmaker', es: 'Hacedor de Reyes' },
    requirement: { en: 'Reach Champion standing with any investor.', es: 'Alcanza estatus de Defensor con algún inversionista.' },
    grants: { perks: ['warmIntro'], statPoints: 1 },
    check: (m) => Object.values(m.investorStandings || {}).some(v => v >= 55),
  },
  {
    id: 'peacemaker', area: { en: 'Diplomacy', es: 'Diplomacia' },
    name: { en: 'Peacemaker', es: 'Pacificador' },
    requirement: { en: 'Bring a rival company to Ally standing.', es: 'Lleva a una empresa rival a estatus de Aliado.' },
    grants: { perks: ['supplyPartner'], statPoints: 1 },
    check: (m) => (m.alliesFormed || 0) >= 1,
  },
  {
    id: 'nemesis', area: { en: 'Rivalry', es: 'Rivalidad' },
    name: { en: 'Nemesis', es: 'Némesis' },
    requirement: { en: 'Land five successful strikes against rivals.', es: 'Consigue cinco golpes exitosos contra rivales.' },
    grants: { perks: ['pressAdvantage'], statPoints: 1 },
    check: (m) => (m.rivalDefeats || 0) >= 5,
  },
  {
    id: 'industrialist', area: { en: 'Manufacturing', es: 'Manufactura' },
    name: { en: 'Industrialist', es: 'Industrial' },
    requirement: { en: 'Win a run in Manufacturing.', es: 'Gana una partida en Manufactura.' },
    grants: { perks: ['toolmaker'], statPoints: 1 },
    check: (m) => (m.winsByIndustry.manufacturing || 0) >= 1,
  },
  {
    id: 'restaurateur', area: { en: 'Hospitality', es: 'Hostelería' },
    name: { en: 'Restaurateur', es: 'Restaurador' },
    requirement: { en: 'Win a run in Hospitality.', es: 'Gana una partida en Hostelería.' },
    grants: { perks: ['fullHouse'], statPoints: 1 },
    check: (m) => (m.winsByIndustry.hospitality || 0) >= 1,
  },
  {
    id: 'dealmaker', area: { en: 'Fundraising', es: 'Financiamiento' },
    name: { en: 'Dealmaker', es: 'Negociador' },
    requirement: { en: 'Raise 750k across your whole career.', es: 'Recauda 750k en toda tu carrera.' },
    grants: { perks: ['termSheet'], statPoints: 1 },
    check: (m) => (m.totalRaised || 0) >= 750,
  },
  {
    id: 'endurance', area: { en: 'Longevity', es: 'Longevidad' },
    name: { en: 'The Long Game', es: 'El Juego Largo' },
    requirement: { en: 'Accumulate 300 months as a founder.', es: 'Acumula 300 meses como fundador.' },
    grants: { perks: ['institutional'], statPoints: 2 },
    check: (m) => (m.totalMonths || 0) >= 300,
  },
];

// ---------------------------------------------------------------- perks
// Curated and unlockable, in the same shape as the existing per-leader `operate` ability, so the
// engine's handleOperate needs no special case for a custom founder.
// `starter: true` perks are available from the very first run; the rest arrive via UNLOCK_MARKERS.
const FOUNDER_PERKS = [
  { id: 'walkTheFloor', starter: true,
    name: { en: 'Walk the Floor', es: 'Recorrer la Planta' },
    desc: { en: '+3 Morale, +2 Reputation', es: '+3 Moral, +2 Reputación' },
    deltas: { morale: 3, reputation: 2 } },
  { id: 'workTheRoom', starter: true,
    name: { en: 'Work the Room', es: 'Trabajar la Sala' },
    desc: { en: '+4 Presence, +2 Reputation', es: '+4 Presencia, +2 Reputación' },
    deltas: { presence: 4, reputation: 2 } },
  { id: 'tightenBelt', starter: true,
    name: { en: 'Tighten the Belt', es: 'Apretar el Cinturón' },
    desc: { en: '-2 Burn, +2 Board Confidence', es: '-2 Gasto, +2 Confianza del Directorio' },
    deltas: { burnReduction: 2, boardConfidence: 2 } },
  { id: 'sketchItOut', starter: true,
    name: { en: 'Sketch It Out', es: 'Bosquejarlo' },
    desc: { en: '+2 Innovation, +3 Morale', es: '+2 Innovación, +3 Moral' },
    deltas: { statBonus: { innovation: 2 }, morale: 3 } },

  { id: 'closer', unlockedBy: 'firstExit',
    name: { en: 'Closer', es: 'Cerrador' },
    desc: { en: '+5 Board Confidence, +3 Market Position', es: '+5 Confianza del Directorio, +3 Posición de Mercado' },
    deltas: { boardConfidence: 5, marketPosition: 3 } },
  { id: 'turnaround', unlockedBy: 'turnaroundSpecialist',
    name: { en: 'Turnaround', es: 'Reestructuración' },
    desc: { en: '+12 Capital, +8 Morale — pulled back from the brink before', es: '+12 Capital, +8 Moral' },
    deltas: { capital: 12, morale: 8 } },
  { id: 'bellRinger', unlockedBy: 'publicCompany',
    name: { en: 'Bell Ringer', es: 'Campanero' },
    desc: { en: '+6 Reputation, +4 Presence', es: '+6 Reputación, +4 Presencia' },
    deltas: { reputation: 6, presence: 4 } },
  { id: 'warmIntro', unlockedBy: 'kingmaker',
    name: { en: 'Warm Introduction', es: 'Presentación Cálida' },
    desc: { en: '+5 Presence, +4 Board Confidence', es: '+5 Presencia, +4 Confianza del Directorio' },
    deltas: { presence: 5, boardConfidence: 4 } },
  { id: 'supplyPartner', unlockedBy: 'peacemaker',
    name: { en: 'Supply Partner', es: 'Socio de Suministro' },
    desc: { en: '-3 Burn, +3 Morale', es: '-3 Gasto, +3 Moral' },
    deltas: { burnReduction: 3, morale: 3 } },
  { id: 'pressAdvantage', unlockedBy: 'nemesis',
    name: { en: 'Press the Advantage', es: 'Presionar la Ventaja' },
    desc: { en: '+4 Market Position, +2 Agility', es: '+4 Posición de Mercado, +2 Agilidad' },
    deltas: { marketPosition: 4, statBonus: { agility: 2 } } },
  { id: 'toolmaker', unlockedBy: 'industrialist',
    name: { en: 'Toolmaker', es: 'Fabricante de Herramientas' },
    desc: { en: '+6 Capacity, +1 Operations', es: '+6 Capacidad, +1 Operaciones' },
    deltas: { capacity: 6, statBonus: { operations: 1 } } },
  { id: 'fullHouse', unlockedBy: 'restaurateur',
    name: { en: 'Full House', es: 'Lleno Total' },
    desc: { en: '+5 Reputation, +3 Morale', es: '+5 Reputación, +3 Moral' },
    deltas: { reputation: 5, morale: 3 } },
  { id: 'termSheet', unlockedBy: 'dealmaker',
    name: { en: 'Term Sheet', es: 'Hoja de Términos' },
    desc: { en: '+18 Capital, +2 Board Confidence', es: '+18 Capital, +2 Confianza del Directorio' },
    deltas: { capital: 18, boardConfidence: 2 } },
  { id: 'institutional', unlockedBy: 'endurance',
    name: { en: 'Institutional Knowledge', es: 'Conocimiento Institucional' },
    desc: { en: '+1 to two stats of the moment, +4 Morale', es: '+1 a dos estadísticas, +4 Moral' },
    deltas: { statBonus: { operations: 1, compliance: 1 }, morale: 4 } },
];
const FOUNDER_PERK_BY_ID = FOUNDER_PERKS.reduce((a, p) => { a[p.id] = p; return a; }, {});

// ---------------------------------------------------------------- point-buy
const FOUNDER_BASE_STAT_POINTS = 4;   // before any unlocks
const FOUNDER_MAX_PER_STAT = 3;       // no dumping everything into one stat at creation
const CUSTOM_FOUNDER_ID = 'custom';

// ---------------------------------------------------------------- roster experience
// Pre-authored founders accumulate experience by being brought along. This is what makes Mara
// after three ventures materially different from a first-time hire, per the locked decision that
// their cosmetics/bio/history are fixed but their capability grows.
const FOUNDER_XP_LEVELS = [0, 100, 240, 430, 680, 1000, 1400, 1900];

function founderLevel(xp) {
  const x = xp || 0;
  let lvl = 1;
  for (let i = 0; i < FOUNDER_XP_LEVELS.length; i++) if (x >= FOUNDER_XP_LEVELS[i]) lvl = i + 1;
  return Math.min(lvl, FOUNDER_XP_LEVELS.length);
}
function founderXpToNext(xp) {
  const lvl = founderLevel(xp);
  if (lvl >= FOUNDER_XP_LEVELS.length) return null; // maxed
  return FOUNDER_XP_LEVELS[lvl] - (xp || 0);
}
// Points a roster founder has earned to spend, above their authored base statBonus. Level 1
// grants nothing — experience has to actually be earned before it shows up.
function founderEarnedPoints(xp) {
  return Math.max(0, founderLevel(xp) - 1);
}

// XP for a completed run. Deliberately rewards *surviving* as well as winning, so a long
// honourable failure still develops the people who lived through it — which is the entire
// premise of "two failed ventures and a successful IPO" making someone stronger.
function founderRunXp({ months, won, outcome }) {
  let xp = 30 + Math.round((months || 0) * 2.5);
  if (won) xp += 120;
  if (outcome === 'ipo') xp += 60;           // hardest exit, biggest lesson
  else if (outcome === 'insolvent') xp += 25; // failure teaches, per the brief
  return xp;
}

// ---------------------------------------------------------------- portrait
// Same deterministic placeholder technique as investors and rival logos: initials + hue + shape,
// stable for a given seed, and the hook real art drops into later without touching call sites.
const PORTRAIT_SHAPES = ['round', 'square', 'shield', 'hex'];

function initialsFrom(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function makeFounderPortrait(name, hue, shape) {
  return {
    initials: initialsFrom(name),
    hue: hue != null ? ((hue % 360) + 360) % 360 : Math.floor(Math.random() * 360),
    shape: shape || PORTRAIT_SHAPES[0],
  };
}

// ---------------------------------------------------------------- the custom founder
function emptyCustomFounder() {
  return {
    id: CUSTOM_FOUNDER_ID,
    name: '',
    classId: 'Visionary',
    perkId: 'walkTheFloor',
    statPoints: {},                       // { agility: 2, operations: 1, ... }
    portrait: makeFounderPortrait('', 210, 'round'),
    createdAt: null,
  };
}

// How many points this founder may spend, given career unlocks.
function availableStatPoints(unlockedIds) {
  const bonus = UNLOCK_MARKERS
    .filter(u => (unlockedIds || []).includes(u.id))
    .reduce((a, u) => a + (u.grants.statPoints || 0), 0);
  return FOUNDER_BASE_STAT_POINTS + bonus;
}

function spentStatPoints(statPoints) {
  return Object.values(statPoints || {}).reduce((a, b) => a + (b || 0), 0);
}

// Which perks the player may currently pick.
function availablePerks(unlockedIds) {
  return FOUNDER_PERKS.filter(p => p.starter || (unlockedIds || []).includes(p.unlockedBy));
}

// Validation before a run can start. Returns [] when the founder is legal.
function validateCustomFounder(founder, unlockedIds) {
  const errs = [];
  if (!founder) return ['missing'];
  if (!String(founder.name || '').trim()) errs.push('name');
  if (!FOUNDER_CLASS_BY_ID[founder.classId]) errs.push('class');
  const perkOk = availablePerks(unlockedIds).some(p => p.id === founder.perkId);
  if (!perkOk) errs.push('perk');
  const spent = spentStatPoints(founder.statPoints);
  if (spent > availableStatPoints(unlockedIds)) errs.push('overspent');
  if (Object.values(founder.statPoints || {}).some(v => v > FOUNDER_MAX_PER_STAT || v < 0)) errs.push('statCap');
  return errs;
}

// Converts the custom founder into the exact leader shape the engine already consumes, so
// computeTeam / handleOperate / trait checks need no special case. This adapter is the whole
// reason the custom founder can slot into existing systems without touching the run loop.
function customFounderToLeader(founder, lang) {
  const cls = FOUNDER_CLASS_BY_ID[founder.classId] || FOUNDER_CLASSES[0];
  const perk = FOUNDER_PERK_BY_ID[founder.perkId] || FOUNDER_PERKS[0];
  const L = lang === 'es' ? 'es' : 'en';
  const statBonus = {};
  Object.entries(founder.statPoints || {}).forEach(([k, v]) => { if (v) statBonus[k] = v; });
  return {
    id: CUSTOM_FOUNDER_ID,
    name: founder.name || 'Founder',
    role: L === 'es' ? 'Fundador y CEO' : 'Founder & CEO',
    style: cls.id,
    trait: null,                     // the custom founder's edge is their class + chosen perk
    traitDesc: cls.mechanics[L],
    bio: '',
    isCustom: true,
    portrait: founder.portrait,
    statBonus,
    operate: { label: perk.name[L], desc: perk.desc[L], deltas: perk.deltas },
  };
}

// Roster founders enter a run with their authored statBonus PLUS whatever the player has
// allocated from earned experience.
function rosterFounderToLeader(leader, record) {
  const allocated = (record && record.allocated) || {};
  const statBonus = { ...(leader.statBonus || {}) };
  Object.entries(allocated).forEach(([k, v]) => { if (v) statBonus[k] = (statBonus[k] || 0) + v; });
  return { ...leader, statBonus, xp: (record && record.xp) || 0, level: founderLevel(record && record.xp) };
}

// ---------------------------------------------------------------- unlock evaluation
// Pure: takes the accumulated career record, returns the ids that qualify. Recomputed from
// scratch every time rather than incrementally toggled, for the same reason deriveDisposition is
// a pure recompute — an incrementally-maintained unlock list drifts and can't be repaired.
function evaluateUnlocks(meta) {
  const m = {
    wins: 0, totalMonths: 0, totalRaised: 0, rivalDefeats: 0, alliesFormed: 0,
    byOutcome: {}, winsByIndustry: {}, investorStandings: {},
    ...(meta || {}),
  };
  m.byOutcome = m.byOutcome || {};
  m.winsByIndustry = m.winsByIndustry || {};
  m.investorStandings = m.investorStandings || {};
  return UNLOCK_MARKERS.filter(u => {
    try { return !!u.check(m); } catch (e) { return false; }
  }).map(u => u.id);
}

// Folds one finished run into the career record the unlock checks read.
function accumulateCareer(prev, run) {
  const m = {
    runs: 0, wins: 0, totalMonths: 0, totalRaised: 0, rivalDefeats: 0, alliesFormed: 0,
    byOutcome: {}, winsByIndustry: {}, investorStandings: {},
    ...(prev || {}),
  };
  m.byOutcome = { ...(m.byOutcome || {}) };
  m.winsByIndustry = { ...(m.winsByIndustry || {}) };
  m.runs += 1;
  m.totalMonths += run.months || 0;
  m.totalRaised += run.totalRaised || 0;
  m.rivalDefeats += run.rivalDefeats || 0;
  m.alliesFormed += run.alliesFormed || 0;
  if (run.won) {
    m.wins += 1;
    m.winsByIndustry[run.industry] = (m.winsByIndustry[run.industry] || 0) + 1;
  }
  if (run.outcome) m.byOutcome[run.outcome] = (m.byOutcome[run.outcome] || 0) + 1;
  if (run.investorStandings) m.investorStandings = { ...run.investorStandings };
  return m;
}

```
