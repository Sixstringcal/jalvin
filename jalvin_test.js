const { lex } = require('./packages/compiler/dist/lexer.js');
const { parse } = require('./packages/compiler/dist/parser.js');
const { DiagnosticBag } = require('./packages/compiler/dist/diagnostics.js');

function parseSource(src) {
  const diag = new DiagnosticBag();
  const tokens = lex(src, '<test>', diag);
  const program = parse(tokens, '<test>', diag, src);
  return { program, diag };
}

const tests = [
  'fun hello() { }',
  'fun add(a: Int, b: Int): Int { return a + b }',
  'fun square(x: Int) = x * x',
  'suspend fun loadData(): String { return "ok" }',
  'fun greet(name: String = "World") { }',
  'class Foo { }',
  'class Point(val x: Double, val y: Double) { }',
  'data class User(val id: Int, val name: String)',
  'val x = if (true) 1 else 2',
  'val doubled = listOf(1, 2).map { it * 2 }',
  'val s = `Hello $name!`',
  'val n = x?.length',
  'val n = x ?: 0',
  'val b = x is String',
  'val s = x as? String',
  'val (a, b) = pair',
];

for (let i = 0; i < tests.length; i++) {
  process.stdout.write('Test ' + i + ': ');
  parseSource(tests[i]);
  console.log('ok');
}
console.log('All done!');
