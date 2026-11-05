<template>
  <div
    class="questions-authoring-editor"
    data-testid="questions-authoring-editor"
  >
    <Banner
      v-if="blockedDependents.length"
      color="warning"
      data-testid="blocked-delete-banner"
    >
      {{ blockedDeleteMessage }}
    </Banner>

    <Banner
      v-if="issueMessages.length"
      color="error"
      data-testid="questions-validation-banner"
    >
      <ul class="validation-issues">
        <li
          v-for="message in issueMessages"
          :key="message"
        >
          {{ message }}
        </li>
      </ul>
    </Banner>

    <div
      v-for="question in modelValue"
      :key="question.id"
      class="question-entry"
      data-testid="question-entry"
    >
      <QuestionNode
        :model-value="question"
        :available-fields="availableFields"
        @update:model-value="handleQuestionUpdate"
        @delete="handleDelete"
      />
    </div>

    <button
      type="button"
      class="btn role-tertiary add mb-20"
      data-testid="add-question"
      @click="addQuestion"
    >
      {{ t('suseai.wizard.questionsEditor.addQuestion', '+ Add question') }}
    </button>

    <div
      class="questions-preview"
      data-testid="questions-preview"
    >
      <h4>{{ t('suseai.wizard.questionsEditor.preview', 'Preview') }}</h4>
      <!-- tabbed="never": outside a <Tabbed> ancestor, Questions' default
           tabbed mode renders <Tab>s whose mount hook throws. -->
      <Questions
        :source="previewSource"
        :value="previewValuesLocal"
        tabbed="never"
        target-namespace=""
        mode="create"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import {
  computed, defineComponent, h, ref, watch,
} from 'vue';
import type { PropType } from 'vue';
import { Banner } from '@components/Banner';
import Questions from '@shell/components/Questions';
import QuestionRow from './QuestionRow.vue';
import ShowIfRuleBuilder from './ShowIfRuleBuilder.vue';
import { useT } from '../../../composables/useT';
import {
  canDeleteQuestion,
  createQuestionId,
  toStoredQuestions,
  validateAuthoredQuestions,
} from '../../../utils/blueprint-questions-schema';
import type { AuthoredQuestion, QuestionIssueKind, ShowIfExpression } from '../../../utils/blueprint-questions-schema';

interface Props {
  modelValue: AuthoredQuestion[];
  previewValues: Record<string, any>;
}
interface Emits { (e: 'update:modelValue', v: AuthoredQuestion[]): void }

const props = defineProps<Props>();
const emit  = defineEmits<Emits>();

const t = useT();

// Flattens the whole authored tree (recursively through subquestions) so a
// show_if/subquestions_if rule at any depth can reference any question in the
// tree — matching findQuestionById/findQuestionByVariable's own recursive
// search in blueprint-questions-schema.ts.
function flattenQuestions(questions: AuthoredQuestion[]): AuthoredQuestion[] {
  return questions.flatMap((question) => [question, ...(question.subquestions ? flattenQuestions(question.subquestions) : [])]);
}

// Removes a question by id from wherever it lives in the tree (top-level or
// nested under any ancestor's subquestions), since a 'delete' event bubbled up
// from a deeply nested QuestionNode only carries the target id, not its path.
function removeQuestionById(questions: AuthoredQuestion[], id: string): AuthoredQuestion[] {
  return questions
    .filter((question) => question.id !== id)
    .map((question) => (question.subquestions
      ? { ...question, subquestions: removeQuestionById(question.subquestions, id) }
      : question));
}

const availableFields = computed(() => flattenQuestions(props.modelValue));

// Questions reads `source.questions.questions` — the same nesting as a
// chart-info's parsed questions.yaml document — so wrap the array twice.
const previewSource = computed(() => ({ questions: { questions: toStoredQuestions(props.modelValue) } }));

// Questions writes into (and, when a field becomes hidden, deletes from) the
// `value` object it is handed. The preview must never touch the Blueprint's
// real default values, so it gets its own deep copy, refreshed only when the
// parent hands over a different values object.
function cloneValues(values: Record<string, any> | undefined): Record<string, any> {
  return JSON.parse(JSON.stringify(values || {}));
}

