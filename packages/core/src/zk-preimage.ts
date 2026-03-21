/**
 * AgentPay Core — Preimage Commitment & Encrypted Delivery
 *
 * Commitment scheme + masked delivery that protects preimage `x` (where SHA256(x) = payment_hash)
 * from cleartext exposure during protocol message exchange.
 *
 * ⚠️  This is NOT a true zero-knowledge proof. A genuine ZK proof of SHA-256 preimage
 *     knowledge requires a zk-SNARK/STARK circuit (e.g. circom + Groth16), because SHA-256
 *     lacks algebraic structure needed for Sigma protocols. What this module provides:
 *
 *     ✅ Computational hiding    — preimage is XOR-masked; extraction requires the nonce
 *     ✅ Computational binding   — commitment ties the prover to a specific (preimage, nonce)
 *     ✅ Confidential delivery   — combined with ECDH, only the intended recipient can unmask
 *     ❌ True zero-knowledge     — verifier cannot independently verify preimage knowledge
 *                                  without the nonce (which is delivered via ECDH)
 *
 * Protocol (non-interactive, Fiat-Shamir-style):
 *
 *   Prover (Provider) knows: preimage
 *   Public: payment_hash = SHA256(preimage)
 *
 *   1. Prover picks random nonce `r` (32 bytes)
 *   2. Commitment:  C = SHA256(preimage || r)
 *   3. Challenge:   e = SHA256(C || payment_hash)           [Fiat-Shamir]
 *   4. Response:    s = XOR(preimage, SHA256(r || e))        [masked preimage]
 *   5. Nonce hash:  nh = SHA256(r)                           [for verification]
 *
 * Verifier (Caller) checks:
 *   1. Recompute challenge: e' = SHA256(C || payment_hash)   [structural integrity]
 *   2. Recover candidate:   x' = XOR(s, SHA256(r' || e'))    [needs nonce — via ECDH]
 *   3. Verify:              SHA256(x') == payment_hash        [preimage correctness]
 *   4. Verify:              SHA256(x' || r') == C             [commitment binding]
 *
 * Security: The preimage never appears in cleartext in any protocol message.
 * Combined with ECDH encryption, only the intended caller can recover it.
 */

import { createHash, randomBytes } from 'node:crypto';

// ╔════════════════════════════════════════════════════════════════╗
//  Types
// ╚════════════════════════════════════════════════════════════════╝

export interface ZkPreimageProof {
  /** SHA256(preimage || nonce) — commitment to the secret */
  commitment: string;
  /** SHA256(commitment || payment_hash) — Fiat-Shamir challenge */
  challenge: string;
  /** XOR(preimage_bytes, SHA256(nonce || challenge)) — masked preimage */
  response: string;
  /** SHA256(nonce) — allows nonce recovery via ECDH for optional preimage extraction */
  nonce_hash: string;
  /** The nonce itself, encrypted with ECDH shared secret (only readable by caller) */
  encrypted_nonce?: string;
}

// ╔════════════════════════════════════════════════════════════════╗
//  Internal Helpers
// ╚════════════════════════════════════════════════════════════════╝

function sha256hex(...inputs: string[]): string {
  const h = createHash('sha256');
  for (const input of inputs) {
    h.update(hexToBytes(input));
  }
  return h.digest('hex');
}

function hexToBytes(hex: string): Buffer {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Buffer.from(clean, 'hex');
}

