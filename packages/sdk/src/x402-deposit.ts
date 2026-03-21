/**
 * AgentPay SDK — x402 Deposit Gateway
 *
 * Enables "fee compression" for EVM Agents:
 *   1. Agent deposits once (e.g. USDC on-chain) → credited to balance
 *   2. Each x402 request deducts from balance (Fiber internal, 0 gas)
 *   3. Agent withdraws remaining balance when done
 *
 * This turns 10,000 on-chain transactions into 1, saving 90-99% gas.
 *
 * Usage:
 * ```ts
 * provider.enableX402();
 * provider.enableDeposit(); // Adds /deposit/* endpoints
 * ```
 */

import { createHash, randomUUID } from 'node:crypto';
import type { Hash256, Pubkey } from '@agentpay-dev/core';

// ╔════════════════════════════════════════════════════════════════╗
//  Types
// ╚════════════════════════════════════════════════════════════════╝

export interface DepositAccount {
  /** Account ID (derived from agent pubkey or API key) */
  account_id: string;
  /** Current balance in shannons */
  balance: string;
  /** Total deposited */
  total_deposited: string;
  /** Total spent */
  total_spent: string;
  /** Number of transactions (deductions) */
  tx_count: number;
  /** Creation time */
  created_at: number;
  /** Last activity */
  last_active: number;
}

export interface DepositTransaction {
  tx_id: string;
  account_id: string;
  type: 'deposit' | 'deduct' | 'withdraw';
  amount: string;
  balance_after: string;
  service?: string;
  reference?: string;
  timestamp: number;
}

// ╔════════════════════════════════════════════════════════════════╗
//  DepositGateway Class
// ╚════════════════════════════════════════════════════════════════╝

export class DepositGateway {
  /** Accounts indexed by account_id */
  private readonly accounts: Map<string, DepositAccount> = new Map();
  /** Transaction log */
  private readonly txLog: DepositTransaction[] = [];

  /**
   * Create or get a deposit account for an agent.
   */
  getOrCreateAccount(agentId: string): DepositAccount {
    let account = this.accounts.get(agentId);
    if (!account) {
      account = {
        account_id: agentId,
        balance: '0',
        total_deposited: '0',
        total_spent: '0',
        tx_count: 0,
        created_at: Date.now(),
        last_active: Date.now(),
      };
      this.accounts.set(agentId, account);
    }
    return { ...account };
  }

  /**
   * Record a deposit (credit balance).
   *
   * In production, this should verify the on-chain tx hash.
   * For now, it's a simple ledger entry.
   */
  deposit(agentId: string, amount: string, reference?: string): DepositAccount {
    if (BigInt(amount) <= 0n) {
      throw new Error('Deposit amount must be > 0');
    }

    const account = this.getOrCreateAccountInternal(agentId);
    account.balance = (BigInt(account.balance) + BigInt(amount)).toString();
    account.total_deposited = (BigInt(account.total_deposited) + BigInt(amount)).toString();
    account.last_active = Date.now();

    this.logTx({
      tx_id: randomUUID(),
      account_id: agentId,
      type: 'deposit',
      amount,
      balance_after: account.balance,
      reference,
      timestamp: Date.now(),
    });

    return { ...account };
  }

  /**
   * Deduct from balance (for x402 payments).
   * Returns true if successful, false if insufficient balance.
   */
  deduct(agentId: string, amount: string, service?: string): { success: boolean; balance: string } {
    const account = this.accounts.get(agentId);
    if (!account) {
      return { success: false, balance: '0' };
    }

    if (BigInt(account.balance) < BigInt(amount)) {
      return { success: false, balance: account.balance };
    }

    account.balance = (BigInt(account.balance) - BigInt(amount)).toString();
    account.total_spent = (BigInt(account.total_spent) + BigInt(amount)).toString();
    account.tx_count++;
    account.last_active = Date.now();

    this.logTx({
      tx_id: randomUUID(),
      account_id: agentId,
      type: 'deduct',
      amount,
      balance_after: account.balance,
      service,
      timestamp: Date.now(),
    });

    return { success: true, balance: account.balance };
  }

  /**
   * Withdraw balance (return funds to agent).
   */
  withdraw(agentId: string, amount?: string): { withdrawn: string; balance: string } {
    const account = this.accounts.get(agentId);
    if (!account) {
      throw new Error(`Account not found: ${agentId}`);
    }

    const withdrawAmount = amount || account.balance;
    if (BigInt(withdrawAmount) > BigInt(account.balance)) {
      throw new Error(`Insufficient balance: ${account.balance} < ${withdrawAmount}`);
    }

    account.balance = (BigInt(account.balance) - BigInt(withdrawAmount)).toString();
    account.last_active = Date.now();

    this.logTx({
      tx_id: randomUUID(),
      account_id: agentId,
      type: 'withdraw',
      amount: withdrawAmount,
      balance_after: account.balance,
      timestamp: Date.now(),
    });

    return { withdrawn: withdrawAmount, balance: account.balance };
  }

  /**
   * Get account balance.
   */
  getBalance(agentId: string): string {
    return this.accounts.get(agentId)?.balance || '0';
  }

  /**
   * Get recent transactions for an account.
   */
  getTransactions(agentId: string, limit: number = 50): DepositTransaction[] {
    return this.txLog
      .filter(tx => tx.account_id === agentId)
      .slice(-limit);
  }

  /**
   * Get stats summary.
   */
  getStats(): {
    total_accounts: number;
    total_deposited: string;
    total_spent: string;
    total_transactions: number;
  } {
    let totalDeposited = 0n;
    let totalSpent = 0n;
    for (const account of this.accounts.values()) {
      totalDeposited += BigInt(account.total_deposited);
      totalSpent += BigInt(account.total_spent);
    }
    return {
      total_accounts: this.accounts.size,
      total_deposited: totalDeposited.toString(),
      total_spent: totalSpent.toString(),
      total_transactions: this.txLog.length,
    };
  }

  // ── Internal ──

  private getOrCreateAccountInternal(agentId: string): DepositAccount {
    let account = this.accounts.get(agentId);
    if (!account) {
      account = {
        account_id: agentId,
        balance: '0',
        total_deposited: '0',
        total_spent: '0',
        tx_count: 0,
        created_at: Date.now(),
        last_active: Date.now(),
      };
      this.accounts.set(agentId, account);
    }
    return account;
  }

  private logTx(tx: DepositTransaction): void {
    this.txLog.push(tx);
    // Keep last 10,000 transactions in memory
    if (this.txLog.length > 10_000) {
      this.txLog.splice(0, this.txLog.length - 10_000);
    }
  }
}
