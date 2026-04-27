const fs = require('fs');
const {compile} = require('./packages/compiler/dist/index.js');

function checkFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const result = compile(src);
  const diags = Array.from(result.diagnostics);
  const errors = diags.filter(d => d.severity === 'error');
  const parseErrors = errors.filter(d => !d.message.includes('Unresolved'));
  const typeErrors = errors.filter(d => d.message.includes('Unresolved'));
  console.log('=== ' + file + ' ===');
  console.log('  parse errors: ' + parseErrors.length);
  parseErrors.forEach(d => console.log('    >> ' + d.message));
  console.log('  type errors: ' + typeErrors.length);
  const gen = result.code || result.output || '';
  console.log('  generated code (first 200 chars): ' + gen.slice(0, 200));
}

checkFile('examples/04-coroutines/Coroutines.jalvin');
checkFile('examples/03-extensions-sealed/Cart.jalvin');
checkFile('examples/01-counter/Counter.jalvin');
checkFile('examples/05-ui-showcase/UIShowcase.jalvin');
