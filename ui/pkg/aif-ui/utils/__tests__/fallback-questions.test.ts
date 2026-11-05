import { describe, it, expect } from 'vitest';
import { getFallbackQuestions, applyFallbackQuestions } from '../fallback-questions';

describe('getFallbackQuestions — generic fallback', () => {
  it('returns null when there are no values to derive from', () => {
    expect(getFallbackQuestions('some-nvidia-chart', undefined)).toBeNull();
    expect(getFallbackQuestions('some-nvidia-chart', {})).toBeNull();
  });

  it('infers one question per top-level primitive key, typed and defaulted from the JS value', () => {
    const result = getFallbackQuestions('some-nvidia-chart', {
      enabled:      true,
      replicaCount: 3,
      cpuLimit:     0.5,
      name:         'foo',
    });

    expect(result).not.toBeNull();
    const byVariable = Object.fromEntries(result!.questions.map((q) => [q.variable, q]));

    expect(byVariable.enabled).toMatchObject({ type: 'boolean', default: true });
    expect(byVariable.replicaCount).toMatchObject({ type: 'int', default: 3 });
    expect(byVariable.cpuLimit).toMatchObject({ type: 'float', default: 0.5 });
    expect(byVariable.name).toMatchObject({ type: 'string', default: 'foo' });
  });

  it('humanizes camelCase keys into labels', () => {
    const result = getFallbackQuestions('some-nvidia-chart', { storageClassName: 'default' });

    expect(result!.questions[0]).toMatchObject({ variable: 'storageClassName', label: 'Storage Class Name' });
  });

  it('flattens a nested object into one question per leaf, keyed by dot-path', () => {
    const result = getFallbackQuestions('some-nvidia-chart', {
      ingress: { enabled: true, host: 'example.com' },
    });

    expect(result).not.toBeNull();
    const byVariable = Object.fromEntries(result!.questions.map((q) => [q.variable, q]));

    expect(byVariable['ingress.enabled']).toMatchObject({ type: 'boolean', default: true, label: 'Ingress Enabled' });
    expect(byVariable['ingress.host']).toMatchObject({ type: 'string', default: 'example.com', label: 'Ingress Host' });
  });

  it('recurses through arbitrarily deep nesting', () => {
    const result = getFallbackQuestions('some-nvidia-chart', {
      websocket: { redis: { service: { port: 6379 } } },
    });

    expect(result!.questions).toMatchObject([
      { variable: 'websocket.redis.service.port', label: 'Websocket Redis Service Port', type: 'int', default: 6379 },
    ]);
  });

  it('produces no question for an object with no primitive leaves', () => {
    const result = getFallbackQuestions('some-nvidia-chart', { affinity: {} });

    expect(result!.questions).toEqual([]);
  });

  it('turns an array into a single yaml-typed question, regardless of item shape', () => {
    const result = getFallbackQuestions('some-nvidia-chart', {
      tags:         ['a', 'b'],
      extraEnvVars: [{ name: 'X', value: 'Y' }],
    });

    const byVariable = Object.fromEntries(result!.questions.map((q) => [q.variable, q]));

    expect(byVariable.tags).toMatchObject({ type: 'yaml', default: ['a', 'b'] });
    expect(byVariable.extraEnvVars).toMatchObject({ type: 'yaml', default: [{ name: 'X', value: 'Y' }] });
  });

  it('groups generated questions using the existing keyword-based grouping', () => {
    const result = getFallbackQuestions('some-nvidia-chart', {
      ingress: { host: 'example.com' },
    });

    expect(result!.questions[0]).toMatchObject({ group: 'Networking' });
  });
});

describe('applyFallbackQuestions', () => {
  it('always leaves chart-info untouched — fallback generation is Blueprint-builder-only, not for standard chart installs', () => {
    const withNativeQuestions = { values: { a: 1 }, questions: [{ variable: 'a', label: 'A', type: 'int' }] };
    const withoutNativeQuestions = { values: { enabled: true } };

    expect(applyFallbackQuestions(withNativeQuestions, 'ollama')).toBe(withNativeQuestions);
    expect(applyFallbackQuestions(withoutNativeQuestions, 'some-nvidia-chart')).toBe(withoutNativeQuestions);
  });
});