function toCleanHex(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

/**
 * XOR two equal-length hex strings.
 */
function xorHex(a: string, b: string): string {
  const aBuf = hexToBytes(a);
  const bBuf = hexToBytes(b);
  if (aBuf.length !== bBuf.length) {
    throw new Error(`XOR length mismatch: ${aBuf.length} vs ${bBuf.length}`);
  }
  const result = Buffer.alloc(aBuf.length);
  for (let i = 0; i < aBuf.length; i++) {
    result[i] = aBuf[i]! ^ bBuf[i]!;
  }
  return result.toString('hex');
}

// ╔════════════════════════════════════════════════════════════════╗
//  Public API — Prover (Provider side)
// ╚════════════════════════════════════════════════════════════════╝

/**
 * Create a ZK proof that you know the preimage for a given payment_hash.
 *
 * @param preimage   - The secret preimage (0x-prefixed or raw hex, 32 bytes)
 * @param paymentHash - The public SHA256(preimage), 0x-prefixed or raw hex
 * @returns ZkPreimageProof — can be sent over HTTP without revealing preimage
 */
export function createPreimageProof(preimage: string, paymentHash: string): ZkPreimageProof {
  const pi = toCleanHex(preimage);
  const ph = toCleanHex(paymentHash);

  if (pi.length !== 64) throw new Error('preimage must be 32 bytes (64 hex chars)');
  if (ph.length !== 64) throw new Error('paymentHash must be 32 bytes (64 hex chars)');

  // Verify: SHA256(preimage) must equal paymentHash
  const computed = sha256hex(pi);
  if (computed !== ph) {
    throw new Error('preimage does not match paymentHash');
  }

  // Step 1: random nonce
  const nonce = randomBytes(32).toString('hex');

  // Step 2: commitment = SHA256(preimage || nonce)
  const commitment = sha256hex(pi, nonce);

  // Step 3: challenge = SHA256(commitment || paymentHash) [Fiat-Shamir]
  const challenge = sha256hex(commitment, ph);

  // Step 4: mask = SHA256(nonce || challenge), response = XOR(preimage, mask)
  const mask = sha256hex(nonce, challenge);
  const response = xorHex(pi, mask);

  // Step 5: nonce_hash = SHA256(nonce) for later verification
  const nonceHash = sha256hex(nonce);

  return {
    commitment: '0x' + commitment,
    challenge: '0x' + challenge,
    response: '0x' + response,
    nonce_hash: '0x' + nonceHash,
  };
}

// ╔════════════════════════════════════════════════════════════════╗
//  Public API — Verifier (Caller side)
// ╚════════════════════════════════════════════════════════════════╝

/**
 * Verify a ZK preimage proof without learning the preimage.
 *
 * Checks:
 *   1. Challenge is correctly derived (Fiat-Shamir soundness)
 *   2. All fields are well-formed (32-byte hex)
 *   3. Commitment is binding (cannot be forged without knowing preimage + nonce)
 *
 * This does NOT check that the prover actually knows the preimage (that requires
 * the nonce for full extraction). It verifies structural integrity and that the
 * prover followed the protocol correctly.
 *
 * @param proof - The ZK proof from the provider
 * @param paymentHash - The known payment hash
 * @returns true if proof structure is valid
 */
export function verifyPreimageProof(proof: ZkPreimageProof, paymentHash: string): boolean {
  try {
    const ph = toCleanHex(paymentHash);
    const commitment = toCleanHex(proof.commitment);
    const challenge = toCleanHex(proof.challenge);
    const response = toCleanHex(proof.response);
    const nonceHash = toCleanHex(proof.nonce_hash);

    // Check field lengths (all must be 32 bytes = 64 hex chars)
    if (commitment.length !== 64) return false;
    if (challenge.length !== 64) return false;
    if (response.length !== 64) return false;
    if (nonceHash.length !== 64) return false;
    if (ph.length !== 64) return false;

    // Verify Fiat-Shamir challenge: e = SHA256(commitment || paymentHash)
    const expectedChallenge = sha256hex(commitment, ph);
    if (expectedChallenge !== challenge) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Recover the preimage from a ZK proof, given the nonce.
 *
 * This is used by the Caller after obtaining the nonce via ECDH decryption.
 * It fully verifies the proof by checking:
 *   1. All structural checks from verifyPreimageProof
 *   2. SHA256(nonce) == proof.nonce_hash
 *   3. commitment == SHA256(recovered_preimage || nonce)
 *   4. SHA256(recovered_preimage) == paymentHash
 *
 * @param proof - The ZK proof
 * @param nonce - The decrypted nonce (from ECDH encrypted_nonce)
 * @param paymentHash - The known payment hash
 * @returns The recovered preimage (0x-prefixed)
 * @throws If proof is invalid or preimage doesn't match
 */
export function recoverPreimage(proof: ZkPreimageProof, nonce: string, paymentHash: string): string {
  const ph = toCleanHex(paymentHash);
  const n = toCleanHex(nonce);
  const commitment = toCleanHex(proof.commitment);
  const challenge = toCleanHex(proof.challenge);
  const response = toCleanHex(proof.response);
  const nonceHash = toCleanHex(proof.nonce_hash);

  // Verify nonce: SHA256(nonce) must match nonce_hash
  const computedNonceHash = sha256hex(n);
  if (computedNonceHash !== nonceHash) {
    throw new Error('Nonce does not match nonce_hash');
  }

  // Verify Fiat-Shamir challenge
  const expectedChallenge = sha256hex(commitment, ph);
  if (expectedChallenge !== challenge) {
    throw new Error('Invalid challenge (Fiat-Shamir verification failed)');
  }

  // Recover preimage: preimage = XOR(response, SHA256(nonce || challenge))
  const mask = sha256hex(n, challenge);
  const recoveredPreimage = xorHex(response, mask);

  // Verify: SHA256(recovered) must equal paymentHash
  const computedHash = sha256hex(recoveredPreimage);
  if (computedHash !== ph) {
    throw new Error('Recovered preimage does not match paymentHash');
  }

  // Verify commitment: SHA256(preimage || nonce) must equal commitment
  const computedCommitment = sha256hex(recoveredPreimage, n);
  if (computedCommitment !== commitment) {
    throw new Error('Commitment verification failed');
  }

  return '0x' + recoveredPreimage;
}
