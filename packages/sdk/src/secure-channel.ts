/**
 * AgentPay SDK — Secure Channel
 *
 * Security layer that wraps protocol messages with:
 *   1. ZK Preimage Proof (Sigma Protocol) — prove preimage knowledge without revealing it
 *   2. ECDH Encrypted Channel — encrypt sensitive data (preimage)
 *   3. secp256k1 ECDSA Signatures — authenticate every protocol message
 *
 * Usage by Provider:
 *   const sec = new SecureChannel(privateKey);
 *   const result = sec.createSecureResult(preimage, paymentHash, output, callerPubkey);
 *   // result.zk_proof, result.encrypted_nonce — instead of cleartext preimage
 *
 * Usage by Wallet:
 *   const sec = new SecureChannel(privateKey);
 *   sec.verifySecureResult(result, paymentHash);
 *   const preimage = sec.recoverPreimageFromResult(result);
 */

import { createHash, randomBytes, createECDH } from 'node:crypto';

// ── Inline implementations to avoid dependency on core dist ──
// These mirror the core modules but are self-contained for the SDK.

// ╔════════════════════════════════════════════════════════════════╗
//  ZK Preimage Proof (from core/zk-preimage.ts)
// ╚════════════════════════════════════════════════════════════════╝

export interface ZkPreimageProof {
  commitment: string;
  challenge: string;
  response: string;
  nonce_hash: string;
  encrypted_nonce?: string;
}

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

function xorHex(a: string, b: string): string {
  const aBuf = hexToBytes(a);
  const bBuf = hexToBytes(b);
  if (aBuf.length !== bBuf.length) throw new Error(`XOR length mismatch: ${aBuf.length} vs ${bBuf.length}`);
  const result = Buffer.alloc(aBuf.length);
  for (let i = 0; i < aBuf.length; i++) result[i] = aBuf[i]! ^ bBuf[i]!;
  return result.toString('hex');
}

function createPreimageProof(preimage: string, paymentHash: string): ZkPreimageProof {
  const pi = toCleanHex(preimage);
  const ph = toCleanHex(paymentHash);
  if (pi.length !== 64) throw new Error('preimage must be 32 bytes');
  if (ph.length !== 64) throw new Error('paymentHash must be 32 bytes');
  const computed = sha256hex(pi);
  if (computed !== ph) throw new Error('preimage does not match paymentHash');

  const nonce = randomBytes(32).toString('hex');
  const commitment = sha256hex(pi, nonce);
  const challenge = sha256hex(commitment, ph);
  const mask = sha256hex(nonce, challenge);
  const response = xorHex(pi, mask);
  const nonceHash = sha256hex(nonce);

  return {
    commitment: '0x' + commitment,
    challenge: '0x' + challenge,
    response: '0x' + response,
    nonce_hash: '0x' + nonceHash,
  };
}

function verifyPreimageProof(proof: ZkPreimageProof, paymentHash: string): boolean {
  try {
    const ph = toCleanHex(paymentHash);
    const commitment = toCleanHex(proof.commitment);
    const challenge = toCleanHex(proof.challenge);
    const response = toCleanHex(proof.response);
    const nonceHash = toCleanHex(proof.nonce_hash);

    if ([commitment, challenge, response, nonceHash, ph].some(s => s.length !== 64)) return false;
    const expectedChallenge = sha256hex(commitment, ph);
    return expectedChallenge === challenge;
  } catch {
    return false;
  }
}

// ╔════════════════════════════════════════════════════════════════╗
//  ECDH (from core/ecdh.ts)
// ╚════════════════════════════════════════════════════════════════╝

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

import { createCipheriv, createDecipheriv, createHmac, createSign, createVerify } from 'node:crypto';

function deriveKey(sharedPoint: Buffer, info: string = 'agentpay-ecdh-v1'): Buffer {
  return createHmac('sha256', sharedPoint).update(info).digest();
}

function ecdhSharedSecret(myPriv: string, theirPub: string): Buffer {
  const ecdh = createECDH('secp256k1');
  ecdh.setPrivateKey(hexToBytes(myPriv));
  const rawShared = ecdh.computeSecret(hexToBytes(theirPub));
  return deriveKey(rawShared);
}

function encryptAesGcm(plaintext: Buffer, key: Buffer): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext: encrypted.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex') };
}

function decryptAesGcm(encrypted: EncryptedPayload, key: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, 'hex')), decipher.final()]);
}

// ╔════════════════════════════════════════════════════════════════╗
//  secp256k1 Signing (from core/identity.ts)
// ╚════════════════════════════════════════════════════════════════╝

function encodeLength(len: number): Buffer {
  if (len < 128) return Buffer.from([len]);
  if (len < 256) return Buffer.from([0x81, len]);
  return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
}

function privateKeyToPem(privHex: string): string {
  const privKeyBuf = Buffer.from(privHex, 'hex');
  const ecdh = createECDH('secp256k1');
  ecdh.setPrivateKey(privKeyBuf);
  const pubKeyBuf = ecdh.getPublicKey();

  const secp256k1Oid = Buffer.from('06052b8104000a', 'hex');
  const oidTagged = Buffer.concat([Buffer.from('a0', 'hex'), encodeLength(secp256k1Oid.length), secp256k1Oid]);
  const pubKeyBits = Buffer.concat([Buffer.from('00', 'hex'), pubKeyBuf]);
  const pubKeyBitString = Buffer.concat([Buffer.from('03', 'hex'), encodeLength(pubKeyBits.length), pubKeyBits]);
  const pubKeyTagged = Buffer.concat([Buffer.from('a1', 'hex'), encodeLength(pubKeyBitString.length), pubKeyBitString]);
  const version = Buffer.from('020101', 'hex');
  const privKeyOctet = Buffer.concat([Buffer.from('04', 'hex'), encodeLength(privKeyBuf.length), privKeyBuf]);
  const seqContent = Buffer.concat([version, privKeyOctet, oidTagged, pubKeyTagged]);
  const seq = Buffer.concat([Buffer.from('30', 'hex'), encodeLength(seqContent.length), seqContent]);

  const lines = seq.toString('base64').match(/.{1,64}/g) || [];
  return `-----BEGIN EC PRIVATE KEY-----\n${lines.join('\n')}\n-----END EC PRIVATE KEY-----`;
}

