global.window = global;
// storage stub so module-scope code referencing window.storage doesn't throw
global.window.storage = undefined;

try {
  require('./build/bundle.cjs');
} catch (e) {
  console.log('MODULE LOAD ERROR:', e.message);
  console.log(e.stack.split('\n').slice(0,5).join('\n'));
  process.exit(1);
}

const IND = global.window.__INDUSTRIES;
if (!IND) { console.log('window.__INDUSTRIES not exposed!'); process.exit(1); }

function report(name, obj) {
  console.log(`\n--- ${name} ---`);
  console.log(JSON.stringify(obj, (k,v)=> typeof v==='function' ? '[fn]' : v, 0).slice(0, 0)); // noop
}

['hospitality','manufacturing'].forEach(id => {
  const ind = IND[id];
  console.log(`\n=== ${id} ===`);
  console.log('stages defined:', Array.isArray(ind.stages), ind.stages && ind.stages.length);
  console.log('stageOrder:', ind.stageOrder);
  console.log('runEnd:', ind.runEnd);
  console.log('apByStage:', ind.apByStage);
  console.log('scaling keys:', ind.scaling && Object.keys(ind.scaling));
  console.log('scaling.stageBurnBonus:', ind.scaling && ind.scaling.stageBurnBonus);
  console.log('scaling.fundraiseSuccessRange:', ind.scaling && ind.scaling.fundraiseSuccessRange);
  console.log('scaling.projectCostMult:', ind.scaling && ind.scaling.projectCostMult);
  console.log('content.projects length:', ind.content && ind.content.projects && ind.content.projects.length);
  console.log('content.leaders length:', ind.content && ind.content.leaders && ind.content.leaders.length);
  console.log('content.exits length:', ind.content && ind.content.exits && ind.content.exits.length);
  console.log('valuation.stageMultiples:', ind.valuation && ind.valuation.stageMultiples);
  console.log('start:', ind.start);
});

console.log('\n=== systemAudit ===');
console.log(global.window.__systemAudit());
