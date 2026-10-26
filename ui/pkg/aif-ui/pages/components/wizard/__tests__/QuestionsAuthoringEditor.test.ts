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
    props: ['source', 'value', 'mode', 'tabbed', 'targetNamespace'],
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

  it('the live preview receives toStoredQuestions(modelValue) nested as source.questions.questions, untabbed', () => {
    const questions = [
      makeQuestion({ id: 'q-1', variable: 'enableTls', label: 'Enable TLS', type: 'boolean' }),
    ];
    const wrapper = mountEditor(questions, { enableTls: true });

    const preview = wrapper.findComponent({ name: 'Questions' });
    expect(preview.exists()).toBe(true);
    // Questions reads source.questions.questions (the chart-info shape).
    expect(preview.props('source')).toEqual({ questions: { questions: toStoredQuestions(questions) } });
    expect(preview.props('value')).toEqual({ enableTls: true });
    // No <Tabbed> ancestor here, so tabbed mode would throw on mount.
    expect(preview.props('tabbed')).toBe('never');
    expect(preview.props('targetNamespace')).toBe('');
  });

  it('the live preview edits a private copy of previewValues, never the caller\'s object', async () => {
    const previewValues = { enableTls: true, nested: { a: 1 } };
    const wrapper = mountEditor([makeQuestion()], previewValues);

    const preview = wrapper.findComponent({ name: 'Questions' });
    const value = preview.props('value') as Record<string, any>;
    expect(value).not.toBe(previewValues);
    expect(value.nested).not.toBe(previewValues.nested);

    // Simulate what Questions.update()/shownQuestions do to its value prop.
    value.enableTls = false;
    delete value.nested;
    expect(previewValues).toEqual({ enableTls: true, nested: { a: 1 } });

    // A new values object from the parent refreshes the copy.
    await wrapper.setProps({ previewValues: { enableTls: false } });
    expect(wrapper.findComponent({ name: 'Questions' }).props('value')).toEqual({ enableTls: false });
  });

  it('deleting a parent is blocked when a subquestion in its subtree is referenced from outside', async () => {
    const child = makeQuestion({ id: 'q-c', variable: 'cVar', label: 'C Label' });
    const parent = makeQuestion({
      id: 'q-a', variable: 'aVar', label: 'A Label', subquestions: [child],
    });
    const dependent = makeQuestion({
      id:      'q-d',
      variable: 'dVar',
      label:   'Dependent Label',
      showIf:  { combinator: '&&', rules: [{ fieldId: 'q-c', operator: '=', value: 'x' }] },
    });
    const wrapper = mountEditor([parent, dependent]);

    // DOM order: A, C (nested), D — index 0 is the parent A.
    await wrapper.findAll('[data-testid="delete-question"]')[0].trigger('click');

    expect(wrapper.emitted('update:modelValue')).toBeFalsy();
    expect(wrapper.get('[data-testid="blocked-delete-banner"]').text()).toContain('Dependent Label');
  });

  it('deleting a question whose subquestions_if references itself is allowed', async () => {
    const parent = makeQuestion({
      id:             'q-a',
      variable:       'ingress.enabled',
      label:          'Ingress',
      type:           'boolean',
      subquestionsIf: { combinator: '&&', rules: [{ fieldId: 'q-a', operator: '=', value: 'true' }] },
      subquestions:   [makeQuestion({ id: 'q-b', variable: 'ingress.host', label: 'Host' })],
    });
    const wrapper = mountEditor([parent]);

    await wrapper.findAll('[data-testid="delete-question"]')[0].trigger('click');

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual([]);
  });

  it('the "show subquestions if" builder offers the parent question itself; the "show if" builder does not', () => {
    const parent = makeQuestion({
      id: 'q-a', variable: 'ingress.enabled', label: 'Ingress', type: 'boolean',
      subquestions: [makeQuestion({ id: 'q-b', variable: 'ingress.host', label: 'Host' })],
    });
    const wrapper = mountEditor([parent]);

    const builders = wrapper.findAllComponents({ name: 'ShowIfRuleBuilder' });
    // Order: A's show_if, A's subquestions_if, B's show_if.
    const subquestionsIfBuilder = builders.find((b) => b.attributes('data-testid') === 'subquestions-if-builder');
    expect(subquestionsIfBuilder).toBeTruthy();
    expect((subquestionsIfBuilder!.props('availableFields') as AuthoredQuestion[]).map((f) => f.id)).toContain('q-a');
    expect((builders[0].props('availableFields') as AuthoredQuestion[]).map((f) => f.id)).not.toContain('q-a');
  });

  it('lists validation issues for blank and duplicate variables', () => {
    const wrapper = mountEditor([
      makeQuestion({ id: 'q-1', variable: '', label: 'Blank Var' }),
      makeQuestion({ id: 'q-2', variable: 'dup', label: 'Dup One' }),
      makeQuestion({ id: 'q-3', variable: 'dup', label: 'Dup Two' }),
    ]);

    const banner = wrapper.get('[data-testid="questions-validation-banner"]');
    expect(banner.text()).toContain('Blank Var: variable is required');
    expect(banner.text()).toContain('Dup One: variable "dup" is used by more than one question');
    expect(banner.text()).toContain('Dup Two');
  });

  it('shows no validation banner for a well-formed form', () => {
    const wrapper = mountEditor([makeQuestion()]);

    expect(wrapper.find('[data-testid="questions-validation-banner"]').exists()).toBe(false);
  });

  // A -> subquestions: [B] -> subquestions: [C]. Depth-2 nesting exercises the
  // bubbling chain two levels deep: QuestionNode(C)'s own update:modelValue is
  // first absorbed by QuestionNode(B) (replacing C among B's direct
  // subquestions), whose own resulting update:modelValue is then absorbed by
  // QuestionNode(A) (replacing B among A's direct subquestions), whose update
  // finally reaches the top-level editor (replacing A in the top-level list).
  function makeNestedTree() {
    const c = makeQuestion({
      id: 'q-c', variable: 'cVar', label: 'C Label', type: 'string',
    });
    const b = makeQuestion({
      id: 'q-b', variable: 'bVar', label: 'B Label', type: 'string', subquestions: [c],
    });
    const a = makeQuestion({
      id: 'q-a', variable: 'aVar', label: 'A Label', type: 'string', subquestions: [b],
    });

    return { a, b, c };
  }

  it('editing a depth-2 subquestion field bubbles up to the top-level modelValue', async () => {
    const { a } = makeNestedTree();
    const wrapper = mountEditor([a]);

    // DOM order of QuestionRow instances is depth-first: A, then B (nested
    // under A), then C (nested under B) — so index 2 is C's.
    const variableInputs = wrapper.findAll('[data-testid="question-variable"]');
    expect(variableInputs).toHaveLength(3);

    await variableInputs[2].setValue('cVarRenamed');

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    const payload = emitted![emitted!.length - 1][0] as AuthoredQuestion[];

    const updatedA = payload[0];
    const updatedB = updatedA.subquestions![0];
    const updatedC = updatedB.subquestions![0];

    expect(updatedA.id).toBe('q-a');
    expect(updatedB.id).toBe('q-b');
    expect(updatedC.id).toBe('q-c');
    expect(updatedC.variable).toBe('cVarRenamed');
    // Everything else about C is preserved by the bubbling chain.
    expect(updatedC.label).toBe('C Label');
  });

  it('deleting a depth-2 grandchild referenced by another question\'s show_if is blocked and names the dependent', async () => {
    const { a } = makeNestedTree();
    const dependent = makeQuestion({
      id:      'q-d',
      variable: 'dVar',
      label:   'Dependent Label',
      showIf:  { combinator: '&&', rules: [{ fieldId: 'q-c', operator: '=', value: 'x' }] },
    });
    const wrapper = mountEditor([a, dependent]);

    // DOM order of delete buttons is depth-first: A, B, C, then D (the next
    // top-level entry) — so index 2 is C's (the grandchild).
    const deleteButtons = wrapper.findAll('[data-testid="delete-question"]');
    expect(deleteButtons).toHaveLength(4);

    await deleteButtons[2].trigger('click');

    // Blocked: no mutation emitted.
    expect(wrapper.emitted('update:modelValue')).toBeFalsy();

    const banner = wrapper.get('[data-testid="blocked-delete-banner"]');
    expect(banner.text()).toContain('Dependent Label');
  });
});
