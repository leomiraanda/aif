// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Questions from '@shell/components/Questions';
import QuestionsAuthoringEditor from '../QuestionsAuthoringEditor.vue';
import { resolveComponentQuestions } from '../../../../utils/blueprint-questions-resolve';

// Every other test in this directory stubs @shell/components/Questions, which
// is exactly how a wrong `source` shape (and a missing <Tabbed> ancestor)
// went unnoticed. These tests mount the *real* component, with just enough of
// the Rancher globals it touches stubbed out, and assert the authored field
// actually renders as a widget — not as junk schemaToQuestions fields, and
// without throwing on mount.

function makeGlobal(errors: unknown[]) {
  const overrides: Record<string, any> = {
    'cluster/all':       () => [],
    'cluster/schemaFor': () => null,
    'i18n/exists':       () => false,
    currentStore:        () => 'cluster',
  };
  // Any other getter (i18n/t, i18n/withFallback, ...) echoes its fallback or key.
  const getters = new Proxy({}, {
    get: (_target, key: string) => (key in overrides
      ? overrides[key]
      : (k: any, _args?: any, fallback?: any) => (typeof fallback === 'string' ? fallback : k)),
  });
  const store = { getters, dispatch: () => Promise.resolve() };

  return {
    config: {
      globalProperties: {
        $store: store, t: (k: string) => k, $fetchState: { pending: false },
      } as any,
      errorHandler: (e: unknown) => {
        errors.push(e);
      },
    },
  };
}

describe('real @shell/components/Questions rendering', () => {
  it('the authoring editor\'s live preview renders each authored field without errors', async () => {
    const errors: unknown[] = [];
    const wrapper = mount(QuestionsAuthoringEditor, {
      props: {
        modelValue:    [{ id: 'a', variable: 'replicaCount', label: 'Replica Count', type: 'string' }],
        previewValues: {},
      },
      global: makeGlobal(errors),
    });
    await flushPromises();

    expect(errors).toEqual([]);
    const preview = wrapper.get('[data-testid="questions-preview"]');
    expect(preview.find('[data-testid="string-input-replicaCount"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it('a resolved chart-info (authored tier) renders the authored field, not the info object\'s own keys', async () => {
    const errors: unknown[] = [];
    const rawInfo = { values: { replicas: 1 }, readme: '# hi', chart: { name: 'chart-a' } };
    const source = {
      ...rawInfo,
      questions: resolveComponentQuestions(undefined, [{ variable: 'authoredVar', label: 'Authored', type: 'string' }], 'chart-a', rawInfo.values),
    };

    const wrapper = mount(Questions, {
      props: {
        source, value: {}, tabbed: 'never', targetNamespace: '', mode: 'create',
      },
      global: makeGlobal(errors),
    });
    await flushPromises();

    expect(errors).toEqual([]);
    expect(wrapper.find('[data-testid="string-input-authoredVar"]').exists()).toBe(true);
    // The pre-fix shape made Questions fall through to schemaToQuestions(source).
    expect(wrapper.find('[data-testid*="readme"]').exists()).toBe(false);

    wrapper.unmount();
  });
});
