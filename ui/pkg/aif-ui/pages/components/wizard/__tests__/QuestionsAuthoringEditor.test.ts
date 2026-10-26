// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import QuestionsAuthoringEditor from '../QuestionsAuthoringEditor.vue';
import { toStoredQuestions } from '../../../../utils/blueprint-questions-schema';
import type { AuthoredQuestion } from '../../../../utils/blueprint-questions-schema';

// LabeledSelect pulls in vue-select's full tree, which is irrelevant to this
// component's own logic — stub it with a plain native <select> that mirrors
// the real component's :value / @update:value contract, same approach as
// QuestionRow.test.ts / ShowIfRuleBuilder.test.ts (both mounted here via
// QuestionRow / ShowIfRuleBuilder, which this editor composes).
vi.mock('@shell/components/form/LabeledSelect', () => ({
  default: {
    name:  'LabeledSelect',
    props: ['value', 'options', 'label'],
    emits: ['update:value'],
    template: `
      <select :value="value" @change="$emit('update:value', $event.target.value)">
        <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
    `,
  },
}));

// The real @shell/components/Questions pulls in Jexl, Vuex store getters and
// the full knownTypes widget tree — none of which this test cares about. It
// only needs to assert what props the editor hands to the preview, so stub it
// with a component that records its props via a plain div.
vi.mock('@shell/components/Questions', () => ({
  default: {
    name:  'Questions',
    props: ['source', 'value', 'mode'],
    template: '<div data-testid="questions-preview-stub" />',
  },
}));

function makeQuestion(overrides: Partial<AuthoredQuestion> = {}): AuthoredQuestion {
  return {
    id:       'q-1',
    variable: 'myVar',
    label:    'My Var',
    type:     'string',
    ...overrides,
  };
}

function mountEditor(modelValue: AuthoredQuestion[], previewValues: Record<string, any> = {}) {
  return mount(QuestionsAuthoringEditor, { props: { modelValue, previewValues } });
}

describe('QuestionsAuthoringEditor', () => {
  it('adding a question appends one with a fresh id and default type string', async () => {
    const wrapper = mountEditor([]);

    await wrapper.get('[data-testid="add-question"]').trigger('click');

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    const payload = emitted![0][0] as AuthoredQuestion[];

    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ variable: '', label: '', type: 'string' });
    expect(payload[0].id).toBeTruthy();
  });

  it('deleting an unreferenced question removes it from modelValue', async () => {
    const questions = [
      makeQuestion({ id: 'q-1', variable: 'first', label: 'First' }),
      makeQuestion({ id: 'q-2', variable: 'second', label: 'Second' }),
    ];
    const wrapper = mountEditor(questions);

    const deleteButtons = wrapper.findAll('[data-testid="delete-question"]');
    expect(deleteButtons).toHaveLength(2);

    await deleteButtons[0].trigger('click');

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    const payload = emitted![0][0] as AuthoredQuestion[];

    expect(payload.map((q) => q.id)).toEqual(['q-2']);
    expect(wrapper.find('[data-testid="blocked-delete-banner"]').exists()).toBe(false);
  });

  it('deleting a question referenced by another question\'s show_if is blocked and names the dependent', async () => {
    const target = makeQuestion({
      id: 'q-1', variable: 'enableTls', label: 'Enable TLS', type: 'boolean',
    });
    const dependent = makeQuestion({
      id:      'q-2',
      variable: 'certPath',
      label:   'Certificate Path',
      showIf:  { combinator: '&&', rules: [{ fieldId: 'q-1', operator: '=', value: 'true' }] },
    });
    const wrapper = mountEditor([target, dependent]);

    const deleteButtons = wrapper.findAll('[data-testid="delete-question"]');
    await deleteButtons[0].trigger('click');

    // Blocked: no mutation emitted.
    expect(wrapper.emitted('update:modelValue')).toBeFalsy();

    const banner = wrapper.get('[data-testid="blocked-delete-banner"]');
    expect(banner.text()).toContain('Certificate Path');
  });

  it('the live preview receives toStoredQuestions(modelValue) as its source', () => {
    const questions = [
      makeQuestion({ id: 'q-1', variable: 'enableTls', label: 'Enable TLS', type: 'boolean' }),
    ];
    const wrapper = mountEditor(questions, { enableTls: true });

    const preview = wrapper.findComponent({ name: 'Questions' });
    expect(preview.exists()).toBe(true);
    expect(preview.props('source')).toEqual({ questions: toStoredQuestions(questions) });
    expect(preview.props('value')).toEqual({ enableTls: true });
  });
});
