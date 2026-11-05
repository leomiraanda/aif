// // @vitest-environment jsdom
// import { describe, it, expect, vi } from 'vitest';
// import { mount } from '@vue/test-utils';
// import ShowIfRuleBuilder from '../ShowIfRuleBuilder.vue';
// import type { AuthoredQuestion, ShowIfExpression } from '../../../../utils/blueprint-questions-schema';

// // LabeledSelect pulls in vue-select's full tree, which is irrelevant to this
// // component's own logic — stub it with a plain native <select> that mirrors
// // the real component's :value / @update:value contract, same approach as
// // QuestionRow.test.ts.
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

// function makeFields(): AuthoredQuestion[] {
//   return [
//     { id: 'q-1', variable: 'enableTls', label: 'Enable TLS', type: 'boolean' },
//     { id: 'q-2', variable: 'replicaCount', label: 'Replica Count', type: 'int' },
//   ];
// }

// function mountBuilder(modelValue: ShowIfExpression | undefined, availableFields: AuthoredQuestion[] = makeFields()) {
//   return mount(ShowIfRuleBuilder, { props: { modelValue, availableFields } });
// }

// describe('ShowIfRuleBuilder', () => {
//   it('field dropdown only offers fields from availableFields', () => {
//     const modelValue: ShowIfExpression = {
//       combinator: '&&',
//       rules:      [{ fieldId: 'q-1', operator: '=', value: 'true' }],
//     };
//     const wrapper = mountBuilder(modelValue);

//     const fieldSelect = wrapper.get('[data-testid="show-if-field"]');
//     const options = fieldSelect.findAll('option');

//     expect(options.map((o) => o.element.value)).toEqual(['q-1', 'q-2']);
//     expect(options.map((o) => o.text())).toEqual(['Enable TLS', 'Replica Count']);
//   });

//   it('field dropdown falls back to the variable name for a field with no label yet', () => {
//     const modelValue: ShowIfExpression = {
//       combinator: '&&',
//       rules:      [{ fieldId: 'q-1', operator: '=', value: 'true' }],
//     };
//     const wrapper = mountBuilder(modelValue, [
//       { id: 'q-1', variable: 'enableTls', label: '', type: 'boolean' },
//     ]);

//     expect(wrapper.get('[data-testid="show-if-field"]').findAll('option').map((o) => o.text())).toEqual(['enableTls']);
//   });

//   it('adding a rule with no prior rules emits a single-rule expression with no combinator needed', async () => {
//     const wrapper = mountBuilder(undefined);

//     await wrapper.get('[data-testid="show-if-add-rule"]').trigger('click');

//     const emitted = wrapper.emitted('update:modelValue');
//     expect(emitted).toBeTruthy();
//     const payload = emitted![0][0] as ShowIfExpression;

//     expect(payload.rules).toHaveLength(1);
//     expect(payload.rules[0]).toMatchObject({ fieldId: 'q-1', operator: '=', value: '' });

//     // No combinator affordance needed with only one rule — ShowIfExpression
//     // still requires the field, so the emission carries an inert default.
//     expect(wrapper.find('[data-testid="show-if-combinator"]').exists()).toBe(false);
//   });

//   it('adding a second rule shows the combinator selector and emits it in the expression', async () => {
//     const modelValue: ShowIfExpression = {
//       combinator: '&&',
//       rules:      [{ fieldId: 'q-1', operator: '=', value: 'true' }],
//     };
//     const wrapper = mountBuilder(modelValue);

//     expect(wrapper.find('[data-testid="show-if-combinator"]').exists()).toBe(false);

//     await wrapper.get('[data-testid="show-if-add-rule"]').trigger('click');

//     const emitted = wrapper.emitted('update:modelValue');
//     expect(emitted).toBeTruthy();
//     const payload = emitted![emitted!.length - 1][0] as ShowIfExpression;

//     expect(payload.rules).toHaveLength(2);
//     expect(payload.combinator).toBe('&&');

//     await wrapper.setProps({ modelValue: payload });
//     expect(wrapper.find('[data-testid="show-if-combinator"]').exists()).toBe(true);

//     await wrapper.get('[data-testid="show-if-combinator"]').setValue('||');

//     const lastEmitted = wrapper.emitted('update:modelValue')!;
//     const lastPayload = lastEmitted[lastEmitted.length - 1][0] as ShowIfExpression;

//     expect(lastPayload.combinator).toBe('||');
//     expect(lastPayload.rules).toHaveLength(2);
//   });

//   it('clearing removes the expression entirely (emits undefined)', async () => {
//     const modelValue: ShowIfExpression = {
//       combinator: '&&',
//       rules:      [{ fieldId: 'q-1', operator: '=', value: 'true' }],
//     };
//     const wrapper = mountBuilder(modelValue);

//     await wrapper.get('[data-testid="show-if-clear"]').trigger('click');

//     const emitted = wrapper.emitted('update:modelValue');
//     expect(emitted).toBeTruthy();
//     const payload = emitted![emitted!.length - 1][0];

//     expect(payload).toBeUndefined();
//   });
// });
