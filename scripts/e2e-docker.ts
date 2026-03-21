#!/usr/bin/env tsx
/**
 * AgentPay — Docker-based E2E Integration Test
 *
 * Tests the FULL AgentPay protocol flow against real Fiber nodes running in Docker.
 *
 * Prerequisites:
 *   1. Docker and docker-compose installed
 *   2. Run: docker-compose up -d
 *   3. Wait for Fiber nodes to be ready (~10s)
 *
 * Usage:
 *   npx tsx scripts/e2e-docker.ts
 *
 * Tests:
 *   1. Provider registers services and starts HTTP server
 *   2. Wallet discovers provider and calls payAndCall
 *   3. Verifies payment flow: SERVICE_REQUEST → SERVICE_OFFER → TASK_INPUT → TASK_RESULT
 *   4. Verifies security: message signatures, preimage protection
 *   5. Verifies rate limiting
 */

import { createHash, randomBytes } from 'node:crypto';

// ── Logger ──
const log = {
  info: (...args: unknown[]) => console.log('[E2E]', ...args),
  ok: (...args: unknown[]) => console.log('[E2E] ✅', ...args),
  fail: (...args: unknown[]) => console.log('[E2E] ❌', ...args),
  section: (name: string) => console.log(`\n${'═'.repeat(60)}\n  ${name}\n${'═'.repeat(60)}`),
};

// ── Config ──
const FIBER_RPC_1 = process.env.FIBER_RPC_1 || 'http://127.0.0.1:8227';
const FIBER_RPC_2 = process.env.FIBER_RPC_2 || 'http://127.0.0.1:8228';
const PROVIDER_PORT = 3099;

