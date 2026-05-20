import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${ p }`, import.meta.url), 'utf8');

test('BlueprintCard: component exists with correct name', () => {
  const src = read('components/blueprints/BlueprintCard.vue');

  assert.match(src, /name:\s*'BlueprintCard'/);
});

test('BlueprintCard: declares lineage, isPublisher, showWithdrawn props', () => {
  const src = read('components/blueprints/BlueprintCard.vue');

  assert.match(src, /lineage:\s*\{/);
  assert.match(src, /isPublisher:\s*\{/);
  assert.match(src, /showWithdrawn:\s*\{/);
});

test('BlueprintCard: imports the picker and pill', () => {
  const src = read('components/blueprints/BlueprintCard.vue');

  assert.match(src, /import BlueprintVersionPicker from '\.\/BlueprintVersionPicker\.vue'/);
  assert.match(src, /import BlueprintPhasePill from '\.\/BlueprintPhasePill\.vue'/);
});

test('BlueprintCard: imports selectDefaultVersion from utils', () => {
  const src = read('components/blueprints/BlueprintCard.vue');

  assert.match(src, /import.*selectDefaultVersion.*from '\.\.\/\.\.\/utils\/blueprint'/);
});

test('BlueprintCard: emits view-versions', () => {
  const src = read('components/blueprints/BlueprintCard.vue');

  assert.match(src, /emits:\s*\[[^\]]*'view-versions'/);
});

test('BlueprintCard: Deploy and Start Bundle buttons are disabled with tooltips', () => {
  const src = read('components/blueprints/BlueprintCard.vue');

  // Both buttons reference their "coming soon" tooltip keys
  assert.match(src, /aif\.pages\.blueprints\.actions\.deployComingSoon/);
  assert.match(src, /aif\.pages\.blueprints\.actions\.startBundleComingSoon/);
  // And both render disabled
  assert.match(src, /:disabled="true"[\s\S]*deploy|disabled[\s\S]*deploy/i);
});

test('BlueprintCard: publisher actions are gated by isPublisher and disabled with tooltip', () => {
  const src = read('components/blueprints/BlueprintCard.vue');

  // The publisher actions block is conditional on isPublisher
  assert.match(src, /v-if="isPublisher"/);
  // All three publisher actions referenced
  assert.match(src, /aif\.pages\.blueprints\.actions\.deprecate/);
  assert.match(src, /aif\.pages\.blueprints\.actions\.withdraw/);
  assert.match(src, /aif\.pages\.blueprints\.actions\.reactivate/);
  // Disabled tooltip key referenced
  assert.match(src, /aif\.pages\.blueprints\.actions\.publisherEndpointComingSoon/);
});

test('BlueprintCard: phase-driven publisher button visibility', () => {
  const src = read('components/blueprints/BlueprintCard.vue');

  // Deprecate/Withdraw shown when selected.phase === 'Active'
  assert.match(src, /selected\.phase\s*===\s*'Active'/);
  // Reactivate shown only when selected.phase === 'Withdrawn' (spec §6 — reverses Withdraw)
  assert.match(src, /selected\.phase\s*===\s*'Withdrawn'/);
});

test('BlueprintCard: vendor-chart origin shows chart name in tooltip', () => {
  const src = read('components/blueprints/BlueprintCard.vue');

  assert.match(src, /vendorChart/);
  assert.match(src, /WrapsVendorChart/);
});
