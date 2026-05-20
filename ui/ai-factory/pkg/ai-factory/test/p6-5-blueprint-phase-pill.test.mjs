import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${ p }`, import.meta.url), 'utf8');

test('BlueprintPhasePill: component exists with correct name', () => {
  const src = read('components/blueprints/BlueprintPhasePill.vue');

  assert.match(src, /name:\s*'BlueprintPhasePill'/);
});

test('BlueprintPhasePill: accepts a typed phase prop', () => {
  const src = read('components/blueprints/BlueprintPhasePill.vue');

  assert.match(src, /props:[\s\S]*phase/);
  assert.match(src, /validator/);   // explicit phase validator
});

test('BlueprintPhasePill: maps all three phases to a CSS modifier', () => {
  const src = read('components/blueprints/BlueprintPhasePill.vue');

  for (const phase of ['active', 'deprecated', 'withdrawn']) {
    assert.match(src, new RegExp(`phase-pill--${ phase }`));
  }
});

test('BlueprintPhasePill: text comes from props (not hard-coded)', () => {
  const src = read('components/blueprints/BlueprintPhasePill.vue');

  // The label is the raw phase value — no English string literal in the template.
  assert.match(src, /\{\{\s*phase\s*\}\}/);
});
