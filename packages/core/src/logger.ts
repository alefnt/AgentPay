/**
 * AgentPay â€?Structured Logger (zero-dependency)
 *
 * Production-grade JSON logger compatible with log collectors
 * (Datadog, ELK, CloudWatch). Outputs pino-compatible format.
 *
 * Features:
 * - JSON output (structured, machine-parseable)
 * - Log levels: debug, info, warn, error, fatal
 * - Service name + version tagging
 * - Pretty print for development (NODE_ENV=development)
 * - Optional child loggers with context
 *
 * Usage:
 *   import { createLogger } from '@agentpay-dev/core';
 *   const log = createLogger({ name: 'hub', version: '0.1.0' });
 *   log.info({ agentId: 'ag_123' }, 'Agent registered');
 *   log.error({ err }, 'Payment failed');
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

export interface LoggerConfig {
  name: string;
  version?: string;
  level?: LogLevel;
  /** Additional fields added to every log entry */
  context?: Record<string, unknown>;
}

export interface Logger {
  debug: (obj: Record<string, unknown> | string, msg?: string) => void;
  info: (obj: Record<string, unknown> | string, msg?: string) => void;
  warn: (obj: Record<string, unknown> | string, msg?: string) => void;
  error: (obj: Record<string, unknown> | string, msg?: string) => void;
  fatal: (obj: Record<string, unknown> | string, msg?: string) => void;
  child: (context: Record<string, unknown>) => Logger;
}

export function createLogger(config: LoggerConfig): Logger {
  const minLevel = LEVEL_VALUES[config.level || (process.env.LOG_LEVEL as LogLevel) || 'info'];
  const isPretty = process.env.NODE_ENV === 'development';
  const baseContext = {
    name: config.name,
    ...(config.version ? { version: config.version } : {}),
    ...(config.context || {}),
  };

  function log(level: LogLevel, obj: Record<string, unknown> | string, msg?: string): void {
    if (LEVEL_VALUES[level] < minLevel) return;

    // Normalize args: log('msg') or log({ data }, 'msg')
    let data: Record<string, unknown>;
    let message: string;
    if (typeof obj === 'string') {
      data = {};
      message = obj;
    } else {
      data = obj;
      message = msg || '';
    }

    // Serialize errors
    if (data.err instanceof Error) {
      data.err = { message: data.err.message, stack: data.err.stack, name: data.err.name };
    }

    const entry = {
      level: LEVEL_VALUES[level],
      time: Date.now(),
      ...baseContext,
      ...data,
      msg: message,
    };

    if (isPretty) {
      // Human-readable format for development
      const color = level === 'error' || level === 'fatal' ? '\x1b[31m' :
        level === 'warn' ? '\x1b[33m' :
          level === 'debug' ? '\x1b[90m' : '\x1b[36m';
      const reset = '\x1b[0m';
      const ts = new Date().toISOString().slice(11, 23);
      const ctx = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      const output = `${color}[${ts}] ${level.toUpperCase().padEnd(5)} ${config.name}${reset} ${message}${ctx}`;

      if (level === 'error' || level === 'fatal') {
        process.stderr.write(output + '\n');
      } else {
        process.stdout.write(output + '\n');
      }
    } else {
      // JSON format for production
      const output = JSON.stringify(entry);
      if (level === 'error' || level === 'fatal') {
        process.stderr.write(output + '\n');
      } else {
        process.stdout.write(output + '\n');
      }
    }
  }

  const logger: Logger = {
    debug: (obj, msg?) => log('debug', obj, msg),
    info: (obj, msg?) => log('info', obj, msg),
    warn: (obj, msg?) => log('warn', obj, msg),
    error: (obj, msg?) => log('error', obj, msg),
    fatal: (obj, msg?) => log('fatal', obj, msg),
    child: (context) => createLogger({
      ...config,
      context: { ...baseContext, ...context },
    }),
  };

  return logger;
}
