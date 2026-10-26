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

// $route/$router are declared on ComponentCustomProperties (from the router
// typings) but irrelevant here — cast once rather than stubbing them.
function globalPropsFor(store: unknown): any {
  return { $store: store };
}

function makeComponent(chartVersion: string, overrides: Partial<BlueprintComponent> = {}): BlueprintComponent {
  return {
    chartRepo: 'repo-a', chartName: 'chart-a', chartVersion, ...overrides,
  };
}

function getVersionInfoCalls(dispatch: ReturnType<typeof vi.fn>) {
  return dispatch.mock.calls.filter(([action]) => action === 'catalog/getVersionInfo');
}

function mountWithRawInfo(rawInfo: Record<string, any>, component: BlueprintComponent | BlueprintComponent[], authoredQuestionsVersion: Record<string, string> = {}) {
  const dispatch = vi.fn((action: string) => {
    if (action === 'catalog/load') return Promise.resolve();
    if (action === 'catalog/getVersionInfo') return Promise.resolve(rawInfo);
    return Promise.resolve();
  });
  const store = { getters: {}, dispatch };

  return mount(BlueprintConfigStep, {
    props: { components: Array.isArray(component) ? component : [component], authoredQuestionsVersion },
    global: { config: { globalProperties: globalPropsFor(store) } },
  });
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
      global: { config: { globalProperties: globalPropsFor(store) } },
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
      global: { config: { globalProperties: globalPropsFor(store) } },
    });
    await flushPromises();

    const valuesStep = wrapper.findComponent({ name: 'ValuesStep' });
    expect(valuesStep.props('hasQuestions')).toBe(true);
    // Questions reads source.questions.questions, so the authored array must
    // arrive nested inside a questions document, not as a bare array.
    expect(valuesStep.props('questionsSource').questions).toEqual({ questions: authoredQuestions });
    // A clone, so Questions' own annotations (depth/group) never leak back
    // into comp.questions and onto the CR.
    expect(valuesStep.props('questionsSource').questions.questions).not.toBe(authoredQuestions);

    wrapper.unmount();
  });

  it('native { questions: [...] } from the chart wins over an authored definition', async () => {
    // Real chart-info shape: `questions` is the parsed questions.yaml document.
    const nativeDocument = { questions: [{ variable: 'native', label: 'Native', type: 'string' }] };
    const authoredQuestions = [{ variable: 'authored', label: 'Authored', type: 'string' }];
    const wrapper = mountWithRawInfo(
      { values: { replicas: 1 }, questions: nativeDocument },
      makeComponent('1.0.0', { questions: authoredQuestions }),
      { 'chart-a': '1.0.0' },
    );
    await flushPromises();

    const valuesStep = wrapper.findComponent({ name: 'ValuesStep' });
    expect(valuesStep.props('hasQuestions')).toBe(true);
    expect(valuesStep.props('questionsSource').questions).toEqual(nativeDocument);
    expect(valuesStep.props('questionsSource').questions.questions.map((q: any) => q.variable)).toEqual(['native']);

    wrapper.unmount();
  });
});

