import { describe, it, expect } from 'vitest';
import {
  AuthoredQuestion,
  toStoredQuestions,
  fromStoredQuestions,
  canDeleteQuestion,
  validateAuthoredQuestions,
} from '../blueprint-questions-schema';

describe('toStoredQuestions / fromStoredQuestions round-trip', () => {
  it('preserves a simple question with no conditional', () => {
    const authored: AuthoredQuestion[] = [
      {
        id: 'a', variable: 'replicaCount', label: 'Replica Count', type: 'int', default: 1,
      },
    ];

    const stored = toStoredQuestions(authored);

    expect(stored).toEqual([
      {
        variable: 'replicaCount', label: 'Replica Count', type: 'int', default: 1,
      },
    ]);

    const roundTripped = fromStoredQuestions(stored);

    expect(roundTripped).toHaveLength(1);
    expect(roundTripped[0]).toMatchObject({
      variable: 'replicaCount', label: 'Replica Count', type: 'int', default: 1,
    });
    expect(roundTripped[0].id).toEqual(expect.any(String));
    expect(roundTripped[0].showIf).toBeUndefined();
  });

  it('serializes a single-rule show_if as "variable=value"', () => {
    const authored: AuthoredQuestion[] = [
      {
        id: 'a', variable: 'ingress.enabled', label: 'Enable Ingress', type: 'boolean', default: true,
      },
      {
        id: 'b',
        variable: 'ingress.host',
        label: 'Ingress Host',
        type: 'string',
        default: 'suse-ollama-webui',
        showIf: { combinator: '&&', rules: [{ fieldId: 'a', operator: '=', value: 'true' }] },
      },
    ];

    const stored = toStoredQuestions(authored);

    expect(stored[1].show_if).toEqual('ingress.enabled=true');
  });

  it('serializes a two-rule && show_if as "a=1&&b=2"', () => {
    const authored: AuthoredQuestion[] = [
      {
        id: 'a', variable: 'a', label: 'A', type: 'string', default: '1',
      },
      {
        id: 'b', variable: 'b', label: 'B', type: 'string', default: '2',
      },
      {
        id: 'c',
        variable: 'c',
        label: 'C',
        type: 'string',
        showIf: {
          combinator: '&&',
          rules: [
            { fieldId: 'a', operator: '=', value: '1' },
            { fieldId: 'b', operator: '=', value: '2' },
          ],
        },
      },
    ];

    const stored = toStoredQuestions(authored);

    expect(stored[2].show_if).toEqual('a=1&&b=2');
  });

  it('serializes a two-rule || show_if as "a=1||b=2"', () => {
    const authored: AuthoredQuestion[] = [
      {
        id: 'a', variable: 'a', label: 'A', type: 'string', default: '1',
      },
      {
        id: 'b', variable: 'b', label: 'B', type: 'string', default: '2',
      },
      {
        id: 'c',
        variable: 'c',
        label: 'C',
        type: 'string',
        showIf: {
          combinator: '||',
          rules: [
            { fieldId: 'a', operator: '=', value: '1' },
            { fieldId: 'b', operator: '=', value: '2' },
          ],
        },
      },
    ];

    const stored = toStoredQuestions(authored);

    expect(stored[2].show_if).toEqual('a=1||b=2');
  });

  it('round-trips subquestions and subquestions_if', () => {
    const authored: AuthoredQuestion[] = [
      {
        id: 'a', variable: 'sso.enabled', label: 'Enable SSO', type: 'boolean', default: false,
      },
      {
        id: 'b',
        variable: 'sso.oidc',
        label: 'OIDC Settings',
        type: 'boolean',
        subquestionsIf: { combinator: '&&', rules: [{ fieldId: 'a', operator: '=', value: 'true' }] },
        subquestions: [
          {
            id: 'c', variable: 'sso.oidc.clientId', label: 'Client ID', type: 'string',
          },
        ],
      },
    ];

    const stored = toStoredQuestions(authored);

    expect(stored[1].subquestions_if).toEqual('sso.enabled=true');
    expect(stored[1].subquestions).toEqual([
      { variable: 'sso.oidc.clientId', label: 'Client ID', type: 'string' },
    ]);

    const roundTripped = fromStoredQuestions(stored);

    expect(roundTripped[1].subquestionsIf).toEqual({
      combinator: '&&',
      rules: [{ fieldId: roundTripped[0].id, operator: '=', value: 'true' }],
    });
    expect(roundTripped[1].subquestions).toHaveLength(1);
    expect(roundTripped[1].subquestions?.[0].variable).toEqual('sso.oidc.clientId');
  });

  it('fromStoredQuestions drops a show_if clause referencing an unknown variable', () => {
    const stored = [
      { variable: 'a', label: 'A', type: 'boolean', default: false },
      {
        variable: 'b', label: 'B', type: 'string', show_if: 'nonexistent.variable=true',
      },
    ];

    const roundTripped = fromStoredQuestions(stored);

    expect(roundTripped[1].showIf).toBeUndefined();
  });
});

