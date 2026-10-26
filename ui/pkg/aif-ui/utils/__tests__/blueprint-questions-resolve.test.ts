import { describe, it, expect } from 'vitest';
import { hasNativeQuestions, resolveComponentQuestions } from '../blueprint-questions-resolve';
import type { QuestionDef } from '../blueprint-questions-schema';

// Real shape: Rancher's chart-info `questions` field is the parsed
// questions.yaml document, i.e. `{ questions: [...] }` — not the bare array.
const nativeArray: QuestionDef[] = [{ variable: 'native', label: 'Native', type: 'string' }];
const nativeDocument = { questions: nativeArray };
const authoredQuestions: QuestionDef[] = [{ variable: 'authored', label: 'Authored', type: 'string' }];

describe('resolveComponentQuestions', () => {
  it('prefers native questions over authored and fallback, returning the native document', () => {
    const result = resolveComponentQuestions(nativeDocument, authoredQuestions, 'ollama', { replicaCount: 1 });

    expect(result).toBe(nativeDocument);
    expect(result?.questions).toBe(nativeArray);
  });

  it('prefers authored questions over fallback when native is absent, wrapped as { questions }', () => {
    const result = resolveComponentQuestions(undefined, authoredQuestions, 'ollama', { replicaCount: 1 });

    expect(result).toEqual({ questions: authoredQuestions });
  });

  it('treats a native document with an empty questions array as absent', () => {
    const result = resolveComponentQuestions({ questions: [] }, authoredQuestions, 'ollama', undefined);

    expect(result?.questions).toBe(authoredQuestions);
  });

  it('falls back to getFallbackQuestions when both native and authored are absent, wrapped as { questions }', () => {
    const result = resolveComponentQuestions(undefined, undefined, 'ollama', { replicaCount: 1 });

    expect(Array.isArray(result?.questions)).toBe(true);
    expect(result?.questions?.map((q) => q.variable)).toContain('replicaCount');
  });

  it('treats an empty authored array the same as absent, falling through to fallback', () => {
    const result = resolveComponentQuestions(undefined, [], 'ollama', { replicaCount: 1 });

    expect(result?.questions?.map((q) => q.variable)).toContain('replicaCount');
  });

  it('returns undefined when nothing matches and there is no values-based fallback', () => {
    const result = resolveComponentQuestions(undefined, undefined, 'some-uncurated-chart', undefined);

    expect(result).toBeUndefined();
  });
});

describe('hasNativeQuestions', () => {
  it('is true for chart-info whose questions document has a non-empty questions array', () => {
    expect(hasNativeQuestions({ questions: nativeDocument })).toBe(true);
  });

  it('is false for missing info, missing questions, or an empty questions array', () => {
    expect(hasNativeQuestions(undefined)).toBe(false);
    expect(hasNativeQuestions({})).toBe(false);
    expect(hasNativeQuestions({ questions: {} })).toBe(false);
    expect(hasNativeQuestions({ questions: { questions: [] } })).toBe(false);
  });
});
