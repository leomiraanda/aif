// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import BlueprintConfigStep from '../BlueprintConfigStep.vue';
import type { BlueprintComponent } from '../../../../types/blueprint-types';
import { toStoredQuestions } from '../../../../utils/blueprint-questions-schema';
import type { AuthoredQuestion } from '../../../../utils/blueprint-questions-schema';

// ValuesStep pulls in @shell's Questions/Tabbed/YamlEditor tree, which is
// irrelevant to the chart-info caching logic under test here — stub it the
// same way Apps.test.ts stubs heavy child components.
vi.mock('../ValuesStep.vue', () => ({
  default: {
    name:  'ValuesStep',
    props: [
      'values', 'chartRepo', 'chartName', 'chartVersion', 'loadingValues', 'versionDirty',
      'hasQuestions', 'questionsSource', 'questionsLoading', 'ignoreVariables', 'targetNamespace',
      'mode', 'inStore',
    ],
    template: '<div class="values-step-stub" />',
  },
}));

// QuestionsAuthoringEditor pulls in @shell/components/Questions' full widget
// tree (Jexl, Vuex getters, knownTypes) via its own live preview — irrelevant
// to the wiring under test here (does BlueprintConfigStep seed/save it
// correctly). Stub it with a component that records modelValue/previewValues
// as props and lets a test drive 'update:modelValue' directly, same approach
// QuestionsAuthoringEditor.test.ts itself uses to stub its own heavy deps.
vi.mock('../QuestionsAuthoringEditor.vue', () => ({
  default: {
    name:  'QuestionsAuthoringEditor',
    props: ['modelValue', 'previewValues'],
    emits: ['update:modelValue'],
    template: '<div data-testid="questions-authoring-editor-stub" />',
  },
}));

function makeComponent(chartVersion: string, overrides: Partial<BlueprintComponent> = {}): BlueprintComponent {
  return {
    chartRepo: 'repo-a', chartName: 'chart-a', chartVersion, ...overrides,
  };
}

function getVersionInfoCalls(dispatch: ReturnType<typeof vi.fn>) {
  return dispatch.mock.calls.filter(([action]) => action === 'catalog/getVersionInfo');
}

describe('BlueprintConfigStep - chart-info cache key', () => {
  it('refetches catalog/getVersionInfo when a component\'s chart version changes while its panel is re-expanded', async () => {
    const dispatch = vi.fn((action: string) => {
      if (action === 'catalog/load') return Promise.resolve();
      if (action === 'catalog/getVersionInfo') return Promise.resolve({ values: { replicas: 1 } });
      return Promise.resolve();
    });
    const store = { getters: {}, dispatch };

    const wrapper = mount(BlueprintConfigStep, {
      props: { components: [makeComponent('1.0.0')] },
      global: { config: { globalProperties: { $store: store } } },
    });
    await flushPromises();

    // Mount loads chart info for the first (auto-expanded) panel.
    expect(getVersionInfoCalls(dispatch)).toHaveLength(1);
    expect(getVersionInfoCalls(dispatch)[0][1]).toMatchObject({ versionName: '1.0.0' });

    const header = wrapper.get('.accordion-header');

    // Collapse the panel.
    await header.trigger('click');
    await flushPromises();

    // Simulate BlueprintAppSelectorStep's onVersionChange bumping the chart version
    // while the (now-collapsed) panel's cache entry still exists.
    await wrapper.setProps({ components: [makeComponent('2.0.0')] });
    await flushPromises();

    // Re-expand the panel.
    await header.trigger('click');
    await flushPromises();

    expect(getVersionInfoCalls(dispatch)).toHaveLength(2);
    expect(getVersionInfoCalls(dispatch)[1][1]).toMatchObject({ versionName: '2.0.0' });

    wrapper.unmount();
  });
});

