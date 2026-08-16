# Entrepreneur Simulator — Procedural Portrait Generator

Extracted from `founder-hospitality-prototype.jsx` for external review. Exact code currently in
the shipped source (not a draft).

## What this does

Generates deterministic, layered SVG character art from a seed string (a founder's id or name) —
no images stored anywhere, no network calls, no build step. The same seed always produces
pixel-identical art, which is what lets a founder's portrait persist across sessions with nothing
saved but the seed itself.

## Design constraints this was built under

- **Must match the game's existing aesthetic**: an engraved brass-and-ink, 1920s-industrial look
  (see the design token object `C` referenced throughout the wider codebase — `C.ink`, `C.brass`,
  `C.panel`, etc.), not a cartoon-avatar style.
- **Must be genuinely 3-D-shaded**, not flat-fill: a single lighting convention (key light
  upper-left, weak fill lower-right, rim light on the right edge) is applied consistently via
  radial gradients for base form, blurred occlusion shadows where planes meet (hairline, jaw,
  chin, nose, collar), and small high-opacity speculars on surfaces facing the key light.
- **Must be render-cheap**: this runs client-side in a browser on every portrait shown (roster
  grids can show 6+ at once), so it's plain SVG path/shape markup — no filters beyond
  `feGaussianBlur`, no external assets.
- **Pool size** (current targets): 10 skin tones (each a 3-stop shadow/base/light ramp, not a
  single hex — naive darkening desaturates deep tones into grey), 10 hair colors, 20 hair
  *styles* (each with optional back/front layers so long styles frame the face), 14 accessories
  (spectacles x2, monocle, moustache, beard, goatee, earrings x2, freckles, and 5 weighted "wears
  nothing" slots so accessories stay a distinguishing detail rather than noise), 5 collar/garment
  styles.
- **Per-face jitter**: face width/height, chin taper, eye spacing/size/height, brow height/angle/
  thickness, nose length/width, mouth width/curve/height, ear size, iris color (6 tones) — all
  derived from the same seeded PRNG so two founders sharing a hair style and skin tone still read
  as different people.

## A bug worth knowing about (already fixed, but instructive for review)

Hair and facial-hair art is authored against fixed reference coordinates, but face geometry
jitters per seed. The first version drew hair at those fixed coordinates directly, which made it
float as a disconnected band above small faces and clip into large ones. The fix — visible in the
code below as `hairXform` — maps the reference art onto the actual generated skull via an SVG
`transform` (translate/scale/translate) computed from that seed's `faceW`/`faceH`. Beards,
moustaches, goatees and earrings were rewritten to compute their paths directly from the
per-face geometry (`chinY`, `mouthY`, `mouthW`, `faceW`) rather than fixed coordinates, for the
same reason.

## What would be useful feedback

- Whether the layered-SVG approach (vs. e.g. a small fixed set of hand-drawn sprite parts, or an
  actual generative-image pipeline) is the right tradeoff for a browser game with no build step
- Whether the lighting/shading technique reads as "3-D" convincingly at small sizes (portraits
  render as small as ~44px in list views) or only holds up at the larger detail-window size (~96px)
- Any gaps in the jitter ranges that would make repeated portraits feel same-y at scale (the game
  may eventually show dozens of rival-company leaders alongside the roster)
- Accessibility: color-only differentiation (skin/hair ramps, iris tones) with no shape-based
  fallback if two very similar seeds land close in hue space

---

```javascript
// ============================== PROCEDURAL PORTRAITS ==============================
// Deterministic layered SVG art, seeded from a founder id or name. Reads as a person while
// staying inside the game's engraved brass-and-ink aesthetic — closer to a period business-card
// etching than a cartoon avatar, which is what suits a 1920s-industrial simulation.
//
// Everything is derived from a hash of the seed, so a given founder always renders identically
// across sessions and devices with nothing stored but the seed itself. When hand-drawn art
// arrives later it drops in behind the same <ProceduralPortrait> call sites.
//
// LIGHTING MODEL: a single key light from the upper-left, a weak fill from the lower-right, and
// a rim light on the right edge. Every shaded element follows that one convention — if a new
// feature is added it must shade the same way or the face stops reading as solid. Volume comes
// from three stacked cheap tricks rather than real 3-D: a radial gradient for the base form,
// hand-placed occlusion shadows where planes meet (under hair, chin, nose, collar), and small
// high-opacity speculars on the surfaces that face the key light.

function hashSeed(str) {
  let h = 2166136261;
  const s = String(str || 'seed');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Small deterministic PRNG so each portrait feature draws from an independent stream.
function seededPicker(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

// Ten skin tones, each a three-stop ramp: shadow / base / light. Authored as explicit ramps
// rather than computed by darkening one hex, because naive multiplication desaturates deep tones
// into grey — the ramps keep warmth in shadow across the whole range.
const SKIN_RAMPS = [
  { s: '#C9A382', b: '#F2D7BA', l: '#FFEBD6' },
  { s: '#BE9068', b: '#E9C39F', l: '#FBDCC0' },
  { s: '#A87B54', b: '#DCAE83', l: '#F2CCA6' },
  { s: '#96683F', b: '#C89464', l: '#E3B589' },
  { s: '#7E5233', b: '#B27B47', l: '#D19E6C' },
  { s: '#66422A', b: '#95643A', l: '#B58459' },
  { s: '#513320', b: '#7A4E2C', l: '#9A6B45' },
  { s: '#3E2719', b: '#5E3A24', l: '#7C543A' },   // added
  { s: '#2E1D13', b: '#482C1C', l: '#66412D' },   // added
  { s: '#D8B99B', b: '#FFF0DC', l: '#FFFAF0' },   // added — very fair, cool cast
];

// Hair ramps follow the same shadow/base/light convention so highlights read as sheen.
const HAIR_RAMPS = [
  { s: '#0D0A08', b: '#1C1512', l: '#3A2C24' },
  { s: '#1A1109', b: '#2E2018', l: '#4E3626' },
  { s: '#2C1B0F', b: '#4A3020', l: '#6E4A30' },
  { s: '#452C17', b: '#6B4A2A', l: '#946A3E' },
  { s: '#5E441F', b: '#8C6A3A', l: '#B89154' },
  { s: '#7E6437', b: '#B9985C', l: '#DCC189' },
  { s: '#A2957A', b: '#D9CBB0', l: '#F2E8D2' },
  { s: '#5E5E5E', b: '#8A8A8A', l: '#BDBDBD' },
  { s: '#3C3834', b: '#5A5550', l: '#807A72' },
  { s: '#6B2B22', b: '#9C4432', l: '#C4694A' },   // auburn
];

const GARMENT_RAMPS = [
  { s: '#17301F', b: '#2A4F37', l: '#3E6B4C' },
  { s: '#0F2418', b: '#1B3626', l: '#2C4E38' },
  { s: '#24382B', b: '#3C5C46', l: '#537A5F' },
  { s: '#1B2632', b: '#2F3E52', l: '#45586F' },
  { s: '#2C2233', b: '#4A3A52', l: '#65526E' },
  { s: '#33281C', b: '#52402E', l: '#6E5842' },
  { s: '#232329', b: '#3A3A42', l: '#52525C' },
  { s: '#3A2320', b: '#5C3833', l: '#7A4E47' },
];

// ---------------------------------------------------------------- hair
// 20 styles. Each returns { back, front }: `back` renders behind the head so long styles frame
// the face instead of sitting on top of it like a helmet, `front` renders over the skull. Both
// receive the full ramp so each style can place its own sheen.
const HAIR_STYLES = [
  // 1 short crop
  (r) => ({ front: `<path d="M26 45 Q26 18 50 18 Q74 18 74 45 L74 37 Q68 28 50 28 Q32 28 32 37 Z" fill="${r.b}"/><path d="M32 30 Q42 22 56 24 Q46 26 38 34 Z" fill="${r.l}" opacity="0.5"/>` }),
  // 2 side part
  (r) => ({ front: `<path d="M26 45 Q26 17 50 17 Q76 17 74 43 Q70 26 46 30 Q34 32 32 45 Z" fill="${r.b}"/><path d="M40 22 Q56 20 68 30 Q54 25 42 28 Z" fill="${r.l}" opacity="0.45"/>` }),
  // 3 long framing
  (r) => ({
    back: `<path d="M22 46 Q20 14 50 14 Q80 14 78 46 L78 82 Q72 60 71 44 L29 44 Q28 60 22 82 Z" fill="${r.s}"/>`,
    front: `<path d="M25 47 Q24 17 50 17 Q76 17 75 47 Q70 31 50 31 Q30 31 25 47 Z" fill="${r.b}"/><path d="M36 24 Q50 19 62 25 Q50 24 40 30 Z" fill="${r.l}" opacity="0.4"/>`,
  }),
  // 4 curly volume
  (r) => ({ front: `<path d="M24 43 Q22 14 50 14 Q78 14 76 43 Q72 30 66 31 Q60 22 50 22 Q40 22 34 31 Q28 30 24 43 Z" fill="${r.b}"/><circle cx="36" cy="24" r="7" fill="${r.b}"/><circle cx="50" cy="19" r="8" fill="${r.b}"/><circle cx="64" cy="24" r="7" fill="${r.b}"/><circle cx="44" cy="20" r="4" fill="${r.l}" opacity="0.35"/>` }),
  // 5 tied back
  (r) => ({
    back: `<path d="M70 38 Q86 44 82 62 Q74 52 68 48 Z" fill="${r.s}"/>`,
    front: `<path d="M27 44 Q27 17 50 17 Q73 17 73 44 Q68 29 50 29 Q32 29 27 44 Z" fill="${r.b}"/><path d="M38 23 Q52 19 64 27 Q52 24 42 29 Z" fill="${r.l}" opacity="0.4"/>`,
  }),
  // 6 receding
  (r) => ({ front: `<path d="M29 41 Q34 25 50 25 Q66 25 71 41 Q64 33 50 33 Q36 33 29 41 Z" fill="${r.b}"/><path d="M38 30 Q50 27 60 31 Q50 30 40 34 Z" fill="${r.l}" opacity="0.3"/>` }),
  // 7 afro
  (r) => ({
    back: `<ellipse cx="50" cy="33" rx="30" ry="26" fill="${r.s}"/>`,
    front: `<ellipse cx="50" cy="32" rx="27" ry="23" fill="${r.b}"/><ellipse cx="40" cy="24" rx="9" ry="7" fill="${r.l}" opacity="0.32"/>`,
  }),
  // 8 bob
  (r) => ({
    back: `<path d="M24 45 Q24 16 50 16 Q76 16 76 45 L76 64 Q70 48 68 43 L32 43 Q30 48 24 64 Z" fill="${r.s}"/>`,
    front: `<path d="M25 45 Q25 18 50 18 Q75 18 75 45 Q71 33 50 33 Q29 33 25 45 Z" fill="${r.b}"/><path d="M35 24 Q50 20 62 26 Q50 25 39 31 Z" fill="${r.l}" opacity="0.4"/>`,
  }),
  // 9 slicked back
  (r) => ({ front: `<path d="M28 40 Q28 18 50 18 Q72 18 72 40 Q70 28 50 27 Q30 28 28 40 Z" fill="${r.b}"/><path d="M34 26 Q50 21 66 26 Q50 25 34 30 Z" fill="${r.l}" opacity="0.55"/>` }),
  // 10 top knot
  (r) => ({
    back: `<circle cx="50" cy="13" r="9" fill="${r.s}"/>`,
    front: `<circle cx="50" cy="12" r="8" fill="${r.b}"/><path d="M28 42 Q28 19 50 19 Q72 19 72 42 Q68 30 50 30 Q32 30 28 42 Z" fill="${r.b}"/><circle cx="47" cy="9" r="3" fill="${r.l}" opacity="0.4"/>` }),
  // 11 undercut / long top
  (r) => ({ front: `<path d="M29 41 Q30 17 52 17 Q74 17 72 38 Q62 22 44 27 Q34 30 33 41 Z" fill="${r.b}"/><path d="M46 21 Q62 21 70 32 Q58 24 46 26 Z" fill="${r.l}" opacity="0.45"/><path d="M29 41 Q31 34 34 33 L34 41 Z" fill="${r.s}"/>` }),
  // 12 braids
  (r) => ({
    back: `<path d="M26 44 Q22 70 26 84 Q32 70 32 48 Z M74 44 Q78 70 74 84 Q68 70 68 48 Z" fill="${r.s}"/>`,
    front: `<path d="M27 44 Q27 17 50 17 Q73 17 73 44 Q68 29 50 29 Q32 29 27 44 Z" fill="${r.b}"/><path d="M36 22 L64 22 M34 27 L66 27" stroke="${r.l}" stroke-width="1.2" opacity="0.35"/>`,
  }),
  // 13 pompadour
  (r) => ({ front: `<path d="M28 42 Q26 20 42 15 Q58 10 68 20 Q74 27 72 42 Q68 28 50 28 Q34 29 28 42 Z" fill="${r.b}"/><path d="M38 19 Q54 14 66 23 Q52 19 40 25 Z" fill="${r.l}" opacity="0.5"/>` }),
  // 14 wavy shoulder
  (r) => ({
    back: `<path d="M22 46 Q20 15 50 15 Q80 15 78 46 Q80 62 74 80 Q72 64 70 46 L30 46 Q28 64 26 80 Q20 62 22 46 Z" fill="${r.s}"/>`,
    front: `<path d="M25 46 Q25 18 50 18 Q75 18 75 46 Q69 32 50 32 Q31 32 25 46 Z" fill="${r.b}"/><path d="M34 25 Q46 20 58 23 Q46 24 37 30 Z" fill="${r.l}" opacity="0.38"/>`,
  }),
  // 15 buzz
  (r) => ({ front: `<path d="M30 40 Q30 22 50 22 Q70 22 70 40 Q66 31 50 31 Q34 31 30 40 Z" fill="${r.b}" opacity="0.9"/>` }),
  // 16 fringe / blunt bangs
  (r) => ({
    back: `<path d="M25 44 Q25 16 50 16 Q75 16 75 44 L75 68 Q70 50 68 44 L32 44 Q30 50 25 68 Z" fill="${r.s}"/>`,
    front: `<path d="M26 44 Q26 17 50 17 Q74 17 74 44 L74 38 Q62 34 50 34 Q38 34 26 38 Z" fill="${r.b}"/><path d="M32 24 Q50 19 68 25 Q50 24 34 30 Z" fill="${r.l}" opacity="0.35"/>`,
  }),
  // 17 side sweep
  (r) => ({ front: `<path d="M26 44 Q24 18 50 17 Q74 17 74 40 Q66 24 44 31 Q32 35 30 46 Z" fill="${r.b}"/><path d="M44 22 Q62 21 70 31 Q56 24 46 27 Z" fill="${r.l}" opacity="0.42"/>` }),
  // 18 dreadlocks
  (r) => ({
    back: `<path d="M26 42 L23 80 M33 44 L31 84 M50 44 L50 86 M67 44 L69 84 M74 42 L77 80" stroke="${r.s}" stroke-width="6" stroke-linecap="round" fill="none"/>`,
    front: `<path d="M26 43 Q26 16 50 16 Q74 16 74 43 Q68 28 50 28 Q32 28 26 43 Z" fill="${r.b}"/><path d="M34 21 L38 30 M46 18 L47 28 M58 19 L57 29 M66 23 L63 31" stroke="${r.l}" stroke-width="1.4" opacity="0.3"/>`,
  }),
  // 19 mohawk / crest
  (r) => ({ front: `<path d="M44 40 Q42 12 50 8 Q58 12 56 40 Z" fill="${r.b}"/><path d="M47 34 Q47 15 50 11 Q52 16 52 34 Z" fill="${r.l}" opacity="0.4"/><path d="M30 42 Q32 30 40 28 L40 42 Z M70 42 Q68 30 60 28 L60 42 Z" fill="${r.s}" opacity="0.8"/>` }),
  // 20 headwrap (cloth, uses hair ramp as fabric)
  (r) => ({ front: `<path d="M25 42 Q25 15 50 15 Q75 15 75 42 Q74 30 50 30 Q26 30 25 42 Z" fill="${r.b}"/><path d="M25 34 Q50 26 75 34 L75 40 Q50 32 25 40 Z" fill="${r.s}" opacity="0.6"/><path d="M70 20 Q80 24 78 34 Q74 26 66 24 Z" fill="${r.b}"/><path d="M34 20 Q50 15 64 20 Q50 19 36 25 Z" fill="${r.l}" opacity="0.35"/>` }),
];

// ---------------------------------------------------------------- accessories
// 14 total. Weighted by repeating the empty entry, so most founders wear nothing and an
// accessory stays a distinguishing detail rather than visual noise.
const ACCESSORIES = [
  () => '', () => '', () => '', () => '', () => '',
  // round spectacles
  (r, g) => `<g fill="none" stroke="#241F17" stroke-width="1.6" opacity="0.9"><circle cx="${g.eyeL}" cy="52" r="7.5"/><circle cx="${g.eyeR}" cy="52" r="7.5"/><path d="M${g.eyeL + 7.5} 52 h${g.eyeR - g.eyeL - 15}"/><path d="M${g.eyeL - 7.5} 51 l-6 -2 M${g.eyeR + 7.5} 51 l6 -2"/></g><circle cx="${g.eyeL - 2}" cy="49" r="2" fill="#FFF" opacity="0.22"/><circle cx="${g.eyeR - 2}" cy="49" r="2" fill="#FFF" opacity="0.22"/>`,
  // square spectacles
  (r, g) => `<g fill="none" stroke="#241F17" stroke-width="1.6" opacity="0.9"><rect x="${g.eyeL - 8}" y="46" width="16" height="12" rx="2"/><rect x="${g.eyeR - 8}" y="46" width="16" height="12" rx="2"/><path d="M${g.eyeL + 8} 52 h${g.eyeR - g.eyeL - 16}"/></g><path d="M${g.eyeL - 6} 48 l5 0" stroke="#FFF" stroke-width="1.4" opacity="0.25"/>`,
  // monocle
  (r, g) => `<g fill="none" stroke="#C79A56" stroke-width="1.7"><circle cx="${g.eyeR}" cy="52" r="8"/></g><path d="M${g.eyeR + 8} 55 q6 8 2 16" stroke="#C79A56" stroke-width="1" fill="none" opacity="0.8"/><circle cx="${g.eyeR - 3}" cy="49" r="2.4" fill="#FFF" opacity="0.2"/>`,
  // moustache — sits on the actual mouth line
  (r, g) => `<path d="M${50 - g.mouthW - 1} ${g.mouthY - 1.5} Q50 ${g.mouthY - 5.5} ${50 + g.mouthW + 1} ${g.mouthY - 1.5} Q50 ${g.mouthY + 1.5} ${50 - g.mouthW - 1} ${g.mouthY - 1.5} Z" fill="${r.s}"/><path d="M${50 - g.mouthW * 0.6} ${g.mouthY - 3} Q50 ${g.mouthY - 4.5} ${50 + g.mouthW * 0.6} ${g.mouthY - 3} Q50 ${g.mouthY - 2.6} ${50 - g.mouthW * 0.6} ${g.mouthY - 3} Z" fill="${r.l}" opacity="0.3"/>`,
  // full beard — traced along the jaw so it fits every face width
  (r, g) => `<path d="M${50 - g.faceW * 0.92} ${g.eyeY + 3} Q${50 - g.faceW * 0.85} ${g.chinY - 1} 50 ${g.chinY + 1} Q${50 + g.faceW * 0.85} ${g.chinY - 1} ${50 + g.faceW * 0.92} ${g.eyeY + 3} Q${50 + g.faceW * 0.7} ${g.chinY - 5} 50 ${g.chinY - 4} Q${50 - g.faceW * 0.7} ${g.chinY - 5} ${50 - g.faceW * 0.92} ${g.eyeY + 3} Z" fill="${r.b}"/><path d="M${50 - g.faceW * 0.55} ${g.mouthY + 5} Q50 ${g.mouthY + 11} ${50 + g.faceW * 0.55} ${g.mouthY + 5} Q50 ${g.mouthY + 8} ${50 - g.faceW * 0.55} ${g.mouthY + 5} Z" fill="${r.s}" opacity="0.5"/>`,
  // goatee
  (r, g) => `<path d="M${50 - g.mouthW} ${g.mouthY + 3} Q50 ${g.mouthY + 1} ${50 + g.mouthW} ${g.mouthY + 3} Q${50 + g.mouthW * 0.8} ${g.chinY - 1} 50 ${g.chinY + 0.5} Q${50 - g.mouthW * 0.8} ${g.chinY - 1} ${50 - g.mouthW} ${g.mouthY + 3} Z" fill="${r.b}"/>`,
  // earring
  (r, g) => `<circle cx="${50 - g.faceW}" cy="${g.eyeY + 10}" r="2.2" fill="#C79A56"/><circle cx="${50 - g.faceW - 0.6}" cy="${g.eyeY + 9.4}" r="0.8" fill="#F2EDE1" opacity="0.7"/>`,
  // hoop earrings
  (r, g) => `<circle cx="${50 - g.faceW}" cy="${g.eyeY + 10}" r="3.4" fill="none" stroke="#C79A56" stroke-width="1.3"/><circle cx="${50 + g.faceW}" cy="${g.eyeY + 10}" r="3.4" fill="none" stroke="#C79A56" stroke-width="1.3"/>`,
  // freckles
  (r, g, sk) => `<g fill="${sk.s}" opacity="0.55"><circle cx="${g.eyeL - 3}" cy="58" r="0.9"/><circle cx="${g.eyeL + 2}" cy="60" r="0.8"/><circle cx="${g.eyeR - 2}" cy="59" r="0.9"/><circle cx="${g.eyeR + 3}" cy="57" r="0.8"/><circle cx="50" cy="61" r="0.7"/></g>`,
];

// ---------------------------------------------------------------- collars
const COLLARS = [
  (g) => `<path d="M20 100 Q20 81 50 81 Q80 81 80 100 Z" fill="${g.b}"/><path d="M20 100 Q22 86 34 82 L34 100 Z" fill="${g.s}" opacity="0.7"/><path d="M50 81 L43 96 L50 100 L57 96 Z" fill="#F2EDE1" opacity="0.92"/><path d="M50 88 L47 96 L50 98 L53 96 Z" fill="#7A2E20" opacity="0.75"/>`,
  (g) => `<path d="M19 100 Q19 83 50 83 Q81 83 81 100 Z" fill="${g.b}"/><path d="M38 84 L50 99 L62 84 L57 83 L50 93 L43 83 Z" fill="#F2EDE1" opacity="0.9"/><path d="M19 100 Q21 88 32 84 L32 100 Z" fill="${g.s}" opacity="0.65"/>`,
  (g) => `<path d="M21 100 Q21 82 50 82 Q79 82 79 100 Z" fill="${g.b}"/><rect x="45" y="83" width="10" height="17" fill="${g.l}" opacity="0.55"/><path d="M21 100 Q23 87 33 83 L33 100 Z" fill="${g.s}" opacity="0.7"/>`,
  // work overalls with strap
  (g) => `<path d="M20 100 Q20 83 50 83 Q80 83 80 100 Z" fill="${g.b}"/><rect x="36" y="83" width="6" height="17" fill="${g.l}" opacity="0.5"/><rect x="58" y="83" width="6" height="17" fill="${g.l}" opacity="0.5"/><circle cx="39" cy="88" r="1.6" fill="#C79A56"/><circle cx="61" cy="88" r="1.6" fill="#C79A56"/>`,
  // high collar / mandarin
  (g) => `<path d="M22 100 Q22 82 50 82 Q78 82 78 100 Z" fill="${g.b}"/><path d="M40 82 Q50 79 60 82 L60 90 Q50 87 40 90 Z" fill="${g.l}" opacity="0.6"/><path d="M22 100 Q24 88 34 83 L34 100 Z" fill="${g.s}" opacity="0.7"/>`,
];

// Builds the full SVG markup for a founder. Pure and deterministic given the seed.
function buildPortraitSVG(seed, opts = {}) {
  const rnd = seededPicker(seed);
  const uid = hashSeed(seed).toString(36);

  const skin = SKIN_RAMPS[Math.floor(rnd() * SKIN_RAMPS.length)];
  const hairRamp = HAIR_RAMPS[Math.floor(rnd() * HAIR_RAMPS.length)];
  const garment = opts.garment || GARMENT_RAMPS[Math.floor(rnd() * GARMENT_RAMPS.length)];
  const hair = HAIR_STYLES[Math.floor(rnd() * HAIR_STYLES.length)](hairRamp);
  const accessory = ACCESSORIES[Math.floor(rnd() * ACCESSORIES.length)];
  const collar = COLLARS[Math.floor(rnd() * COLLARS.length)];
  const bgHue = Math.floor(rnd() * 360);

  // ---- per-face jitter ----
  // Widened well beyond the first pass: face proportions, chin taper, eye spacing and size, brow
  // height and angle, nose length and width, mouth width and curve, ear size. Two faces sharing
  // a hair style and skin tone should still read as different people.
  const faceW = 19.5 + rnd() * 5.5;
  const faceH = 24.5 + rnd() * 5.5;
  const chinTaper = 0.62 + rnd() * 0.3;
  const eyeSpread = 8 + rnd() * 3.4;
  const eyeL = 50 - eyeSpread, eyeR = 50 + eyeSpread;
  const eyeR_ = 2.0 + rnd() * 1.0;
  const eyeY = 51 + rnd() * 2.2;
  const browY = eyeY - (4.5 + rnd() * 2.4);
  const browAngle = -2.6 + rnd() * 5.2;
  const browThick = 1.3 + rnd() * 1.2;
  const noseLen = 7 + rnd() * 4.5;
  const noseW = 2.6 + rnd() * 2.2;
  const mouthY = 66 + rnd() * 3.5;
  const mouthW = 5 + rnd() * 4;
  const mouthCurve = 1.6 + rnd() * 3.2;
  const earR = 3 + rnd() * 1.6;
  const irisTone = ['#3B2A1C', '#4A3520', '#2F4A3C', '#3A4A5E', '#5A4030', '#2A2A2E'][Math.floor(rnd() * 6)];

  const noseTip = eyeY + noseLen;
  const chinY = 52 + faceH * chinTaper;
  // Nominal hair art is drawn against a reference skull (top y=16, half-width 25 at the
  // hairline). Real skulls jitter, so hair is mapped onto the actual head with this transform
  // instead of being drawn at fixed coordinates — without it, hair floats as a band above small
  // faces and clips into large ones.
  const hairXform = `translate(50 ${52 - faceH}) scale(${(faceW / 25).toFixed(4)} ${(faceH / 28).toFixed(4)}) translate(-50 -16)`;
  const g = { eyeL, eyeR, eyeY, faceW, faceH, chinY, mouthY, mouthW, noseTip };

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
  <defs>
    <clipPath id="cp-${uid}"><rect x="0" y="0" width="100" height="100" rx="6"/></clipPath>
    <radialGradient id="bg-${uid}" cx="0.36" cy="0.28" r="0.9">
      <stop offset="0%" stop-color="hsl(${bgHue}, 26%, 30%)"/>
      <stop offset="60%" stop-color="hsl(${bgHue}, 28%, 19%)"/>
      <stop offset="100%" stop-color="hsl(${bgHue}, 30%, 11%)"/>
    </radialGradient>
    <!-- Key light upper-left: base form of the face. -->
    <radialGradient id="skin-${uid}" cx="0.34" cy="0.26" r="0.86">
      <stop offset="0%" stop-color="${skin.l}"/>
      <stop offset="45%" stop-color="${skin.b}"/>
      <stop offset="100%" stop-color="${skin.s}"/>
    </radialGradient>
    <linearGradient id="neck-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${skin.s}"/>
      <stop offset="100%" stop-color="${skin.b}"/>
    </linearGradient>
    <!-- Soft occlusion used under the hairline and jaw. -->
    <filter id="blur-${uid}" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2.4"/>
    </filter>
    <filter id="soft-${uid}" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="1.1"/>
    </filter>
  </defs>
  <g clip-path="url(#cp-${uid})">
    <rect x="0" y="0" width="100" height="100" fill="url(#bg-${uid})"/>
    <!-- cast shadow behind the head, offset down-right away from the key light -->
    <ellipse cx="54" cy="56" rx="33" ry="35" fill="#000" opacity="0.22" filter="url(#blur-${uid})"/>

    ${hair.back ? `<g transform="${hairXform}">${hair.back}</g>` : ''}

    <!-- neck, with the jaw's occlusion shadow across its top -->
    <path d="M${50 - 7} 68 h14 v14 h-14 Z" fill="url(#neck-${uid})"/>
    <ellipse cx="50" cy="70" rx="9" ry="4.5" fill="${skin.s}" opacity="0.85" filter="url(#soft-${uid})"/>

    ${collar(garment)}

    <!-- ears, shaded toward the far side -->
    <ellipse cx="${50 - faceW}" cy="${eyeY + 5}" rx="${earR}" ry="${earR * 1.45}" fill="${skin.b}"/>
    <ellipse cx="${50 - faceW}" cy="${eyeY + 5}" rx="${earR * 0.5}" ry="${earR * 0.8}" fill="${skin.s}" opacity="0.7"/>
    <ellipse cx="${50 + faceW}" cy="${eyeY + 5}" rx="${earR}" ry="${earR * 1.45}" fill="${skin.s}"/>

    <!-- face: broad cranium tapering to the chin -->
    <path d="M${50 - faceW} ${eyeY - 4}
             Q${50 - faceW} ${52 - faceH} 50 ${52 - faceH}
             Q${50 + faceW} ${52 - faceH} ${50 + faceW} ${eyeY - 4}
             Q${50 + faceW} ${52 + faceH * chinTaper} 50 ${52 + faceH * chinTaper + 2}
             Q${50 - faceW} ${52 + faceH * chinTaper} ${50 - faceW} ${eyeY - 4} Z"
          fill="url(#skin-${uid})"/>

    <!-- forehead specular, facing the key light -->
    <ellipse cx="${50 - faceW * 0.38}" cy="${eyeY - 9}" rx="${faceW * 0.34}" ry="4.5" fill="${skin.l}" opacity="0.26" filter="url(#soft-${uid})"/>
    <!-- cheekbone highlight and the shadowed far cheek -->
    <ellipse cx="${50 - faceW * 0.52}" cy="${eyeY + 7}" rx="5" ry="4" fill="${skin.l}" opacity="0.3" filter="url(#soft-${uid})"/>
    <ellipse cx="${50 + faceW * 0.62}" cy="${eyeY + 6}" rx="6" ry="9" fill="${skin.s}" opacity="0.4" filter="url(#soft-${uid})"/>
    <!-- occlusion under the hairline -->
    <ellipse cx="50" cy="${52 - faceH + 6}" rx="${faceW * 0.9}" ry="5" fill="${skin.s}" opacity="0.5" filter="url(#blur-${uid})"/>
    <!-- chin/jaw shadow -->
    <ellipse cx="50" cy="${52 + faceH * chinTaper - 3}" rx="${faceW * 0.5}" ry="4" fill="${skin.s}" opacity="0.35" filter="url(#soft-${uid})"/>

    <!-- nose: shadowed plane on the light-away side plus a specular on the bridge -->
    <path d="M50 ${eyeY - 1} Q${50 + noseW} ${noseTip - 2} 50 ${noseTip} Q${50 - noseW * 0.7} ${noseTip - 1} ${50 - noseW * 0.5} ${noseTip - 3}"
          fill="${skin.s}" opacity="0.55"/>
    <ellipse cx="${50 - 1}" cy="${eyeY + noseLen * 0.45}" rx="1.1" ry="${noseLen * 0.34}" fill="${skin.l}" opacity="0.5"/>
    <ellipse cx="${50 - noseW * 0.9}" cy="${noseTip}" rx="1.3" ry="1" fill="${skin.s}" opacity="0.7"/>
    <ellipse cx="${50 + noseW * 0.9}" cy="${noseTip}" rx="1.3" ry="1" fill="${skin.s}" opacity="0.7"/>

    <!-- eyes: socket shadow, sclera, iris, pupil, specular, lid line -->
    <ellipse cx="${eyeL}" cy="${eyeY}" rx="${eyeR_ + 2.6}" ry="${eyeR_ + 1.8}" fill="${skin.s}" opacity="0.4" filter="url(#soft-${uid})"/>
    <ellipse cx="${eyeR}" cy="${eyeY}" rx="${eyeR_ + 2.6}" ry="${eyeR_ + 1.8}" fill="${skin.s}" opacity="0.4" filter="url(#soft-${uid})"/>
    <ellipse cx="${eyeL}" cy="${eyeY}" rx="${eyeR_ + 1.4}" ry="${eyeR_ + 0.5}" fill="#F6F0E4" opacity="0.95"/>
    <ellipse cx="${eyeR}" cy="${eyeY}" rx="${eyeR_ + 1.4}" ry="${eyeR_ + 0.5}" fill="#F6F0E4" opacity="0.95"/>
    <circle cx="${eyeL}" cy="${eyeY}" r="${eyeR_}" fill="${irisTone}"/>
    <circle cx="${eyeR}" cy="${eyeY}" r="${eyeR_}" fill="${irisTone}"/>
    <circle cx="${eyeL}" cy="${eyeY}" r="${eyeR_ * 0.45}" fill="#120E0A"/>
    <circle cx="${eyeR}" cy="${eyeY}" r="${eyeR_ * 0.45}" fill="#120E0A"/>
    <circle cx="${eyeL - eyeR_ * 0.4}" cy="${eyeY - eyeR_ * 0.4}" r="${eyeR_ * 0.3}" fill="#FFF" opacity="0.85"/>
    <circle cx="${eyeR - eyeR_ * 0.4}" cy="${eyeY - eyeR_ * 0.4}" r="${eyeR_ * 0.3}" fill="#FFF" opacity="0.85"/>
    <path d="M${eyeL - eyeR_ - 1.4} ${eyeY - 1} q${eyeR_ + 1.4} -2.2 ${(eyeR_ + 1.4) * 2} 0" stroke="${skin.s}" stroke-width="0.9" fill="none" opacity="0.8"/>
    <path d="M${eyeR - eyeR_ - 1.4} ${eyeY - 1} q${eyeR_ + 1.4} -2.2 ${(eyeR_ + 1.4) * 2} 0" stroke="${skin.s}" stroke-width="0.9" fill="none" opacity="0.8"/>

    <!-- brows, angled by jitter -->
    <path d="M${eyeL - 5} ${browY + browAngle * 0.4} q5 ${-2.4 - browAngle * 0.2} 10 ${browAngle * 0.35}"
          stroke="${hairRamp.s}" stroke-width="${browThick}" fill="none" stroke-linecap="round"/>
    <path d="M${eyeR - 5} ${browY + browAngle * 0.35} q5 ${-2.4 - browAngle * 0.2} 10 ${browAngle * 0.4}"
          stroke="${hairRamp.s}" stroke-width="${browThick}" fill="none" stroke-linecap="round"/>

    <!-- mouth: shadow line, lower-lip specular -->
    <path d="M${50 - mouthW} ${mouthY} q${mouthW} ${mouthCurve} ${mouthW * 2} 0"
          stroke="#6B2A20" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.85"/>
    <path d="M${50 - mouthW * 0.7} ${mouthY + mouthCurve * 0.55} q${mouthW * 0.7} ${mouthCurve * 0.5} ${mouthW * 1.4} 0"
          stroke="${skin.l}" stroke-width="1.1" fill="none" opacity="0.35"/>

    ${hair.front ? `<g transform="${hairXform}">${hair.front}</g>` : ''}
    ${accessory(hairRamp, g, skin)}

    <!-- rim light down the right edge, opposite the key -->
    <path d="M${50 + faceW - 1} ${eyeY - 12} Q${50 + faceW + 1.5} ${eyeY + 6} ${50 + faceW * 0.55} ${52 + faceH * chinTaper - 4}"
          stroke="${skin.l}" stroke-width="1.6" fill="none" opacity="0.4" filter="url(#soft-${uid})"/>
    <!-- vignette to seat the head in the frame -->
    <rect x="0" y="0" width="100" height="100" fill="none" stroke="#000" stroke-width="10" opacity="0.16"/>
  </g>
</svg>`;
}

```