describe('canDeleteQuestion', () => {
  it('allows deleting a question nothing references', () => {
    const questions: AuthoredQuestion[] = [
      {
        id: 'a', variable: 'a', label: 'A', type: 'boolean', default: false,
      },
      {
        id: 'b', variable: 'b', label: 'B', type: 'string',
      },
    ];

    const result = canDeleteQuestion(questions, 'b');

    expect(result).toEqual({ allowed: true, dependents: [] });
  });

  it('blocks deleting a question referenced by another question\'s show_if, naming the dependent', () => {
    const dependent: AuthoredQuestion = {
      id: 'b',
      variable: 'b',
      label: 'B',
      type: 'string',
      showIf: { combinator: '&&', rules: [{ fieldId: 'a', operator: '=', value: 'true' }] },
    };
    const questions: AuthoredQuestion[] = [
      {
        id: 'a', variable: 'a', label: 'A', type: 'boolean', default: false,
      },
      dependent,
    ];

    const result = canDeleteQuestion(questions, 'a');

    expect(result.allowed).toBe(false);
    expect(result.dependents).toEqual([dependent]);
  });

  it('blocks deleting a question referenced by a nested subquestion\'s subquestions_if', () => {
    const nestedDependent: AuthoredQuestion = {
      id: 'c',
      variable: 'c',
      label: 'C',
      type: 'string',
      subquestionsIf: { combinator: '&&', rules: [{ fieldId: 'a', operator: '=', value: 'true' }] },
      subquestions: [
        {
          id: 'd', variable: 'd', label: 'D', type: 'string',
        },
      ],
    };
    const questions: AuthoredQuestion[] = [
      {
        id: 'a', variable: 'a', label: 'A', type: 'boolean', default: false,
      },
      {
        id: 'b',
        variable: 'b',
        label: 'B',
        type: 'string',
        subquestions: [nestedDependent],
      },
    ];

    const result = canDeleteQuestion(questions, 'a');

    expect(result.allowed).toBe(false);
    expect(result.dependents).toEqual([nestedDependent]);
  });

  it('blocks deleting a parent whose nested subquestion is referenced from outside the subtree', () => {
    const outsideDependent: AuthoredQuestion = {
      id: 'd',
      variable: 'd',
      label: 'D',
      type: 'string',
      showIf: { combinator: '&&', rules: [{ fieldId: 'c', operator: '=', value: 'x' }] },
    };
    const questions: AuthoredQuestion[] = [
      {
        id: 'a',
        variable: 'a',
        label: 'A',
        type: 'boolean',
        subquestions: [{
          id: 'c', variable: 'c', label: 'C', type: 'string',
        }],
      },
      outsideDependent,
    ];

    const result = canDeleteQuestion(questions, 'a');

    expect(result.allowed).toBe(false);
    expect(result.dependents).toEqual([outsideDependent]);
  });

  it('ignores references that originate inside the subtree being deleted', () => {
    const questions: AuthoredQuestion[] = [
      {
        id: 'a',
        variable: 'a',
        label: 'A',
        type: 'boolean',
        subquestions: [
          {
            id: 'b', variable: 'b', label: 'B', type: 'string',
          },
          {
            id: 'c',
            variable: 'c',
            label: 'C',
            type: 'string',
            showIf: { combinator: '&&', rules: [{ fieldId: 'b', operator: '=', value: 'x' }] },
          },
        ],
      },
    ];

    expect(canDeleteQuestion(questions, 'a')).toEqual({ allowed: true, dependents: [] });
  });

  it('allows deleting a question whose only reference is its own self-referencing subquestions_if', () => {
    const questions: AuthoredQuestion[] = [
      {
        id: 'a',
        variable: 'ingress.enabled',
        label: 'Ingress',
        type: 'boolean',
        subquestionsIf: { combinator: '&&', rules: [{ fieldId: 'a', operator: '=', value: 'true' }] },
        subquestions: [{
          id: 'b', variable: 'ingress.host', label: 'Host', type: 'string',
        }],
      },
    ];

    expect(canDeleteQuestion(questions, 'a')).toEqual({ allowed: true, dependents: [] });
  });
});

describe('validateAuthoredQuestions', () => {
  it('returns no issues for a well-formed tree', () => {
    const questions: AuthoredQuestion[] = [
      {
        id: 'a',
        variable: 'mode',
        label: 'Mode',
        type: 'enum',
        options: ['x', 'y'],
        subquestions: [{
          id: 'b', variable: 'mode.extra', label: 'Extra', type: 'string',
        }],
      },
    ];

    expect(validateAuthoredQuestions(questions)).toEqual([]);
  });

  it('flags blank variables, blank labels, duplicate variables at any depth, and blank enum options', () => {
    const questions: AuthoredQuestion[] = [
      {
        id: 'blank', variable: '  ', label: '', type: 'string',
      },
      {
        id: 'dup1',
        variable: 'shared',
        label: 'Shared 1',
        type: 'string',
        subquestions: [{
          id: 'dup2', variable: 'shared', label: 'Shared 2', type: 'string',
        }],
      },
      {
        id: 'enum', variable: 'choice', label: 'Choice', type: 'enum', options: ['ok', ''],
      },
    ];

    const issues = validateAuthoredQuestions(questions).map((issue) => `${ issue.id }:${ issue.kind }`);

    expect(issues).toEqual([
      'blank:emptyVariable',
      'blank:emptyLabel',
      'dup1:duplicateVariable',
      'dup2:duplicateVariable',
      'enum:emptyOption',
    ]);
  });
});
