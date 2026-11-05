// // @vitest-environment jsdom
// import { describe, it, expect, vi } from 'vitest';
// import { mount } from '@vue/test-utils';
// import { Checkbox } from '@components/Form/Checkbox';
// import QuestionRow from '../QuestionRow.vue';
// import type { AuthoredQuestion } from '../../../../utils/blueprint-questions-schema';

// // LabeledSelect pulls in vue-select's full tree, which is irrelevant to this
// // component's own logic — stub it with a plain native <select> that mirrors
// // the real component's :value / @update:value contract, same approach as
// // Settings.test.ts.
// vi.mock('@shell/components/form/LabeledSelect', () => ({
//   default: {
//     name:  'LabeledSelect',
//     props: ['value', 'options', 'label'],
//     emits: ['update:value'],
//     template: `
//       <select :value="value" @change="$emit('update:value', $event.target.value)">
//         <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
//       </select>
//     `,
//   },
// }));

// function makeQuestion(overrides: Partial<AuthoredQuestion> = {}): AuthoredQuestion {
//   return {
//     id:       'q-1',
//     variable: 'myVar',
//     label:    'My Var',
//     type:     'string',
//     ...overrides,
//   };
// }

// function mountRow(modelValue: AuthoredQuestion) {
//   return mount(QuestionRow, { props: { modelValue } });
// }

// describe('QuestionRow', () => {
//   it('emits update:modelValue with the new variable when the variable input changes', async () => {
//     const question = makeQuestion();
//     const wrapper = mountRow(question);

//     await wrapper.get('[data-testid="question-variable"]').setValue('newVar');

//     const emitted = wrapper.emitted('update:modelValue');
//     expect(emitted).toBeTruthy();
//     const payload = emitted![emitted!.length - 1][0] as AuthoredQuestion;
//     expect(payload.variable).toBe('newVar');
//     // Everything else about the question is preserved.
//     expect(payload.id).toBe('q-1');
//     expect(payload.label).toBe('My Var');
//   });

//   it('shows a boolean default as a checkbox and emits a boolean value', async () => {
//     const question = makeQuestion({ type: 'boolean', default: false });
//     const wrapper = mountRow(question);

//     // No number/text default input for a boolean question.
//     expect(wrapper.find('[data-testid="question-default-number"]').exists()).toBe(false);
//     expect(wrapper.find('[data-testid="question-default-text"]').exists()).toBe(false);

//     const checkbox = wrapper.findComponent(Checkbox);
//     expect(checkbox.exists()).toBe(true);

//     checkbox.vm.$emit('update:value', true);
//     await wrapper.vm.$nextTick();

//     const emitted = wrapper.emitted('update:modelValue');
//     const payload = emitted![emitted!.length - 1][0] as AuthoredQuestion;
//     expect(payload.default).toBe(true);
//   });

//   it('shows the options list editor only when type is enum', async () => {
//     const stringQuestion = makeQuestion({ type: 'string' });
//     const stringWrapper = mountRow(stringQuestion);
//     expect(stringWrapper.find('[data-testid="question-enum-options"]').exists()).toBe(false);

//     const enumQuestion = makeQuestion({ type: 'enum', options: ['a', 'b'] });
//     const enumWrapper = mountRow(enumQuestion);
//     expect(enumWrapper.find('[data-testid="question-enum-options"]').exists()).toBe(true);
//   });

//   it('adding an option to an enum question appends to modelValue.options', async () => {
//     const question = makeQuestion({ type: 'enum', options: ['a', 'b'] });
//     const wrapper = mountRow(question);

//     await wrapper.get('[data-testid="question-option-add"]').trigger('click');

//     const emitted = wrapper.emitted('update:modelValue');
//     expect(emitted).toBeTruthy();
//     const payload = emitted![emitted!.length - 1][0] as AuthoredQuestion;
//     expect(payload.options).toEqual(['a', 'b', '']);
//   });
// });
