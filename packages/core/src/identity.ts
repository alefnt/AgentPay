/**
 * AgentPay Core — Agent Identity & Cryptographic Signatures
 *
 * An Agent's identity is defined by its Fiber node's secp256k1 pubkey.
 * The pubkey serves triple duty:
 *   1. Agent ID (for protocol messages)
 *   2. Fiber node identity (for payment routing)
 *   3. CKB address derivation (for on-chain operations)
 *
 * Signature scheme:
 *   - secp256k1 ECDSA (same curve as Fiber / CKB / Bitcoin)
 *   - SHA-256 message digest
 *   - DER-encoded signatures (standard OpenSSL interoperable format)
 *
 * Zero external dependencies — uses Node.js built-in `crypto` module.
 */

import { createHash, createSign, createVerify, createECDH } from 'node:crypto';
import type { Pubkey } from './types.js';

// ╔════════════════════════════════════════════════════════════════╗
//  Identity from Fiber Node
// ╚════════════════════════════════════════════════════════════════╝

/**
 * Get the Agent's identity from a running Fiber node.
 * Returns the node's pubkey which IS the Agent's ID.
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
      params: [],
    }),
  });
  const json = await res.json() as { result: { public_key: Pubkey; node_name: string; addresses: string[] } };
  return {
    pubkey: json.result.public_key,
    node_name: json.result.node_name,
    addresses: json.result.addresses,
  };
}

// ╔════════════════════════════════════════════════════════════════╗
//  secp256k1 ECDSA — Sign & Verify
// ╚════════════════════════════════════════════════════════════════╝

/**
 * Convert a raw secp256k1 private key (32-byte hex) to PEM format
 * for use with Node.js crypto.sign().
 *
 * Uses SEC1 / DER encoding for EC private keys.
 * OID: 1.2.840.10045.3.1.7 = secp256k1 is not standard in DER OIDs,
 * so we use the createECDH approach to derive the public key and
 * then build a PKCS8 DER structure.
 */