const previewValuesLocal = ref<Record<string, any>>(cloneValues(props.previewValues));

watch(() => props.previewValues, (values) => {
  previewValuesLocal.value = cloneValues(values);
}, { deep: true });

const ISSUE_MESSAGES: Record<QuestionIssueKind, [string, string]> = {
  emptyVariable:     ['suseai.wizard.questionsEditor.issues.emptyVariable', '{name}: variable is required'],
  duplicateVariable: ['suseai.wizard.questionsEditor.issues.duplicateVariable', '{name}: variable "{variable}" is used by more than one question'],
  emptyLabel:        ['suseai.wizard.questionsEditor.issues.emptyLabel', '{name}: label is required'],
  emptyOption:       ['suseai.wizard.questionsEditor.issues.emptyOption', '{name}: enum options cannot be blank'],
};

const issueMessages = computed(() => validateAuthoredQuestions(props.modelValue).map((issue) => {
  const [key, fallback] = ISSUE_MESSAGES[issue.kind];
  const name = issue.label.trim() || issue.variable.trim() || t('suseai.wizard.questionsEditor.untitledQuestion', 'Untitled question');

  return t(key, fallback, { name, variable: issue.variable });
}));

const blockedDependents = ref<AuthoredQuestion[]>([]);

const blockedDeleteMessage = computed(() => t(
  'suseai.wizard.questionsEditor.blockedDelete',
  'Cannot delete — still referenced by: {labels}',
  { labels: blockedDependents.value.map((dependent) => dependent.label).join(', ') },
));

function addQuestion() {
  const fresh: AuthoredQuestion = {
    id: createQuestionId(), variable: '', label: '', type: 'string',
  };

  emit('update:modelValue', [...props.modelValue, fresh]);
}

// A QuestionNode only ever knows about its own direct children, so an update
// to a top-level question (or a change bubbled up one level from its own
// subquestions) is applied here by matching on id among the top-level list.
function handleQuestionUpdate(updated: AuthoredQuestion) {
  emit('update:modelValue', props.modelValue.map((question) => (question.id === updated.id ? updated : question)));
}

// canDeleteQuestion is checked against the full top-level tree *before* any
// mutation — a positive match blocks the delete entirely and surfaces the
// dependents' labels instead of silently reparenting/dropping their show_if.
function handleDelete(id: string) {
  const { allowed, dependents } = canDeleteQuestion(props.modelValue, id);

  if (!allowed) {
    blockedDependents.value = dependents;
    return;
  }

  blockedDependents.value = [];
  emit('update:modelValue', removeQuestionById(props.modelValue, id));
}

