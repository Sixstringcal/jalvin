#!/usr/bin/env node
/**
 * Validation script to prevent workspace: protocol references in published packages.
 * This ensures that all dependencies use explicit version numbers (e.g., ^2.0.34)
 * instead of pnpm's workspace: protocol, which npm cannot resolve.
 */

const fs = require('fs');
const path = require('path');

const publishedPackages = [
  'packages/cli',
  'packages/compiler',
  'packages/runtime',
  'packages/ui',
  'packages/vite-plugin',
  'packages/webpack-plugin'
];

console.log('🔍 Checking for workspace: protocol in published packages...\n');

let hasIssues = false;

for (const pkg of publishedPackages) {
  const pkgJsonPath = path.join(__dirname, '..', pkg, 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  
  const checkDeps = (deps, depType) => {
    if (!deps) return;
    for (const [key, val] of Object.entries(deps)) {
      if (typeof val === 'string' && val.includes('workspace:')) {
        console.error(`  ❌ ${pkg}/${depType}/${key} = "${val}"`);
        hasIssues = true;
      }
    }
  };
  
  checkDeps(pkgJson.dependencies, 'dependencies');
  checkDeps(pkgJson.devDependencies, 'devDependencies');
  checkDeps(pkgJson.peerDependencies, 'peerDependencies');
}

if (hasIssues) {
  console.error('\n⚠️  FAILED: workspace: protocol found in published packages');
  console.error('   These cannot be published to npm. Replace with explicit versions.\n');
  process.exit(1);
}

console.log('✅ PASSED: No workspace: protocols found in published packages\n');
process.exit(0);
