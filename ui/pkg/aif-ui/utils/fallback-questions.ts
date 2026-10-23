// Standard Helm questions.yaml shape (the subset @shell/components/Questions reads).
export interface QuestionDef {
  variable:     string;
  label:        string;
  type:         string;
  default?:     any;
  description?: string;
  group?:       string;
  show_if?:     string;
}

// Hand-curated forms for charts AIF bundles into its own blueprints but that ship
// without their own questions.yaml. Fields are drawn from the defaults baked into
// charts/aif-operator/files/blueprints/simple-chatbot-with-rag-1.0.2.yaml. Keyed by
// chart name only (not version) — a fallback form trading version-exactness for
// not having to track every upstream chart release.
const CURATED_FALLBACK_QUESTIONS: Record<string, QuestionDef[]> = {
  ollama: [
    { variable: 'replicaCount', label: 'Replica Count', type: 'int', default: 1 },
    { variable: 'ollama.models.pull', label: 'Models to Pull', type: 'array[string]', default: ['qwen2.5:3b'] },
    { variable: 'ollama.gpu.enabled', label: 'Enable GPU', type: 'boolean', default: false, group: 'Advanced' },
    { variable: 'persistentVolume.enabled', label: 'Enable Persistent Storage', type: 'boolean', default: false },
    {
      variable: 'persistentVolume.size', label: 'Storage Size', type: 'string', default: '30Gi', show_if: 'persistentVolume.enabled=true',
    },
    { variable: 'resources', label: 'Resource Requests/Limits', type: 'yaml', group: 'Advanced' },
  ],
  'open-webui': [
    { variable: 'replicaCount', label: 'Replica Count', type: 'int', default: 1 },
    { variable: 'ingress.enabled', label: 'Enable Ingress', type: 'boolean', default: true },
    {
      variable: 'ingress.host', label: 'Ingress Host', type: 'string', default: 'suse-ollama-webui', show_if: 'ingress.enabled=true',
    },
    { variable: 'persistence.enabled', label: 'Enable Persistent Storage', type: 'boolean', default: true },
    {
      variable: 'persistence.size', label: 'Storage Size', type: 'string', default: '20Gi', show_if: 'persistence.enabled=true',
    },
    { variable: 'sso.enabled', label: 'Enable SSO', type: 'boolean', default: false, group: 'Authentication' },
    {
      variable: 'sso.oidc.enabled', label: 'Enable OIDC', type: 'boolean', default: false, group: 'Authentication', show_if: 'sso.enabled=true',
    },
    { variable: 'resources', label: 'Resource Requests/Limits', type: 'yaml', group: 'Advanced' },
  ],
  'open-webui-mcpo': [
    { variable: 'replicaCount', label: 'Replica Count', type: 'int', default: 1 },
    { variable: 'config.mcpServers', label: 'MCP Servers', type: 'yaml' },
    { variable: 'ingress.enabled', label: 'Enable Ingress', type: 'boolean', default: false },
    { variable: 'resources', label: 'Resource Requests/Limits', type: 'yaml', group: 'Advanced' },
  ],
};

// Splits camelCase keys into words and capitalizes the first letter, so a raw
// values.yaml key like `storageClassName` reads as `Storage Class Name`.
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Last-resort fallback for charts with no curated entry: one question per
// top-level values.yaml key, typed from the JS value. Nested objects/arrays
// become a 'yaml' question (a scoped mini YAML editor for that subtree) rather
// than guessing a shape-specific form.
function buildGenericQuestions(values: Record<string, any>): QuestionDef[] {
  return Object.entries(values).map(([key, value]) => {
    const base = { variable: key, label: humanizeKey(key) };

    if (typeof value === 'boolean') return { ...base, type: 'boolean', default: value };
    if (typeof value === 'number') return { ...base, type: Number.isInteger(value) ? 'int' : 'float', default: value };
    if (typeof value === 'string') return { ...base, type: 'string', default: value };
    return { ...base, type: 'yaml', default: value };
  });
}

// Resolves a fallback questions.yaml-shaped form for a chart that has none of its
// own: a curated form if AIF ships one for this chart name, otherwise one
// generated from the chart's live default values, otherwise null (caller falls
// back to the raw YAML editor, as it does today when this returns null).
export function getFallbackQuestions(
  chartName: string,
  values: Record<string, any> | undefined,
): { questions: QuestionDef[] } | null {
  const curated = CURATED_FALLBACK_QUESTIONS[chartName];
  if (curated) {
    return { questions: curated };
  }

  if (values && Object.keys(values).length > 0) {
    return { questions: buildGenericQuestions(values) };
  }

  return null;
}

// Splices a fallback questions form onto chart-info returned by
// catalog/getVersionInfo when the chart shipped none of its own, so the two
// blueprint wizard steps (BlueprintConfigStep, BlueprintCustomizeStep) don't
// each re-implement this decision. Returns `info` unchanged — same reference —
// when it already has questions or no fallback applies, so callers can keep
// relying on `!!info.questions` without any extra null-handling.
export function applyFallbackQuestions<T extends { values?: Record<string, any>; questions?: QuestionDef[] }>(
  info: T,
  chartName: string,
): T & { questions?: QuestionDef[] } {
  if (info.questions) {
    return info;
  }

  const fallback = getFallbackQuestions(chartName, info.values);
  if (!fallback) {
    return info;
  }

  return { ...info, questions: fallback.questions };
}