// Renders one AuthoredQuestion: its QuestionRow fields, a ShowIfRuleBuilder for
// its own showIf, an "Add subquestion" affordance, and (once it has
// subquestions) a ShowIfRuleBuilder for subquestionsIf plus a recursive list of
// child QuestionNodes — one per subquestion, since AuthoredQuestion.subquestions
// itself nests arbitrarily deep (mirrored by canDeleteQuestion/findDependents).
// Kept as a render-function component local to this file (rather than a
// second .vue file) so QuestionsAuthoringEditor.vue stays the single
// deliverable the brief calls for; it only composes QuestionRow and
// ShowIfRuleBuilder, never reimplementing their editing logic.
const QuestionNode = defineComponent({
  name:  'QuestionNode',
  props: {
    modelValue:      { type: Object as PropType<AuthoredQuestion>, required: true },
    availableFields: { type: Array as PropType<AuthoredQuestion[]>, required: true },
  },
  emits: ['update:modelValue', 'delete'],
  setup(nodeProps, { emit: nodeEmit }) {
    const nodeT = useT();

    function update(patch: Partial<AuthoredQuestion>) {
      nodeEmit('update:modelValue', { ...nodeProps.modelValue, ...patch });
    }

    // A show_if referencing its own question would be a no-op the builder
    // can't usefully express — exclude self from its field choices. The
    // subquestions_if builder keeps self: "show my subquestions when I am
    // true" (e.g. `ingress.enabled=true`) is the canonical Rancher pattern.
    const showIfFieldOptions = computed(() => nodeProps.availableFields.filter((field) => field.id !== nodeProps.modelValue.id));

    function addSubquestion() {
      const fresh: AuthoredQuestion = {
        id: createQuestionId(), variable: '', label: '', type: 'string',
      };

      update({ subquestions: [...(nodeProps.modelValue.subquestions || []), fresh] });
    }

    // A subquestion's own update bubbles up one level at a time: this node
    // only needs to match it against its *direct* children.
    function handleSubUpdate(updatedSub: AuthoredQuestion) {
      const subquestions = (nodeProps.modelValue.subquestions || [])
        .map((sub) => (sub.id === updatedSub.id ? updatedSub : sub));

      update({ subquestions });
    }

    return () => {
      const question = nodeProps.modelValue;

      const children: ReturnType<typeof h>[] = [
        h(QuestionRow, {
          modelValue:            question,
          'onUpdate:modelValue': (value: AuthoredQuestion) => nodeEmit('update:modelValue', value),
        }),
        h('div', { class: 'show-if-section' }, [
          h('label', { class: 'section-label' }, nodeT('suseai.wizard.questionsEditor.showIf', 'Show if')),
          h(ShowIfRuleBuilder, {
            modelValue:            question.showIf,
            availableFields:       showIfFieldOptions.value,
            'onUpdate:modelValue': (value: ShowIfExpression | undefined) => update({ showIf: value }),
          }),
        ]),
        h('div', { class: 'question-node-actions' }, [
          h('button', {
            type: 'button',
            class: 'btn role-tertiary add',
            'data-testid': 'add-subquestion',
            onClick: addSubquestion,
          }, nodeT('suseai.wizard.questionsEditor.addSubquestion', '+ Add subquestion')),
          h('button', {
            type: 'button',
            class: 'btn role-link text-error',
            'data-testid': 'delete-question',
            'aria-label': nodeT('suseai.wizard.questionsEditor.deleteQuestion', 'Delete question'),
            onClick: () => nodeEmit('delete', question.id),
          }, nodeT('suseai.wizard.questionsEditor.deleteQuestion', 'Delete question')),
        ]),
      ];

      if (question.subquestions && question.subquestions.length > 0) {
        children.push(
          h('div', { class: 'subquestions-if-section' }, [
            h('label', { class: 'section-label' }, nodeT('suseai.wizard.questionsEditor.subquestionsIf', 'Show subquestions if')),
            h(ShowIfRuleBuilder, {
              modelValue:            question.subquestionsIf,
              availableFields:       nodeProps.availableFields,
              'data-testid':         'subquestions-if-builder',
              'onUpdate:modelValue': (value: ShowIfExpression | undefined) => update({ subquestionsIf: value }),
            }),
          ]),
          h('div', { class: 'subquestions-list' }, question.subquestions.map((sub) => h(QuestionNode, {
            key:                   sub.id,
            modelValue:            sub,
            availableFields:       nodeProps.availableFields,
            'onUpdate:modelValue': handleSubUpdate,
            // 'delete' bubbles untouched: only the top-level editor has the
            // full tree needed to run canDeleteQuestion/removeQuestionById.
            onDelete:              (id: string) => nodeEmit('delete', id),
            'data-testid':         'subquestion-entry',
          }))),
        );
      }

      return h('div', { class: 'question-node' }, children);
    };
  },
});
</script>

<style lang="scss" scoped>
.questions-authoring-editor {
  .question-entry {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 12px;
  }
  .validation-issues {
    margin: 0;
    padding-left: 18px;
  }
  .questions-preview {
    border-top: 1px solid var(--border);
    padding-top: 16px;
  }
}

:deep(.question-node) {
  .section-label {
    display: block;
    font-size: 12px;
    color: var(--muted);
    margin: 10px 0 6px;
  }
  .question-node-actions {
    display: flex;
    gap: 12px;
    margin-top: 10px;
  }
  .subquestions-list {
    margin-left: 20px;
    padding-left: 12px;
    border-left: 2px solid var(--border);
  }
}
</style>
