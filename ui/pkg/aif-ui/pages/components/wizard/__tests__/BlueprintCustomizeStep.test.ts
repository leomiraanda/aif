// // @vitest-environment jsdom
// import { describe, it, expect, vi } from 'vitest';
// import { mount, flushPromises } from '@vue/test-utils';
// import BlueprintCustomizeStep from '../BlueprintCustomizeStep.vue';
// import type { BlueprintComponent } from '../../../../types/blueprint-types';

// // ValuesStep pulls in @shell's Questions/Tabbed/YamlEditor tree, which is
// // irrelevant to the chart-info caching logic under test here — stub it the
// // same way Apps.test.ts stubs heavy child components.
// vi.mock('../ValuesStep.vue', () => ({
//   default: {
//     name:  'ValuesStep',
//     props: [
//       'values', 'chartRepo', 'chartName', 'chartVersion', 'loadingValues', 'versionDirty',
//       'hasQuestions', 'questionsSource', 'questionsLoading', 'ignoreVariables', 'targetNamespace',
//       'mode', 'inStore',
//     ],
//     template: '<div class="values-step-stub" />',
//   },
// }));

// function makeComponent(chartVersion: string, overrides: Partial<BlueprintComponent> = {}): BlueprintComponent {
//   return {
//     chartRepo: 'repo-a', chartName: 'chart-a', chartVersion, ...overrides,
//   };
// }

// function getVersionInfoCalls(dispatch: ReturnType<typeof vi.fn>) {
//   return dispatch.mock.calls.filter(([action]) => action === 'catalog/getVersionInfo');
// }

// describe('BlueprintCustomizeStep - chart-info cache key', () => {
//   it('refetches catalog/getVersionInfo when a component\'s chart version changes while its panel is re-expanded', async () => {
//     const dispatch = vi.fn((action: string) => {
//       if (action === 'catalog/load') return Promise.resolve();
//       if (action === 'catalog/getVersionInfo') return Promise.resolve({ values: {} });
//       return Promise.resolve();
//     });
//     const store = { getters: {}, dispatch };

//     const wrapper = mount(BlueprintCustomizeStep, {
//       props: { components: [makeComponent('1.0.0')], mode: 'install' },
//       global: { config: { globalProperties: { $store: store } as any } },
//     });
//     await flushPromises();

//     // Mount loads chart info for the first (auto-expanded) panel.
//     expect(getVersionInfoCalls(dispatch)).toHaveLength(1);
//     expect(getVersionInfoCalls(dispatch)[0][1]).toMatchObject({ versionName: '1.0.0' });

//     const header = wrapper.get('.accordion-header');

//     // Collapse the panel.
//     await header.trigger('click');
//     await flushPromises();

//     // Simulate BlueprintAppSelectorStep's onVersionChange bumping the chart version
//     // while the (now-collapsed) panel's cache entry still exists.
//     await wrapper.setProps({ components: [makeComponent('2.0.0')] });
//     await flushPromises();

//     // Re-expand the panel.
//     await header.trigger('click');
//     await flushPromises();

//     expect(getVersionInfoCalls(dispatch)).toHaveLength(2);
//     expect(getVersionInfoCalls(dispatch)[1][1]).toMatchObject({ versionName: '2.0.0' });

//     wrapper.unmount();
//   });
// });

// describe('BlueprintCustomizeStep - questions precedence', () => {
//   it('uses the Blueprint-authored questions when the chart has no native questions.yaml', async () => {
//     const dispatch = vi.fn((action: string) => {
//       if (action === 'catalog/load') return Promise.resolve();
//       if (action === 'catalog/getVersionInfo') return Promise.resolve({ values: {} });
//       return Promise.resolve();
//     });
//     const store = { getters: {}, dispatch };

//     const authoredQuestions = [{ variable: 'authored', label: 'Authored', type: 'string' }];
//     const component = makeComponent('1.0.0', { questions: authoredQuestions });

//     const wrapper = mount(BlueprintCustomizeStep, {
//       props: { components: [component], mode: 'install' },
//       global: { config: { globalProperties: { $store: store } as any } },
//     });
//     await flushPromises();

//     const valuesStep = wrapper.findComponent({ name: 'ValuesStep' });
//     expect(valuesStep.props('hasQuestions')).toBe(true);
//     expect(valuesStep.props('questionsSource').questions).toEqual({ questions: authoredQuestions });

//     wrapper.unmount();
//   });

//   it('native { questions: [...] } from the chart wins over an authored definition', async () => {
//     const nativeDocument = { questions: [{ variable: 'native', label: 'Native', type: 'string' }] };
//     const dispatch = vi.fn((action: string) => {
//       if (action === 'catalog/load') return Promise.resolve();
//       if (action === 'catalog/getVersionInfo') return Promise.resolve({ values: {}, questions: nativeDocument });
//       return Promise.resolve();
//     });
//     const store = { getters: {}, dispatch };

//     const component = makeComponent('1.0.0', { questions: [{ variable: 'authored', label: 'Authored', type: 'string' }] });

//     const wrapper = mount(BlueprintCustomizeStep, {
//       props: { components: [component], mode: 'install' },
//       global: { config: { globalProperties: { $store: store } as any } },
//     });
//     await flushPromises();

//     const valuesStep = wrapper.findComponent({ name: 'ValuesStep' });
//     expect(valuesStep.props('hasQuestions')).toBe(true);
//     expect(valuesStep.props('questionsSource').questions).toEqual(nativeDocument);

//     wrapper.unmount();
//   });
// });
