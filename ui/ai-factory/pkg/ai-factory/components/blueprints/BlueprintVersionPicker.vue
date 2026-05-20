<template>
  <LabeledSelect
    :value="modelValue"
    :options="options"
    :label="t('aif.pages.blueprints.card.version')"
    :clearable="false"
    :disabled="!options.length"
    class="version-picker"
    @update:value="$emit('update:modelValue', $event)"
  />
</template>

<script>
import { defineComponent, computed } from 'vue';
import LabeledSelect from '@shell/components/form/LabeledSelect';

export default defineComponent({
  name: 'BlueprintVersionPicker',

  components: { LabeledSelect },

  props: {
    versions: {
      type:     Array,
      required: true
    },
    modelValue: {
      type:     String,
      required: true
    },
    showWithdrawn: {
      type:    Boolean,
      default: false
    }
  },

  emits: ['update:modelValue'],

  setup(props) {
    const options = computed(() =>
      (props.versions ?? [])
        .filter((v) => props.showWithdrawn || v.phase !== 'Withdrawn')
        .map((v) => ({
          label: `v${ v.version } — ${ v.phase }`,
          value: v.id
        }))
    );

    return { options };
  }
});
</script>

<style lang="scss" scoped>
.version-picker {
  min-width: 200px;
}
</style>
