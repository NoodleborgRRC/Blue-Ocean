# Entrepreneur Simulator — Founder Customize Screen & Roster UI

Extracted from `founder-hospitality-prototype.jsx` for external review. Exact code currently in
the shipped source (not a draft). This is React (JSX), styled with inline style objects against a
shared design-token object `C` (colors) and font constants `F_MONO`/`F_DISPLAY`/`F_BODY` defined
elsewhere in the file — not shown here, but referenced throughout.

## What this covers

Three linked pieces, in the order they appear in the source:

1. **`FounderCustomizeScreen`** — the first screen after "Begin Game" in the pre-game flow
   (`Home → Begin Game → Customize Founder → Choose Industry`). Lets the player name their
   character, pick a class (Visionary/Operator/Hustler — see the companion classes/perks
   document), pick one unlockable perk, allocate a small stat point-buy, and reroll a procedural
   portrait (see the companion portrait-generator document). Also surfaces career-wide memory
   (ventures founded, exits, months, capital raised) and progression (which of the 10 unlock
   markers are hit).
2. **`PhilosophySpread`** — a small shared renderer (used here, and also by the Investors/
   Competitors Index pages elsewhere in the file) that draws the six-axis Founder Philosophy
   bars. Included here because the roster detail window calls it directly.
3. **`FounderRosterPanel`** and its children (`FounderCard`, `FounderDetailModal`,
   `FounderCompareModal`, `StatRow`, `ProceduralPortrait`) — the roster grid shown on the
   customize screen, where the player spends stat points earned by pre-authored founders who
   have been brought along on runs.

## The interaction model this was built to

- Each roster founder card shows portrait, name, class, and level. A **glowing pulsing `+`
  badge** appears on any card with unspent points (see the `founderPulse` CSS keyframe animation
  defined inline in `FounderRosterPanel`).
- Clicking a card opens a **detail modal** with five tabs: Stats (view + allocate, with a
  Confirm/Reset step so nothing commits accidentally), Philosophy, Perks (equipped ability +
  trait, then the full unlockable list with lock icons and requirement text on locked ones),
  Relationships (investors backed, rivals faced — both pulled from per-run history), and Archive
  (a chronological list of past runs: outcome, headline, months, capital raised, valuation).
- An `✕` in the modal's upper-right closes it.
- A **Compare** button in the modal footer starts compare mode: the modal closes, the roster grid
  marks the first founder as selected, and clicking a second founder opens `FounderCompareModal`
  — a side-by-side view with stats marked ◀/▶ toward whichever founder is higher, operate
  abilities, and both philosophy spreads.
- The player's own **custom founder** is visually distinguished in the roster grid (a highlighted
  portrait ring) and cannot have its stats edited from this screen — a note in the Stats tab
  explains that the custom founder is edited on the customize screen itself, not here. This
  matches the locked design decision that pre-authored roster founders' cosmetics/bio/trait are
  fixed but their *capability* grows through experience, while the custom founder's whole loadout
  is player-editable but doesn't earn roster XP.

## Data this reads (defined in the companion classes/perks document, not repeated here)

`FOUNDER_CLASSES`, `FOUNDER_PERKS`, `UNLOCK_MARKERS`, `STAT_KEYS`, `founderLevel`,
`founderXpToNext`, `founderEarnedPoints`, `spentStatPoints`, `availablePerks`, `dispositionBand`,
`makeRivalLogo`, `INVESTOR_BY_ID` (for rendering the small investor icons in Relationships).

## What would be useful feedback

- Whether five tabs in the detail modal is the right amount of information density, or whether
  Relationships/Archive should be a separate lighter-weight view
- Whether the stat allocation flow (bump with +/-, then a separate Confirm) is the right amount
  of friction, or whether it should commit immediately per click
- The compare flow currently requires closing the detail modal, then clicking a second card —
  whether that hand-off reads clearly enough or needs an explicit "select someone to compare"
  prompt state
- Whether the roster grid should scale/paginate once a player has accumulated many founders
  across both industries (currently a plain CSS grid with no pagination)
- General accessibility of an inline-style-only component (no CSS classes to target for
  prefers-reduced-motion on the pulsing badge animation, for example)

---

