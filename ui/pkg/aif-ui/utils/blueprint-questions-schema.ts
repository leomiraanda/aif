// Question authoring schema: the stored (CR-facing) QuestionDef shape that
// @shell/components/Questions consumes, plus the richer AuthoredQuestion shape
// used only in-memory while a Blueprint author is building a form in the GUI.
//
// AuthoredQuestion carries a stable `id` per question so that `show_if`
// references survive a field being renamed (the stored show_if string embeds
// the *current* variable name, resolved at save time), and structured
// conditionals (ShowIfExpression) instead of a raw string, so the GUI can
// build/edit them without string-parsing.

// The v1 widget subset (a subset of Rancher's full `knownTypes`; more types
// can be added to this union later with no architectural change).
export type QuestionType =
  | 'string'
  | 'multiline'
  | 'password'
  | 'boolean'
  | 'int'
  | 'float'
  | 'enum'
  | 'storageclass'
  | 'secret'
  | 'configmap'
  | 'yaml';

// Standard Helm questions.yaml shape (the subset @shell/components/Questions reads).
export interface QuestionDef {
  variable:         string;
  label:            string;
  type:             string;
  default?:         any;
  description?:     string;
  group?:           string;
  show_if?:         string;
  options?:         string[];
  subquestions?:    QuestionDef[];
  subquestions_if?: string;
}

export interface ShowIfRule {
  fieldId:  string;
  operator: '=' | '!=';
  value:    string;
}

export interface ShowIfExpression {
  combinator: '&&' | '||';
  rules:      ShowIfRule[];
}

// Authoring-session shape: a stable `id` (so show_if references survive a
// field being renamed) and structured conditionals instead of a raw string.
export interface AuthoredQuestion {
  id:              string;
  variable:        string;
  label:           string;
  type:            QuestionType;
  default?:        any;
  description?:    string;
  group?:          string;
  options?:        string[];
  showIf?:         ShowIfExpression;
  subquestions?:   AuthoredQuestion[];
  subquestionsIf?: ShowIfExpression;
}

export function createQuestionId(): string {
  return crypto.randomUUID();
}

