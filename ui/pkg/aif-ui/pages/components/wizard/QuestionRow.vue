<template>
  <div class="question-row">
    <div class="row">
      <div class="col span-4">
        <LabeledInput
          :value="modelValue.variable"
          :label="t('suseai.wizard.questionRow.variable', 'Variable')"
          data-testid="question-variable"
          @update:value="onVariableChange"
        />
      </div>
      <div class="col span-4">
        <LabeledInput
          :value="modelValue.label"
          :label="t('suseai.wizard.questionRow.label', 'Label')"
          data-testid="question-label"
          @update:value="onLabelChange"
        />
      </div>
      <div class="col span-4">
        <LabeledSelect
          :value="modelValue.type"
          :label="t('suseai.wizard.questionRow.type', 'Type')"
          :options="QUESTION_TYPE_OPTIONS"
          data-testid="question-type"
          @update:value="onTypeChange"
        />
      </div>
    </div>

    <div class="row mt-10">
      <div class="col span-6">
        <LabeledInput
          :value="modelValue.description || ''"
          :label="t('suseai.wizard.questionRow.description', 'Description')"
          data-testid="question-description"
          @update:value="onDescriptionChange"
        />
      </div>
      <div class="col span-6">
        <LabeledInput
          :value="modelValue.group || ''"
          :label="t('suseai.wizard.questionRow.group', 'Group')"
          data-testid="question-group"
          @update:value="onGroupChange"
        />
      </div>
    </div>

    <div class="row mt-10">
      <div class="col span-6">
        <Checkbox
          v-if="modelValue.type === 'boolean'"
          :value="!!modelValue.default"
          :label="t('suseai.wizard.questionRow.default', 'Default value')"
          data-testid="question-default-boolean"
          @update:value="onDefaultChange"
        />
        <LabeledInput
          v-else-if="modelValue.type === 'int' || modelValue.type === 'float'"
          type="number"
          :value="numericDefaultText"
          :label="t('suseai.wizard.questionRow.default', 'Default value')"
          data-testid="question-default-number"
          @update:value="onNumericDefaultChange"
        />
        <LabeledInput
          v-else
          :value="modelValue.default ?? ''"
          :label="t('suseai.wizard.questionRow.default', 'Default value')"
          data-testid="question-default-text"
          @update:value="onDefaultChange"
        />
      </div>
    </div>

    <div
      v-if="modelValue.type === 'enum'"
      class="enum-options mt-10"
      data-testid="question-enum-options"
    >
      <label class="enum-options-label">{{ t('suseai.wizard.questionRow.options', 'Options') }}</label>
      <div
        v-for="(option, idx) in modelValue.options || []"
        :key="idx"
        class="row enum-option-row"
      >
        <div class="col span-10">
          <LabeledInput
            :value="option"
            data-testid="question-option-input"
            @update:value="onOptionChange(idx, $event)"
          />
        </div>
        <div class="col span-2">
          <button
            type="button"
            class="btn-remove-option"
            data-testid="question-option-remove"
            :aria-label="t('suseai.wizard.questionRow.removeOption', 'Remove option')"
            @click="removeOption(idx)"
          >
            &#x2715;
          </button>
        </div>
      </div>
      <button
        type="button"
        class="btn-add-option"
        data-testid="question-option-add"
        @click="addOption"
      >
        {{ t('suseai.wizard.questionRow.addOption', '+ Add option') }}
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import type { QuestionType } from '../../../utils/blueprint-questions-schema';

// Human labels for the v1 QuestionType union, exported alongside QuestionRow
// so the type <select> and any other authoring UI can share one source of truth.
export const QUESTION_TYPE_OPTIONS: { label: string; value: QuestionType }[] = [
  { label: 'String', value: 'string' },
  { label: 'Multi-line string', value: 'multiline' },
  { label: 'Password', value: 'password' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Integer', value: 'int' },
  { label: 'Float', value: 'float' },
  { label: 'Enum', value: 'enum' },
  { label: 'Storage class', value: 'storageclass' },
  { label: 'Secret', value: 'secret' },
  { label: 'ConfigMap', value: 'configmap' },
  { label: 'YAML', value: 'yaml' },
];
</script>

<script lang="ts" setup>
import { computed } from 'vue';
import { LabeledInput } from '@components/Form/LabeledInput';
import { Checkbox } from '@components/Form/Checkbox';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { useT } from '../../../composables/useT';
import type { AuthoredQuestion } from '../../../utils/blueprint-questions-schema';

interface Props { modelValue: AuthoredQuestion }
interface Emits { (e: 'update:modelValue', v: AuthoredQuestion): void }

const props = defineProps<Props>();
const emit  = defineEmits<Emits>();

const t = useT();

function update(patch: Partial<AuthoredQuestion>) {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

function onVariableChange(value: string) {
  update({ variable: value });
}

function onLabelChange(value: string) {
  update({ label: value });
}

function onTypeChange(value: string) {
  update({ type: value as QuestionType });
}

function onDescriptionChange(value: string) {
  update({ description: value });
}

function onGroupChange(value: string) {
  update({ group: value });
}

function onDefaultChange(value: unknown) {
  update({ default: value });
}

// LabeledInput always emits the native input's string value, even for
// type="number" — convert to a real number (falling back to the raw string
// for a value the user hasn't finished typing, e.g. "-") before storing it.
const numericDefaultText = computed(() => {
  const value = props.modelValue.default;
  return value === undefined || value === null ? '' : String(value);
});

function onNumericDefaultChange(value: string) {
  if (value === '') {
    update({ default: undefined });
    return;
  }
  const parsed = Number(value);
  update({ default: Number.isNaN(parsed) ? value : parsed });
}

function onOptionChange(idx: number, value: string) {
  const options = [...(props.modelValue.options || [])];
  options[idx] = value;
  update({ options });
}

function addOption() {
  update({ options: [...(props.modelValue.options || []), ''] });
}

function removeOption(idx: number) {
  update({ options: (props.modelValue.options || []).filter((_, i) => i !== idx) });
}
</script>

<style lang="scss" scoped>
.question-row {
  padding: 12px 0;
}
.mt-10 {
  margin-top: 10px;
}
.enum-options {
  .enum-options-label {
    display: block;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .enum-option-row {
    align-items: center;
    margin-bottom: 6px;
  }
  .btn-remove-option {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--muted);
    font-size: 14px;
    &:hover {
      color: var(--error);
    }
  }
  .btn-add-option {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--primary);
    font-size: 13px;
    padding: 0;
  }
}
</style>