describe('BlueprintConfigStep - questions authoring affordance', () => {
  it('shows a "Build a configuration form" affordance when the chart has no native questions', async () => {
    const wrapper = mountWithRawInfo({ values: { replicas: 1 } }, makeComponent('1.0.0'));
    await flushPromises();

    expect(wrapper.find('[data-testid="build-questions-form"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it('does not show the affordance when the chart has native questions', async () => {
    const nativeDocument = { questions: [{ variable: 'native', label: 'Native', type: 'string' }] };
    const wrapper = mountWithRawInfo({ values: {}, questions: nativeDocument }, makeComponent('1.0.0'));
    await flushPromises();

    expect(wrapper.find('[data-testid="build-questions-form"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('shows the affordance when the chart-info questions document has an empty questions array', async () => {
    const wrapper = mountWithRawInfo({ values: {}, questions: { questions: [] } }, makeComponent('1.0.0'));
    await flushPromises();

    expect(wrapper.find('[data-testid="build-questions-form"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it('labels the affordance "Edit" once authored questions exist', async () => {
    const component = makeComponent('1.0.0', { questions: [{ variable: 'authored', label: 'Authored', type: 'string' }] });
    const wrapper = mountWithRawInfo({ values: {} }, component, { 'chart-a': '1.0.0' });
    await flushPromises();

    expect(wrapper.get('[data-testid="build-questions-form"]').text()).toContain('Edit configuration form');

    wrapper.unmount();
  });

  it('opens QuestionsAuthoringEditor pre-seeded with fromStoredQuestions(comp.questions) when clicked', async () => {
    const authoredQuestions = [{ variable: 'authored', label: 'Authored', type: 'string' }];
    const component = makeComponent('1.0.0', { questions: authoredQuestions });
    const wrapper = mountWithRawInfo({ values: {} }, component, { 'chart-a': '1.0.0' });
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

  it('disables Save and emits nothing while the form has a blank or duplicate variable', async () => {
    const wrapper = mountWithRawInfo({ values: {} }, makeComponent('1.0.0'));
    await flushPromises();

    await wrapper.get('[data-testid="build-questions-form"]').trigger('click');

    const editor = wrapper.findComponent({ name: 'QuestionsAuthoringEditor' });
    await editor.vm.$emit('update:modelValue', [
      { id: 'q-1', variable: '', label: 'Blank', type: 'string' },
    ] as AuthoredQuestion[]);

    const save = wrapper.get('[data-testid="save-questions-form"]');
    expect((save.element as HTMLButtonElement).disabled).toBe(true);
    await save.trigger('click');
    expect(wrapper.emitted('update:components')).toBeFalsy();

    await editor.vm.$emit('update:modelValue', [
      { id: 'q-1', variable: 'dup', label: 'One', type: 'string' },
      { id: 'q-2', variable: 'dup', label: 'Two', type: 'string' },
    ] as AuthoredQuestion[]);
    expect((wrapper.get('[data-testid="save-questions-form"]').element as HTMLButtonElement).disabled).toBe(true);

    wrapper.unmount();
  });
});

describe('BlueprintConfigStep - unsaved authoring changes', () => {
  function lastUnsaved(wrapper: ReturnType<typeof mountWithRawInfo>) {
    const emitted = wrapper.emitted('update:hasUnsavedQuestions') || [];

    return emitted.length ? emitted[emitted.length - 1][0] : undefined;
  }

  it('reports unsaved changes while an edited editor is open, and clears on save or cancel', async () => {
    const wrapper = mountWithRawInfo({ values: {} }, makeComponent('1.0.0'));
    await flushPromises();

    expect(lastUnsaved(wrapper)).toBe(false);

    await wrapper.get('[data-testid="build-questions-form"]').trigger('click');
    // Opening alone changes nothing.
    expect(lastUnsaved(wrapper)).toBe(false);

    const editor = wrapper.findComponent({ name: 'QuestionsAuthoringEditor' });
    await editor.vm.$emit('update:modelValue', [
      { id: 'q-1', variable: 'newVar', label: 'New Var', type: 'string' },
    ] as AuthoredQuestion[]);
    expect(lastUnsaved(wrapper)).toBe(true);

    await wrapper.get('[data-testid="cancel-questions-form"]').trigger('click');
    expect(lastUnsaved(wrapper)).toBe(false);

    await wrapper.get('[data-testid="build-questions-form"]').trigger('click');
    await wrapper.findComponent({ name: 'QuestionsAuthoringEditor' }).vm.$emit('update:modelValue', [
      { id: 'q-1', variable: 'newVar', label: 'New Var', type: 'string' },
    ] as AuthoredQuestion[]);
    expect(lastUnsaved(wrapper)).toBe(true);

    await wrapper.get('[data-testid="save-questions-form"]').trigger('click');
    expect(lastUnsaved(wrapper)).toBe(false);

    wrapper.unmount();
  });
});

describe('BlueprintConfigStep - version-bump review banner', () => {
  it('shows a review banner when chartVersion differs from authoredQuestionsVersion for a component with authored questions', async () => {
    const authoredQuestions = [{ variable: 'authored', label: 'Authored', type: 'string' }];
    const component = makeComponent('2.0.0', { questions: authoredQuestions });
    const wrapper = mountWithRawInfo({ values: {} }, component, { 'chart-a': '1.0.0' });
    await flushPromises();

    expect(wrapper.find('[data-testid="questions-version-review-banner"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it('forces a bumped component\'s panel open with its authoring editor on mount, even when it is not the first panel', async () => {
    const authoredQuestions = [{ variable: 'authored', label: 'Authored', type: 'string' }];
    const first = makeComponent('1.0.0', { chartName: 'chart-first' });
    const bumped = makeComponent('2.0.0', { chartName: 'chart-bumped', questions: authoredQuestions });
    const wrapper = mountWithRawInfo({ values: {} }, [first, bumped], { 'chart-bumped': '1.0.0' });
    await flushPromises();

    const panels = wrapper.findAll('.accordion-panel');
    expect(panels).toHaveLength(2);
    expect(panels[1].find('.accordion-body').exists()).toBe(true);
    expect(panels[1].find('[data-testid="questions-version-review-banner"]').exists()).toBe(true);
    expect(panels[1].find('[data-testid="questions-authoring-panel"]').exists()).toBe(true);

    const editor = panels[1].findComponent({ name: 'QuestionsAuthoringEditor' });
    expect(toStoredQuestions(editor.props('modelValue'))).toEqual(authoredQuestions);

    wrapper.unmount();
  });

  it('does not force open a component whose authored questions match the tracked version', async () => {
    const authoredQuestions = [{ variable: 'authored', label: 'Authored', type: 'string' }];
    const first = makeComponent('1.0.0', { chartName: 'chart-first' });
    const current = makeComponent('2.0.0', { chartName: 'chart-current', questions: authoredQuestions });
    const wrapper = mountWithRawInfo({ values: {} }, [first, current], { 'chart-current': '2.0.0' });
    await flushPromises();

    expect(wrapper.findAll('.accordion-panel')[1].find('.accordion-body').exists()).toBe(false);

    wrapper.unmount();
  });

  it('does not show the banner for a component with no authored questions, regardless of version', async () => {
    const component = makeComponent('2.0.0');
    const wrapper = mountWithRawInfo({ values: {} }, component, { 'chart-a': '1.0.0' });
    await flushPromises();

    expect(wrapper.find('[data-testid="questions-version-review-banner"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('saving from the authoring editor updates authoredQuestionsVersion to the current chartVersion', async () => {
    const component = makeComponent('1.0.0');
    const wrapper = mountWithRawInfo({ values: {} }, component, {});
    await flushPromises();

    await wrapper.get('[data-testid="build-questions-form"]').trigger('click');

    const editor = wrapper.findComponent({ name: 'QuestionsAuthoringEditor' });
    const authored: AuthoredQuestion[] = [
      { id: 'q-1', variable: 'newVar', label: 'New Var', type: 'string' },
    ];
    await editor.vm.$emit('update:modelValue', authored);

    await wrapper.get('[data-testid="save-questions-form"]').trigger('click');

    const emitted = wrapper.emitted('update:authoredQuestionsVersion');
    expect(emitted).toBeTruthy();
    const payload = emitted![emitted!.length - 1][0] as Record<string, string>;
    expect(payload).toEqual({ 'chart-a': '1.0.0' });

    wrapper.unmount();
  });
});
