// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import BlueprintCreateWizard from '../BlueprintCreateWizard.vue';

// Only the step-2 navigation guard is under test — stub every step.
vi.mock('../wizard/BlueprintBasicInfoStep.vue', () => ({ default: { name: 'BlueprintBasicInfoStep', template: '<div />' } }));
vi.mock('../wizard/BlueprintAppSelectorStep.vue', () => ({ default: { name: 'BlueprintAppSelectorStep', template: '<div />' } }));
vi.mock('../wizard/BlueprintReviewCreateStep.vue', () => ({ __esModule: true, default: { name: 'BlueprintReviewCreateStep', template: '<div class="review-step-stub" />' } }));
vi.mock('../wizard/BlueprintConfigStep.vue', () => ({
  __esModule: true,
  default: {
    name:     'BlueprintConfigStep',
    props:    ['components', 'authoredQuestionsVersion'],
    emits:    ['update:components', 'update:authoredQuestionsVersion', 'update:hasUnsavedQuestions'],
    template: '<div class="config-step-stub" />',
  },
}));

function mountWizard() {
  return mount(BlueprintCreateWizard, {
    props: {
      prefill: {
        displayName: 'BP',
        version:     '1.0.0',
        components:  [{ chartRepo: 'repo-a', chartName: 'chart-a', chartVersion: '1.0.0' }],
      },
    },
    global: {
      config: {
        globalProperties: {
          $store: { getters: {}, dispatch: vi.fn() }, $router: { push: vi.fn() }, $route: { params: {} },
        } as any,
      },
    },
  });
}

function buttonByText(wrapper: ReturnType<typeof mountWizard>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().trim() === text)!;
}

describe('BlueprintCreateWizard - unsaved configuration form guard', () => {
  it('blocks leaving the Configuration step while it reports unsaved questions, and allows it after', async () => {
    const wrapper = mountWizard();

    await wrapper.findAll('.step-item')[2].trigger('click');
    await flushPromises();
    const configStep = wrapper.findComponent({ name: 'BlueprintConfigStep' });
    expect(configStep.exists()).toBe(true);

    await configStep.vm.$emit('update:hasUnsavedQuestions', true);

    expect(wrapper.find('[data-testid="unsaved-questions-banner"]').exists()).toBe(true);
    expect((buttonByText(wrapper, 'Next').element as HTMLButtonElement).disabled).toBe(true);
    expect((buttonByText(wrapper, 'Previous').element as HTMLButtonElement).disabled).toBe(true);

    // Step-header navigation is blocked too, in both directions.
    await wrapper.findAll('.step-item')[3].trigger('click');
    await wrapper.findAll('.step-item')[0].trigger('click');
    await flushPromises();
    expect(wrapper.findComponent({ name: 'BlueprintConfigStep' }).exists()).toBe(true);

    await wrapper.findComponent({ name: 'BlueprintConfigStep' }).vm.$emit('update:hasUnsavedQuestions', false);
    expect(wrapper.find('[data-testid="unsaved-questions-banner"]').exists()).toBe(false);

    await buttonByText(wrapper, 'Next').trigger('click');
    await flushPromises();
    expect(wrapper.find('.review-step-stub').exists()).toBe(true);

    wrapper.unmount();
  });
});
