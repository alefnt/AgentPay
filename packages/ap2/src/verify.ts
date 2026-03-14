/**
 * AP2 VC Signature Verification
 *
 * Verifies W3C Verifiable Credential proofs using Ed25519.
 * Uses tweetnacl for signature operations (same as AgentPay core).
 */

import type { VerifiableCredential, VCProof } from './types.js';

/**
 * Verify the Ed25519 signature on a Verifiable Credential.
 *
 * @param vc - The Verifiable Credential to verify
 * @param publicKeyHex - Ed25519 public key (hex encoded, 64 chars)
 * @returns true if signature is valid
 */
export async function verifyVCSignature(
  vc: VerifiableCredential<string>,
  publicKeyHex: string,
): Promise<boolean> {
  try {
    // Dynamically import tweetnacl (optional peer dep)
    // @ts-ignore — optional dependency
    const nacl = await import('tweetnacl');

    // 1. Extract proof and create unsigned credential
    const { proof, ...unsignedVC } = vc;
    if (proof.type !== 'Ed25519Signature2020') {
      return false;
    }

    // 2. Canonicalize the credential (deterministic JSON)
    const message = canonicalize(unsignedVC);
    const messageBytes = new TextEncoder().encode(message);

    // 3. Decode signature and public key
    const signatureBytes = base64UrlDecode(proof.proofValue);
    const pubKeyBytes = hexToBytes(publicKeyHex);

    // 4. Verify
    return nacl.sign.detached.verify(messageBytes, signatureBytes, pubKeyBytes);
  } catch {
    return false;
  }
}

/**
 * Create an Ed25519 signature for a Verifiable Credential.
 *
 * @param unsignedVC - VC without proof
 * @param secretKeyHex - Ed25519 secret key (hex, 128 chars = 64 bytes)
 * @param verificationMethod - DID key reference (e.g. "did:bit:alice.bit#key-1")
 * @returns VCProof object
 */
export async function signVC(
  unsignedVC: Omit<VerifiableCredential<string>, 'proof'>,
  secretKeyHex: string,
  verificationMethod: string,
): Promise<VCProof> {
  // @ts-ignore — optional dependency
  const nacl = await import('tweetnacl');

  const message = canonicalize(unsignedVC);
  const messageBytes = new TextEncoder().encode(message);
  const secretKeyBytes = hexToBytes(secretKeyHex);

  const signature = nacl.sign.detached(messageBytes, secretKeyBytes);

  return {
    type: 'Ed25519Signature2020',
    created: new Date().toISOString(),
    verificationMethod,
    proofPurpose: 'assertionMethod',
    proofValue: base64UrlEncode(signature),
  };
}

// ─── Helpers ─────────────────────────────────────────────

/** Deterministic JSON serialization (sorted keys) */
function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
}

/** Hex string → Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Uint8Array → base64url string */
function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url string → Uint8Array */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array(Buffer.from(base64, 'base64'));
}