describe('BlueprintConfigStep - questions precedence', () => {
  it('uses the Blueprint-authored questions when the chart has no native questions.yaml', async () => {
    const dispatch = vi.fn((action: string) => {
      if (action === 'catalog/load') return Promise.resolve();
      if (action === 'catalog/getVersionInfo') return Promise.resolve({ values: { replicas: 1 } });
      return Promise.resolve();
    });
    const store = { getters: {}, dispatch };

    const authoredQuestions = [{ variable: 'authored', label: 'Authored', type: 'string' }];
    const component = makeComponent('1.0.0', { questions: authoredQuestions });

    const wrapper = mount(BlueprintConfigStep, {
      props: { components: [component] },
      global: { config: { globalProperties: { $store: store } } },
    });
    await flushPromises();

    const valuesStep = wrapper.findComponent({ name: 'ValuesStep' });
    expect(valuesStep.props('hasQuestions')).toBe(true);
    expect(valuesStep.props('questionsSource').questions).toEqual(authoredQuestions);

    wrapper.unmount();
  });
});

describe('BlueprintConfigStep - questions authoring affordance', () => {
  function mountWithRawInfo(rawInfo: Record<string, any>, component: BlueprintComponent) {
    const dispatch = vi.fn((action: string) => {
      if (action === 'catalog/load') return Promise.resolve();
      if (action === 'catalog/getVersionInfo') return Promise.resolve(rawInfo);
      return Promise.resolve();
    });
    const store = { getters: {}, dispatch };

    return mount(BlueprintConfigStep, {
      props: { components: [component] },
      global: { config: { globalProperties: { $store: store } } },
    });
  }

  it('shows a "Build a configuration form" affordance when the chart has no native questions', async () => {
    const wrapper = mountWithRawInfo({ values: { replicas: 1 } }, makeComponent('1.0.0'));
    await flushPromises();

    expect(wrapper.find('[data-testid="build-questions-form"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it('does not show the affordance when the chart has native questions', async () => {
    const nativeQuestions = [{ variable: 'native', label: 'Native', type: 'string' }];
    const wrapper = mountWithRawInfo({ values: {}, questions: nativeQuestions }, makeComponent('1.0.0'));
    await flushPromises();

    expect(wrapper.find('[data-testid="build-questions-form"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('opens QuestionsAuthoringEditor pre-seeded with fromStoredQuestions(comp.questions) when clicked', async () => {
    const authoredQuestions = [{ variable: 'authored', label: 'Authored', type: 'string' }];
    const component = makeComponent('1.0.0', { questions: authoredQuestions });
    const wrapper = mountWithRawInfo({ values: {} }, component);
    await flushPromises();

    await wrapper.get('[data-testid="build-questions-form"]').trigger('click');

    const editor = wrapper.findComponent({ name: 'QuestionsAuthoringEditor' });
    expect(editor.exists()).toBe(true);
    // fromStoredQuestions mints a fresh random id each call, so compare the
    // seeded editor state back through toStoredQuestions (which drops id)
    // rather than asserting object identity on a second, separately-minted
    // fromStoredQuestions(...) call.
    expect(toStoredQuestions(editor.props('modelValue'))).toEqual(authoredQuestions);

    wrapper.unmount();
  });

  it('saving from the editor emits update:components with comp.questions set to toStoredQuestions(result)', async () => {
    const component = makeComponent('1.0.0');
    const wrapper = mountWithRawInfo({ values: {} }, component);
    await flushPromises();

    await wrapper.get('[data-testid="build-questions-form"]').trigger('click');

    const editor = wrapper.findComponent({ name: 'QuestionsAuthoringEditor' });
    const authored: AuthoredQuestion[] = [
      { id: 'q-1', variable: 'newVar', label: 'New Var', type: 'string' },
    ];
    await editor.vm.$emit('update:modelValue', authored);

    await wrapper.get('[data-testid="save-questions-form"]').trigger('click');

    const emitted = wrapper.emitted('update:components');
    expect(emitted).toBeTruthy();
    const payload = emitted![emitted!.length - 1][0] as BlueprintComponent[];
    expect(payload[0].questions).toEqual(toStoredQuestions(authored));

    wrapper.unmount();
  });
});
