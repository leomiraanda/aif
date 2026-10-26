import type { QuestionDef } from './blueprint-questions-schema';
import { getFallbackQuestions } from './fallback-questions';

// Single source of truth for which questions form wins for a given component,
// across the three places that can supply one: the chart's own native
// questions.yaml (highest priority — the chart author's intent always wins),
// the Blueprint CR's author-supplied `questions` (comp.questions — a
// Blueprint author overriding/supplying a form for a chart that has none of
// its own), and the hardcoded/generic fallback in fallback-questions.ts
// (lowest priority, last resort). An empty array at any tier is treated the
// same as absent, so a cleared-out authored list falls through to fallback
// instead of rendering a form with zero fields.
export function resolveComponentQuestions(
  nativeQuestions: QuestionDef[] | undefined,
  authoredQuestions: QuestionDef[] | undefined,
  chartName: string,
  values: Record<string, any> | undefined,
): QuestionDef[] | undefined {
  if (nativeQuestions?.length) {
    return nativeQuestions;
  }

  if (authoredQuestions?.length) {
    return authoredQuestions;
  }

  return getFallbackQuestions(chartName, values)?.questions;
}
