/**
 * Example: Code Review Agent
 *
 * A real-world Agent that provides paid code review service.
 * It uses a simple static analysis approach (can be enhanced with LLM).
 *
 * Service: code_review
 * Input:  { code: string, language: string }
 * Output: { issues: Array, score: number, suggestions: string[] }
 * Price:  2 CKB per review
 */

import { ServiceProvider } from '@agentpay-dev/sdk';

// ─── Code Review Logic ──────────────────────────────────

interface ReviewIssue {
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule: string;
}

function reviewCode(code: string, language: string): {
  issues: ReviewIssue[];
  score: number;
  suggestions: string[];
  stats: { lines: number; functions: number; complexity: string };
} {
  const lines = code.split('\n');
  const issues: ReviewIssue[] = [];
  const suggestions: string[] = [];

  // Static analysis rules
  lines.forEach((line, i) => {
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Common issues
    if (trimmed.includes('console.log') && language !== 'script') {
      issues.push({ line: lineNum, severity: 'warning', message: 'Remove debug console.log', rule: 'no-console' });
    }
    if (trimmed.includes('any') && (language === 'typescript' || language === 'ts')) {
      issues.push({ line: lineNum, severity: 'warning', message: 'Avoid using `any` type', rule: 'no-any' });
    }
    if (trimmed.length > 120) {
      issues.push({ line: lineNum, severity: 'info', message: 'Line exceeds 120 characters', rule: 'max-line-length' });
    }
    if (trimmed.includes('TODO') || trimmed.includes('FIXME')) {
      issues.push({ line: lineNum, severity: 'info', message: 'Unresolved TODO/FIXME comment', rule: 'no-todo' });
    }
    if (trimmed === 'var ') {
      issues.push({ line: lineNum, severity: 'error', message: 'Use `const` or `let` instead of `var`', rule: 'no-var' });
    }
    if (trimmed.includes('eval(')) {
      issues.push({ line: lineNum, severity: 'error', message: 'Avoid using eval() �?security risk', rule: 'no-eval' });
    }
    if (trimmed.includes('==') && !trimmed.includes('===') && !trimmed.includes('!==')) {
      issues.push({ line: lineNum, severity: 'warning', message: 'Use strict equality (===)', rule: 'eqeqeq' });
    }
  });

  // Count functions
  const funcCount = (code.match(/function\s|=>\s*{|async\s+\(/g) || []).length;

  // Calculate score (out of 100)
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const score = Math.max(0, Math.min(100, 100 - errorCount * 15 - warningCount * 5 - issues.length));

  // Generate suggestions
  if (errorCount > 0) suggestions.push('Fix critical errors before deploying');
  if (warningCount > 3) suggestions.push('Consider refactoring to reduce warnings');
  if (lines.length > 200) suggestions.push('Consider splitting large file into smaller modules');
  if (funcCount > 10) suggestions.push('Consider extracting functions into separate files');
  if (score >= 90) suggestions.push('Code quality is excellent!');

  return {
    issues,
    score,
    suggestions,
    stats: {
      lines: lines.length,
      functions: funcCount,
      complexity: score > 80 ? 'low' : score > 50 ? 'medium' : 'high',
    },
  };
}

// ─── Agent Setup ─────────────────────────────────────────

const provider = new ServiceProvider({
  fiberRpcUrl: process.env.FIBER_RPC_URL || 'http://127.0.0.1:8227',
  currency: 'Fibt',
  services: [
    {
      name: 'code_review',
      description: 'Automated code review with static analysis',
      input_schema: { code: 'string', language: 'string' },
      output_schema: {
        issues: 'ReviewIssue[]',
        score: 'number (0-100)',
        suggestions: 'string[]',
        stats: '{ lines, functions, complexity }',
      },
      pricing: { model: 'per-call', amount: '200000000', asset: 'CKB' }, // 2 CKB
      sla: { max_latency_ms: 3000 },
    },
  ],
});

provider.onTask('code_review', async (input: unknown) => {
  const { code, language } = input as { code: string; language: string };

  if (!code || typeof code !== 'string') {
    throw new Error('code is required and must be a string');
  }

  return reviewCode(code, language || 'javascript');
});

const PORT = parseInt(process.env.PORT || '3002');
provider.listen(PORT);

console.log(`
╔══════════════════════════════════════════════════╗
�? Code Review Agent                               �?�?                                                 �?�? Service: code_review                            �?�? Price:   2 CKB per review                       �?�? Port:    ${PORT}                                  �?�?                                                 �?�? Usage:                                          �?�?   wallet.payAndCall(                             �?�?     'http://localhost:${PORT}',                   �?�?     'code_review',                              �?�?     { code: '...', language: 'typescript' }     �?�?   );                                            �?╚══════════════════════════════════════════════════╝
`);
