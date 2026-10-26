<template>
  <div
    class="show-if-rule-builder"
    data-testid="show-if-rule-builder"
  >
    <div
      v-for="(rule, idx) in rules"
      :key="idx"
      class="row show-if-rule"
      data-testid="show-if-rule"
    >
      <div class="col span-4">
        <LabeledSelect
          :value="rule.fieldId"
          :label="t('suseai.wizard.showIf.field', 'Field')"
          :options="fieldOptions"
          data-testid="show-if-field"
          @update:value="onFieldChange(idx, $event)"
        />
      </div>
      <div class="col span-3">
        <LabeledSelect
          :value="rule.operator"
          :label="t('suseai.wizard.showIf.operator', 'Operator')"
          :options="OPERATOR_OPTIONS"
          data-testid="show-if-operator"
          @update:value="onOperatorChange(idx, $event)"
        />
      </div>
      <div class="col span-4">
        <LabeledInput
          :value="rule.value"
          :label="t('suseai.wizard.showIf.value', 'Value')"
          data-testid="show-if-value"
          @update:value="onValueChange(idx, $event)"
        />
      </div>
      <div class="col span-1 show-if-remove-col">
        <button
          type="button"
          class="btn-remove-rule"
          data-testid="show-if-remove-rule"
          :aria-label="t('suseai.wizard.showIf.removeRule', 'Remove condition')"
          @click="removeRule(idx)"
        >
          &#x2715;
        </button>
      </div>
    </div>

    <div
      v-if="rules.length >= 2"
      class="row mt-10"
      data-testid="show-if-combinator-row"
    >
      <div class="col span-4">
        <LabeledSelect
          :value="combinator"
          :label="t('suseai.wizard.showIf.combinator', 'Match')"
          :options="COMBINATOR_OPTIONS"
          data-testid="show-if-combinator"
          @update:value="onCombinatorChange"
        />
      </div>
    </div>

    <div class="row mt-10 show-if-actions">
      <button
        type="button"
        class="btn-add-rule"
        data-testid="show-if-add-rule"
        @click="addRule"
      >
        {{ t('suseai.wizard.showIf.addCondition', '+ Add condition') }}
      </button>
      <button
        v-if="rules.length > 0"
        type="button"
        class="btn-clear"
        data-testid="show-if-clear"
        @click="clear"
      >
        {{ t('suseai.wizard.showIf.clear', 'Clear') }}
      </button>
    </div>
  </div>
</template>

<script lang="ts">
// Human labels for the two fixed selects a show_if rule ever needs — not
// translated via t() (same approach as QUESTION_TYPE_OPTIONS in
// QuestionRow.vue), since these are terse symbolic/short labels rather than
// prose.
export const OPERATOR_OPTIONS: { label: string; value: '=' | '!=' }[] = [
  { label: '=', value: '=' },
  { label: '!=', value: '!=' },
];

export const COMBINATOR_OPTIONS: { label: string; value: '&&' | '||' }[] = [
  { label: 'AND', value: '&&' },
  { label: 'OR', value: '||' },
];
</script>

<script lang="ts" setup>
import { computed } from 'vue';
import { LabeledInput } from '@components/Form/LabeledInput';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { useT } from '../../../composables/useT';
import type { AuthoredQuestion, ShowIfExpression, ShowIfRule } from '../../../utils/blueprint-questions-schema';

interface Props { modelValue: ShowIfExpression | undefined; availableFields: AuthoredQuestion[] }
interface Emits { (e: 'update:modelValue', v: ShowIfExpression | undefined): void }

const props = defineProps<Props>();
const emit  = defineEmits<Emits>();

const t = useT();

// `ShowIfExpression.combinator` is a required field even while only one rule
// exists (the combinator is unused — and not rendered — until a second rule
// is added); default it to '&&' so a single-rule expression is always valid
// without surfacing the selector.
const rules      = computed(() => props.modelValue?.rules ?? []);
const combinator = computed(() => props.modelValue?.combinator ?? '&&');

// The GUI-level guard against dangling show_if references: the field <select>
// is only ever populated from availableFields, so there is no way to type an
// arbitrary field name into a rule.
// Falls back to the variable name so a not-yet-labelled field is still
// identifiable in the dropdown.
const fieldOptions = computed(() => props.availableFields.map((field) => ({ label: field.label || field.variable, value: field.id })));

function emitRules(newRules: ShowIfRule[]) {
  if (newRules.length === 0) {
    emit('update:modelValue', undefined);
    return;
  }
  emit('update:modelValue', { combinator: combinator.value, rules: newRules });
}

function addRule() {
  const fieldId = props.availableFields[0]?.id ?? '';
  const newRule: ShowIfRule = { fieldId, operator: '=', value: '' };

  emitRules([...rules.value, newRule]);
}

function removeRule(idx: number) {
  emitRules(rules.value.filter((_, i) => i !== idx));
}

function updateRule(idx: number, patch: Partial<ShowIfRule>) {
  emitRules(rules.value.map((rule, i) => (i === idx ? { ...rule, ...patch } : rule)));
}

function onFieldChange(idx: number, value: string) {
  updateRule(idx, { fieldId: value });
}

function onOperatorChange(idx: number, value: string) {
  updateRule(idx, { operator: value as '=' | '!=' });
}

function onValueChange(idx: number, value: string) {
  updateRule(idx, { value });
}

function onCombinatorChange(value: string) {
  emit('update:modelValue', { combinator: value as '&&' | '||', rules: rules.value });
}

function clear() {
  emit('update:modelValue', undefined);
}
</script>

<style lang="scss" scoped>
.show-if-rule-builder {
  .mt-10 {
    margin-top: 10px;
  }
  .show-if-rule {
    align-items: center;
    margin-bottom: 6px;
  }
  .show-if-remove-col {
    display: flex;
    align-items: center;
  }
  .btn-remove-rule {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--muted);
    font-size: 14px;
    &:hover {
      color: var(--error);
    }
  }
  .show-if-actions {
    display: flex;
    gap: 12px;
  }
  .btn-add-rule,
  .btn-clear {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--primary);
    font-size: 13px;
    padding: 0;
  }
}
</style>
