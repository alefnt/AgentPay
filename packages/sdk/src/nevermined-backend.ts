/**
 * AgentPay SDK — Nevermined Payment Backend
 *
 * Implements a payment backend compatible with Nevermined's protocol-agnostic
 * billing layer. Nevermined agents can use this to settle payments via Fiber L2.
 *
 * Nevermined is "protocol-agnostic" — they explicitly support custom payment
 * backends. This module plugs Fiber into their billing pipeline.
 *
 * Supported billing models:
 *   - per-call: Fixed price per API call
 *   - per-token: Price per AI token consumed
 *   - per-second: Time-based streaming
 *
 * Usage:
 * ```ts
 * const backend = new NeverminedBackend({ fiber, currency: 'Fibb' });
 * const invoice = await backend.createPayment('1000000000', 'translate');
 * const verified = await backend.verifyPayment(invoice.paymentHash);
 * await backend.settlePayment(invoice.paymentHash);
 * ```
 */

import { createHash, randomBytes } from 'node:crypto';
import type { FiberRpcClient, FiberCurrency, Hash256 } from '@agentpay-dev/core';

// ╔════════════════════════════════════════════════════════════════╗
//  Types
// ╚════════════════════════════════════════════════════════════════╝

export interface NeverminedPayment {
  paymentHash: string;
  invoice: string;
  amount: string;
  service: string;
  billingModel: 'per-call' | 'per-token' | 'per-second';
  status: 'pending' | 'paid' | 'settled' | 'cancelled';
  createdAt: number;
}

export interface NeverminedBackendConfig {
  fiber: FiberRpcClient;
  currency: FiberCurrency;
}

// ╔════════════════════════════════════════════════════════════════╗
//  NeverminedBackend Class
// ╚════════════════════════════════════════════════════════════════╝

export class NeverminedBackend {
  private readonly fiber: FiberRpcClient;
  private readonly currency: FiberCurrency;
  private readonly payments: Map<string, { payment: NeverminedPayment; preimage: string }> = new Map();

  constructor(config: NeverminedBackendConfig) {
    this.fiber = config.fiber;
    this.currency = config.currency;
  }

  /**
   * Create a payment request (Nevermined Payment Backend interface).
   * Returns a Fiber invoice for the Nevermined agent to pay.
   */
  async createPayment(
    amount: string,
    service: string,
    billingModel: 'per-call' | 'per-token' | 'per-second' = 'per-call',
  ): Promise<{ paymentHash: string; invoice: string; amount: string }> {
    const preimage = randomBytes(32).toString('hex');
    const paymentHash = createHash('sha256')
      .update(Buffer.from(preimage, 'hex'))
      .digest('hex');

    const { invoice_address } = await this.fiber.newInvoice({
      amount,
      currency: this.currency,
      payment_hash: `0x${paymentHash}` as Hash256,
      description: `Nevermined: ${service} (${billingModel})`,
      expiry: 600,
    });

    const payment: NeverminedPayment = {
      paymentHash,
      invoice: invoice_address,
      amount,
      service,
      billingModel,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.payments.set(paymentHash, { payment, preimage });

    return { paymentHash, invoice: invoice_address, amount };
  }

  /**
   * Verify a payment has been received (Nevermined verification step).
   */
  async verifyPayment(paymentHash: string): Promise<{ verified: boolean; status: string }> {
    const cleanHash = paymentHash.replace(/^0x/, '');
    const entry = this.payments.get(cleanHash);
    if (!entry) {
      return { verified: false, status: 'not_found' };
    }

    try {
      const invoiceStatus = await this.fiber.getInvoice({
        payment_hash: `0x${cleanHash}` as Hash256,
      });

      if (invoiceStatus.status === 'Received') {
        entry.payment.status = 'paid';
        return { verified: true, status: 'paid' };
      }
      return { verified: false, status: invoiceStatus.status };
    } catch {
      return { verified: false, status: 'error' };
    }
  }

  /**
   * Settle a payment (reveal preimage, collect funds).
   */
  async settlePayment(paymentHash: string): Promise<{ settled: boolean }> {
    const cleanHash = paymentHash.replace(/^0x/, '');
    const entry = this.payments.get(cleanHash);
    if (!entry) {
      throw new Error(`Payment not found: ${paymentHash}`);
    }

    await this.fiber.settleInvoice({
      payment_hash: `0x${cleanHash}` as Hash256,
      payment_preimage: `0x${entry.preimage}`,
    });

    entry.payment.status = 'settled';
    return { settled: true };
  }

  /**
   * Cancel a payment (refund).
   */
  async cancelPayment(paymentHash: string): Promise<{ cancelled: boolean }> {
    const cleanHash = paymentHash.replace(/^0x/, '');
    const entry = this.payments.get(cleanHash);
    if (!entry) {
      throw new Error(`Payment not found: ${paymentHash}`);
    }

    await this.fiber.cancelInvoice({
      payment_hash: `0x${cleanHash}` as Hash256,
    });

    entry.payment.status = 'cancelled';
    return { cancelled: true };
  }

  /**
   * Get payment status (Nevermined query interface).
   */
  getPaymentStatus(paymentHash: string): NeverminedPayment | null {
    const cleanHash = paymentHash.replace(/^0x/, '');
    return this.payments.get(cleanHash)?.payment || null;
  }
}