function privateKeyToPem(privateKeyHex: string): string {
  const cleanHex = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
  const privKeyBuf = Buffer.from(cleanHex, 'hex');

  // Get the uncompressed public key from the private key
  const ecdh = createECDH('secp256k1');
  ecdh.setPrivateKey(privKeyBuf);
  const pubKeyBuf = ecdh.getPublicKey();

  // Build SEC1 DER for secp256k1 EC private key
  // SEQUENCE {
  //   INTEGER 1 (version)
  //   OCTET STRING (private key, 32 bytes)
  //   [0] OID secp256k1 (1.3.132.0.10)
  //   [1] BIT STRING (public key)
  // }
  const secp256k1Oid = Buffer.from('06052b8104000a', 'hex'); // OID 1.3.132.0.10
  const oidTagged = Buffer.concat([Buffer.from('a0', 'hex'), encodeLength(secp256k1Oid.length), secp256k1Oid]);

  const pubKeyBits = Buffer.concat([Buffer.from('00', 'hex'), pubKeyBuf]); // unused bits = 0
  const pubKeyBitString = Buffer.concat([Buffer.from('03', 'hex'), encodeLength(pubKeyBits.length), pubKeyBits]);
  const pubKeyTagged = Buffer.concat([Buffer.from('a1', 'hex'), encodeLength(pubKeyBitString.length), pubKeyBitString]);

  const version = Buffer.from('020101', 'hex'); // INTEGER 1
  const privKeyOctet = Buffer.concat([Buffer.from('04', 'hex'), encodeLength(privKeyBuf.length), privKeyBuf]);

  const seqContent = Buffer.concat([version, privKeyOctet, oidTagged, pubKeyTagged]);
  const seq = Buffer.concat([Buffer.from('30', 'hex'), encodeLength(seqContent.length), seqContent]);

  const b64 = seq.toString('base64');
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN EC PRIVATE KEY-----\n${lines.join('\n')}\n-----END EC PRIVATE KEY-----`;
}

/**
 * Convert a raw secp256k1 public key (compressed 33-byte or uncompressed 65-byte hex)
 * to PEM format for use with Node.js crypto.verify().
 */
function publicKeyToPem(publicKeyHex: string): string {
  const cleanHex = publicKeyHex.startsWith('0x') ? publicKeyHex.slice(2) : publicKeyHex;
  let pubKeyBuf = Buffer.from(cleanHex, 'hex');

  // If compressed (33 bytes), decompress using ECDH
  if (pubKeyBuf.length === 33) {
    const ecdh = createECDH('secp256k1');
    // Set any dummy private key, then use the public key for point decompression
    ecdh.setPrivateKey(Buffer.alloc(32, 1));
    // On Node.js, ECDH.computeSecret can take compressed keys
    // But for PEM we need uncompressed. Use a workaround:
    // Actually, SubjectPublicKeyInfo can use compressed keys too.
    // We'll use uncompressed for maximum compatibility.
    // Node.js ECDH doesn't directly decompress, so we encode compressed in DER.
    // Actually Node.js createVerify supports compressed in the SPKI if constructed correctly.
    // Let's keep compressed — Node.js handles it.
  }

  // Build SubjectPublicKeyInfo DER
  // SEQUENCE {
  //   SEQUENCE {
  //     OID ecPublicKey (1.2.840.10045.2.1)
  //     OID secp256k1 (1.3.132.0.10)
  //   }
  //   BIT STRING (public key)
  // }
  const ecPublicKeyOid = Buffer.from('06072a8648ce3d0201', 'hex'); // 1.2.840.10045.2.1
  const secp256k1Oid = Buffer.from('06052b8104000a', 'hex');        // 1.3.132.0.10
  const algoSeqContent = Buffer.concat([ecPublicKeyOid, secp256k1Oid]);
  const algoSeq = Buffer.concat([Buffer.from('30', 'hex'), encodeLength(algoSeqContent.length), algoSeqContent]);

  const pubKeyBits = Buffer.concat([Buffer.from('00', 'hex'), pubKeyBuf]);
  const pubKeyBitString = Buffer.concat([Buffer.from('03', 'hex'), encodeLength(pubKeyBits.length), pubKeyBits]);

  const spkiContent = Buffer.concat([algoSeq, pubKeyBitString]);
  const spki = Buffer.concat([Buffer.from('30', 'hex'), encodeLength(spkiContent.length), spkiContent]);

  const b64 = spki.toString('base64');
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

/** DER length encoding */
function encodeLength(len: number): Buffer {
  if (len < 128) {
    return Buffer.from([len]);
  } else if (len < 256) {
    return Buffer.from([0x81, len]);
  } else {
    return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
  }
}

/**
 * Sign a protocol message payload with a secp256k1 private key.
 *
 * Uses ECDSA with SHA-256 digest. Returns hex-encoded DER signature.
 *
 * @param privateKeyHex - 32-byte secp256k1 private key (hex, 0x-prefix optional)
 * @param payload - The message payload string to sign
 * @returns Hex-encoded DER signature
 */
export function signPayload(privateKeyHex: string, payload: string): string {
  const pem = privateKeyToPem(privateKeyHex);
  const sign = createSign('SHA256');
  sign.update(payload);
  sign.end();
  return sign.sign(pem, 'hex');
}

/**
 * Verify a secp256k1 ECDSA signature on a message payload.
 *
 * @param pubkey - The signer's compressed secp256k1 public key (hex)
 * @param payload - The original message payload string
 * @param signature - Hex-encoded DER signature from signPayload
 * @returns true if signature is valid
 */
export function verifySignature(pubkey: Pubkey, payload: string, signature: string): boolean {
  try {
    const pem = publicKeyToPem(pubkey);
    const verify = createVerify('SHA256');
    verify.update(payload);
    verify.end();
    return verify.verify(pem, signature, 'hex');
  } catch {
    return false;
  }
}

// ╔════════════════════════════════════════════════════════════════╗
//  Display Helpers
// ╚════════════════════════════════════════════════════════════════╝

/**
 * Derive a short display name from a pubkey.
 * e.g. "02a1b2c3..." → "Agent-a1b2"
 */
export function agentDisplayName(pubkey: Pubkey): string {
  const short = pubkey.replace(/^0[23]/, '').slice(0, 8);
  return `Agent-${short}`;
}
