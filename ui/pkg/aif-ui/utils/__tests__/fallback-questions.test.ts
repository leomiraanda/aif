import { describe, it, expect } from 'vitest';
import { getFallbackQuestions, applyFallbackQuestions } from '../fallback-questions';

describe('getFallbackQuestions — curated charts', () => {
  it('returns curated questions for ollama, ignoring any values passed in', () => {
    const result = getFallbackQuestions('ollama', { replicaCount: 7 });

    expect(result).not.toBeNull();
    const variables = result!.questions.map((q) => q.variable);
    expect(variables).toContain('replicaCount');
    expect(variables).toContain('ollama.models.pull');
    expect(variables).toContain('persistentVolume.size');

    const replicaCount = result!.questions.find((q) => q.variable === 'replicaCount');
    expect(replicaCount).toMatchObject({ type: 'int', default: 1 });
  });

  it('returns curated questions for open-webui', () => {
    const result = getFallbackQuestions('open-webui', undefined);

    expect(result).not.toBeNull();
    const ingressHost = result!.questions.find((q) => q.variable === 'ingress.host');
    expect(ingressHost).toMatchObject({ type: 'string', show_if: 'ingress.enabled=true' });
  });

  it('returns curated questions for open-webui-mcpo', () => {
    const result = getFallbackQuestions('open-webui-mcpo', undefined);

    expect(result).not.toBeNull();
    const variables = result!.questions.map((q) => q.variable);
    expect(variables).toContain('config.mcpServers');
  });
});

describe('getFallbackQuestions — generic fallback for uncurated charts', () => {
  it('returns null when there is no curated entry and no values to derive from', () => {
    expect(getFallbackQuestions('some-nvidia-chart', undefined)).toBeNull();
    expect(getFallbackQuestions('some-nvidia-chart', {})).toBeNull();
  });

  it('infers one question per top-level key, typed from the JS value', () => {
    const result = getFallbackQuestions('some-nvidia-chart', {
      enabled:      true,
      replicaCount: 3,
      cpuLimit:     0.5,
      name:         'foo',
      tags:         ['a', 'b'],
      resources:    { limits: {} },
    });

    expect(result).not.toBeNull();
    const byVariable = Object.fromEntries(result!.questions.map((q) => [q.variable, q]));

    expect(byVariable.enabled).toMatchObject({ type: 'boolean', default: true });
    expect(byVariable.replicaCount).toMatchObject({ type: 'int', default: 3 });
    expect(byVariable.cpuLimit).toMatchObject({ type: 'float', default: 0.5 });
    expect(byVariable.name).toMatchObject({ type: 'string', default: 'foo' });
    expect(byVariable.tags).toMatchObject({ type: 'yaml' });
    expect(byVariable.resources).toMatchObject({ type: 'yaml' });
  });

  it('humanizes camelCase keys into labels', () => {
    const result = getFallbackQuestions('some-nvidia-chart', { storageClassName: 'default' });

    expect(result!.questions[0]).toMatchObject({ variable: 'storageClassName', label: 'Storage Class Name' });
  });
});

describe('applyFallbackQuestions', () => {
  it('leaves chart-info untouched when it already has its own questions', () => {
    const info = { values: { a: 1 }, questions: [{ variable: 'a', label: 'A', type: 'int' }] };

    expect(applyFallbackQuestions(info, 'ollama')).toBe(info);
  });

  it('splices in the curated questions when the chart has none of its own', () => {
    const info = { values: {} };

    const result = applyFallbackQuestions(info, 'ollama');

    expect(result.questions?.map((q: any) => q.variable)).toContain('replicaCount');
  });

  it('splices in generic questions derived from values when there is no curated entry', () => {
    const info = { values: { enabled: true } };

    const result = applyFallbackQuestions(info, 'some-nvidia-chart');

    expect(result.questions).toMatchObject([{ variable: 'enabled', type: 'boolean' }]);
  });

  it('leaves chart-info untouched when there is neither a curated nor a generic fallback', () => {
    const info = { values: {} };

    expect(applyFallbackQuestions(info, 'some-nvidia-chart')).toBe(info);
  });
});