function findQuestionById(questions: AuthoredQuestion[], id: string): AuthoredQuestion | undefined {
  for (const question of questions) {
    if (question.id === id) {
      return question;
    }
    if (question.subquestions) {
      const found = findQuestionById(question.subquestions, id);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function findQuestionByVariable(questions: AuthoredQuestion[], variable: string): AuthoredQuestion | undefined {
  for (const question of questions) {
    if (question.variable === variable) {
      return question;
    }
    if (question.subquestions) {
      const found = findQuestionByVariable(question.subquestions, variable);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

// Resolves each rule's fieldId to that question's current variable among
// `questions` (searched recursively through subquestions), joining the
// resulting clauses with the expression's combinator. A rule whose fieldId no
// longer resolves to a known question is dropped defensively (mirrors
// parseShowIf's handling of unknown variables). Returns undefined for an
// undefined/empty expression, or one where every rule was dropped.
export function serializeShowIf(
  expr: ShowIfExpression | undefined,
  questions: AuthoredQuestion[],
): string | undefined {
  if (!expr || expr.rules.length === 0) {
    return undefined;
  }

  const clauses = expr.rules
    .map((rule) => {
      const question = findQuestionById(questions, rule.fieldId);
      return question ? `${ question.variable }${ rule.operator }${ rule.value }` : undefined;
    })
    .filter((clause): clause is string => clause !== undefined);

  if (clauses.length === 0) {
    return undefined;
  }

  return clauses.join(expr.combinator);
}

function splitClauses(showIf: string): { combinator: '&&' | '||'; clauses: string[] } {
  if (showIf.includes('&&')) {
    return { combinator: '&&', clauses: showIf.split('&&') };
  }
  if (showIf.includes('||')) {
    return { combinator: '||', clauses: showIf.split('||') };
  }
  return { combinator: '&&', clauses: [showIf] };
}

function parseClause(clause: string): { variable: string; operator: '=' | '!='; value: string } {
  if (clause.includes('!=')) {
    const [variable, value] = clause.split('!=');
    return { variable, operator: '!=', value };
  }
  const [variable, value] = clause.split('=');
  return { variable, operator: '=', value };
}

// Inverse of serializeShowIf: splits on the first of && / || present (&& and
// || are never mixed in one expression, matching Rancher's own parser and the
// existing fallback-questions.ts data), splits each clause on != first then
// =, and matches each clause's variable name against `questions` (recursively)
// to resolve a fieldId. A clause matching no known question is dropped
// (defensive). Returns undefined if nothing is left to parse, or if every
// clause was dropped.
export function parseShowIf(
  showIf: string | undefined,
  questions: AuthoredQuestion[],
): ShowIfExpression | undefined {
  if (!showIf) {
    return undefined;
  }

  const { combinator, clauses } = splitClauses(showIf);

  const rules = clauses
    .map((clause) => {
      const { variable, operator, value } = parseClause(clause);
      const question = findQuestionByVariable(questions, variable);
      return question ? { fieldId: question.id, operator, value } : undefined;
    })
    .filter((rule): rule is ShowIfRule => rule !== undefined);

  if (rules.length === 0) {
    return undefined;
  }

  return { combinator, rules };
}

function questionToStored(question: AuthoredQuestion, root: AuthoredQuestion[]): QuestionDef {
  const stored: QuestionDef = {
    variable: question.variable,
    label:    question.label,
    type:     question.type,
  };

  if (question.default !== undefined) {
    stored.default = question.default;
  }
  if (question.description !== undefined) {
    stored.description = question.description;
  }
  if (question.group !== undefined) {
    stored.group = question.group;
  }
  if (question.options !== undefined) {
    stored.options = question.options;
  }

  const showIf = serializeShowIf(question.showIf, root);
  if (showIf !== undefined) {
    stored.show_if = showIf;
  }

  if (question.subquestions !== undefined) {
    stored.subquestions = question.subquestions.map((sub) => questionToStored(sub, root));
  }

  const subquestionsIf = serializeShowIf(question.subquestionsIf, root);
  if (subquestionsIf !== undefined) {
    stored.subquestions_if = subquestionsIf;
  }

  return stored;
}

// Maps each AuthoredQuestion to a QuestionDef, stripping `id`, calling
// serializeShowIf for showIf/subquestionsIf (resolved against the full
// top-level authored list, since a fieldId may reference any question in the
// tree, not just a sibling), and recursing into subquestions.
export function toStoredQuestions(authored: AuthoredQuestion[]): QuestionDef[] {
  return authored.map((question) => questionToStored(question, authored));
}

interface StoredAuthoredPair {
  stored:   QuestionDef;
  authored: AuthoredQuestion;
}

function buildAuthored(stored: QuestionDef, pairs: StoredAuthoredPair[]): AuthoredQuestion {
  const authored: AuthoredQuestion = {
    id:       createQuestionId(),
    variable: stored.variable,
    label:    stored.label,
    type:     stored.type as QuestionType,
  };

  if (stored.default !== undefined) {
    authored.default = stored.default;
  }
  if (stored.description !== undefined) {
    authored.description = stored.description;
  }
  if (stored.group !== undefined) {
    authored.group = stored.group;
  }
  if (stored.options !== undefined) {
    authored.options = stored.options;
  }
  if (stored.subquestions !== undefined) {
    authored.subquestions = stored.subquestions.map((sub) => buildAuthored(sub, pairs));
  }

  pairs.push({ stored, authored });

  return authored;
}

// Inverse of toStoredQuestions: assigns a fresh id per question (recursively),
// then a second pass calls parseShowIf per question now that all ids exist
// (a show_if can reference a question defined later in document order, or a
// sibling nested elsewhere in the tree).
export function fromStoredQuestions(stored: QuestionDef[]): AuthoredQuestion[] {
  const pairs: StoredAuthoredPair[] = [];
  const roots = stored.map((question) => buildAuthored(question, pairs));

  pairs.forEach(({ stored: storedQuestion, authored }) => {
    const showIf = parseShowIf(storedQuestion.show_if, roots);
    if (showIf !== undefined) {
      authored.showIf = showIf;
    }

    const subquestionsIf = parseShowIf(storedQuestion.subquestions_if, roots);
    if (subquestionsIf !== undefined) {
      authored.subquestionsIf = subquestionsIf;
    }
  });

  return roots;
}

// Every question (searched recursively through subquestions) whose showIf or
// subquestionsIf references `targetId` in any rule.
export function findDependents(questions: AuthoredQuestion[], targetId: string): AuthoredQuestion[] {
  const referencesTarget = (expr: ShowIfExpression | undefined): boolean => !!expr?.rules.some((rule) => rule.fieldId === targetId);

  const dependents: AuthoredQuestion[] = [];

  const walk = (list: AuthoredQuestion[]) => {
    for (const question of list) {
      if (referencesTarget(question.showIf) || referencesTarget(question.subquestionsIf)) {
        dependents.push(question);
      }
      if (question.subquestions) {
        walk(question.subquestions);
      }
    }
  };

  walk(questions);

  return dependents;
}

function collectSubtreeIds(question: AuthoredQuestion, into: Set<string>): Set<string> {
  into.add(question.id);
  (question.subquestions || []).forEach((sub) => collectSubtreeIds(sub, into));

  return into;
}

// Deleting a question removes its whole subtree, so every id in that subtree
// is checked — a reference to a nested subquestion from outside the subtree
// would otherwise be left dangling (and silently dropped by serializeShowIf on
// save). References that originate *inside* the subtree being deleted
// (including a question's self-referencing subquestions_if, the canonical
// Rancher `ingress.enabled` pattern) are ignored: they disappear along with it.
export function canDeleteQuestion(
  questions: AuthoredQuestion[],
  targetId: string,
): { allowed: boolean; dependents: AuthoredQuestion[] } {
  const target = findQuestionById(questions, targetId);
  const doomed = target ? collectSubtreeIds(target, new Set()) : new Set([targetId]);

  const dependents: AuthoredQuestion[] = [];

  doomed.forEach((id) => {
    findDependents(questions, id).forEach((dependent) => {
      if (!doomed.has(dependent.id) && !dependents.includes(dependent)) {
        dependents.push(dependent);
      }
    });
  });

  return { allowed: dependents.length === 0, dependents };
}

export type QuestionIssueKind = 'emptyVariable' | 'duplicateVariable' | 'emptyLabel' | 'emptyOption';

export interface QuestionIssue {
  id:       string;
  variable: string;
  label:    string;
  kind:     QuestionIssueKind;
}

// Problems that would make the stored form unusable or corrupt the deployed
// Helm values (a blank `variable` makes Questions write an empty-key value; a
// duplicate one makes two fields fight over the same key). Checked across the
// whole tree, since every variable — at any depth — is a path into the same
// values object. An empty result means the form is safe to save.
export function validateAuthoredQuestions(questions: AuthoredQuestion[]): QuestionIssue[] {
  const issues: QuestionIssue[] = [];
  const all: AuthoredQuestion[] = [];
  const walk = (list: AuthoredQuestion[]) => list.forEach((question) => {
    all.push(question);
    walk(question.subquestions || []);
  });

  walk(questions);

  const counts = new Map<string, number>();

  all.forEach((question) => {
    const variable = question.variable.trim();

    if (variable) {
      counts.set(variable, (counts.get(variable) || 0) + 1);
    }
  });

  all.forEach((question) => {
    const base = { id: question.id, variable: question.variable, label: question.label };
    const variable = question.variable.trim();

    if (!variable) {
      issues.push({ ...base, kind: 'emptyVariable' });
    } else if ((counts.get(variable) || 0) > 1) {
      issues.push({ ...base, kind: 'duplicateVariable' });
    }
    if (!question.label.trim()) {
      issues.push({ ...base, kind: 'emptyLabel' });
    }
    if (question.type === 'enum' && (question.options || []).some((option) => !`${ option }`.trim())) {
      issues.push({ ...base, kind: 'emptyOption' });
    }
  });

  return issues;
}
