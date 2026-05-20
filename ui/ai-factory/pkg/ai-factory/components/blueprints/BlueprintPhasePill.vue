<template>
  <span :class="['phase-pill', `phase-pill--${ phaseClass }`]">
    {{ phase }}
  </span>
</template>

<script>
import { defineComponent, computed } from 'vue';

const PHASES = ['Active', 'Deprecated', 'Withdrawn'];

export default defineComponent({
  name: 'BlueprintPhasePill',

  props: {
    phase: {
      type:      String,
      required:  true,
      validator: (v) => PHASES.includes(v)
    }
  },

  setup(props) {
    const phaseClass = computed(() => props.phase.toLowerCase());

    return { phaseClass };
  }
});
</script>

<style lang="scss" scoped>
.phase-pill {
  display:        inline-block;
  padding:        2px 8px;
  border-radius:  12px;
  font-size:      0.85em;
  font-weight:    500;
  line-height:    1.4;
  border:         1px solid transparent;
}
.phase-pill--active {
  color:            var(--info);
  background-color: var(--info-banner-bg, rgba(36, 132, 199, 0.12));
  border-color:     var(--info);
}
.phase-pill--deprecated {
  color:            var(--warning);
  background-color: var(--warning-banner-bg, rgba(244, 161, 41, 0.12));
  border-color:     var(--warning);
}
.phase-pill--withdrawn {
  color:            var(--muted, #888);
  background-color: var(--disabled-bg, rgba(136, 136, 136, 0.12));
  border-color:     var(--muted, #888);
}
</style>
