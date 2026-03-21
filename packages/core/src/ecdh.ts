/**
 * AgentPay Core — ECDH Encrypted Channel
 *
 * Provides encrypted communication between Agents using their Fiber node
 * secp256k1 keypairs. This ensures sensitive data (like nonces for ZK proof
 * recovery, or fallback preimage delivery) cannot be intercepted by MITM.
 *
 * Uses:
 *   - ECDH (secp256k1) for shared secret derivation
 *   - AES-256-GCM for authenticated encryption
 *   - HKDF for key derivation from ECDH shared point
 *
 * All operations use Node.js built-in `crypto` module — zero external dependencies.
 */

import { createECDH, createCipheriv, createDecipheriv, randomBytes, createHash, createHmac } from 'node:crypto';

// ╔════════════════════════════════════════════════════════════════╗
//  Types
// ╚════════════════════════════════════════════════════════════════╝

export interface EncryptedPayload {
  /** AES-256-GCM ciphertext (hex) */
  ciphertext: string;
  /** 12-byte initialization vector (hex) */
  iv: string;
  /** 16-byte GCM authentication tag (hex) */
  tag: string;
}

// ╔════════════════════════════════════════════════════════════════╗
//  Internal Helpers
// ╚════════════════════════════════════════════════════════════════╝

function hexToBuffer(hex: string): Buffer {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Buffer.from(clean, 'hex');
}

/**
 * Simple HKDF-like key derivation using HMAC-SHA256.
 * Derives a 32-byte key from the raw ECDH shared secret.
 */
function deriveKey(sharedPoint: Buffer, info: string = 'agentpay-ecdh-v1'): Buffer {
  return createHmac('sha256', sharedPoint)
    .update(info)
    .digest();
}

// ╔════════════════════════════════════════════════════════════════╗
//  Public API — Key Exchange
// ╚════════════════════════════════════════════════════════════════╝

/**
 * Derive a shared secret from your private key and the other party's public key.
 * Uses secp256k1 ECDH — the same curve used by Fiber Network nodes.
 *
 * @param myPrivateKeyHex - Your secp256k1 private key (32 bytes, hex)
 * @param theirPublicKeyHex - Their compressed/uncompressed secp256k1 public key (hex)
 * @returns 32-byte shared secret (hex, 0x-prefixed)
 */
export function deriveSharedSecret(myPrivateKeyHex: string, theirPublicKeyHex: string): string {
  const ecdh = createECDH('secp256k1');
  ecdh.setPrivateKey(hexToBuffer(myPrivateKeyHex));

  // ECDH computeSecret: my_private * their_public = shared_point
  const rawShared = ecdh.computeSecret(hexToBuffer(theirPublicKeyHex));

  // Derive a proper encryption key via HKDF
  const derivedKey = deriveKey(rawShared);
  return '0x' + derivedKey.toString('hex');
}

/**
 * Get the public key corresponding to a private key (secp256k1, compressed).
 *
 * @param privateKeyHex - 32-byte private key (hex)
 * @returns Compressed public key (33 bytes, hex, 0x-prefixed)
 */
export function getPublicKey(privateKeyHex: string): string {
  const ecdh = createECDH('secp256k1');
  ecdh.setPrivateKey(hexToBuffer(privateKeyHex));
  return '0x' + ecdh.getPublicKey('hex', 'compressed');
}

// ╔════════════════════════════════════════════════════════════════╗
//  Public API — Encryption / Decryption
// ╚════════════════════════════════════════════════════════════════╝

/**
 * Encrypt data using AES-256-GCM with a shared secret.
 *
 * @param plaintext - Data to encrypt (hex string, 0x-prefix optional)
 * @param sharedSecret - 32-byte shared secret from deriveSharedSecret (hex)
 * @returns EncryptedPayload with ciphertext, iv, and auth tag
 */
export function encryptWithSharedSecret(plaintext: string, sharedSecret: string): EncryptedPayload {
  const key = hexToBuffer(sharedSecret);
  const iv = randomBytes(12); // 96-bit IV for GCM
  const plaintextBuf = hexToBuffer(plaintext);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Decrypt data using AES-256-GCM with a shared secret.
 *
 * @param encrypted - EncryptedPayload from encryptWithSharedSecret
 * @param sharedSecret - 32-byte shared secret from deriveSharedSecret (hex)
 * @returns Decrypted data (hex string, 0x-prefixed)
 * @throws If authentication tag verification fails (tampered ciphertext)
 */
export function decryptWithSharedSecret(encrypted: EncryptedPayload, sharedSecret: string): string {
  const key = hexToBuffer(sharedSecret);
  const iv = Buffer.from(encrypted.iv, 'hex');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'hex');
  const tag = Buffer.from(encrypted.tag, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return '0x' + decrypted.toString('hex');
}
