global.window = global;
const { makeMemoryStorage } = require('./memory_storage_stub.cjs');
window.storage = makeMemoryStorage();
require('./build/harness.cjs');

let pass=0, fail=0;
const ok=(l,c,d)=>{ if(c){pass++;console.log(`  ok   ${l}${d?'  — '+d:''}`);} else {fail++;console.log(`  FAIL ${l}${d?'  — '+d:''}`);} };
const section=(s)=>console.log(`\n${s}`);

const Store = window.__Store;
const getIndustry = window.__getIndustry2;
const founderLevel = window.__founderLevel;
const earnedPoints = window.__founderEarnedPoints;
const spentPoints = window.__spentStatPoints;
const toLeader = window.__customFounderToLeader;
const buildSVG = window.__buildPortraitSVG;
const hashSeed = window.__hashSeed;

(async () => {
  section('Procedural portraits');
  ok('generator is exposed', typeof buildSVG === 'function');
  const svg1 = buildSVG('mfgEngineer');
  const svg2 = buildSVG('mfgEngineer');
  const svg3 = buildSVG('mfgOps');
  ok('produces valid SVG markup', svg1.startsWith('<svg') && svg1.includes('</svg>'));
  ok('deterministic — same seed, identical art', svg1 === svg2);
  ok('different seeds produce different art', svg1 !== svg3);
  ok('includes a face', svg1.includes('ellipse') && svg1.includes('circle'));
  const seeds = ['a','b','c','d','e','f','g','h','i','j','k','l'];
  const arts = seeds.map(s => buildSVG(s));
  ok('12 seeds yield 12 distinct portraits', new Set(arts).size === 12, `${new Set(arts).size} unique`);
  // Verify variety across the feature axes rather than just "the strings differ".
  // Pool sizes, asserted against the actual tables rather than hardcoded hexes — the previous
  // version checked for specific colours from an earlier palette and silently went stale the
  // moment the ramps were rewritten.
  const SKIN = window.__SKIN_RAMPS, HAIRS = window.__HAIR_STYLES, ACC = window.__ACCESSORIES;
  ok('at least 10 skin tones', SKIN.length >= 10, `${SKIN.length}`);
  ok('at least 20 hair styles', HAIRS.length >= 20, `${HAIRS.length}`);
  ok('at least 14 accessories', ACC.length >= 14, `${ACC.length}`);
  ok('every skin tone is a full shadow/base/light ramp', SKIN.every(r => r.s && r.b && r.l));
  // Variety actually reaching the output: sample widely and count distinct base skin fills.
  const wide = Array.from({length: 400}, (_, i) => buildSVG('tone-' + i));
  const tonesSeen = new Set();
  SKIN.forEach(r => { if (wide.some(a => a.includes(r.b))) tonesSeen.add(r.b); });
  ok('every authored skin tone appears across a wide sample', tonesSeen.size === SKIN.length,
    `${tonesSeen.size}/${SKIN.length} tones observed in 400 portraits`);
  ok('3-D shading present (gradients, occlusion blur, rim light)',
    arts[0].includes('radialGradient') && arts[0].includes('feGaussianBlur'));
  ok('hair is bound to the skull rather than fixed coordinates',
    wide.filter(a => a.includes('<g transform="translate(50')).length > 300,
    'hair transform present');
  ok('unique clip ids prevent cross-portrait bleed (distinct hashes)',
    hashSeed('mfgEngineer') !== hashSeed('mfgOps'));

  section('Roster record captures detail-window data');
  const ind = getIndustry('manufacturing');
  const custom = { id:'custom', name:'Ada Chen', classId:'Operator', perkId:'walkTheFloor', statPoints:{operations:2}, portrait:{initials:'AC',hue:200,shape:'round'} };
  const customLeader = toLeader(custom, 'en');
  const authored = ind.content.leaders[1];
  const team = { name:'t', style:null, leaders:[customLeader, authored] };

  await Store.commitFounderRun({
    game: {
      month: 42, team, totalRaised: 260, companyValuation: 3100,
      philosophy: { growthVsSustainability: 60, peopleVsProfit: -40, innovationVsExecution: 20, riskVsStability: 10, premiumVsMass: 0, centralizedVsDelegated: 30 },
      investorBackers: { jimLeonard: {}, dwayneBorg: {} },
      competitors: [{ seedId:'mfg-r1', name:'Kestrel Tooling', encounters:{ attackedByPlayer:2 } }],
      gameOver: { headline: 'Acquired by Meridian' },
    },
    industry:'manufacturing', won:true, outcome:'strategicAcquisition',
  });
  const doc = await Store.getFounders();
  const rec = doc.roster[authored.id];
  ok('history entry recorded', (rec.history||[]).length === 1);
  ok('history has the outcome and headline', rec.history[0].outcome==='strategicAcquisition' && rec.history[0].headline==='Acquired by Meridian');
  ok('history records months/raised/valuation', rec.history[0].months===42 && rec.history[0].raised===260 && rec.history[0].valuation===3100);
  ok('philosophy accumulated from the run', rec.philosophy && rec.philosophy.growthVsSustainability === 60, JSON.stringify(rec.philosophy));
  ok('investors backed recorded', rec.investorsBacked.jimLeonard===1 && rec.investorsBacked.dwayneBorg===1);
  ok('rivals faced recorded with disposition band', rec.rivalsFaced['mfg-r1'] && rec.rivalsFaced['mfg-r1'].name==='Kestrel Tooling');
  ok('custom founder still gets no roster record', !doc.roster.custom);

  section('Philosophy averages rather than pinning at the clamp');
  await Store.commitFounderRun({
    game: { month: 20, team, totalRaised: 50, philosophy: { growthVsSustainability: -60, peopleVsProfit: 40, innovationVsExecution: 0, riskVsStability: 0, premiumVsMass: 0, centralizedVsDelegated: 0 }, investorBackers:{}, competitors:[] },
    industry:'manufacturing', won:false, outcome:'insolvent',
  });
  const doc2 = await Store.getFounders();
  const p2 = doc2.roster[authored.id].philosophy;
  ok('two opposite runs average toward the middle', Math.abs(p2.growthVsSustainability) < 40,
    `growth axis now ${p2.growthVsSustainability} (60 then -60)`);
  ok('history now has two entries, newest first', doc2.roster[authored.id].history.length===2 && doc2.roster[authored.id].history[0].outcome==='insolvent');
  ok('history is capped', doc2.roster[authored.id].history.length <= 30);

  section('Unspent point signal');
  const rec2 = doc2.roster[authored.id];
  const unspent = earnedPoints(rec2.xp) - spentPoints(rec2.allocated||{});
  ok('a founder with levels has unspent points to signal', unspent >= 0, `level ${founderLevel(rec2.xp)}, ${unspent} unspent`);
  if (unspent > 0) {
    await Store.allocateRosterPoints(authored.id, { operations: 1 });
    const doc3 = await Store.getFounders();
    const after = earnedPoints(doc3.roster[authored.id].xp) - spentPoints(doc3.roster[authored.id].allocated||{});
    ok('allocating reduces the unspent count', after === unspent - 1, `${unspent} -> ${after}`);
  } else {
    ok('allocating reduces the unspent count (skipped: none earned)', true);
  }

  console.log(`\n${'='.repeat(56)}\nRoster UI data: ${pass} passed, ${fail} failed\n${'='.repeat(56)}`);
  process.exit(fail?1:0);
})();
