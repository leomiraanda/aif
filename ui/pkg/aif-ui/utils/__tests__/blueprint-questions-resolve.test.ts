import { describe, it, expect } from 'vitest';
import { resolveComponentQuestions } from '../blueprint-questions-resolve';
import type { QuestionDef } from '../blueprint-questions-schema';

const nativeQuestions: QuestionDef[] = [{ variable: 'native', label: 'Native', type: 'string' }];
const authoredQuestions: QuestionDef[] = [{ variable: 'authored', label: 'Authored', type: 'string' }];

describe('resolveComponentQuestions', () => {
  it('prefers native questions over authored and fallback', () => {
    const result = resolveComponentQuestions(nativeQuestions, authoredQuestions, 'ollama', { replicaCount: 1 });

    expect(result).toBe(nativeQuestions);
  });

  it('prefers authored questions over fallback when native is absent', () => {
    const result = resolveComponentQuestions(undefined, authoredQuestions, 'ollama', { replicaCount: 1 });

    expect(result).toBe(authoredQuestions);
  });

  it('falls back to getFallbackQuestions when both native and authored are absent', () => {
    const result = resolveComponentQuestions(undefined, undefined, 'ollama', { replicaCount: 1 });

    expect(result?.map((q) => q.variable)).toContain('replicaCount');
  });

  it('treats an empty authored array the same as absent, falling through to fallback', () => {
    const result = resolveComponentQuestions(undefined, [], 'ollama', { replicaCount: 1 });

    expect(result?.map((q) => q.variable)).toContain('replicaCount');
  });

  it('returns undefined when nothing matches and there is no values-based fallback', () => {
    const result = resolveComponentQuestions(undefined, undefined, 'some-uncurated-chart', undefined);

    expect(result).toBeUndefined();
  });
});