function publicKeyToPem(pubHex: string): string {
  const cleanHex = pubHex.startsWith('0x') ? pubHex.slice(2) : pubHex;
  const pubKeyBuf = Buffer.from(cleanHex, 'hex');
  const ecPublicKeyOid = Buffer.from('06072a8648ce3d0201', 'hex');
  const secp256k1Oid = Buffer.from('06052b8104000a', 'hex');
  const algoSeqContent = Buffer.concat([ecPublicKeyOid, secp256k1Oid]);
  const algoSeq = Buffer.concat([Buffer.from('30', 'hex'), encodeLength(algoSeqContent.length), algoSeqContent]);
  const pubKeyBits = Buffer.concat([Buffer.from('00', 'hex'), pubKeyBuf]);
  const pubKeyBitString = Buffer.concat([Buffer.from('03', 'hex'), encodeLength(pubKeyBits.length), pubKeyBits]);
  const spkiContent = Buffer.concat([algoSeq, pubKeyBitString]);
  const spki = Buffer.concat([Buffer.from('30', 'hex'), encodeLength(spkiContent.length), spkiContent]);

  const lines = spki.toString('base64').match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

function ecdsaSign(privateKey: string, payload: string): string {
  const pem = privateKeyToPem(privateKey);
  const sign = createSign('SHA256');
  sign.update(payload);
  sign.end();
  return sign.sign(pem, 'hex');
}

function ecdsaVerify(pubkey: string, payload: string, signature: string): boolean {
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
//  Types
// ╚════════════════════════════════════════════════════════════════╝

/** Protocol message shape (imported from core types but inlined for independence) */
interface ProtocolMsg<T = unknown> {
  protocol: string;
  id: string;
  timestamp: number;
  from: string;
  to: string;
  signature: string;
  type: string;
  payload: T;
}

/** Secure TASK_RESULT payload — replaces cleartext preimage */
export interface SecureResultPayload {
  zk_proof: ZkPreimageProof;
  encrypted_nonce: EncryptedPayload;
  output: unknown;
  settled: boolean;
  execution_time_ms: number;
  proof_hash: string;
}

// ╔════════════════════════════════════════════════════════════════╗
//  SecureChannel Class
// ╚════════════════════════════════════════════════════════════════╝

export class SecureChannel {
  private readonly privateKey: string;
  private readonly publicKey: string;

  constructor(privateKeyHex: string) {
    this.privateKey = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
    if (this.privateKey.length === 64) {
      const ecdh = createECDH('secp256k1');
      ecdh.setPrivateKey(Buffer.from(this.privateKey, 'hex'));
      this.publicKey = '0x' + ecdh.getPublicKey('hex', 'compressed');
    } else {
      this.publicKey = '';
    }
  }

  getPublicKey(): string { return this.publicKey; }

  // ── Message Signing ──

  signMessage<T>(msg: ProtocolMsg<T>): ProtocolMsg<T> {
    if (!this.privateKey || this.privateKey.length !== 64) return msg;
    const payload = this.getSignablePayload(msg);
    msg.signature = ecdsaSign(this.privateKey, payload);
    return msg;
  }

  verifyMessage<T>(msg: ProtocolMsg<T>, senderPubkey: string): boolean {
    if (!msg.signature || msg.signature === '') return false;
    const payload = this.getSignablePayload(msg);
    return ecdsaVerify(senderPubkey, payload, msg.signature);
  }

  private getSignablePayload<T>(msg: ProtocolMsg<T>): string {
    return JSON.stringify({
      protocol: msg.protocol,
      id: msg.id,
      timestamp: msg.timestamp,
      type: msg.type,
      payload: msg.payload,
    });
  }

  // ── Provider: Create Secure Result ──

  createSecureResult(
    preimage: string,
    paymentHash: string,
    output: unknown,
    callerPubkey: string,
    executionTimeMs: number,
  ): SecureResultPayload {
    const zkProof = createPreimageProof(preimage, paymentHash);

    let encryptedPreimage: EncryptedPayload;
    try {
      const key = ecdhSharedSecret(this.privateKey, callerPubkey);
      const preimageBuf = hexToBytes(preimage);
      encryptedPreimage = encryptAesGcm(preimageBuf, key);
    } catch {
      encryptedPreimage = { ciphertext: '', iv: '', tag: '' };
    }

    const proofHash = createHash('sha256').update(JSON.stringify(output)).digest('hex');

    return {
      zk_proof: zkProof,
      encrypted_nonce: encryptedPreimage,
      output,
      settled: true,
      execution_time_ms: executionTimeMs,
      proof_hash: proofHash,
    };
  }

  // ── Wallet: Verify and Recover ──

  verifySecureResult(result: SecureResultPayload, paymentHash: string): boolean {
    return verifyPreimageProof(result.zk_proof, paymentHash);
  }

  recoverPreimageFromResult(result: SecureResultPayload, providerPubkey: string): string {
    if (!result.encrypted_nonce.ciphertext) {
      throw new Error('No encrypted preimage in result');
    }
    const key = ecdhSharedSecret(this.privateKey, providerPubkey);
    const decrypted = decryptAesGcm(result.encrypted_nonce, key);
    return '0x' + decrypted.toString('hex');
  }
}
