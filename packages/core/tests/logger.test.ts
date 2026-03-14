/**
 * Logger Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLogger, type Logger } from '../src/logger.js';

describe('Logger', () => {
  let stdoutSpy: any;
  let stderrSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a logger', () => {
    const log = createLogger({ name: 'test' });
    expect(log).toBeDefined();
    expect(typeof log.info).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.child).toBe('function');
  });

  it('should log info message as JSON', () => {
    const log = createLogger({ name: 'test', level: 'info' });
    log.info('hello world');
    expect(stdoutSpy).toHaveBeenCalled();
    const output = JSON.parse(stdoutSpy.mock.calls[0][0]);
    expect(output.msg).toBe('hello world');
    expect(output.name).toBe('test');
    expect(output.level).toBe(20);
    expect(output.time).toBeDefined();
  });

  it('should log with context object', () => {
    const log = createLogger({ name: 'test', level: 'info' });
    log.info({ agentId: 'ag_123', amount: '100' }, 'Payment received');
    const output = JSON.parse(stdoutSpy.mock.calls[0][0]);
    expect(output.agentId).toBe('ag_123');
    expect(output.amount).toBe('100');
    expect(output.msg).toBe('Payment received');
  });

  it('should serialize errors', () => {
    const log = createLogger({ name: 'test', level: 'info' });
    const err = new Error('connection refused');
    log.error({ err }, 'Fiber RPC failed');
    const output = JSON.parse(stderrSpy.mock.calls[0][0]);
    expect(output.err.message).toBe('connection refused');
    expect(output.err.stack).toBeDefined();
    expect(output.msg).toBe('Fiber RPC failed');
  });

  it('should respect log level', () => {
    const log = createLogger({ name: 'test', level: 'warn' });
    log.debug('should not appear');
    log.info('should not appear');
    log.warn('should appear');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
  });

  it('should create child logger with extra context', () => {
    const log = createLogger({ name: 'hub', level: 'info' });
    const child = log.child({ agentId: 'ag_456' });
    child.info('request processed');
    const output = JSON.parse(stdoutSpy.mock.calls[0][0]);
    expect(output.agentId).toBe('ag_456');
    expect(output.name).toBe('hub');
  });

  it('should include version in logs', () => {
    const log = createLogger({ name: 'test', version: '1.2.3', level: 'info' });
    log.info('startup');
    const output = JSON.parse(stdoutSpy.mock.calls[0][0]);
    expect(output.version).toBe('1.2.3');
  });

  it('should write errors to stderr', () => {
    const log = createLogger({ name: 'test', level: 'info' });
    log.error('something broke');
    expect(stderrSpy).toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('should write fatal to stderr', () => {
    const log = createLogger({ name: 'test', level: 'info' });
    log.fatal('crash');
    expect(stderrSpy).toHaveBeenCalled();
  });
});
