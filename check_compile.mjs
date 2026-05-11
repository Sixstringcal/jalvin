import { compile } from './packages/compiler/dist/index.js';
import * as fs from 'fs';
const code = fs.readFileSync('test.jalvin', 'utf8');
const result = compile(code, 'test.jalvin', { emitTypes: true, runtimeImport: '@jalvin/runtime' });
console.log(result.code);