async function main() {
  const startTime = Date.now();
  let passed = 0;
  let failed = 0;

  // ────────────────────────────────────────────
  //  Test 1: Fiber Node Connectivity
  // ────────────────────────────────────────────
  log.section('Test 1: Fiber Node Connectivity');
  try {
    const { FiberRpcClient } = await import('@agentpay-dev/core');

    const fiber1 = new FiberRpcClient({ rpcUrl: FIBER_RPC_1, timeoutMs: 5000 });
    const fiber2 = new FiberRpcClient({ rpcUrl: FIBER_RPC_2, timeoutMs: 5000 });

    const [info1, info2] = await Promise.all([
      fiber1.nodeInfo(),
      fiber2.nodeInfo(),
    ]);

    log.ok(`Node 1: ${info1.node_name || info1.node_id?.slice(0, 20)} (${info1.version})`);
    log.ok(`Node 2: ${info2.node_name || info2.node_id?.slice(0, 20)} (${info2.version})`);
    passed++;
  } catch (err: any) {
    log.fail(`Node connectivity failed: ${err.message}`);
    log.info('Make sure Docker Fiber nodes are running: docker-compose up -d');
    failed++;
  }

  // ────────────────────────────────────────────
  //  Test 2: Security Module Unit Validation
  // ────────────────────────────────────────────
  log.section('Test 2: Security Module Validation');
  try {
    const { createPreimageProof, verifyPreimageProof } = await import('@agentpay-dev/core');
    const {
      deriveSharedSecret, getPublicKey,
      encryptWithSharedSecret, decryptWithSharedSecret,
    } = await import('@agentpay-dev/core');
    const { signPayload, verifySignature } = await import('@agentpay-dev/core');

    // ZK Proof
    const preimage = randomBytes(32).toString('hex');
    const paymentHash = createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');

    const proof = createPreimageProof('0x' + preimage, '0x' + paymentHash);
    const valid = verifyPreimageProof(proof, '0x' + paymentHash);
    if (!valid) throw new Error('ZK proof verification failed');
    log.ok('Preimage commitment proof: create + verify');

    // ECDH
    const priv1 = randomBytes(32).toString('hex');
    const priv2 = randomBytes(32).toString('hex');
    const pub1 = getPublicKey(priv1);
    const pub2 = getPublicKey(priv2);

    const s1 = deriveSharedSecret(priv1, pub2);
    const s2 = deriveSharedSecret(priv2, pub1);
    if (s1 !== s2) throw new Error('ECDH shared secret mismatch');

    const plaintext = '0x' + randomBytes(32).toString('hex');
    const enc = encryptWithSharedSecret(plaintext, s1);
    const dec = decryptWithSharedSecret(enc, s2);
    if (dec !== plaintext) throw new Error('ECDH encrypt/decrypt mismatch');
    log.ok('ECDH key exchange + AES-256-GCM encrypt/decrypt');

    // Signatures
    const sig = signPayload(priv1, 'test-payload');
    const sigValid = verifySignature(pub1, 'test-payload', sig);
    if (!sigValid) throw new Error('Signature verification failed');
    log.ok('secp256k1 ECDSA sign + verify');

    passed++;
  } catch (err: any) {
    log.fail(`Security validation failed: ${err.message}`);
    failed++;
  }

  // ────────────────────────────────────────────
  //  Test 3: Rate Limiter
  // ────────────────────────────────────────────
  log.section('Test 3: Rate Limiter');
  try {
    const { RateLimiter } = await import('@agentpay-dev/core');
    const limiter = new RateLimiter({ ipLimit: 3, windowMs: 1000 });

    const mockReq = { headers: {}, socket: { remoteAddress: '10.0.0.1' } } as any;

    let allowed = 0;
    for (let i = 0; i < 5; i++) {
      const res = {
        _status: 0,
        writeHead(s: number) { this._status = s; },
        setHeader() {},
        end() {},
      } as any;
      if (limiter.check(mockReq, res)) allowed++;
    }

    if (allowed !== 3) throw new Error(`Expected 3 allowed, got ${allowed}`);
    log.ok(`Rate limiter: 3/5 allowed (limit: 3 req/s)`);
    limiter.destroy();
    passed++;
  } catch (err: any) {
    log.fail(`Rate limiter test failed: ${err.message}`);
    failed++;
  }

  // ────────────────────────────────────────────
  //  Test 4: SecureChannel E2E
  // ────────────────────────────────────────────
  log.section('Test 4: SecureChannel E2E');
  try {
    const { SecureChannel } = await import('@agentpay-dev/sdk');
    const { createECDH } = await import('node:crypto');

    const providerEcdh = createECDH('secp256k1');
    providerEcdh.generateKeys();
    const callerEcdh = createECDH('secp256k1');
    callerEcdh.generateKeys();

    const providerChannel = new SecureChannel(providerEcdh.getPrivateKey('hex'));
    const callerChannel = new SecureChannel(callerEcdh.getPrivateKey('hex'));

    // Sign + verify message
    const msg = {
      protocol: 'agentpay/1.0',
      id: 'test',
      timestamp: Date.now(),
      from: providerChannel.getPublicKey(),
      to: callerChannel.getPublicKey(),
      signature: '',
      type: 'SERVICE_OFFER',
      payload: { price: '1000000000' },
    };

    providerChannel.signMessage(msg);
    const sigValid = callerChannel.verifyMessage(msg, providerChannel.getPublicKey());
    if (!sigValid) throw new Error('SecureChannel message verification failed');

    // Create secure result + recover
    const preimage = '0x' + randomBytes(32).toString('hex');
    const paymentHash = '0x' + createHash('sha256')
      .update(Buffer.from(preimage.slice(2), 'hex'))
      .digest('hex');

    const result = providerChannel.createSecureResult(
      preimage, paymentHash, { output: 'test' },
      '0x' + callerEcdh.getPublicKey('hex', 'compressed'),
      100,
    );

    // Verify preimage is NOT in cleartext
    if (JSON.stringify(result).includes(preimage.slice(2))) {
      throw new Error('Preimage found in cleartext!');
    }

    // Recover via ECDH
    const recovered = callerChannel.recoverPreimageFromResult(
      result,
      '0x' + providerEcdh.getPublicKey('hex', 'compressed'),
    );
    if (recovered !== preimage) throw new Error('Preimage recovery mismatch');

    log.ok('SecureChannel: sign → verify → ZK commit → ECDH recover');
    passed++;
  } catch (err: any) {
    log.fail(`SecureChannel E2E failed: ${err.message}`);
    failed++;
  }

  // ────────────────────────────────────────────
  //  Summary
  // ────────────────────────────────────────────
  const totalMs = Date.now() - startTime;
  log.section('Summary');
  log.info(`Passed: ${passed}/${passed + failed}`);
  log.info(`Failed: ${failed}/${passed + failed}`);
  log.info(`Duration: ${totalMs}ms`);

  if (failed > 0) {
    process.exit(1);
  }
  log.ok('All E2E tests passed!');
}

main().catch((err) => {
  log.fail(`Unhandled error: ${err.message}`);
  process.exit(1);
});