```javascript
// ============================== FOUNDER CUSTOMIZE SCREEN ==============================
// First screen after Begin Game. The custom founder's identity and memory persist; appearance,
// class, perk and stat allocation are all re-editable before every run (locked decision).
function FounderCustomizeScreen({
  language, founderDoc, draft, setDraft, onConfirm, onBack, t, rosterLeaders, onAllocate,
}) {
  const L = language === 'es' ? 'es' : 'en';
  const unlocked = founderDoc.unlocked || [];
  const career = founderDoc.career || {};
  const f = draft;
  const perks = availablePerks(unlocked);
  const maxPoints = availableStatPoints(unlocked);
  const spent = spentStatPoints(f.statPoints);
  const remaining = maxPoints - spent;
  const errs = validateCustomFounder(f, unlocked);
  const ready = errs.length === 0;

  const setField = (patch) => setDraft({ ...f, ...patch });
  const setName = (name) => setDraft({
    ...f, name,
    // Portrait initials track the name automatically; hue/shape stay under player control.
    portrait: { ...f.portrait, initials: initialsFrom(name) },
  });
  const bumpStat = (key, dir) => {
    const cur = (f.statPoints || {})[key] || 0;
    const next = cur + dir;
    if (next < 0 || next > FOUNDER_MAX_PER_STAT) return;
    if (dir > 0 && remaining <= 0) return;
    setDraft({ ...f, statPoints: { ...f.statPoints, [key]: next } });
  };

  const isReturning = !!(founderDoc.custom && founderDoc.custom.createdAt);

  return (
    <div style={{ background: C.ink, minHeight: '100vh', fontFamily: F_BODY, color: C.text }} className="p-4 md:p-10">
      <FontImport />
      <div className="max-w-5xl mx-auto">
        <button onClick={onBack} style={{ color: C.muted, fontFamily: F_MONO }} className="text-xs mb-4">{t('← Back')}</button>

        <div className="mb-6 text-center">
          <h2 style={{ fontFamily: F_DISPLAY, color: C.paper }} className="text-2xl md:text-3xl font-semibold mb-2">
            {isReturning ? (L === 'es' ? 'Tu Fundador' : 'Your Founder') : (L === 'es' ? 'Crea Tu Fundador' : 'Create Your Founder')}
          </h2>
          <p style={{ color: C.muted }} className="max-w-2xl mx-auto text-sm">
            {isReturning
              ? (L === 'es'
                ? 'Tu historia permanece. Antes de cada partida puedes reconsiderar tu enfoque, tu ventaja y tu apariencia — pero lo que has vivido no se borra.'
                : 'Your history stays with you. Before each run you can rethink your approach, your edge and your appearance — but what you have lived through does not reset.')
              : (L === 'es'
                ? 'Este fundador te acompañará en cada partida y recordará todo: cada quiebra, cada salida, cada inversionista que quemaste.'
                : 'This founder carries through every run and remembers all of it: every bankruptcy, every exit, every investor you burned.')}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-4">
          {/* ---------------- Identity ---------------- */}
          <div style={{ background: C.panel, border: `1px solid ${C.hair}` }} className="rounded-lg p-4">
            <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-xs uppercase tracking-widest mb-3">
              {L === 'es' ? 'Identidad' : 'Identity'}
            </div>
            <div className="flex items-center gap-3 mb-3">
              <ProceduralPortrait seed={f.portraitSeed || `custom-${f.portrait.hue}-${f.portrait.shape}`} size={64} ring />
              <div className="flex-1">
                <input
                  value={f.name}
                  onChange={(e) => setName(e.target.value.slice(0, 28))}
                  placeholder={L === 'es' ? 'Nombre del fundador' : 'Founder name'}
                  style={{ background: C.panel2, border: `1px solid ${f.name.trim() ? C.hair : C.rust}`, color: C.text }}
                  className="w-full rounded px-2 py-1.5 text-sm mb-2"
                />
                <div className="flex gap-1.5">
                  <button onClick={() => setField({ portraitSeed: `custom-${Math.random().toString(36).slice(2, 9)}` })}
                    style={{ background: C.panel3, border: `1px solid ${C.brassDim}`, color: C.brass, fontFamily: F_MONO }}
                    className="rounded px-2 py-1 text-[10px] flex-1">
                    {L === 'es' ? '↻ Nueva apariencia' : '↻ Reroll look'}
                  </button>
                </div>
              </div>
            </div>
            <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[10px]">
              {L === 'es'
                ? 'Apariencia generada — vuelve a tirar hasta que te reconozcas.'
                : 'Generated appearance — reroll until you recognise yourself.'}
            </div>
          </div>

          {/* ---------------- Class ---------------- */}
          <div style={{ background: C.panel, border: `1px solid ${C.hair}` }} className="rounded-lg p-4">
            <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-xs uppercase tracking-widest mb-3">
              {L === 'es' ? 'Clase' : 'Class'}
            </div>
            <div className="space-y-2">
              {FOUNDER_CLASSES.map(c => {
                const sel = f.classId === c.id;
                return (
                  <button key={c.id} onClick={() => setField({ classId: c.id })}
                    style={{ background: sel ? C.panel3 : C.panel2, border: `1px solid ${sel ? C.brass : C.hair}`, textAlign: 'left' }}
                    className="w-full rounded p-2.5">
                    <div style={{ color: C.paper }} className="text-sm font-semibold mb-0.5">{c.name[L]}</div>
                    <div style={{ color: C.muted }} className="text-[11px] italic mb-1 leading-snug">{c.blurb[L]}</div>
                    <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-[10px] leading-snug">{c.mechanics[L]}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------------- Perk ---------------- */}
          <div style={{ background: C.panel, border: `1px solid ${C.hair}` }} className="rounded-lg p-4">
            <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-xs uppercase tracking-widest mb-1">
              {L === 'es' ? 'Habilidad de Operar' : 'Operate Perk'}
            </div>
            <div style={{ color: C.muted }} className="text-[10px] mb-3">
              {L === 'es' ? 'Cuesta 1 Punto de Acción por uso.' : 'Costs 1 Action Point per use.'}
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {perks.map(p => {
                const sel = f.perkId === p.id;
                return (
                  <button key={p.id} onClick={() => setField({ perkId: p.id })}
                    style={{ background: sel ? C.panel3 : C.panel2, border: `1px solid ${sel ? C.brass : C.hair}`, textAlign: 'left' }}
                    className="w-full rounded p-2">
                    <div style={{ color: C.paper }} className="text-xs font-semibold">{p.name[L]}</div>
                    <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[10px]">{p.desc[L]}</div>
                  </button>
                );
              })}
            </div>
            {FOUNDER_PERKS.length > perks.length && (
              <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[10px] mt-2">
                {FOUNDER_PERKS.length - perks.length} {L === 'es' ? 'más por desbloquear' : 'more to unlock'}
              </div>
            )}
          </div>
        </div>

        {/* ---------------- Stat point buy ---------------- */}
        <div style={{ background: C.panel, border: `1px solid ${C.hair}` }} className="rounded-lg p-4 mb-4">
          <div className="flex items-baseline justify-between mb-3">
            <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-xs uppercase tracking-widest">
              {L === 'es' ? 'Estadísticas Iniciales' : 'Starting Stats'}
            </div>
            <div style={{ color: remaining > 0 ? C.brass : C.muted, fontFamily: F_MONO }} className="text-xs">
              {remaining} / {maxPoints} {L === 'es' ? 'puntos restantes' : 'points left'}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {STAT_KEYS.map(key => {
              const v = (f.statPoints || {})[key] || 0;
              return (
                <div key={key} style={{ background: C.panel2, border: `1px solid ${C.hair}` }} className="rounded p-2 flex items-center justify-between gap-2">
                  <div style={{ color: C.text }} className="text-xs">{statLabel(key, language)}</div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => bumpStat(key, -1)} disabled={v <= 0}
                      style={{ background: C.panel3, color: v > 0 ? C.text : C.hair, border: `1px solid ${C.hair}` }}
                      className="rounded w-6 h-6 text-xs leading-none">−</button>
                    <div style={{ color: v > 0 ? C.brass : C.muted, fontFamily: F_MONO, minWidth: 14, textAlign: 'center' }} className="text-sm">{v}</div>
                    <button onClick={() => bumpStat(key, 1)} disabled={remaining <= 0 || v >= FOUNDER_MAX_PER_STAT}
                      style={{ background: C.panel3, color: (remaining > 0 && v < FOUNDER_MAX_PER_STAT) ? C.text : C.hair, border: `1px solid ${C.hair}` }}
                      className="rounded w-6 h-6 text-xs leading-none">+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---------------- Career memory ---------------- */}
        {(career.runs || 0) > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.hair}` }} className="rounded-lg p-4 mb-4">
            <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-xs uppercase tracking-widest mb-3">
              {L === 'es' ? 'Memoria de Carrera' : 'Career Memory'}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              {[
                [L === 'es' ? 'Empresas fundadas' : 'Ventures founded', career.runs || 0],
                [L === 'es' ? 'Salidas exitosas' : 'Successful exits', career.wins || 0],
                [L === 'es' ? 'Meses como fundador' : 'Months as founder', career.totalMonths || 0],
                [L === 'es' ? 'Capital recaudado' : 'Capital raised', `${career.totalRaised || 0}k`],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ color: C.paper, fontFamily: F_MONO }} className="text-lg">{val}</div>
                  <div style={{ color: C.muted }} className="text-[10px]">{label}</div>
                </div>
              ))}
            </div>
            <div style={{ color: C.muted }} className="text-[11px]">
              {L === 'es'
                ? 'Los inversionistas y las empresas rivales recuerdan a este fundador. Sus relaciones continúan donde quedaron.'
                : 'Investors and rival companies remember this founder. Those relationships pick up where they left off.'}
            </div>
          </div>
        )}

        {/* ---------------- Roster ---------------- */}
        {rosterLeaders && rosterLeaders.length > 0 && (
          <FounderRosterPanel
            leaders={rosterLeaders}
            founderDoc={founderDoc}
            language={language}
            onAllocate={onAllocate}
            t={t}
          />
        )}

        {/* ---------------- Unlocks ---------------- */}
        <div style={{ background: C.panel, border: `1px solid ${C.hair}` }} className="rounded-lg p-4 mb-4">
          <div className="flex items-baseline justify-between mb-3">
            <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-xs uppercase tracking-widest">
              {L === 'es' ? 'Progreso' : 'Progression'}
            </div>
            <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-xs">
              {unlocked.length}/{UNLOCK_MARKERS.length}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-1.5">
            {UNLOCK_MARKERS.map(u => {
              const got = unlocked.includes(u.id);
              return (
                <div key={u.id} style={{ background: got ? C.panel3 : C.panel2, border: `1px solid ${got ? C.brassDim : C.hair}`, opacity: got ? 1 : 0.65 }}
                  className="rounded p-2 flex items-start gap-2">
                  <div style={{ color: got ? C.brass : C.hair }} className="text-xs mt-0.5">{got ? '◆' : '◇'}</div>
                  <div className="min-w-0">
                    <div style={{ color: got ? C.paper : C.muted }} className="text-xs font-semibold">
                      {u.name[L]} <span style={{ color: C.muted, fontFamily: F_MONO }} className="text-[9px]">· {u.area[L]}</span>
                    </div>
                    <div style={{ color: C.muted }} className="text-[10px] leading-snug">{u.requirement[L]}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---------------- Confirm ---------------- */}
        <div style={{ background: C.panel, border: `1px solid ${C.hair}` }} className="rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <div style={{ color: ready ? C.muted : C.rust, fontFamily: F_MONO }} className="text-xs">
            {ready
              ? (L === 'es' ? 'Listo para elegir industria.' : 'Ready to choose an industry.')
              : errs.includes('name')
                ? (L === 'es' ? 'Tu fundador necesita un nombre.' : 'Your founder needs a name.')
                : (L === 'es' ? 'Revisa tus selecciones.' : 'Check your selections.')}
          </div>
          <button onClick={() => ready && onConfirm(f)} disabled={!ready}
            style={{ background: ready ? C.brass : C.hair, color: ready ? C.ink : C.muted, opacity: ready ? 1 : 0.6 }}
            className="rounded px-6 py-2 text-sm font-semibold">
            {L === 'es' ? 'Continuar' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================== INDEX: PHILOSOPHY SPREAD ==============================
// One renderer, used by BOTH the investor and competitor pages, so an investor and a rival are
// legible on identical terms — that comparability is the whole reason the spread exists.
function PhilosophySpread({ philosophy, language, compact }) {
  const L = language === 'es' ? 'es' : 'en';
  if (!philosophy) return null;
  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {PHILOSOPHY_AXES.map(axis => {
        const v = clamp(philosophy[axis] || 0, -100, 100);
        const meta = PHILOSOPHY_POLE_LABELS[axis] || { neg: { en: '', es: '' }, pos: { en: '', es: '' } };
        const pct = (v + 100) / 2; // -100..100 -> 0..100
        const strong = Math.abs(v) >= 55;
        return (
          <div key={axis}>
            <div className="flex justify-between" style={{ fontFamily: F_MONO, fontSize: 9, color: C.muted }}>
              <span style={{ color: v < -20 ? C.brass : C.muted }}>{meta.neg[L]}</span>
              <span style={{ color: v > 20 ? C.brass : C.muted }}>{meta.pos[L]}</span>
            </div>
            <div style={{ height: 5, background: C.panel3, borderRadius: 3, position: 'relative', border: `1px solid ${C.hair}` }}>
              {/* centre tick: makes "leans slightly" visually distinct from "neutral" */}
              <div style={{ position: 'absolute', left: '50%', top: -1, bottom: -1, width: 1, background: C.hair }} />
              <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${Math.min(50, pct)}%`, width: `${Math.abs(pct - 50)}%`,
                background: strong ? C.brass : C.brassDim, borderRadius: 2,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================== FOUNDER ROSTER UI ==============================

// Renders the procedural portrait. Falls back to the initials placeholder if anything about the
// generated art fails, so a portrait bug can never block the roster screen.
function ProceduralPortrait({ seed, size, garment, ring, dim }) {
  const sz = size || 72;
  let svg = '';
  try { svg = buildPortraitSVG(seed, { garment }); } catch (e) { svg = ''; }
  return (
    <div style={{
      width: sz, height: sz, flexShrink: 0, borderRadius: 6, overflow: 'hidden',
      border: `${ring ? 2 : 1}px solid ${ring ? C.brass : C.hair}`,
      filter: dim ? 'grayscale(0.6) brightness(0.7)' : 'none',
      background: C.panel2,
    }}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

// A single stat row with optional +/- controls. Used for both viewing and allocating.
function StatRow({ statKey, base, allocated, pending, onBump, canAdd, language }) {
  const total = base + allocated + pending;
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.hair}` }} className="rounded p-2 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div style={{ color: C.text }} className="text-xs truncate">{statLabel(statKey, language)}</div>
        <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[9px]">
          {base} {language === 'es' ? 'base' : 'base'}
          {allocated > 0 && <span style={{ color: C.brassDim }}> +{allocated}</span>}
          {pending > 0 && <span style={{ color: C.brass }}> +{pending}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {onBump && (
          <button onClick={() => onBump(-1)} disabled={pending <= 0}
            style={{ background: C.panel3, color: pending > 0 ? C.text : C.hair, border: `1px solid ${C.hair}` }}
            className="rounded w-6 h-6 text-xs leading-none">−</button>
        )}
        <div style={{ color: pending > 0 ? C.brass : C.paper, fontFamily: F_MONO, minWidth: 16, textAlign: 'center' }} className="text-sm">{total}</div>
        {onBump && (
          <button onClick={() => onBump(1)} disabled={!canAdd}
            style={{ background: C.panel3, color: canAdd ? C.text : C.hair, border: `1px solid ${C.hair}` }}
            className="rounded w-6 h-6 text-xs leading-none">+</button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- roster card
function FounderCard({ leader, record, language, onOpen, selected, compareMode }) {
  const L = language === 'es' ? 'es' : 'en';
  const xp = (record && record.xp) || 0;
  const level = founderLevel(xp);
  const unspent = founderEarnedPoints(xp) - spentStatPoints((record && record.allocated) || {});
  const isCustom = leader.isCustom;
  return (
    <button onClick={() => onOpen(leader.id)}
      style={{
        background: selected ? C.panel3 : C.panel2,
        border: `1px solid ${selected ? C.brass : C.hair}`,
      }}
      className="rounded-lg p-3 flex flex-col items-center gap-2 relative hover:brightness-110">
      {/* Unspent points indicator — the glowing + the player is meant to notice from across the grid. */}
      {unspent > 0 && (
        <div style={{
          position: 'absolute', top: 6, right: 6, zIndex: 2,
          background: C.brass, color: C.ink,
          width: 20, height: 20, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: F_MONO, fontSize: 13, fontWeight: 700,
          boxShadow: `0 0 0 2px ${C.ink}, 0 0 10px 2px ${C.brass}`,
          animation: 'founderPulse 1.6s ease-in-out infinite',
        }}>+</div>
      )}
      {compareMode && selected && (
        <div style={{
          position: 'absolute', top: 6, left: 6, zIndex: 2,
          background: C.brass, color: C.ink, borderRadius: 3,
          fontFamily: F_MONO, fontSize: 9, padding: '1px 5px',
        }}>{language === 'es' ? 'COMPARAR' : 'COMPARE'}</div>
      )}
      <ProceduralPortrait seed={leader.portraitSeed || leader.id} size={72} ring={isCustom} />
      <div className="text-center min-w-0 w-full">
        <div style={{ color: C.paper }} className="text-xs font-semibold truncate">{leader.name}</div>
        <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[9px] truncate">
          {language === 'es' ? STYLE_NAMES_ES[leader.style] : leader.style}
        </div>
        <div style={{ color: xp > 0 ? C.brass : C.hair, fontFamily: F_MONO }} className="text-[9px] mt-0.5">
          {language === 'es' ? 'NIV' : 'LVL'} {level}
          {isCustom && <span style={{ color: C.brassDim }}> · {L === 'es' ? 'TÚ' : 'YOU'}</span>}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------- detail window
function FounderDetailModal({
  leader, record, language, unlockedIds, onClose, onAllocate, onStartCompare, compareWith, t,
}) {
  const L = language === 'es' ? 'es' : 'en';
  const [pending, setPending] = useState({});
  const [tab, setTab] = useState('stats');

  const xp = (record && record.xp) || 0;
  const level = founderLevel(xp);
  const toNext = founderXpToNext(xp);
  const allocated = (record && record.allocated) || {};
  const earned = founderEarnedPoints(xp);
  const spent = spentStatPoints(allocated);
  const pendingTotal = spentStatPoints(pending);
  const unspent = earned - spent - pendingTotal;

  const bump = (key, dir) => {
    const cur = pending[key] || 0;
    const next = cur + dir;
    if (next < 0) return;
    if (dir > 0 && unspent <= 0) return;
    setPending({ ...pending, [key]: next });
  };

  const commit = () => {
    const merged = { ...allocated };
    Object.entries(pending).forEach(([k, v]) => { if (v) merged[k] = (merged[k] || 0) + v; });
    onAllocate(leader.id, merged);
    setPending({});
  };

  const history = (record && record.history) || [];
  const philosophy = (record && record.philosophy) || null;
  const investorsBacked = (record && record.investorsBacked) || {};
  const rivalsFaced = (record && record.rivalsFaced) || {};
  const equippedPerkId = leader.isCustom ? null : null;

  const TABS = [
    { id: 'stats', label: { en: 'Stats', es: 'Estadísticas' } },
    { id: 'philosophy', label: { en: 'Philosophy', es: 'Filosofía' } },
    { id: 'perks', label: { en: 'Perks', es: 'Habilidades' } },
    { id: 'relationships', label: { en: 'Relationships', es: 'Relaciones' } },
    { id: 'archive', label: { en: 'Archive', es: 'Archivo' } },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(8,14,10,0.82)', zIndex: 60,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3vh 12px', overflowY: 'auto',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: C.panel, border: `1px solid ${C.brassDim}`, maxWidth: 720, width: '100%', borderRadius: 10 }}
        className="relative">

        {/* Close */}
        <button onClick={onClose}
          style={{ position: 'absolute', top: 10, right: 10, background: C.panel2, border: `1px solid ${C.hair}`, color: C.muted, zIndex: 3 }}
          className="rounded w-8 h-8 text-sm leading-none">✕</button>

        {/* Header */}
        <div className="p-4 flex gap-4 items-start" style={{ borderBottom: `1px solid ${C.hair}` }}>
          <ProceduralPortrait seed={leader.portraitSeed || leader.id} size={96} ring />
          <div className="min-w-0 flex-1 pr-8">
            <div style={{ color: C.paper, fontFamily: F_DISPLAY }} className="text-xl">{leader.name}</div>
            <div style={{ color: C.muted }} className="text-xs mb-1">{leader.role}</div>
            <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-[10px] mb-2">
              {language === 'es' ? STYLE_NAMES_ES[leader.style] : leader.style}
              {' · '}{language === 'es' ? 'Nivel' : 'Level'} {level}
              {toNext != null
                ? ` · ${toNext} ${language === 'es' ? 'XP al siguiente' : 'XP to next'}`
                : ` · ${language === 'es' ? 'máximo' : 'max'}`}
            </div>
            {/* XP bar */}
            <div style={{ height: 5, background: C.panel3, borderRadius: 3, border: `1px solid ${C.hair}`, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${toNext == null ? 100 : Math.min(100, Math.max(4, ((xp - FOUNDER_XP_LEVELS[level - 1]) / Math.max(1, (FOUNDER_XP_LEVELS[level] - FOUNDER_XP_LEVELS[level - 1]))) * 100))}%`,
                background: C.brass,
              }} />
            </div>
            <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[9px] mt-1">
              {xp} XP · {(record && record.runsWith) || 0} {language === 'es' ? 'partidas contigo' : 'runs with you'} · {(record && record.wins) || 0} {language === 'es' ? 'salidas' : 'exits'}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 pt-3 flex gap-1.5 flex-wrap">
          {TABS.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)}
              style={{
                background: tab === tb.id ? C.brass : C.panel2,
                color: tab === tb.id ? C.ink : C.muted,
                border: `1px solid ${tab === tb.id ? C.brass : C.hair}`, fontFamily: F_MONO,
              }}
              className="rounded px-2.5 py-1 text-[10px] font-semibold">
              {tb.label[L]}
              {tb.id === 'stats' && unspent > 0 && <span style={{ color: tab === tb.id ? C.ink : C.brass }}> +{unspent}</span>}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* -------- Stats -------- */}
          {tab === 'stats' && (
            <div>
              {leader.bio ? (
                <p style={{ color: C.muted }} className="text-[11px] italic mb-3 leading-relaxed">{leader.bio}</p>
              ) : null}
              <div className="flex items-baseline justify-between mb-2">
                <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-[10px] uppercase tracking-widest">
                  {language === 'es' ? 'Distribución de Estadísticas' : 'Stat Spread'}
                </div>
                <div style={{ color: unspent > 0 ? C.brass : C.muted, fontFamily: F_MONO }} className="text-[10px]">
                  {unspent} {language === 'es' ? 'puntos sin gastar' : 'unspent points'}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                {STAT_KEYS.map(k => (
                  <StatRow key={k} statKey={k}
                    base={(leader.baseStatBonus || leader.statBonus || {})[k] || 0}
                    allocated={allocated[k] || 0}
                    pending={pending[k] || 0}
                    onBump={leader.isCustom ? null : (dir) => bump(k, dir)}
                    canAdd={unspent > 0}
                    language={language} />
                ))}
              </div>
              {leader.isCustom && (
                <div style={{ color: C.muted }} className="text-[10px] italic">
                  {language === 'es'
                    ? 'Tu propio fundador se ajusta en la pantalla de personalización, no aquí.'
                    : 'Your own founder is edited on the customization screen, not here.'}
                </div>
              )}
              {pendingTotal > 0 && (
                <div className="flex items-center justify-between gap-3 mt-2">
                  <button onClick={() => setPending({})}
                    style={{ color: C.muted, fontFamily: F_MONO }} className="text-[10px]">
                    {language === 'es' ? 'Descartar' : 'Reset'}
                  </button>
                  <button onClick={commit}
                    style={{ background: C.brass, color: C.ink }}
                    className="rounded px-4 py-1.5 text-xs font-semibold">
                    {language === 'es' ? `Confirmar +${pendingTotal}` : `Confirm +${pendingTotal}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* -------- Philosophy -------- */}
          {tab === 'philosophy' && (
            <div>
              {philosophy ? (
                <>
                  <p style={{ color: C.muted }} className="text-[11px] mb-3 leading-relaxed">
                    {language === 'es'
                      ? 'Acumulada a lo largo de las partidas en las que este fundador estuvo presente — no de las que se perdió.'
                      : 'Accumulated across the runs this founder was actually present for — not the ones they missed.'}
                  </p>
                  <PhilosophySpread philosophy={philosophy} language={language} />
                </>
              ) : (
                <div style={{ color: C.muted }} className="text-xs">
                  {language === 'es'
                    ? 'Aún no ha vivido una partida contigo. Su filosofía se formará sobre la marcha.'
                    : 'Hasn\u2019t been through a run with you yet. Their philosophy will form as they go.'}
                </div>
              )}
            </div>
          )}

          {/* -------- Perks -------- */}
          {tab === 'perks' && (
            <div>
              <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-[10px] uppercase tracking-widest mb-2">
                {language === 'es' ? 'Equipada' : 'Equipped'}
              </div>
              <div style={{ background: C.panel3, border: `1px solid ${C.brassDim}` }} className="rounded p-2.5 mb-4">
                <div style={{ color: C.paper }} className="text-xs font-semibold">{leader.operate.label}</div>
                <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[10px]">{leader.operate.desc}</div>
                {leader.trait && (
                  <div style={{ color: C.brass }} className="text-[10px] italic mt-1">{leader.trait} — {leader.traitDesc}</div>
                )}
              </div>
              <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-[10px] uppercase tracking-widest mb-2">
                {language === 'es' ? 'Desbloqueables de Carrera' : 'Career Unlockables'}
              </div>
              <div className="grid md:grid-cols-2 gap-1.5">
                {FOUNDER_PERKS.map(p => {
                  const got = p.starter || (unlockedIds || []).includes(p.unlockedBy);
                  const marker = UNLOCK_MARKERS.find(m => m.id === p.unlockedBy);
                  return (
                    <div key={p.id}
                      style={{ background: got ? C.panel2 : C.panel, border: `1px solid ${got ? C.hair : C.hair}`, opacity: got ? 1 : 0.55 }}
                      className="rounded p-2">
                      <div style={{ color: got ? C.paper : C.muted }} className="text-[11px] font-semibold">
                        {got ? '' : '🔒 '}{p.name[L]}
                      </div>
                      <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[9px]">{p.desc[L]}</div>
                      {!got && marker && (
                        <div style={{ color: C.brassDim }} className="text-[9px] italic mt-0.5">{marker.requirement[L]}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ color: C.muted }} className="text-[10px] italic mt-3">
                {language === 'es'
                  ? 'Las habilidades desbloqueadas se equipan a tu propio fundador en la pantalla de personalización.'
                  : 'Unlocked perks are equipped to your own founder on the customization screen.'}
              </div>
            </div>
          )}

          {/* -------- Relationships -------- */}
          {tab === 'relationships' && (
            <div className="space-y-4">
              <div>
                <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-[10px] uppercase tracking-widest mb-2">
                  {language === 'es' ? 'Inversionistas' : 'Investors'}
                </div>
                {Object.keys(investorsBacked).length ? (
                  <div className="space-y-1.5">
                    {Object.entries(investorsBacked).sort((a, b) => b[1] - a[1]).map(([id, times]) => {
                      const inv = INVESTOR_BY_ID[id];
                      if (!inv) return null;
                      return (
                        <div key={id} style={{ background: C.panel2, border: `1px solid ${C.hair}` }} className="rounded p-2 flex items-center gap-2">
                          <div style={{
                            width: 26, height: 26, borderRadius: 4, flexShrink: 0,
                            background: `hsl(${inv.portrait.hue}, 32%, 26%)`,
                            border: `1px solid hsl(${inv.portrait.hue}, 40%, 45%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: F_MONO, fontSize: 9, color: `hsl(${inv.portrait.hue}, 55%, 78%)`,
                          }}>{inv.portrait.initials}</div>
                          <div className="min-w-0 flex-1">
                            <div style={{ color: C.paper }} className="text-[11px] font-semibold truncate">{inv.name}</div>
                            <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[9px]">{inv.archetype[L]}</div>
                          </div>
                          <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-[10px]">
                            ×{times}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: C.muted }} className="text-[11px]">
                    {language === 'es' ? 'Sin inversionistas todavía.' : 'No investors backed yet.'}
                  </div>
                )}
              </div>
              <div>
                <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-[10px] uppercase tracking-widest mb-2">
                  {language === 'es' ? 'Rivales Enfrentados' : 'Rivals Faced'}
                </div>
                {Object.keys(rivalsFaced).length ? (
                  <div className="space-y-1.5">
                    {Object.entries(rivalsFaced).sort((a, b) => b[1].times - a[1].times).map(([seedId, r]) => {
                      const logo = makeRivalLogo(seedId);
                      const band = dispositionBand(r.disposition || 0);
                      return (
                        <div key={seedId} style={{ background: C.panel2, border: `1px solid ${C.hair}` }} className="rounded p-2 flex items-center gap-2">
                          <div style={{
                            width: 26, height: 26, borderRadius: 4, flexShrink: 0,
                            background: `hsl(${logo.hue}, 30%, 22%)`,
                            border: `1px solid hsl(${logo.hue}, 50%, 52%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, color: `hsl(${logo.hue}, 60%, 70%)`,
                          }}>{logo.glyph}</div>
                          <div className="min-w-0 flex-1">
                            <div style={{ color: C.paper }} className="text-[11px] font-semibold truncate">{r.name}</div>
                            <div style={{ color: band.tone === 'bad' ? C.rust : band.tone === 'good' ? C.good : C.muted, fontFamily: F_MONO }} className="text-[9px]">
                              {band.label[L]}
                            </div>
                          </div>
                          <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[10px]">×{r.times}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: C.muted }} className="text-[11px]">
                    {language === 'es' ? 'Sin rivales todavía.' : 'No rivals faced yet.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* -------- Archive -------- */}
          {tab === 'archive' && (
            <div>
              {history.length ? (
                <div className="space-y-1.5">
                  {history.map((h, i) => (
                    <div key={i} style={{ background: C.panel2, border: `1px solid ${h.won ? C.goodDim : C.hair}` }} className="rounded p-2.5">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <div style={{ color: h.won ? C.good : C.rust, fontFamily: F_MONO }} className="text-[10px] uppercase tracking-wide">
                          {h.won ? (language === 'es' ? 'Salida' : 'Exit') : (language === 'es' ? 'Cierre' : 'Ended')} · {h.outcome}
                        </div>
                        <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[9px]">
                          {h.industry === 'manufacturing' ? (language === 'es' ? 'Manufactura' : 'Manufacturing') : (language === 'es' ? 'Hostelería' : 'Hospitality')}
                        </div>
                      </div>
                      {h.headline && <div style={{ color: C.paper }} className="text-[11px] mb-0.5">{h.headline}</div>}
                      <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[9px]">
                        {h.months} {language === 'es' ? 'meses' : 'months'}
                        {h.raised ? ` · ${h.raised}k ${language === 'es' ? 'recaudado' : 'raised'}` : ''}
                        {h.valuation ? ` · ${fmtMoney(h.valuation)} ${language === 'es' ? 'valuación' : 'valuation'}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: C.muted }} className="text-xs">
                  {language === 'es'
                    ? 'Sin historial todavía. Las partidas que completes con este fundador aparecerán aquí.'
                    : 'No history yet. Runs you complete with this founder will appear here.'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — compare */}
        <div className="p-3 flex items-center justify-between gap-3" style={{ borderTop: `1px solid ${C.hair}` }}>
          <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[10px]">
            {compareWith
              ? (language === 'es' ? `Comparando con ${compareWith}` : `Comparing with ${compareWith}`)
              : (language === 'es' ? 'Elige otro fundador para comparar' : 'Pick another founder to compare')}
          </div>
          <button onClick={() => onStartCompare(leader.id)}
            style={{ background: C.panel3, border: `1px solid ${C.brass}`, color: C.brass }}
            className="rounded px-4 py-1.5 text-xs font-semibold">
            {language === 'es' ? 'Comparar' : 'Compare'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- compare window
function FounderCompareModal({ a, b, recA, recB, language, onClose, onSwap }) {
  const L = language === 'es' ? 'es' : 'en';
  const col = (leader, rec) => {
    const xp = (rec && rec.xp) || 0;
    return {
      leader, rec, xp, level: founderLevel(xp),
      allocated: (rec && rec.allocated) || {},
      runsWith: (rec && rec.runsWith) || 0,
      wins: (rec && rec.wins) || 0,
      philosophy: (rec && rec.philosophy) || null,
    };
  };
  const A = col(a, recA);
  const B = col(b, recB);
  const statTotal = (side, k) => ((side.leader.baseStatBonus || side.leader.statBonus || {})[k] || 0) + (side.allocated[k] || 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(8,14,10,0.86)', zIndex: 70,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3vh 12px', overflowY: 'auto',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: C.panel, border: `1px solid ${C.brassDim}`, maxWidth: 760, width: '100%', borderRadius: 10 }}
        className="relative p-4">
        <button onClick={onClose}
          style={{ position: 'absolute', top: 10, right: 10, background: C.panel2, border: `1px solid ${C.hair}`, color: C.muted }}
          className="rounded w-8 h-8 text-sm leading-none z-10">✕</button>

        <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-[10px] uppercase tracking-widest mb-3">
          {language === 'es' ? 'Comparar Fundadores' : 'Compare Founders'}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {[A, B].map((side, i) => (
            <div key={i} className="flex flex-col items-center text-center">
              <ProceduralPortrait seed={side.leader.portraitSeed || side.leader.id} size={80} ring />
              <div style={{ color: C.paper }} className="text-sm font-semibold mt-2">{side.leader.name}</div>
              <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[9px]">
                {language === 'es' ? STYLE_NAMES_ES[side.leader.style] : side.leader.style} · {language === 'es' ? 'Niv' : 'Lvl'} {side.level}
              </div>
              <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[9px]">
                {side.runsWith} {language === 'es' ? 'partidas' : 'runs'} · {side.wins} {language === 'es' ? 'salidas' : 'exits'}
              </div>
            </div>
          ))}
        </div>

        {/* Stat comparison — the higher side is highlighted so the read is instant. */}
        <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-[10px] uppercase tracking-widest mb-2">
          {language === 'es' ? 'Estadísticas' : 'Stats'}
        </div>
        <div className="space-y-1 mb-4">
          {STAT_KEYS.map(k => {
            const av = statTotal(A, k), bv = statTotal(B, k);
            return (
              <div key={k} className="grid grid-cols-3 gap-2 items-center">
                <div style={{ color: av > bv ? C.brass : C.muted, fontFamily: F_MONO, textAlign: 'right' }} className="text-xs">
                  {av}{av > bv ? ' ◀' : ''}
                </div>
                <div style={{ color: C.text, textAlign: 'center' }} className="text-[10px]">{statLabel(k, language)}</div>
                <div style={{ color: bv > av ? C.brass : C.muted, fontFamily: F_MONO }} className="text-xs">
                  {bv > av ? '▶ ' : ''}{bv}
                </div>
              </div>
            );
          })}
        </div>

        {/* Operate abilities side by side */}
        <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-[10px] uppercase tracking-widest mb-2">
          {language === 'es' ? 'Habilidad de Operar' : 'Operate Ability'}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[A, B].map((side, i) => (
            <div key={i} style={{ background: C.panel2, border: `1px solid ${C.hair}` }} className="rounded p-2">
              <div style={{ color: C.paper }} className="text-[11px] font-semibold">{side.leader.operate.label}</div>
              <div style={{ color: C.muted, fontFamily: F_MONO }} className="text-[9px]">{side.leader.operate.desc}</div>
              {side.leader.trait && (
                <div style={{ color: C.brass }} className="text-[9px] italic mt-1">{side.leader.trait}</div>
              )}
            </div>
          ))}
        </div>

        {/* Philosophy, when both have lived through runs */}
        {(A.philosophy || B.philosophy) && (
          <>
            <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-[10px] uppercase tracking-widest mb-2">
              {language === 'es' ? 'Filosofía' : 'Philosophy'}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[A, B].map((side, i) => (
                <div key={i}>
                  {side.philosophy
                    ? <PhilosophySpread philosophy={side.philosophy} language={language} compact />
                    : <div style={{ color: C.muted }} className="text-[10px]">{language === 'es' ? 'Sin historial' : 'No history'}</div>}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end">
          <button onClick={onSwap}
            style={{ background: C.panel3, border: `1px solid ${C.hair}`, color: C.muted, fontFamily: F_MONO }}
            className="rounded px-4 py-1.5 text-[10px]">
            {language === 'es' ? 'Elegir otro' : 'Pick another'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- roster screen section
function FounderRosterPanel({ leaders, founderDoc, language, onAllocate, t }) {
  const [openId, setOpenId] = useState(null);
  const [compareFrom, setCompareFrom] = useState(null);
  const [compareTo, setCompareTo] = useState(null);

  const byId = (id) => leaders.find(l => l.id === id);
  const rec = (id) => (founderDoc.roster || {})[id];
  const totalUnspent = leaders.reduce((a, l) => {
    if (l.isCustom) return a;
    const r = rec(l.id);
    return a + Math.max(0, founderEarnedPoints((r && r.xp) || 0) - spentStatPoints((r && r.allocated) || {}));
  }, 0);

  const handleCardClick = (id) => {
    if (compareFrom && id !== compareFrom) { setCompareTo(id); return; }
    setOpenId(id);
  };

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.hair}` }} className="rounded-lg p-4 mb-4">
      {/* Keyframes for the unspent-points pulse. Scoped here so the roster owns its own animation. */}
      <style>{`@keyframes founderPulse {
        0%, 100% { box-shadow: 0 0 0 2px ${C.ink}, 0 0 6px 1px ${C.brass}; }
        50%      { box-shadow: 0 0 0 2px ${C.ink}, 0 0 14px 4px ${C.brass}; }
      }`}</style>

      <div className="flex items-baseline justify-between mb-3">
        <div style={{ color: C.brass, fontFamily: F_MONO }} className="text-xs uppercase tracking-widest">
          {language === 'es' ? 'Tu Plantel' : 'Your Roster'}
        </div>
        <div style={{ color: totalUnspent > 0 ? C.brass : C.muted, fontFamily: F_MONO }} className="text-[10px]">
          {compareFrom
            ? (language === 'es' ? 'Elige un segundo fundador…' : 'Pick a second founder…')
            : totalUnspent > 0
              ? `${totalUnspent} ${language === 'es' ? 'puntos sin asignar' : 'points to allocate'}`
              : (language === 'es' ? 'Todo asignado' : 'All allocated')}
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {leaders.map(l => (
          <FounderCard key={l.id} leader={l} record={rec(l.id)} language={language}
            onOpen={handleCardClick}
            selected={compareFrom === l.id}
            compareMode={!!compareFrom} />
        ))}
      </div>

      {compareFrom && (
        <button onClick={() => { setCompareFrom(null); setCompareTo(null); }}
          style={{ color: C.muted, fontFamily: F_MONO }} className="text-[10px] mt-2">
          {language === 'es' ? 'Cancelar comparación' : 'Cancel compare'}
        </button>
      )}

      {openId && !compareTo && (
        <FounderDetailModal
          leader={byId(openId)}
          record={rec(openId)}
          language={language}
          unlockedIds={founderDoc.unlocked || []}
          onClose={() => setOpenId(null)}
          onAllocate={onAllocate}
          onStartCompare={(id) => { setCompareFrom(id); setOpenId(null); }}
          compareWith={null}
          t={t}
        />
      )}

      {compareFrom && compareTo && (
        <FounderCompareModal
          a={byId(compareFrom)} b={byId(compareTo)}
          recA={rec(compareFrom)} recB={rec(compareTo)}
          language={language}
          onClose={() => { setCompareFrom(null); setCompareTo(null); }}
          onSwap={() => setCompareTo(null)}
        />
      )}
    </div>
  );
}

```
