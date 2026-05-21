import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${ p }`, import.meta.url), 'utf8');

test('BlueprintVersionsPanel: component exists with correct name', () => {
  const src = read('components/blueprints/BlueprintVersionsPanel.vue');

  assert.match(src, /name:\s*'BlueprintVersionsPanel'/);
});

test('BlueprintVersionsPanel: accepts a lineage prop', () => {
  const src = read('components/blueprints/BlueprintVersionsPanel.vue');

  assert.match(src, /lineage:\s*\{/);
});

test('BlueprintVersionsPanel: emits close', () => {
  const src = read('components/blueprints/BlueprintVersionsPanel.vue');

  assert.match(src, /emits:\s*\[\s*'close'\s*\]/);
});

test('BlueprintVersionsPanel: renders all required i18n keys', () => {
  const src = read('components/blueprints/BlueprintVersionsPanel.vue');

  for (const key of [
    'aif.pages.blueprints.versionsPanel.title',
    'aif.pages.blueprints.versionsPanel.changeDescription',
    'aif.pages.blueprints.versionsPanel.empty',
    'aif.pages.blueprints.card.publishedBy'
  ]) {
    assert.match(src, new RegExp(key.replace(/\./g, '\\.')));
  }
});

test('BlueprintVersionsPanel: imports BlueprintPhasePill', () => {
  const src = read('components/blueprints/BlueprintVersionsPanel.vue');

  assert.match(src, /import BlueprintPhasePill from '\.\/BlueprintPhasePill\.vue'/);
});
