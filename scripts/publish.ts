#!/usr/bin/env tsx
/**
 * AgentPay �?NPM Publish Script
 *
 * Publishes all public packages to npm in the correct dependency order.
 *
 * Usage:
 *   npx tsx scripts/publish.ts          # Dry run (default)
 *   npx tsx scripts/publish.ts --real   # Actually publish
 *
 * Prerequisites:
 *   1. npm login (or set NPM_TOKEN env var)
 *   2. pnpm build (all packages must be built)
 *   3. All tests pass
 *
 * Publish order (dependency-first):
 *   1. @agentpay-dev/core (no deps)
 *   2. @agentpay-dev/sdk (depends on core)
 *   3. @agentpay-dev/x402-facilitator (depends on core)
 *   4. create-agentpay (depends on sdk)
 */

import { execSync } from 'node:child_process';

const DRY_RUN = !process.argv.includes('--real');

const PACKAGES = [
  { name: '@agentpay-dev/core', dir: 'packages/core' },
  { name: '@agentpay-dev/sdk', dir: 'packages/sdk' },
  { name: '@agentpay-dev/x402-facilitator', dir: 'packages/x402-facilitator' },
  { name: 'create-agentpay', dir: 'packages/create-agentpay' },
];

console.log(`\n══�?AgentPay NPM Publish ${DRY_RUN ? '(DRY RUN)' : '🚀 REAL'} ═══\n`);

async function main() {
  // Step 1: Build
  console.log('📦 Building all packages...');
  execSync('pnpm -r build', { stdio: 'inherit', cwd: process.cwd() });

  // Step 2: Test
  console.log('\n🧪 Running all tests...');
  try {
    execSync('pnpm -r test', { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    console.error('�?Tests failed. Fix tests before publishing.');
    process.exit(1);
  }

  // Step 3: Publish each package
  for (const pkg of PACKAGES) {
    console.log(`\n📤 Publishing ${pkg.name}...`);

    const cmd = DRY_RUN
      ? `npm publish --access public --dry-run`
      : `npm publish --access public`;

    try {
      execSync(cmd, { stdio: 'inherit', cwd: pkg.dir });
      console.log(`  �?${pkg.name} ${DRY_RUN ? '(dry run OK)' : 'published!'}`);
    } catch (err: any) {
      console.error(`  �?${pkg.name} failed: ${err.message}`);
      if (!DRY_RUN) process.exit(1);
    }
  }

  console.log(`\n══�?Done! ${DRY_RUN ? '(was dry run, use --real to publish)' : '🎉 All published!'} ═══\n`);
}

main();
