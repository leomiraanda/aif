<template>
  <div class="step-content">
    <h2 class="step-title">{{ t('suseai.wizard.sections.configureApps', 'Configure Applications') }}</h2>
    <p class="text-muted mb-20">{{ t('suseai.wizard.sections.configureAppsDesc', 'Set default Helm values for each application in this blueprint.') }}</p>

    <div v-for="(comp, idx) in components" :key="comp.chartName" class="accordion-panel">
      <div
        class="accordion-header"
        @click="togglePanel(idx)"
      >
        <span class="panel-title">{{ comp.chartName }}</span>
        <span class="panel-meta text-muted">{{ comp.chartVersion }}</span>
        <i :class="['icon', expandedPanels.has(idx) ? 'icon-chevron-up' : 'icon-chevron-down']" />
      </div>

      <div v-if="expandedPanels.has(idx)" class="accordion-body">
        <Banner
          v-if="needsVersionReview(comp)"
          color="warning"
          data-testid="questions-version-review-banner"
          class="mb-20"
        >
          {{ t('suseai.wizard.questionsEditor.versionReviewBanner', 'This chart version changed — review your custom fields.') }}
        </Banner>

        <ValuesStep
          :key="`${comp.chartName}-${valuesKeys[comp.chartName] || 0}`"
          :values="compValues[comp.chartName] || {}"
          :chart-repo="comp.chartRepo"
          :chart-name="comp.chartName"
          :chart-version="comp.chartVersion"
          :loading-values="!!loadingMap[chartInfoKey(comp)]"
          :version-dirty="false"
          :has-questions="!!(resolvedInfoMap[chartInfoKey(comp)]?.questions)"
          :questions-source="resolvedInfoMap[chartInfoKey(comp)] || null"
          :questions-loading="!!questionsLoadingMap[chartInfoKey(comp)]"
          :ignore-variables="[]"
          :target-namespace="''"
          mode="install"
          :in-store="'cluster'"
          @update:values="onValuesUpdate(comp.chartName, $event)"
          @load-defaults="reloadDefaults(comp.chartName, comp.chartRepo, comp.chartVersion)"
          @values-edited="() => onValuesUpdate(comp.chartName, compValues[comp.chartName] || {})"
        />

        <div
          v-if="!loadingMap[chartInfoKey(comp)] && !hasNativeQuestions(versionInfoMap[chartInfoKey(comp)])"
          class="questions-authoring-affordance"
        >
          <button
            v-if="!authoringPanels.has(idx)"
            type="button"
            class="btn-build-questions-form"
            data-testid="build-questions-form"
            @click="openAuthoring(idx, comp)"
          >
            {{ comp.questions?.length
              ? t('suseai.wizard.questionsEditor.editFormAffordance', 'Edit configuration form')
              : t('suseai.wizard.questionsEditor.buildFormAffordance', '+ Build a configuration form') }}
          </button>

          <div v-else class="questions-authoring-panel" data-testid="questions-authoring-panel">
            <QuestionsAuthoringEditor
              :model-value="authoringQuestions[idx] || []"
              :preview-values="compValues[comp.chartName] || {}"
              @update:model-value="(v) => (authoringQuestions = { ...authoringQuestions, [idx]: v })"
            />
            <div class="questions-authoring-actions">
              <button
                type="button"
                class="btn-save-questions-form"
                data-testid="save-questions-form"
                :disabled="authoringHasIssues(idx)"
                @click="saveAuthoring(idx)"
              >
                {{ t('suseai.common.actions.save', 'Save') }}
              </button>
              <button
                type="button"
                class="btn-cancel-questions-form"
                data-testid="cancel-questions-form"
                @click="closeAuthoring(idx)"
              >
                {{ t('suseai.common.actions.cancel', 'Cancel') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {
  ref, computed, watch, onBeforeUnmount, getCurrentInstance,
} from 'vue';
import { useT } from '../../../composables/useT';
import yaml from 'js-yaml';
import { Banner } from '@components/Banner';
import ValuesStep from './ValuesStep.vue';
import QuestionsAuthoringEditor from './QuestionsAuthoringEditor.vue';
import { fetchChartDefaultValues } from '../../../services/rancher-apps';
import { hasNativeQuestions, resolveComponentQuestions } from '../../../utils/blueprint-questions-resolve';
import { fromStoredQuestions, toStoredQuestions, validateAuthoredQuestions } from '../../../utils/blueprint-questions-schema';
import type { AuthoredQuestion } from '../../../utils/blueprint-questions-schema';
import type { BlueprintComponent } from '../../../types/blueprint-types';

interface Props {
  components: BlueprintComponent[];
  authoredQuestionsVersion?: Record<string, string>;
}
interface Emits {
  (e: 'update:components', v: BlueprintComponent[]): void;
  (e: 'update:authoredQuestionsVersion', v: Record<string, string>): void;
  // True while any authoring editor holds changes that were not yet saved —
  // the wizard blocks leaving this step until they are saved or cancelled.
  (e: 'update:hasUnsavedQuestions', v: boolean): void;
}

const props = withDefaults(defineProps<Props>(), { authoredQuestionsVersion: () => ({}) });
const emit  = defineEmits<Emits>();

const vm    = getCurrentInstance()!.proxy as any;
const store = vm.$store;

const t = useT();

const expandedPanels    = ref(new Set<number>([0]));
const loadingMap        = ref<Record<string, boolean>>({});
const questionsLoadingMap = ref<Record<string, boolean>>({});
const versionInfoMap    = ref<Record<string, any>>({});
const valuesKeys        = ref<Record<string, number>>({});

// Tracks which panels (by index) currently show the QuestionsAuthoringEditor
// in place of the "Build a configuration form" affordance button, and the
// in-progress AuthoredQuestion[] each one is editing.
const authoringPanels    = ref(new Set<number>());
const authoringQuestions = ref<Record<number, AuthoredQuestion[]>>({});
// Serialized toStoredQuestions() of what each editor was seeded with, so
// "unsaved changes" compares like with like (a hand-edited CR whose show_if
// the parser can't read would otherwise look dirty the moment it opens).
const authoringBaseline  = ref<Record<number, string>>({});

const compValues = ref<Record<string, Record<string, any>>>(
  Object.fromEntries(props.components.map(c => [c.chartName, { ...(c.values || {}) }]))
);

// Chart-info (versionInfoMap/loadingMap/questionsLoadingMap) is cached per chart
// version, not just per chart name — otherwise bumping a component's chart
// version while its panel is already expanded would reuse the stale entry and
// never refetch.
function chartInfoKey(comp: { chartName: string; chartVersion: string }): string {
  return `${comp.chartName}@${comp.chartVersion}`;
}

// Applies the native/authored/fallback questions precedence (see
// blueprint-questions-resolve.ts) on top of the raw chart-info cached in
// versionInfoMap, so the cache itself always holds the untouched
// catalog/getVersionInfo response — needed to tell "chart shipped native
// questions" apart from "an author supplied them on the Blueprint CR".
//
// rawInfo.questions is the parsed questions.yaml *document* ({ questions: [...] }),
// and Questions reads source.questions.questions — resolveComponentQuestions
// returns that same document shape. Authored questions are deep-cloned
// because Questions annotates the question objects it renders (depth/group),
// which must never leak back into comp.questions and onto the CR.
const resolvedInfoMap = computed<Record<string, any>>(() => Object.fromEntries(props.components.map((comp) => {
  const key = chartInfoKey(comp);
  const rawInfo = versionInfoMap.value[key];

  if (!rawInfo) return [key, rawInfo];

  const authored = comp.questions?.length ? JSON.parse(JSON.stringify(comp.questions)) : undefined;

  return [key, {
    ...rawInfo,
    questions: resolveComponentQuestions(rawInfo.questions, authored, comp.chartName, rawInfo.values),
  }];
})));

function needsVersionReview(comp: BlueprintComponent): boolean {
  return !!comp.questions?.length && props.authoredQuestionsVersion[comp.chartName] !== comp.chartVersion;
}

// Load info for the first panel on mount. Any component whose authored form
// was written against a different chart version is also forced open — panel
// expanded and editor opened — so the review banner can't go unseen behind a
// collapsed panel.
props.components.forEach((comp, idx) => {
  if (idx !== 0 && !needsVersionReview(comp)) return;

  if (idx !== 0) {
    expandedPanels.value = new Set([...expandedPanels.value, idx]);
  }
  if (needsVersionReview(comp)) {
    openAuthoring(idx, comp);
  }
  loadChartInfo(comp.chartName, comp.chartRepo, comp.chartVersion);
});

function togglePanel(idx: number) {
  const next = new Set(expandedPanels.value);
  if (next.has(idx)) {
    next.delete(idx);
  } else {
    next.add(idx);
    const comp = props.components[idx];
    if (comp && !versionInfoMap.value[chartInfoKey(comp)]) {
      loadChartInfo(comp.chartName, comp.chartRepo, comp.chartVersion);
    }
  }
  expandedPanels.value = next;
}

async function loadChartInfo(chartName: string, chartRepo: string, chartVersion: string) {
  const key = chartInfoKey({ chartName, chartVersion });
  if (loadingMap.value[key]) return;

  loadingMap.value        = { ...loadingMap.value,        [key]: true };
  questionsLoadingMap.value = { ...questionsLoadingMap.value, [key]: true };

  try {
    await store.dispatch('catalog/load');
    const rawInfo = await store.dispatch('catalog/getVersionInfo', {
      repoType:    'cluster',
      repoName:    chartRepo,
      chartName,
      versionName: chartVersion,
    });
    versionInfoMap.value = { ...versionInfoMap.value, [key]: rawInfo };
    questionsLoadingMap.value = { ...questionsLoadingMap.value, [key]: false };

    // Populate initial values only if not already set.
    if (!Object.keys(compValues.value[chartName] || {}).length) {
      await applyDefaults(chartName, chartRepo, chartVersion, rawInfo);
    }
  } catch {
    questionsLoadingMap.value = { ...questionsLoadingMap.value, [key]: false };
  } finally {
    loadingMap.value = { ...loadingMap.value, [key]: false };
  }
}

// Called by the "Load defaults" button — always reloads values.
async function reloadDefaults(chartName: string, chartRepo: string, chartVersion: string) {
  const key = chartInfoKey({ chartName, chartVersion });
  if (loadingMap.value[key]) return;
  loadingMap.value = { ...loadingMap.value, [key]: true };
  try {
    const info = versionInfoMap.value[key];
    await applyDefaults(chartName, chartRepo, chartVersion, info);
  } finally {
    loadingMap.value = { ...loadingMap.value, [key]: false };
  }
}

async function applyDefaults(
  chartName: string,
  chartRepo: string,
  chartVersion: string,
  info: any,
) {
  let parsed: Record<string, any> = {};

  if (info?.values && Object.keys(info.values).length) {
    parsed = JSON.parse(JSON.stringify(info.values));
  } else {
    try {
      const raw = await fetchChartDefaultValues(store, 'local', chartRepo, chartName, chartVersion);
      if (raw?.trim()) {
        parsed = (yaml.load(raw) as Record<string, any>) || {};
      }
    } catch { /* leave empty */ }
  }

  if (Object.keys(parsed).length) {
    compValues.value = { ...compValues.value, [chartName]: parsed };
    valuesKeys.value = { ...valuesKeys.value, [chartName]: (valuesKeys.value[chartName] || 0) + 1 };
    emitComponents();
  }
}

function onValuesUpdate(chartName: string, newValues: Record<string, any>) {
  compValues.value = { ...compValues.value, [chartName]: newValues };
  emitComponents();
}

// Opens the authoring editor for panel `idx`, seeded with the component's
// currently-stored authored questions (empty when it has none yet).
function openAuthoring(idx: number, comp: BlueprintComponent) {
  const seeded = fromStoredQuestions(comp.questions || []);

  authoringQuestions.value = { ...authoringQuestions.value, [idx]: seeded };
  authoringBaseline.value = { ...authoringBaseline.value, [idx]: JSON.stringify(toStoredQuestions(seeded)) };
  const next = new Set(authoringPanels.value);
  next.add(idx);
  authoringPanels.value = next;
}

function closeAuthoring(idx: number) {
  const next = new Set(authoringPanels.value);
  next.delete(idx);
  authoringPanels.value = next;
}

// Serializes the in-progress AuthoredQuestion[] back to QuestionDef[] and
// emits it as that one component's `questions`, leaving every other field
// (values, targetNamespace, etc.) untouched. `undefined` — not `[]` — when
// the result is empty, matching the CRD's `omitempty` field.
function authoringHasIssues(idx: number): boolean {
  return validateAuthoredQuestions(authoringQuestions.value[idx] || []).length > 0;
}

const hasUnsavedQuestions = computed(() => [...authoringPanels.value].some((idx) => JSON.stringify(toStoredQuestions(authoringQuestions.value[idx] || [])) !== authoringBaseline.value[idx]
));

watch(hasUnsavedQuestions, (dirty) => emit('update:hasUnsavedQuestions', dirty), { immediate: true });
onBeforeUnmount(() => emit('update:hasUnsavedQuestions', false));

function saveAuthoring(idx: number) {
  // Never write a form that would corrupt deployed values (blank/duplicate
  // variables etc.) — the button is disabled too; this guards direct calls.
  if (authoringHasIssues(idx)) return;

  const stored = toStoredQuestions(authoringQuestions.value[idx] || []);
  const comp = props.components[idx];

  emit('update:components', props.components.map((c, i) => (i === idx
    ? { ...c, questions: stored.length ? stored : undefined }
    : c)));

  if (comp) {
    emit('update:authoredQuestionsVersion', { ...props.authoredQuestionsVersion, [comp.chartName]: comp.chartVersion });
  }

  closeAuthoring(idx);
}

function emitComponents() {
  emit('update:components', props.components.map(c => ({
    ...c,
    values: Object.keys(compValues.value[c.chartName] || {}).length > 0
      ? compValues.value[c.chartName]
      : undefined,
  })));
}
</script>

<style lang="scss" scoped>
.step-content { width: 100%; }
.step-title { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
.mb-20 { margin-bottom: 20px; }
.text-muted { color: var(--muted); font-size: 14px; }
.accordion-panel {
  border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px; overflow: hidden;
}
.accordion-header {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; cursor: pointer; background: var(--sortable-table-header-bg);
  &:hover { background: var(--hover-bg); }
}
.panel-title { font-weight: 600; font-size: 14px; flex: 1; }
.panel-meta  { font-size: 12px; color: var(--muted); }
.accordion-body { padding: 16px; }
.questions-authoring-affordance { margin-top: 16px; }
.btn-build-questions-form {
  background: none; border: none; cursor: pointer; color: var(--primary); font-size: 13px; padding: 0;
}
.questions-authoring-panel {
  border-top: 1px solid var(--border); margin-top: 16px; padding-top: 16px;
}
.questions-authoring-actions { display: flex; gap: 12px; margin-top: 12px; }
</style>
