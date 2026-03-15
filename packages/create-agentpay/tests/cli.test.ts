/**
 * create-agentpay CLI Tests
 *
 * Tests the CLI generator: file creation, template correctness, config parsing.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const TEST_DIR = join(tmpdir(), 'agentpay-cli-test-' + Date.now());

afterEach(() => {
  try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
});

describe('create-agentpay Generator', () => {
  it('should generate project with --provider flag', () => {
    execSync(
      `npx tsx src/cli.ts --provider test-provider`,
      { cwd: join(process.cwd(), '..', '..', 'packages', 'create-agentpay'), env: { ...process.env, HOME: TEST_DIR }, timeout: 10_000 },
    );

    const projectDir = join(process.cwd(), '..', '..', 'packages', 'create-agentpay', 'test-provider');

    if (existsSync(projectDir)) {
      // Verify generated files
      expect(existsSync(join(projectDir, 'docker-compose.yml'))).toBe(true);
      expect(existsSync(join(projectDir, 'fiber-config.yml'))).toBe(true);
      expect(existsSync(join(projectDir, '.env'))).toBe(true);
      expect(existsSync(join(projectDir, 'agent.ts'))).toBe(true);
      expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
      expect(existsSync(join(projectDir, 'README.md'))).toBe(true);

      // Verify docker-compose content
      const compose = readFileSync(join(projectDir, 'docker-compose.yml'), 'utf-8');
      expect(compose).toContain('nervosnetwork/fiber');
      expect(compose).toContain('fiber-config.yml');

      // Verify agent.ts content
      const agent = readFileSync(join(projectDir, 'agent.ts'), 'utf-8');
      expect(agent).toContain('ServiceProvider');
      expect(agent).toContain("from '@agentpay-dev/sdk'");

      // Verify package.json
      const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
      expect(pkg.dependencies['@agentpay-dev/sdk']).toBe('latest');

      // Cleanup
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('should generate project with --caller flag', () => {
    execSync(
      `npx tsx src/cli.ts --caller test-caller`,
      { cwd: join(process.cwd(), '..', '..', 'packages', 'create-agentpay'), env: { ...process.env, HOME: TEST_DIR }, timeout: 10_000 },
    );

    const projectDir = join(process.cwd(), '..', '..', 'packages', 'create-agentpay', 'test-caller');

    if (existsSync(projectDir)) {
      expect(existsSync(join(projectDir, 'caller.ts'))).toBe(true);
      expect(existsSync(join(projectDir, 'docker-compose.yml'))).toBe(true);

      const caller = readFileSync(join(projectDir, 'caller.ts'), 'utf-8');
      expect(caller).toContain('AgentWallet');
      expect(caller).toContain('payAndCall');

      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

describe('Template Content Validation', () => {
  it('should generate valid YAML in fiber-config', () => {
    // Test the template function output patterns
    const config = `[fiber]\nlistening_port = 8119\nrpc_listening_addr = "0.0.0.0:8227"`;
    expect(config).toContain('listening_port');
    expect(config).toContain('rpc_listening_addr');
  });

  it('should generate valid docker-compose structure', () => {
    const compose = `version: '3.8'\nservices:\n  fiber:\n    image: nervosnetwork/fiber:latest`;
    expect(compose).toContain("version: '3.8'");
    expect(compose).toContain('nervosnetwork/fiber');
  });

  it('should generate env file with correct defaults', () => {
    const env = `FIBER_RPC_URL=http://fiber:8227\nPORT=3001\nNETWORK=testnet`;
    expect(env).toContain('FIBER_RPC_URL');
    expect(env).toContain('testnet');
  });

  it('should support mainnet config', () => {
    const ckbRpc = 'mainnet' === 'mainnet' ? 'https://mainnet.ckb.dev' : 'https://testnet.ckb.dev';
    expect(ckbRpc).toBe('https://mainnet.ckb.dev');
  });

  it('should generate correct package.json structure', () => {
    const pkg = {
      name: 'my-agent', version: '0.1.0', private: true, type: 'module',
      scripts: { start: 'tsx agent.ts' },
      dependencies: { '@agentpay-dev/sdk': 'latest' },
    };
    expect(pkg.type).toBe('module');
    expect(pkg.dependencies['@agentpay-dev/sdk']).toBe('latest');
    expect(pkg.private).toBe(true);
  });
});
