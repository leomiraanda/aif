import type { QuestionDef } from './blueprint-questions-schema';

// Splits camelCase keys into words and capitalizes the first letter, so a raw
// values.yaml key like `storageClassName` reads as `Storage Class Name`.
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Hand-curated forms previously used for charts AIF bundles into its own
// blueprints but that ship without their own questions.yaml. Superseded by the
// generic, grouping-aware fallback below, which covers these charts well
// enough without per-chart maintenance. Kept here only as a reference for a
// nicer author experience (nested show_if toggles, hand-picked labels) if
// that's ever worth reintroducing — not wired into getFallbackQuestions.
//
// const CURATED_FALLBACK_QUESTIONS: Record<string, QuestionDef[]> = {
//   ollama: [
//     { variable: 'replicaCount', label: 'Replica Count', type: 'int', default: 1 },
//     { variable: 'ollama.models.pull', label: 'Models to Pull', type: 'array[string]', default: ['qwen2.5:3b'] },
//     { variable: 'ollama.gpu.enabled', label: 'Enable GPU', type: 'boolean', default: false, group: 'Advanced' },
//     { variable: 'persistentVolume.enabled', label: 'Enable Persistent Storage', type: 'boolean', default: false },
//     {
//       variable: 'persistentVolume.size', label: 'Storage Size', type: 'string', default: '30Gi', show_if: 'persistentVolume.enabled=true',
//     },
//     { variable: 'resources', label: 'Resource Requests/Limits', type: 'yaml', group: 'Advanced' },
//   ],
//   'open-webui': [
//     { variable: 'replicaCount', label: 'Replica Count', type: 'int', default: 1 },
//     { variable: 'ingress.enabled', label: 'Enable Ingress', type: 'boolean', default: true },
//     {
//       variable: 'ingress.host', label: 'Ingress Host', type: 'string', default: 'suse-ollama-webui', show_if: 'ingress.enabled=true',
//     },
//     { variable: 'persistence.enabled', label: 'Enable Persistent Storage', type: 'boolean', default: true },
//     {
//       variable: 'persistence.size', label: 'Storage Size', type: 'string', default: '20Gi', show_if: 'persistence.enabled=true',
//     },
//     { variable: 'sso.enabled', label: 'Enable SSO', type: 'boolean', default: false, group: 'Authentication' },
//     {
//       variable: 'sso.oidc.enabled', label: 'Enable OIDC', type: 'boolean', default: false, group: 'Authentication', show_if: 'sso.enabled=true',
//     },
//     { variable: 'resources', label: 'Resource Requests/Limits', type: 'yaml', group: 'Advanced' },
//   ],
//   'open-webui-mcpo': [
//     { variable: 'replicaCount', label: 'Replica Count', type: 'int', default: 1 },
//     { variable: 'config.mcpServers', label: 'MCP Servers', type: 'yaml' },
//     { variable: 'ingress.enabled', label: 'Enable Ingress', type: 'boolean', default: false },
//     { variable: 'resources', label: 'Resource Requests/Limits', type: 'yaml', group: 'Advanced' },
//   ],
// };

// Helper to group generic variables into standard operational sections
function getGroupForKey(key: string): string | undefined {
  const lowerKey = key.toLowerCase();
  if (/image|registry|pullsecret|pullpolicy/i.test(lowerKey)) return 'Image';
  if (/ingress|service|port|host|tls|network/i.test(lowerKey)) return 'Networking';
  if (/resource|replica|affinity|toleration|nodeselector|poddisruption/i.test(lowerKey)) return 'Resources';
  if (/persist|storage|volume|pvc/i.test(lowerKey)) return 'Storage';
  if (/metric|monitor|observ|telemetry|prometheus|grafana|log|trace/i.test(lowerKey)) return 'Observability';
  if (/auth|security|rbac|serviceaccount|credential|cert/i.test(lowerKey)) return 'Security';
  return undefined;
}

// Last-resort fallback for charts with no native form: one question per
// values.yaml key, typed from the JS value. Nested objects are flattened
// recursively into dot-path variables (e.g. `ingress.host`), since `variable`
// is already a path into the values object at any depth (see
// blueprint-questions-schema.ts). Arrays — of scalars or objects — become a
// single 'yaml' question for that subtree rather than guessing a per-item
// form, since there's no generic way to split them into individual fields.
function buildGenericQuestions(values: Record<string, any>, pathPrefix = ''): QuestionDef[] {
  const questions: QuestionDef[] = [];
  for (const [key, value] of Object.entries(values)) {
    const path = pathPrefix ? `${ pathPrefix }.${ key }` : key;
    const label = path.split('.').map(humanizeKey).join(' ');
    const group = getGroupForKey(path);
    const base = group ? { variable: path, label, group } : { variable: path, label };

    if (typeof value === 'boolean') questions.push({ ...base, type: 'boolean', default: value });
    else if (typeof value === 'number') questions.push({ ...base, type: Number.isInteger(value) ? 'int' : 'float', default: value });
    else if (typeof value === 'string') questions.push({ ...base, type: 'string', default: value });
    else if (Array.isArray(value)) questions.push({ ...base, type: 'yaml', default: value });
    else if (value && typeof value === 'object') questions.push(...buildGenericQuestions(value, path));
    // null/undefined values carry no type information, so they're skipped.
  }

  return questions;
}

// Resolves a fallback questions.yaml-shaped form for a chart that has none of
// its own, generated from the chart's live default values.
export function getFallbackQuestions(
  chartName: string,
  values: Record<string, any> | undefined,
): { questions: QuestionDef[] } | null {
  if (values && Object.keys(values).length > 0) {
    return { questions: buildGenericQuestions(values) };
  }

  return null;
}

// Splices a fallback questions form onto chart-info returned by
// catalog/getVersionInfo when the chart shipped none of its own, so the two
// blueprint wizard steps (BlueprintConfigStep, BlueprintCustomizeStep) don't
// each re-implement this decision.
export function applyFallbackQuestions<T extends { values?: Record<string, any>; questions?: QuestionDef[] }>(
  info: T,
  chartName: string,
): T & { questions?: QuestionDef[] } {
  // Disabled for the standalone Apps page: we only want the generic fallback
  // to generate questions in the Blueprint builder, not for standard chart installs.
  return info;
}
