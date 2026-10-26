import type { QuestionDef } from './blueprint-questions-schema';
import { getFallbackQuestions } from './fallback-questions';

// The parsed questions.yaml document as Rancher's chart-info response carries
// it: `rawInfo.questions` is the whole document object, whose `questions` key
// holds the actual array. @shell/components/Questions reads exactly this shape
// (`source.questions.questions`), so every resolved result below is returned
// wrapped back into it.
export interface QuestionsDocument {
  questions?: QuestionDef[];
  [key: string]: any;
}

// True when the chart itself ships a non-empty questions.yaml — the gate for
// both precedence tier 1 and hiding the "Build a configuration form"
// affordance (a chart author's own form always wins, so a Blueprint author
// never gets to override it).
export function hasNativeQuestions(rawInfo: { questions?: QuestionsDocument } | undefined | null): boolean {
  return !!rawInfo?.questions?.questions?.length;
}

// Single source of truth for which questions form wins for a given component,
// across the three places that can supply one: the chart's own native
// questions.yaml (highest priority — the chart author's intent always wins),
// the Blueprint CR's author-supplied `questions` (comp.questions — a
// Blueprint author overriding/supplying a form for a chart that has none of
// its own), and the hardcoded/generic fallback in fallback-questions.ts
// (lowest priority, last resort). An empty array at any tier is treated the
// same as absent, so a cleared-out authored list falls through to fallback
// instead of rendering a form with zero fields.
//
// `nativeDocument` is the chart-info's `questions` field as-is (the parsed
// questions.yaml object, not the bare array). Returns a questions document in
// that same `{ questions: [...] }` shape, or undefined when nothing resolves.
export function resolveComponentQuestions(
  nativeDocument: QuestionsDocument | undefined,
  authoredQuestions: QuestionDef[] | undefined,
  chartName: string,
  values: Record<string, any> | undefined,
): QuestionsDocument | undefined {
  if (nativeDocument?.questions?.length) {
    return nativeDocument;
  }

  if (authoredQuestions?.length) {
    return { ...(nativeDocument || {}), questions: authoredQuestions };
  }

  const fallback = getFallbackQuestions(chartName, values)?.questions;

  return fallback ? { ...(nativeDocument || {}), questions: fallback } : undefined;
}
