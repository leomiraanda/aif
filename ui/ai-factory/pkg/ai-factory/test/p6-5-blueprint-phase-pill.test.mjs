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

test('BlueprintPhasePill: label is translated via the phase i18n key', () => {
  const src = read('components/blueprints/BlueprintPhasePill.vue');

  // Visible label resolves through t('aif.pages.blueprints.phase.${ phaseClass }') —
  // no hardcoded English; no raw CR enum bleeds into the template.
  assert.match(src, /t\(`aif\.pages\.blueprints\.phase\.\$\{\s*phaseClass\s*\}`\)/);
  assert.doesNotMatch(src, /\{\{\s*phase\s*\}\}/);
});

test('BlueprintPhasePill: imports BLUEPRINT_PHASES from utils', () => {
  const src = read('components/blueprints/BlueprintPhasePill.vue');

  assert.match(src, /import\s*\{\s*BLUEPRINT_PHASES\s*\}\s*from\s*'\.\.\/\.\.\/utils\/blueprint'/);
});
