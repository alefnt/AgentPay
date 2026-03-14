/**
 * AgentPay Core — Agent Identity
 *
 * An Agent's identity is defined by its Fiber node's pubkey.
 * The pubkey serves triple duty:
 *   1. Agent ID (for protocol messages)
 *   2. Fiber node identity (for payment routing)
 *   3. CKB address derivation (for on-chain operations)
 *
 * In production: the Agent runs or connects to a Fiber node,
 * and the node's pubkey IS the Agent's identity.
 */

import { createHash } from 'node:crypto';
import type { Pubkey } from './types.js';

/**
 * Get the Agent's identity from a running Fiber node.
 * This is the canonical way to get an Agent's ID.
 */
export async function getAgentIdFromNode(fiberRpcUrl: string): Promise<{
  pubkey: Pubkey;
  node_name: string;
  addresses: string[];
}> {
  const res = await fetch(fiberRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'node_info',
      params: [{}],
    }),
  });
  const json = await res.json() as { result: { public_key: Pubkey; node_name: string; addresses: string[] } };
  return {
    pubkey: json.result.public_key,
    node_name: json.result.node_name,
    addresses: json.result.addresses,
  };
}

/**
 * Sign a protocol message with a private key.
 * Uses SHA-256 HMAC for PoC. Production: secp256k1 ECDSA.
 */
export function signPayload(privateKeyHex: string, payload: string): string {
  return createHash('sha256')
    .update(Buffer.from(privateKeyHex, 'hex'))
    .update(payload)
    .digest('hex');
}

/**
 * Verify a message signature.
 * PoC: length check. Production: secp256k1 verify.
 */
export function verifySignature(
  _pubkey: Pubkey,
  _payload: string,
  signature: string,
): boolean {
  // TODO: Real secp256k1 verification
  return typeof signature === 'string' && signature.length === 64;
}

/**
 * Derive a short display name from a pubkey.
 * e.g. "02a1b2c3..." → "Agent-a1b2"
 */
export function agentDisplayName(pubkey: Pubkey): string {
  const short = pubkey.replace(/^0[23]/, '').slice(0, 8);
  return `Agent-${short}`;
}
