# MVP Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all MVP features from `pkg/suse-ai-lifecycle-manager` to the `aif` repo, achieving feature parity per SOFTWARE_SPEC v1.2 using the three-noun model (App / Blueprint / Workload).

**Architecture:** Feature-slice approach — each slice delivers backend endpoint(s) + operator-api.ts update + UI page/component + tests end-to-end. Existing UI (apps.vue, blueprints.vue, settings.vue) is retained and extended. Bundle controller stays dormant; no Bundle UI surface.

**Tech Stack:** Go 1.21, controller-runtime, Ginkgo/Gomega (envtest), Vue 3 Options API, Rancher Dashboard extension DSL, Node test runner (`node:test`), Vitest.

**All paths and commands assume you are at the root of the cloned `aif` repository.**

---

## Baseline State (as of latest aif main — 2026-05-26)

The following work has already landed in the `aif` repo and MUST NOT be re-implemented:

| Task | Status | What exists |
|---|---|---|
| F-4 (Fleet Bundle + phase) | ✅ DONE (P4-3b) | `pkg/fleet/bundle_engine.go`, deployer routes through `FleetBundleEngine`, `SetupWithManager` owns `Bundle`, phase driven by `RecomputePhase` |
| Task 1-1 (Apps catalog) | ✅ DONE (P6-7) | `pages/apps.vue` fully implemented; `AppCard.vue`; `listApps/getApp/listCategories` in operator-api.ts |
| P6-5 (Blueprints gallery components) | ✅ DONE | `pages/blueprints.vue`, `BlueprintCard.vue`, `BlueprintVersionsPanel.vue`, `BlueprintVersionPicker.vue`, `BlueprintPhasePill.vue`, `utils/blueprint.ts` |
| P5-3 (Workload upgrade backend) | ✅ DONE | `pkg/workload/upgrader.go`; `POST /api/v1/workloads/{namespace}/{name}/upgrade` in `WorkloadsHandler` |
| operator-api.ts (read path) | ✅ DONE | `listBlueprints`, `getBlueprint`, `getBlueprintVersion`, `listWorkloads`, `getWorkload`, `deleteWorkload` |
| pkg/workload Repository | ✅ PARTIAL | `Reader` (Get, List) + `Writer` (Update, UpdateStatus, Patch) + `DeploymentCounter` exist; **Create and Delete missing** |
| F-5 (Git client + git.Engine) | ✅ DONE (P4-3) | `pkg/git/gogit_engine.go` full go-git in-memory engine; `NewEngine(logger)` constructor; SSH/token/basic auth; `Push()` method; old `git.go` stub removed |
| F-6 (Fleet GitRepo + GitOps delivery) | ✅ DONE (P4-3) | `pkg/fleet/gitrepo_engine.go` SSA-based implementation; deployer dispatches `"gitops"` → `fleetGitRepo.Apply()`; `SetupWithManager` owns `GitRepo`; wired in `main.go` |
| P5-4b (Settings → fleet engine bus) | ✅ DONE (P5-4b) | `SettingsSnapshot` carries resolved `FleetGitAuth` union (Token/Basic/SSH); `engineBus.projectFleet` pushes `FleetSettings` to both fleet engines via `UpdateSettings`; `settings_controller.go` resolves fleet creds before snapshot |
| P6-11 (InstallAIExtension UIPlugin) | ✅ DONE (P6-11) | Dual-source (Helm/Git) UIPlugin creation in `InstallAIExtensionReconciler`; `internal/infra/rancher` CatalogManager extracted; `helm.Engine.InstallFromRepoURL` added (7th method — fake is in `FakeEngine`); `InstallAIExtension` CR auto-bundled in operator chart |
| Blueprint write actions | ❌ NOT DONE | No CRUD wiring in blueprints.vue, no backend blueprint API handler |
| Workload CRUD (create/delete) | ❌ NOT DONE | k8s_repository and FakeRepository lack Create/Delete |

---

## Pre-Task 0: Bundle UI Cleanup + Settings Verification

### User-Facing Features & Behaviors

- The left navigation contains exactly five items: **Overview, Apps, Blueprints, Workloads, Settings**.
- **"Bundles" and "Pending Reviews" are gone** from the nav and routing; navigating directly to their URLs shows the Rancher **404 page**, not a blank/broken stub component.
- The **Settings** page (retained) exposes the full configuration set across four collapsible sections:
  - **SUSE Application Collection** — user secret ref, token secret ref (both name + key via SecretSelector), categories (comma-separated).
  - **SUSE Registry** — user secret ref, token secret ref, refresh interval (minutes).
  - **Fleet / GitOps** — repo URL, branch, auth type (`none` / `ssh` / `token` / `basic`), credential secret ref (shown when an auth type is set).
  - **Advanced** — registry endpoint overrides (SUSE Registry, App Collection, App Collection API), catalog discovery mode (`api` / `registry-fallback` / `disabled`), image-rewrite enable toggle + match/replace rules.
- **Apply** persists settings via `PUT /api/v1/settings`; the operator resolves the referenced credentials server-side (no client-side ClusterRepo creation).

Remove Bundle and PendingReviews surfaces from the UI. No tests needed — the pages are stubs and the backend bundle controller stays intact.

**Files:**
- Delete: `ui/ai-factory/pkg/ai-factory/pages/bundles.vue`
- Delete: `ui/ai-factory/pkg/ai-factory/pages/pending-reviews.vue`
- Modify: `ui/ai-factory/pkg/ai-factory/config/types.ts`
- Modify: `ui/ai-factory/pkg/ai-factory/routing/index.ts`
- Modify: `ui/ai-factory/pkg/ai-factory/config/aif-product.ts`
- Modify: `ui/ai-factory/pkg/ai-factory/utils/operator-api.ts`
- Modify: `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`

- [ ] **Step 1: Delete the two stub pages**

```bash
rm ui/ai-factory/pkg/ai-factory/pages/bundles.vue
rm ui/ai-factory/pkg/ai-factory/pages/pending-reviews.vue
```

- [ ] **Step 2: Remove BUNDLES and PENDING_REVIEWS from types.ts**

In `ui/ai-factory/pkg/ai-factory/config/types.ts`, replace the PAGE_IDS block:

```typescript
export const PAGE_IDS = {
  OVERVIEW: 'overview',
  APPS:     'apps',
  BLUEPRINTS: 'blueprints',
  WORKLOADS:  'workloads',
  SETTINGS:   'settings'
} as const;
```

- [ ] **Step 3: Remove bundles + pending-reviews routes from routing/index.ts**

Replace the full routes array in `ui/ai-factory/pkg/ai-factory/routing/index.ts`:

```typescript
import { PRODUCT_NAME, PAGE_IDS } from '../config/types';

const routes = [
  {
    name:      `${ PRODUCT_NAME }-c-cluster-${ PAGE_IDS.OVERVIEW }`,
    path:      `/c/:cluster/${ PRODUCT_NAME }/${ PAGE_IDS.OVERVIEW }`,
    component: () => import('../pages/overview.vue'),
    meta:      { product: PRODUCT_NAME, pageId: PAGE_IDS.OVERVIEW }
  },
  {
    name:      `${ PRODUCT_NAME }-c-cluster-${ PAGE_IDS.APPS }`,
    path:      `/c/:cluster/${ PRODUCT_NAME }/${ PAGE_IDS.APPS }`,
    component: () => import('../pages/apps.vue'),
    meta:      { product: PRODUCT_NAME, pageId: PAGE_IDS.APPS }
  },
  {
    name:      `${ PRODUCT_NAME }-c-cluster-${ PAGE_IDS.BLUEPRINTS }`,
    path:      `/c/:cluster/${ PRODUCT_NAME }/${ PAGE_IDS.BLUEPRINTS }`,
    component: () => import('../pages/blueprints.vue'),
    meta:      { product: PRODUCT_NAME, pageId: PAGE_IDS.BLUEPRINTS }
  },
  {
    name:      `${ PRODUCT_NAME }-c-cluster-${ PAGE_IDS.WORKLOADS }`,
    path:      `/c/:cluster/${ PRODUCT_NAME }/${ PAGE_IDS.WORKLOADS }`,
    component: () => import('../pages/workloads.vue'),
    meta:      { product: PRODUCT_NAME, pageId: PAGE_IDS.WORKLOADS }
  },
  {
    name:      `${ PRODUCT_NAME }-c-cluster-${ PAGE_IDS.SETTINGS }`,
    path:      `/c/:cluster/${ PRODUCT_NAME }/${ PAGE_IDS.SETTINGS }`,
    component: () => import('../pages/settings.vue'),
    meta:      { product: PRODUCT_NAME, pageId: PAGE_IDS.SETTINGS }
  }
];

export default routes;
```

- [ ] **Step 4: Clean up aif-product.ts — remove BUNDLES/PENDING_REVIEWS from nav and basicType**

Replace `pageNav` and the `basicType` + `configureType` block in `ui/ai-factory/pkg/ai-factory/config/aif-product.ts`:

```typescript
const pageNav = [
  { id: PAGE_IDS.OVERVIEW,   labelKey: 'aif.nav.overview',   weight: 600 },
  { id: PAGE_IDS.APPS,       labelKey: 'aif.nav.apps',       weight: 500 },
  { id: PAGE_IDS.BLUEPRINTS, labelKey: 'aif.nav.blueprints', weight: 400 },
  { id: PAGE_IDS.WORKLOADS,  labelKey: 'aif.nav.workloads',  weight: 150 },
  { id: PAGE_IDS.SETTINGS,   labelKey: 'aif.nav.settings',   weight: 100 }
];
```

And replace the `basicType` calls with:

```typescript
basicType([
  PAGE_IDS.OVERVIEW,
  PAGE_IDS.APPS,
  PAGE_IDS.BLUEPRINTS,
  PAGE_IDS.WORKLOADS,
  PAGE_IDS.SETTINGS
]);

basicType([CRD_TYPES.BLUEPRINT, CRD_TYPES.WORKLOAD, CRD_TYPES.SETTINGS]);
```

Remove the `configureType(CRD_TYPES.BUNDLE, ...)` line and the `ignoreType(CRD_TYPES.BUNDLE)` line. Remove the `CRD_TYPES.BUNDLE` import usage.

Also remove the `BUNDLE` entry from `CRD_TYPES` in `config/types.ts`:

```typescript
export const CRD_TYPES = {
  BLUEPRINT: 'ai.suse.com.blueprint',
  WORKLOAD:  'ai.suse.com.workload',
  SETTINGS:  'ai.suse.com.settings'
} as const;
```

- [ ] **Step 5: Remove Bundle functions from operator-api.ts**

Delete the entire `// ── Bundles ──` section (lines containing `listBundles`, `getBundle`, `createBundle`, `patchBundle`, `deleteBundle`) from `ui/ai-factory/pkg/ai-factory/utils/operator-api.ts`.

- [ ] **Step 6: Remove bundles/pendingReviews keys from l10n/en-us.yaml**

In `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`, remove:
- `aif.nav.bundles`
- `aif.nav.pendingReviews`
- The entire `aif.pages.bundles` section
- The entire `aif.pages.pendingReviews` section

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd ui/ai-factory && npm run build 2>&1 | head -40
```

Expected: no TS errors referencing BUNDLES, PENDING_REVIEWS, listBundles, etc.

- [ ] **Step 8: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/
git commit -m "chore: remove Bundle and PendingReviews UI surfaces (three-noun model)"
```

- [ ] **Step 9: Verify settings.vue field parity (audited 2026-05-27 — at parity)**

Audit result: `ui/ai-factory/pkg/ai-factory/pages/settings.vue` is a near-verbatim port of the reference `pages/Settings.vue` and already covers the full field set. The operator-side handler (`internal/api/settings.go`, GET/PUT `/api/v1/settings` + `SettingsApplier`) **already exists** — nothing to port. This step is now a confirmation checklist, not new work.

Confirm these field groups are present (all four accordion sections):
- [ ] **SUSE Application Collection**: user secret ref (`SecretSelector`, name+key), token secret ref, categories (comma-separated)
- [ ] **SUSE Registry**: user secret ref, token secret ref, `refreshIntervalMinutes` (number)
- [ ] **Fleet/GitOps**: repo URL, branch, auth type (`none` / `ssh` / `token` / `basic`), credential secret reference (shown only when authType is set)
- [ ] **Advanced**: registry endpoints (`suseRegistry`, `applicationCollection`, `applicationCollectionAPI`); catalog discovery mode (`api` / `registry-fallback` / `disabled`); image rewrite enable toggle + match/replace rules (add/remove)

> **Do NOT port the reference's `ensureClusterReposWithCredentials` post-save side-effect.** The reference `Settings.vue` creates Rancher `ClusterRepo`s on the local cluster (with credentials read from the referenced Secrets) so its *client-side* Helm install flow can list chart versions. aif does NOT install client-side: the operator resolves registry credentials server-side (`internal/controller/settings_controller.go` → `internal/manager/engine_bus.go` → `pkg/helm` engine via `UpdateSettings`) and pulls charts itself (this is also what backs Task 3-0's `getAppValues`). Re-adding client-side ClusterRepo creation would be the wrong pattern for aif and is intentionally omitted. The `internal/infra/rancher` `EnsureClusterRepo` that does exist is for UIPlugin extension installs (P6-11), a different concern.

---

## Foundation

### User-Facing Features & Behaviors

- **None directly.** This group is pure backend + shared-UI infrastructure: the shared `WizardStepIndicator` and `InstallProgressModal` components, `Create`/`Delete` on the workload repository, the Workload REST endpoints (`POST`/`PATCH`/`DELETE /api/v1/workloads`), the Fleet Bundle and Fleet GitRepo delivery engines, and the git-publish path.
- Nothing new appears in the browser after this group alone — its value is unlocked by Groups 3, 4, and 5 (install/manage/upgrade/delete all ride on these endpoints and components).

> Backend and shared UI infrastructure that all feature groups depend on. Complete these before starting any group.

### Task F-1: Shared wizard components (WizardStepIndicator + InstallProgressModal)

All four wizards (App Install, Blueprint Install, Blueprint Create, App Manage) use the same step indicator, and both install wizards (App Install in Group 3, Blueprint Install in Group 4) use the same per-cluster `InstallProgressModal`. Because Group 3 runs before Group 4, both shared components are built here in Foundation so every consumer can import them.

**Files:**
- Create: `ui/ai-factory/pkg/ai-factory/components/wizards/WizardStepIndicator.vue`
- Create: `ui/ai-factory/pkg/ai-factory/components/wizards/InstallProgressModal.vue`
- Create: `ui/ai-factory/pkg/ai-factory/test/p6-wizard-step-indicator.test.mjs`

- [ ] **Step 1: Write failing scaffold test**

Create `ui/ai-factory/pkg/ai-factory/test/p6-wizard-step-indicator.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${ p }`, import.meta.url), 'utf8');

test('WizardStepIndicator.vue: exists and exports name', () => {
  const src = read('components/wizards/WizardStepIndicator.vue');
  assert.match(src, /name:\s*'WizardStepIndicator'/);
});

test('WizardStepIndicator.vue: accepts steps and currentStep props', () => {
  const src = read('components/wizards/WizardStepIndicator.vue');
  assert.match(src, /steps/);
  assert.match(src, /currentStep/);
});

test('WizardStepIndicator.vue: renders step numbers and labels', () => {
  const src = read('components/wizards/WizardStepIndicator.vue');
  assert.match(src, /v-for.*step/);
  assert.match(src, /step\.label|step\.title/);
});

test('WizardStepIndicator.vue: emits go-to-step on completed step click', () => {
  const src = read('components/wizards/WizardStepIndicator.vue');
  assert.match(src, /emit.*go-to-step|go-to-step/);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-wizard-step-indicator.test.mjs 2>&1 | tail -10
```

Expected: `not ok` — file does not exist.

- [ ] **Step 3: Create the components/wizards directory and implement the component**

```bash
mkdir -p ui/ai-factory/pkg/ai-factory/components/wizards
```

Create `ui/ai-factory/pkg/ai-factory/components/wizards/WizardStepIndicator.vue`:

```vue
<template>
  <div class="wizard-step-indicator">
    <div
      v-for="(step, index) in steps"
      :key="index"
      class="wizard-step-indicator__step"
      :class="{
        'wizard-step-indicator__step--active':    index === currentStep,
        'wizard-step-indicator__step--completed': index < currentStep,
      }"
      @click="onStepClick(index)"
    >
      <div class="wizard-step-indicator__circle">
        <span v-if="index < currentStep" class="wizard-step-indicator__check">✓</span>
        <span v-else>{{ index + 1 }}</span>
      </div>
      <span class="wizard-step-indicator__label">{{ step.label || step.title }}</span>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'WizardStepIndicator',

  props: {
    steps: {
      type:     Array,
      required: true,
    },
    currentStep: {
      type:    Number,
      default: 0,
    },
  },

  emits: ['go-to-step'],

  methods: {
    onStepClick(index) {
      if (index < this.currentStep) {
        this.$emit('go-to-step', index);
      }
    },
  },
});
</script>

<style scoped>
.wizard-step-indicator {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
}

.wizard-step-indicator__step {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  opacity: 0.5;
}

.wizard-step-indicator__step--active,
.wizard-step-indicator__step--completed {
  opacity: 1;
}

.wizard-step-indicator__step--completed {
  cursor: pointer;
}

.wizard-step-indicator__circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.8rem;
  flex-shrink: 0;
}

.wizard-step-indicator__step--active .wizard-step-indicator__circle {
  background: var(--primary);
  color: #fff;
}

.wizard-step-indicator__step--completed .wizard-step-indicator__circle {
  background: var(--success);
  border-color: var(--success);
  color: #fff;
}
</style>
```

- [ ] **Step 3b: Create the shared InstallProgressModal**

Both install wizards show the same per-cluster progress modal. Create `ui/ai-factory/pkg/ai-factory/components/wizards/InstallProgressModal.vue`:

```vue
<template>
  <div v-if="show" class="aif-progress-modal__backdrop">
    <div class="aif-progress-modal">
      <h3>{{ title }}</h3>
      <ul class="aif-progress-modal__list">
        <li v-for="item in progress" :key="item.clusterId" class="aif-progress-modal__item">
          <span :class="`aif-progress-modal__icon aif-progress-modal__icon--${ item.status }`">
            <i v-if="item.status === 'installing'" class="icon icon-spinner icon-spin" />
            <i v-else-if="item.status === 'success'" class="icon icon-checkmark" />
            <i v-else class="icon icon-warning" />
          </span>
          <span class="aif-progress-modal__cluster">{{ item.clusterName || item.clusterId }}</span>
          <span class="aif-progress-modal__msg">{{ item.message }}</span>
        </li>
      </ul>
      <div class="aif-progress-modal__footer">
        <button v-if="isDone" class="btn role-primary" @click="$emit('done')">Done</button>
        <button v-else class="btn role-secondary" @click="$emit('cancel')">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'InstallProgressModal',

  props: {
    show:     { type: Boolean, default: false },
    title:    { type: String,  default: 'Installing' },
    progress: { type: Array,   default: () => [] },
  },

  emits: ['done', 'cancel'],

  computed: {
    isDone() {
      return this.progress.length > 0 && this.progress.every((p) => p.status !== 'installing');
    },
  },
});
</script>

<style scoped>
.aif-progress-modal__backdrop {
  position: fixed; inset: 0; background: rgba(0, 0, 0, .5); display: flex;
  align-items: center; justify-content: center; z-index: 1000;
}
.aif-progress-modal {
  background: var(--body-bg); border-radius: 6px; padding: 24px;
  min-width: 400px; max-width: 560px; width: 100%;
}
.aif-progress-modal h3 { margin: 0 0 16px; font-size: 16px; font-weight: 600; }
.aif-progress-modal__list { list-style: none; padding: 0; margin: 0 0 16px; }
.aif-progress-modal__item {
  display: flex; align-items: center; gap: 10px; padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.aif-progress-modal__item:last-child { border-bottom: none; }
.aif-progress-modal__icon--success { color: var(--success); }
.aif-progress-modal__icon--failed  { color: var(--error); }
.aif-progress-modal__msg { font-size: 12px; color: var(--muted); margin-left: auto; }
.aif-progress-modal__footer { display: flex; justify-content: flex-end; }
</style>
```

- [ ] **Step 4: Run scaffold tests**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-wizard-step-indicator.test.mjs 2>&1
```

Expected: all `ok`

- [ ] **Step 5: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/components/wizards/ \
        ui/ai-factory/pkg/ai-factory/test/p6-wizard-step-indicator.test.mjs
git commit -m "feat(ui): add shared WizardStepIndicator and InstallProgressModal components"
```

---

### Task F-2: pkg/workload — add Create and Delete to existing repository

`pkg/workload/repository.go`, `k8s_repository.go`, and `fake_repository.go` already exist with `Reader` (Get, List) and `Writer` (Update, UpdateStatus, Patch). This task extends `Writer` to add `Create` and `Delete`, implementing them in both the K8s and fake backends, so the HTTP handler in Task F-3 can create and delete Workload CRs.

**Files:**
- Modify: `pkg/workload/k8s_repository.go`
- Modify: `pkg/workload/fake_repository.go`
- Modify: `pkg/workload/fake_repository_test.go`

- [ ] **Step 1: Write failing tests for Create and Delete on FakeRepository**

Open `pkg/workload/fake_repository_test.go` and add at the end:

```go
func TestFakeRepository_Create(t *testing.T) {
	f := NewFakeRepository()
	w := &aifv1.Workload{}
	w.Namespace = "ns"
	w.Name = "wl"
	w.Spec.Source.Kind = aifv1.WorkloadSourceKindApp

	if err := f.Create(context.Background(), w); err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := f.Get(context.Background(), "ns", "wl")
	if err != nil {
		t.Fatalf("Get after Create: %v", err)
	}
	if got.Spec.Source.Kind != aifv1.WorkloadSourceKindApp {
		t.Errorf("source kind = %v, want App", got.Spec.Source.Kind)
	}
}

func TestFakeRepository_Create_ErrorInjection(t *testing.T) {
	f := NewFakeRepository()
	f.CreateErr = fmt.Errorf("injected")
	w := &aifv1.Workload{}
	w.Namespace = "ns"
	w.Name = "wl"

	if err := f.Create(context.Background(), w); err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestFakeRepository_Delete(t *testing.T) {
	f := NewFakeRepository()
	w := &aifv1.Workload{}
	w.Namespace = "ns"
	w.Name = "wl"
	f.Seed(w)

	if err := f.Delete(context.Background(), "ns", "wl"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := f.Get(context.Background(), "ns", "wl"); err == nil {
		t.Fatal("expected NotFound after Delete, got nil")
	}
}

func TestFakeRepository_Delete_NotFound(t *testing.T) {
	f := NewFakeRepository()
	err := f.Delete(context.Background(), "ns", "missing")
	if err == nil {
		t.Fatal("expected error for missing workload, got nil")
	}
	if !apierrors.IsNotFound(err) {
		t.Errorf("expected NotFound error, got %v", err)
	}
}

func TestFakeRepository_Delete_ErrorInjection(t *testing.T) {
	f := NewFakeRepository()
	w := &aifv1.Workload{}
	w.Namespace = "ns"
	w.Name = "wl"
	f.Seed(w)
	f.DeleteErr = fmt.Errorf("injected delete error")

	if err := f.Delete(context.Background(), "ns", "wl"); err == nil {
		t.Fatal("expected error, got nil")
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
go test ./pkg/workload/... -run "TestFakeRepository_Create|TestFakeRepository_Delete" -v 2>&1 | tail -20
```

Expected: `FAIL` — `f.Create undefined`, `f.Delete undefined`

- [ ] **Step 3: Add Create and Delete to FakeRepository**

In `pkg/workload/fake_repository.go`, add `CreateErr` and `DeleteErr` fields to the struct, then add the two methods:

```go
// In FakeRepository struct, add after CountByBlueprintErr:
CreateErr error
DeleteErr error
```

```go
func (f *FakeRepository) Create(_ context.Context, w *aifv1.Workload) error {
	if f.CreateErr != nil {
		return f.CreateErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.items[key(w.Namespace, w.Name)] = w.DeepCopy()
	return nil
}

func (f *FakeRepository) Delete(_ context.Context, namespace, name string) error {
	if f.DeleteErr != nil {
		return f.DeleteErr
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	k := key(namespace, name)
	if _, ok := f.items[k]; !ok {
		return apierrors.NewNotFound(schema.GroupResource{Group: "ai.suse.com", Resource: "workloads"}, name)
	}
	delete(f.items, k)
	return nil
}
```

- [ ] **Step 4: Add Create and Delete to k8s_repository**

In `pkg/workload/k8s_repository.go`, add after the `Patch` method:

```go
func (r *k8sRepository) Create(ctx context.Context, w *aifv1.Workload) error {
	return r.c.Create(ctx, w)
}

func (r *k8sRepository) Delete(ctx context.Context, namespace, name string) error {
	w := &aifv1.Workload{}
	w.Namespace = namespace
	w.Name = name
	return r.c.Delete(ctx, w)
}
```

- [ ] **Step 5: Run tests again — expect PASS**

```bash
go test ./pkg/workload/... -run "TestFakeRepository_Create|TestFakeRepository_Delete" -v 2>&1 | tail -20
```

Expected: all 5 new tests `PASS`

- [ ] **Step 6: Run full workload package tests to check for regressions**

```bash
go test ./pkg/workload/... -v 2>&1 | grep -E "^(ok|FAIL|---)"
```

Expected: `ok  github.com/SUSE/aif/pkg/workload`

- [ ] **Step 7: Commit**

```bash
git add pkg/workload/fake_repository.go pkg/workload/k8s_repository.go pkg/workload/fake_repository_test.go
git commit -m "feat(workload): add Create and Delete to k8s and fake repositories"
```

---

### Task F-3: WorkloadsHandler CRUD + operator-api.ts workload functions + routes

This task combines all workload HTTP API work: the list/delete handler (former Task 2), the create endpoint and operator-api wiring (former Tasks 9 and 10), and the PATCH handler (former Task 13). Complete all steps in sequence.

**Existing state:** `internal/api/workloads.go` already exists with:
```go
type WorkloadsHandler struct { upgrader workload.Upgrader; logger *slog.Logger }
func NewWorkloadsHandler(upgrader workload.Upgrader, logger *slog.Logger) *WorkloadsHandler
```
The `Register` method currently registers only `POST /api/v1/workloads/{namespace}/{name}/upgrade`. This task extends the existing file — Step 3 adds `reader workloadReader` and `mutator workloadMutator` fields to the struct, updates `NewWorkloadsHandler` to accept the two new ports, and adds new routes to the existing `Register` method alongside the upgrade route. Do NOT recreate the file from scratch.

**Files:**
- Modify: `internal/api/workloads.go`
- Modify: `internal/api/workloads_test.go`
- Modify: `cmd/operator/main.go`
- Modify: `ui/ai-factory/pkg/ai-factory/utils/operator-api.ts`
- Modify: `ui/ai-factory/pkg/ai-factory/routing/index.ts`
- Modify: `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`

- [ ] **Step 1: Write failing tests for list and delete**

Add to `internal/api/workloads_test.go`:

```go
// listDeleteTestRig wires list + delete handlers over FakeRepository.
type listDeleteTestRig struct {
	mux  *http.ServeMux
	repo *workload.FakeRepository
}

func newListDeleteTestRig(t *testing.T) *listDeleteTestRig {
	t.Helper()
	repo := workload.NewFakeRepository()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	mux := http.NewServeMux()
	upgrader := workload.NewUpgrader(
		workload.NewFakeWorkloadStore(),
		workload.NewFakeBlueprintReader(),
		&workload.FakeUpgradeEventRecorder{},
		logger,
	)
	h := NewWorkloadsHandler(upgrader, repo, logger)
	h.Register(mux)
	return &listDeleteTestRig{mux: mux, repo: repo}
}

func seedWorkload(repo *workload.FakeRepository, ns, name string, kind aifv1.WorkloadSourceKind) {
	w := &aifv1.Workload{}
	w.Namespace = ns
	w.Name = name
	w.Spec.Source.Kind = kind
	repo.Seed(w)
}

func TestWorkloadsList_Empty(t *testing.T) {
	rig := newListDeleteTestRig(t)
	req := httptest.NewRequest("GET", "/api/v1/workloads", nil)
	req.Header.Set("Impersonate-User", "alice")
	rr := httptest.NewRecorder()
	rig.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var result []any
	if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected empty array, got %d items", len(result))
	}
}

func TestWorkloadsList_WithItems(t *testing.T) {
	rig := newListDeleteTestRig(t)
	seedWorkload(rig.repo, "ns-a", "wl-1", aifv1.WorkloadSourceKindApp)
	seedWorkload(rig.repo, "ns-b", "wl-2", aifv1.WorkloadSourceKindBlueprint)

	req := httptest.NewRequest("GET", "/api/v1/workloads", nil)
	req.Header.Set("Impersonate-User", "alice")
	rr := httptest.NewRecorder()
	rig.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var result []any
	if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(result) != 2 {
		t.Errorf("expected 2 workloads, got %d", len(result))
	}
}

func TestWorkloadsList_MissingUser(t *testing.T) {
	rig := newListDeleteTestRig(t)
	req := httptest.NewRequest("GET", "/api/v1/workloads", nil)
	rr := httptest.NewRecorder()
	rig.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rr.Code)
	}
}

func TestWorkloadsDelete_HappyPath(t *testing.T) {
	rig := newListDeleteTestRig(t)
	seedWorkload(rig.repo, "team-a", "my-wl", aifv1.WorkloadSourceKindApp)

	req := httptest.NewRequest("DELETE", "/api/v1/workloads/team-a/my-wl", nil)
	req.Header.Set("Impersonate-User", "alice")
	rr := httptest.NewRecorder()
	rig.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rr.Code, rr.Body.String())
	}
	// Confirm deleted
	req2 := httptest.NewRequest("GET", "/api/v1/workloads", nil)
	req2.Header.Set("Impersonate-User", "alice")
	rr2 := httptest.NewRecorder()
	rig.mux.ServeHTTP(rr2, req2)
	var items []any
	json.NewDecoder(rr2.Body).Decode(&items)
	if len(items) != 0 {
		t.Errorf("expected 0 workloads after delete, got %d", len(items))
	}
}

func TestWorkloadsDelete_NotFound(t *testing.T) {
	rig := newListDeleteTestRig(t)
	req := httptest.NewRequest("DELETE", "/api/v1/workloads/ns/missing", nil)
	req.Header.Set("Impersonate-User", "alice")
	rr := httptest.NewRecorder()
	rig.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

func TestWorkloadsDelete_MissingUser(t *testing.T) {
	rig := newListDeleteTestRig(t)
	req := httptest.NewRequest("DELETE", "/api/v1/workloads/ns/wl", nil)
	rr := httptest.NewRecorder()
	rig.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rr.Code)
	}
}
```

Also add the missing import `aifv1 "github.com/SUSE/aif/api/v1alpha1"` to `workloads_test.go`.

- [ ] **Step 2: Run to confirm failures**

```bash
go test ./internal/api/... -run "TestWorkloadsList|TestWorkloadsDelete" -v 2>&1 | tail -30
```

Expected: compile error — `NewWorkloadsHandler` called with 3 args but accepts 2.

- [ ] **Step 3: Add workloadReader / workloadMutator interfaces and update WorkloadsHandler**

In `internal/api/workloads.go`, add the consumer-side interface and update the struct + constructor:

```go
import (
    // existing imports plus:
    aifv1 "github.com/SUSE/aif/api/v1alpha1"
    apierrors "k8s.io/apimachinery/pkg/api/errors"
    "k8s.io/apimachinery/pkg/labels"
)

// workloadReader is the consumer-defined read port. Satisfied by
// *workload.k8sRepository and *workload.FakeRepository in tests.
// ≤4 methods (ISP).
type workloadReader interface {
    List(ctx context.Context, namespace string, selector labels.Selector) ([]aifv1.Workload, error)
    Get(ctx context.Context, namespace, name string) (*aifv1.Workload, error)
}

// workloadMutator is the consumer-defined write port. Satisfied by
// *workload.k8sRepository (after Task F-2 adds Create/Delete) and
// *workload.FakeRepository in tests.
// ≤4 methods (ISP).
type workloadMutator interface {
    Create(ctx context.Context, w *aifv1.Workload) error
    Delete(ctx context.Context, namespace, name string) error
    Patch(ctx context.Context, w, orig *aifv1.Workload) error
}
```

Update the struct:

```go
type WorkloadsHandler struct {
    upgrader workload.Upgrader
    reader   workloadReader
    mutator  workloadMutator
    logger   *slog.Logger
}

func NewWorkloadsHandler(upgrader workload.Upgrader, reader workloadReader, mutator workloadMutator, logger *slog.Logger) *WorkloadsHandler {
    return &WorkloadsHandler{upgrader: upgrader, reader: reader, mutator: mutator, logger: logger}
}
```

Update `Register`:

```go
func (h *WorkloadsHandler) Register(mux *http.ServeMux) {
    mux.HandleFunc("GET /api/v1/workloads", h.list)
    mux.HandleFunc("DELETE /api/v1/workloads/{namespace}/{name}", h.deleteWorkload)
    mux.HandleFunc("POST /api/v1/workloads/{namespace}/{name}/upgrade", h.upgrade)
}
```

Add the two new handler methods:

```go
func (h *WorkloadsHandler) list(w http.ResponseWriter, r *http.Request) {
    user, _ := ExtractUser(r)
    if user == "" {
        writeError(w, http.StatusForbidden, fmt.Errorf("%w: Impersonate-User header missing", ErrForbidden))
        return
    }
    items, err := h.reader.List(r.Context(), "", nil)
    if err != nil {
        LoggerFromContext(r.Context()).Error("list workloads failed", "error", err)
        writeError(w, http.StatusInternalServerError, ErrInternal)
        return
    }
    writeJSON(w, http.StatusOK, items)
}

func (h *WorkloadsHandler) deleteWorkload(w http.ResponseWriter, r *http.Request) {
    user, _ := ExtractUser(r)
    if user == "" {
        writeError(w, http.StatusForbidden, fmt.Errorf("%w: Impersonate-User header missing", ErrForbidden))
        return
    }
    ns := r.PathValue("namespace")
    name := r.PathValue("name")
    if err := h.mutator.Delete(r.Context(), ns, name); err != nil {
        if apierrors.IsNotFound(err) {
            writeError(w, http.StatusNotFound, ErrNotFound)
            return
        }
        LoggerFromContext(r.Context()).Error("delete workload failed", "ns", ns, "name", name, "error", err)
        writeError(w, http.StatusInternalServerError, ErrInternal)
        return
    }
    LoggerFromContext(r.Context()).Info("workload deleted", "namespace", ns, "name", name, "user", user)
    w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 4: Fix the existing upgrade test rig to pass nil reader and mutator**

In `workloads_test.go`, update `newUpgradeTestRig` to pass `nil` for both reader and mutator (upgrade tests don't need CRUD):

```go
func newUpgradeTestRig(t *testing.T) *upgradeTestRig {
    t.Helper()
    wStore := workload.NewFakeWorkloadStore()
    bpReader := workload.NewFakeBlueprintReader()
    rec := &workload.FakeUpgradeEventRecorder{}
    logger := slog.New(slog.NewTextHandler(io.Discard, nil))
    upgrader := workload.NewUpgrader(wStore, bpReader, rec, logger)

    mux := http.NewServeMux()
    h := NewWorkloadsHandler(upgrader, nil, nil, logger)
    h.Register(mux)
    return &upgradeTestRig{mux: mux, workloads: wStore, blueprints: bpReader, events: rec}
}
```

- [ ] **Step 5: Run all workloads handler tests**

```bash
go test ./internal/api/... -run "TestWorkload" -v 2>&1 | grep -E "^(=== RUN|--- PASS|--- FAIL|FAIL|ok)"
```

Expected: all `--- PASS`

- [ ] **Step 6: Update main.go to pass the repository**

In `cmd/operator/main.go`, change the workloads handler wiring:

```go
// Replace the existing two lines:
//   workloadRepo := workload.NewK8sRepository(mgr.GetClient()).AsRepository()
//   ...
//   workloadsHandler := api.NewWorkloadsHandler(workloadUpgrader, logger)
//
// With:
workloadK8sRepo := workload.NewK8sRepository(mgr.GetClient())
workloadRepo    := workloadK8sRepo.AsRepository()
upgradeStore    := internalworkload.NewUpgradeStore(workloadRepo)
upgradeBlueprintReader := internalworkload.NewBlueprintReader(blueprintRepo)
upgradeRecorder := internalworkload.NewEventRecorder(mgr.GetEventRecorder("workload-upgrader"))
workloadUpgrader := workload.NewUpgrader(upgradeStore, upgradeBlueprintReader, upgradeRecorder, logger)
// workloadK8sRepo satisfies both workloadReader and workloadMutator — pass it for both.
workloadsHandler := api.NewWorkloadsHandler(workloadUpgrader, workloadK8sRepo, workloadK8sRepo, logger)
```

- [ ] **Step 7: Build to verify no compile errors**

```bash
go build ./... 2>&1
```

Expected: no output (clean build)

- [ ] **Step 8: Commit**

```bash
git add internal/api/workloads.go internal/api/workloads_test.go cmd/operator/main.go
git commit -m "feat(api): add GET /api/v1/workloads and DELETE /api/v1/workloads/{ns}/{name}"
```

- [ ] **Step 9: Write failing tests for Workload Create**

Add to `internal/api/workloads_test.go`:

```go
func TestWorkloadsCreate_HappyPathApp(t *testing.T) {
	rig := newListDeleteTestRig(t)
	body := map[string]any{
		"metadata": map[string]any{
			"name":      "my-wl",
			"namespace": "team-a",
		},
		"spec": map[string]any{
			"source": map[string]any{
				"kind": "App",
				"app":  map[string]any{"repo": "dp.apps.rancher.io", "chart": "nvidia-nim", "version": "1.0.0"},
			},
			"targetClusters":  []string{"c-abc123"},
			"deployStrategy":  "helm",
		},
	}
	buf, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/api/v1/workloads", bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Impersonate-User", "alice")
	rr := httptest.NewRecorder()
	rig.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestWorkloadsCreate_MissingName(t *testing.T) {
	rig := newListDeleteTestRig(t)
	body := map[string]any{
		"metadata": map[string]any{"namespace": "team-a"},
		"spec":     map[string]any{"source": map[string]any{"kind": "App"}},
	}
	buf, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/api/v1/workloads", bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Impersonate-User", "alice")
	rr := httptest.NewRecorder()
	rig.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

func TestWorkloadsCreate_MissingUser(t *testing.T) {
	rig := newListDeleteTestRig(t)
	req := httptest.NewRequest("POST", "/api/v1/workloads", bytes.NewReader([]byte(`{}`)))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	rig.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rr.Code)
	}
}
```

Also add `"bytes"` to the workloads_test.go imports.

- [ ] **Step 10: Run to confirm failures**

```bash
go test ./internal/api/... -run "TestWorkloadsCreate" -v 2>&1 | tail -10
```

Expected: `405 Method Not Allowed` — `POST /api/v1/workloads` not registered.

- [ ] **Step 11: Add create request struct and handler**

In `internal/api/workloads.go`, add:

```go
type createWorkloadRequest struct {
	Metadata struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	} `json:"metadata"`
	Spec aifv1.WorkloadSpec `json:"spec"`
}
```

Add to `Register`:

```go
mux.HandleFunc("POST /api/v1/workloads", h.createWorkload)
```

Add handler method:

```go
func (h *WorkloadsHandler) createWorkload(w http.ResponseWriter, r *http.Request) {
	user, _ := ExtractUser(r)
	if user == "" {
		writeError(w, http.StatusForbidden, fmt.Errorf("%w: Impersonate-User header missing", ErrForbidden))
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var req createWorkloadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("%w: invalid request body: %v", ErrInvalidInput, err))
		return
	}
	if req.Metadata.Name == "" || req.Metadata.Namespace == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("%w: metadata.name and metadata.namespace are required", ErrInvalidInput))
		return
	}

	wl := &aifv1.Workload{}
	wl.Name = req.Metadata.Name
	wl.Namespace = req.Metadata.Namespace
	wl.Spec = req.Spec
	// WorkloadSpec.Name is a required display-name field (MinLength=1). Default
	// to metadata.name if the caller omits it.
	if wl.Spec.Name == "" {
		wl.Spec.Name = req.Metadata.Name
	}

	if err := h.mutator.Create(r.Context(), wl); err != nil {
		if apierrors.IsAlreadyExists(err) {
			writeError(w, http.StatusConflict, ErrConflict)
			return
		}
		LoggerFromContext(r.Context()).Error("create workload failed", "name", wl.Name, "namespace", wl.Namespace, "error", err)
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}

	LoggerFromContext(r.Context()).Info("workload created", "namespace", wl.Namespace, "name", wl.Name, "user", user)
	writeJSON(w, http.StatusCreated, wl)
}
```

- [ ] **Step 12: Fix newListDeleteTestRig to use fake client**

The `FakeRepository` needs to satisfy both `workloadReader` and `workloadMutator` for the create test. Ensure `*workload.FakeRepository` implements `Create` (done in Task F-2). The existing `newListDeleteTestRig` passes `repo` (`*workload.FakeRepository`) as both reader and mutator — this already works since it implements all five methods.

- [ ] **Step 13: Run all workload handler tests**

```bash
go test ./internal/api/... -run "TestWorkload" -v 2>&1 | grep -E "^(=== RUN|--- PASS|--- FAIL|FAIL|ok)"
```

Expected: all `--- PASS`

- [ ] **Step 14: Commit**

```bash
git add internal/api/workloads.go internal/api/workloads_test.go
git commit -m "feat(api): add POST /api/v1/workloads (Workload Create)"
```

- [ ] **Step 15: Write failing tests for Workload Patch**

Add to `internal/api/workloads_test.go`:

```go
func TestWorkloadsPatch_HappyPath(t *testing.T) {
	rig := newListDeleteTestRig(t)
	// Seed an App workload
	w := &aifv1.Workload{}
	w.Namespace = "team-a"
	w.Name = "my-app"
	w.ResourceVersion = "1"
	w.Spec.Source.Kind = aifv1.WorkloadSourceKindApp
	w.Spec.Source.App = &aifv1.AppRef{Repo: "repo", Chart: "chart", Version: "1.0.0"}
	rig.repo.Seed(w)

	body := map[string]any{
		"spec": map[string]any{
			"source": map[string]any{
				"kind": "App",
				"app":  map[string]any{"repo": "repo", "chart": "chart", "version": "2.0.0"},
			},
		},
	}
	buf, _ := json.Marshal(body)
	req := httptest.NewRequest("PATCH", "/api/v1/workloads/team-a/my-app", bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Impersonate-User", "alice")
	rr := httptest.NewRecorder()
	rig.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestWorkloadsPatch_NotFound(t *testing.T) {
	rig := newListDeleteTestRig(t)
	body := map[string]any{"spec": map[string]any{}}
	buf, _ := json.Marshal(body)
	req := httptest.NewRequest("PATCH", "/api/v1/workloads/ns/missing", bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Impersonate-User", "alice")
	rr := httptest.NewRecorder()
	rig.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

func TestWorkloadsPatch_MissingUser(t *testing.T) {
	rig := newListDeleteTestRig(t)
	req := httptest.NewRequest("PATCH", "/api/v1/workloads/ns/wl", bytes.NewReader([]byte(`{}`)))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	rig.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rr.Code)
	}
}
```

- [ ] **Step 16: Run to confirm failures**

```bash
go test ./internal/api/... -run "TestWorkloadsPatch" -v 2>&1 | tail -10
```

Expected: 405 Method Not Allowed.

- [ ] **Step 17: Add patchWorkload request struct, register route, and add handler**

In `internal/api/workloads.go`, add to `Register`:

```go
mux.HandleFunc("PATCH /api/v1/workloads/{namespace}/{name}", h.patchWorkload)
```

Add struct and handler:

```go
type patchWorkloadRequest struct {
	Spec aifv1.WorkloadSpec `json:"spec"`
}

func (h *WorkloadsHandler) patchWorkload(w http.ResponseWriter, r *http.Request) {
	user, _ := ExtractUser(r)
	if user == "" {
		writeError(w, http.StatusForbidden, fmt.Errorf("%w: Impersonate-User header missing", ErrForbidden))
		return
	}

	ns   := r.PathValue("namespace")
	name := r.PathValue("name")

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var req patchWorkloadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("%w: invalid request body: %v", ErrInvalidInput, err))
		return
	}

	orig, err := h.reader.Get(r.Context(), ns, name)
	if err != nil {
		if apierrors.IsNotFound(err) {
			writeError(w, http.StatusNotFound, ErrNotFound)
			return
		}
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}

	patched := orig.DeepCopy()
	patched.Spec = req.Spec
	// Preserve the required display-name field — callers sending a partial spec
	// should not accidentally zero it out.
	if patched.Spec.Name == "" {
		patched.Spec.Name = orig.Spec.Name
	}

	if err := h.mutator.Patch(r.Context(), patched, orig); err != nil {
		if apierrors.IsConflict(err) {
			writeError(w, http.StatusConflict, ErrConflict)
			return
		}
		if apierrors.IsNotFound(err) {
			writeError(w, http.StatusNotFound, ErrNotFound)
			return
		}
		LoggerFromContext(r.Context()).Error("patch workload failed", "ns", ns, "name", name, "error", err)
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}

	LoggerFromContext(r.Context()).Info("workload patched", "namespace", ns, "name", name, "user", user)
	writeJSON(w, http.StatusOK, patched)
}
```

- [ ] **Step 18: Run all workload handler tests**

```bash
go test ./internal/api/... -run "TestWorkload" -v 2>&1 | grep -E "^(=== RUN|--- PASS|--- FAIL|FAIL|ok)"
```

Expected: all `--- PASS`

- [ ] **Step 19: Commit**

```bash
git add internal/api/workloads.go internal/api/workloads_test.go
git commit -m "feat(api): add PATCH /api/v1/workloads/{ns}/{name} (App Manage)"
```

- [ ] **Step 20: Add createWorkload and patchWorkload to operator-api.ts**

After the `deleteWorkload` function, add:

```typescript
export function createWorkload(spec: any): Promise<any> {
  return operatorFetch('/api/v1/workloads', { method: 'POST', body: JSON.stringify(spec) });
}

export function patchWorkload(namespace: string, name: string, spec: any): Promise<any> {
  return operatorFetch(`/api/v1/workloads/${ namespace }/${ name }`, {
    method: 'PATCH',
    body:   JSON.stringify(spec),
  });
}
```

- [ ] **Step 21: Add wizard and manage routes to routing/index.ts**

Append to the `routes` array in `ui/ai-factory/pkg/ai-factory/routing/index.ts`:

```typescript
  {
    name:      `${ PRODUCT_NAME }-c-cluster-app-install`,
    path:      `/c/:cluster/${ PRODUCT_NAME }/apps/:id/install`,
    component: () => import('../pages/wizards/app-install.vue'),
    meta:      { product: PRODUCT_NAME }
  },
  {
    name:      `${ PRODUCT_NAME }-c-cluster-blueprint-install`,
    path:      `/c/:cluster/${ PRODUCT_NAME }/blueprints/:bpName/:bpVersion/install`,
    component: () => import('../pages/wizards/blueprint-install.vue'),
    meta:      { product: PRODUCT_NAME }
  },
  {
    name:      `${ PRODUCT_NAME }-c-cluster-workload-manage`,
    path:      `/c/:cluster/${ PRODUCT_NAME }/workloads/:ns/:name/manage`,
    component: () => import('../pages/manage.vue'),
    meta:      { product: PRODUCT_NAME }
  },
```

- [ ] **Step 22: Add wizard l10n keys**

In `l10n/en-us.yaml`, add a new `wizards` section inside `aif.pages`:

```yaml
    wizards:
      steps:
        basicInfo: 'Basic Info'
        target: 'Target'
        configuration: 'Configuration'
        review: 'Review'
      install:
        title: 'Install {name}'
        instanceName: 'Instance Name'
        namespace: 'Namespace'
        newNamespace: 'New namespace'
        chartVersion: 'Chart Version'
        targetClusters: 'Target Clusters'
        deliveryStrategy: 'Delivery Strategy'
        strategyHelm: 'Helm (direct)'
        strategyGitops: 'GitOps (Fleet GitRepo)'
        helmValues: 'Helm Values (YAML)'
        resetDefaults: 'Reset to defaults'
        install: 'Install'
        back: 'Back'
        next: 'Next'
        cancel: 'Cancel'
        installing: 'Installing...'
        success: 'Workload created'
      manage:
        title: 'Manage {name}'
        apply: 'Apply'
        applySuccess: 'Changes applied'
```

- [ ] **Step 23: Build to verify**

```bash
cd ui/ai-factory && npm run build 2>&1 | grep -i error | head -10
```

- [ ] **Step 24: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/utils/operator-api.ts \
        ui/ai-factory/pkg/ai-factory/routing/index.ts \
        ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml
git commit -m "feat(ui): add createWorkload/patchWorkload to operator-api, wizard routes and l10n"
```

---

### Task F-4: WorkloadReconciler — Fleet Bundle (Helm delivery) + phase reconciliation

> **COMPLETED — landed in P4-3b.** Nothing to implement.
>
> What was done: `pkg/fleet/bundle_engine.go` implements `FleetBundleEngine` (SSA-based idempotent Apply/Teardown). `pkg/workload/deployer.go` routes all deploys through `FleetBundleEngine`. `pkg/workload/phase.go` implements `RecomputePhase` and `AggregateClusterPhases`. The `WorkloadReconciler` in `internal/controller/workload_controller.go` owns the phase lifecycle and its `SetupWithManager` already calls `.Owns(&fleetv1.Bundle{})`.
>
> An executor MUST skip this task entirely.

---

### Task F-5: Git client + POST /api/v1/git/publish endpoint

> **COMPLETED (P4-3)** — This task has already landed in the `aif` repository.
>
> What was done: `pkg/git/gogit_engine.go` implements the full go-git engine. The old `pkg/git/git.go` stub is gone — the package now exports an `Engine` interface (`Push(ctx, PushRequest) (PushResult, error)`) with `NewEngine(logger)` constructor. Auth is handled by `buildAuthMethod` supporting SSH private key (`ssh-privatekey` Secret field), token (Basic `x-token-auth`), and HTTP Basic. In-memory clone + manifest-tree commit + push pattern — no disk I/O. `EngineSettings` carries `RepoURL`, `Branch`, `GitAuth` and is pushed via `UpdateSettings`. `pkg/fleet/gitrepo_engine.go` uses this engine for GitOps delivery.
>
> An executor MUST skip this task entirely.

---

### Task F-6: WorkloadReconciler — Fleet GitRepo (GitOps delivery) + phase reconciliation

> **COMPLETED (P4-3)** — This task has already landed in the `aif` repository.
>
> What was done: `pkg/fleet/gitrepo_engine.go` implements `FleetGitRepoEngine` with SSA-based idempotent `Apply()` and `Teardown()`. `Apply()` pushes a manifest tree via `git.Engine` then SSA-applies one `fleetv1.GitRepo` CR per target cluster. `pkg/workload/deployer.go` `Deploy()` now switches on `req.DeployStrategy`: `"gitops"` → `d.fleetGitRepo.Apply()`, default/`"helm"` → `d.fleetBundle.Apply()`. `Teardown()` calls both engines. Dispatch is in the deployer — the `WorkloadReconciler` itself does NOT have `ensureFleetGitRepo`/`deleteFleetGitRepo` helpers; fleet management is fully delegated to the deployer. `WorkloadReconciler.SetupWithManager` already calls `.Owns(&fleetv1.Bundle{}).Owns(&fleetv1.GitRepo{})`. `cmd/operator/main.go` constructs `fleet.NewGitRepoEngine(logger, fleetClient, gitEngine)` and passes it via `manager.Options.FleetGitRepoEngine`. Per-cluster phase mapping for GitRepo is handled by `translateObservedGit` in `deployer.go`.
>
> An executor MUST skip this task entirely.

---

## Group 1: Apps Catalog

### User-Facing Features & Behaviors

- Open **Apps** → a grid of App cards fetched from the registries configured in Settings.
- **Registry selector** with exactly two options: **"SUSE AI Library"** (merges SUSE Application Collection + SUSE Registry) and **"Nvidia NGC"**. Default selection: SUSE AI Library.
- **Search** filters cards in real time (matches name, display name, description).
- **Refresh** re-fetches from the registry without a full page reload.
- **Tile / list view** toggle.
- Each card shows the app logo, name, a source badge, a **packaging badge** (**Helm** / **Container**), the description, and an external project link.
- **Clicking a card** opens the App Install wizard (Group 3). Before Group 3 ships, the click routes to a not-yet-existent page (404) — intended interim behavior.
- **Intentionally absent** (removed for parity): category filter, "Include Reference Blueprints" toggle, "Add to Bundle" button.
- **Deferred (known gap):** per-app installation status — "Installed in: \<cluster chips\>" on tiles, the list "Clusters" column, and the "Installed" filter checkbox.

### Task 1-1: Apps catalog — reference parity (registry selector, click-to-install, cleanup)

> **NOTE:** P6-7 shipped an Apps page, but it diverges from the reference and was previously (incorrectly) marked "skip". This task brings it into parity. The data layer (`listApps`, `getApp`, `listCategories` in `operator-api.ts`) stays; the page/card UI is reworked.

**Authoritative reference:** `/home/matamagu/suse-ai-lifecycle-manager/pkg/suse-ai-lifecycle-manager/pages/Apps.vue`.

**Target behavior (confirmed with product owner):**
1. Grid of App cards fetched from registries configured in Settings.
2. **Registry selector with exactly TWO options** (no "All"):
   - **"SUSE AI Library"** → merges SUSE Application Collection + SUSE Registry → `listApps({ source: 'suse' })`.
   - **"Nvidia NGC"** → `listApps({ source: 'nvidia' })`.
   Default selection: "SUSE AI Library". (Settings has no NVIDIA registry field yet — separate story; the Nvidia option may return an empty grid until then.)
3. **Search** filters cards in real time (client-side over name/displayName/description).
4. **Refresh** re-fetches from the registry without a page reload.
5. **Clicking an App card** navigates to the **App Install wizard** (`${ PRODUCT_NAME }-c-cluster-app-install`, params `{ cluster, id }`). That route is created in Task 3-1 and registered in F-3 Step 21; before Group 3 lands the click 404s — the intended interim behavior (same pattern as the Blueprint Install button).

**Removed for parity (no reference equivalent):**
- **Category filter** dropdown (hide for MVP1 — category metadata only exists for AppCo via API).
- **"Include Reference Blueprints"** toggle (hide for MVP1).
- **"Add to Bundle"** button + `AddToBundleDialog` (the Bundle concept is deleted in Pre-Task 0).
- **Header count pills** (total/nvidia/suse) → replaced by a **"Showing X of Y applications"** results summary.
- **List columns** Publisher / Category / Version / Updated → reference list is Name / Description / Actions.

**Added for parity:**
- **Packaging badge** "Helm" / "Container" (map `app.assetType === 'chart'` → Helm, else Container).
- **Documentation link** on the card if the App model exposes one (aif currently has only `projectURL`; keep that external link, add a docs link only if a field exists).

**Deferred — recorded gap (see Known Gaps):**
- **Installation status** ("Installed in: \<cluster chips\>" on tiles + the "Installed" filter checkbox + the list "Clusters" column). The reference computes this client-side by probing Rancher Helm releases per cluster; aif has no such discovery service and the App model carries no install data. Out of scope for MVP1.

**Files:**
- Modify: `ui/ai-factory/pkg/ai-factory/pages/apps.vue`
- Modify: `ui/ai-factory/pkg/ai-factory/components/apps/AppCard.vue`
- Delete: `ui/ai-factory/pkg/ai-factory/components/apps/AddToBundleDialog.vue` and its test `test/p6-7-add-to-bundle-dialog.test.mjs`
- Modify: `ui/ai-factory/pkg/ai-factory/utils/mock-api.ts` (drop bundle-add mock used only by the dialog, if any)
- Modify tests: `test/p6-7-apps-page.test.mjs`, `test/p6-7-app-card.test.mjs`, `test/p6-7-integration.test.mjs`
- Modify: `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`

- [ ] **Step 1: Re-baseline P6-7 tests**

The current `p6-7-*.test.mjs` files assert the OLD structure (source filter `all/nvidia/suse`, category filter, includeRefBlueprints, Add-to-Bundle, count pills). Run them to confirm the green baseline, then update the assertions per Step 2. Delete `test/p6-7-add-to-bundle-dialog.test.mjs` entirely.

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-7-apps-page.test.mjs pkg/ai-factory/test/p6-7-app-card.test.mjs 2>&1 | tail -20
```

- [ ] **Step 2: Write reference-parity scaffold tests**

In `test/p6-7-apps-page.test.mjs`, replace the structure-specific assertions:

```javascript
test('apps.vue: registry selector has SUSE AI Library and Nvidia NGC only', () => {
  const src = read('pages/apps.vue');
  assert.match(src, /aif\.pages\.apps\.toolbar\.registrySuseLibrary/);
  assert.match(src, /aif\.pages\.apps\.toolbar\.registryNvidia/);
  // no "All" option
  assert.doesNotMatch(src, /toolbar\.sourceAll/);
});

test('apps.vue: category filter and reference-blueprints toggle removed', () => {
  const src = read('pages/apps.vue');
  assert.doesNotMatch(src, /categoryFilter/);
  assert.doesNotMatch(src, /includeRefBlueprints|includeReferenceBlueprints/);
});

test('apps.vue: Add to Bundle removed', () => {
  const src = read('pages/apps.vue');
  assert.doesNotMatch(src, /AddToBundle|add-to-bundle/);
});

test('apps.vue: results summary replaces count pills', () => {
  const src = read('pages/apps.vue');
  assert.match(src, /aif\.pages\.apps\.resultsSummary/);
  assert.doesNotMatch(src, /apps-page__pill/);
});

test('apps.vue: card selection navigates to app-install route', () => {
  const src = read('pages/apps.vue');
  assert.match(src, /app-install/);
  assert.match(src, /\.id/);
});
```

In `test/p6-7-app-card.test.mjs`:

```javascript
test('AppCard.vue: whole card is clickable and emits install/select', () => {
  const src = read('components/apps/AppCard.vue');
  assert.match(src, /@click/);
  assert.match(src, /\$emit\(\s*['"](install|select)['"]/);
});

test('AppCard.vue: Add to Bundle button removed', () => {
  const src = read('components/apps/AppCard.vue');
  assert.doesNotMatch(src, /add-to-bundle/);
});

test('AppCard.vue: shows packaging badge (Helm/Container)', () => {
  const src = read('components/apps/AppCard.vue');
  assert.match(src, /aif\.pages\.apps\.packaging\.(helm|container)|assetType/);
});
```

- [ ] **Step 3: Run to confirm failures**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-7-apps-page.test.mjs pkg/ai-factory/test/p6-7-app-card.test.mjs 2>&1 | grep "not ok"
```

- [ ] **Step 4: Rework `apps.vue`**

- **Toolbar:** keep the search input and Refresh button + view toggle. Replace the source `<select>` with a 2-option registry selector:
  ```vue
  <select v-model="registry" class="apps-page__select" @change="loadApps">
    <option value="suse">{{ t('aif.pages.apps.toolbar.registrySuseLibrary') }}</option>
    <option value="nvidia">{{ t('aif.pages.apps.toolbar.registryNvidia') }}</option>
  </select>
  ```
  Remove the category `<select>` and the Include-Reference-Blueprints `<label>`/checkbox.
- **data/refs:** rename `sourceFilter` → `registry` (default `'suse'`); remove `categoryFilter`, `categories`, `includeRefBlueprints`, `showAddToBundleDialog`, `dialogApp`, and the `STORAGE_KEY` localStorage logic. `loadApps` calls `listApps({ source: registry.value })` (drop `category`/`includeReferenceBlueprints`). Remove `loadCategories` and `onAddToBundle`/`onBundleAdded`.
- **header:** remove the three count pills; under the toolbar add a results summary:
  ```vue
  <div class="apps-page__summary">{{ t('aif.pages.apps.resultsSummary', { count: filteredApps.length }) }}</div>
  ```
- **navigation:** replace the `onInstall` stub with navigation, and import `PRODUCT_NAME, MANAGEMENT_CLUSTER` from `../config/types`:
  ```javascript
  const onInstall = (app) => {
    instance?.proxy?.$router.push({
      name:   `${ PRODUCT_NAME }-c-cluster-app-install`,
      params: { cluster: MANAGEMENT_CLUSTER, id: app.id },
    });
  };
  ```
- **list view:** reduce columns to Name (logo + packaging badge), Description, Actions (a chevron, whole row clickable → `onInstall(app)`). Remove Publisher/Category/Version/Updated and both action buttons.
- Remove the `<AddToBundleDialog>` element and its import.

- [ ] **Step 5: Rework `AppCard.vue`**

- Make the **whole card clickable**: add `role="button"`, `tabindex="0"`, `@click="$emit('install', app)"`, and `@keydown.enter`/`@keydown.space.prevent`. Remove the `bp`-style action buttons block (both the disabled **Install** and **Add to Bundle** buttons) and the `add-to-bundle` emit.
- Keep the logo, title, source badge, description, and the `projectURL` external link (`@click.stop` so it doesn't trigger card navigation).
- Add a **packaging badge**: `{{ app.assetType === 'chart' ? t('aif.pages.apps.packaging.helm') : t('aif.pages.apps.packaging.container') }}`.
- `emits: ['install']`.

- [ ] **Step 6: l10n + delete dialog**

In `l10n/en-us.yaml` under `aif.pages.apps`:
```yaml
      toolbar:
        search: 'Search applications'
        registrySuseLibrary: 'SUSE AI Library'
        registryNvidia: 'Nvidia NGC'
        refresh: 'Refresh'
        viewTile: 'Tile View'
        viewList: 'List View'
      resultsSummary: '{count} application(s)'
      packaging:
        helm: 'Helm'
        container: 'Container'
```
Remove the obsolete `sourceAll/sourceNvidia/sourceSuse`, `categoryAll`, `includeRefBlueprints`, `header.*` (count pills), `card.addToBundle`, `card.installDisabled`, and `dialog.*` keys.

Delete `components/apps/AddToBundleDialog.vue`, `test/p6-7-add-to-bundle-dialog.test.mjs`, and remove the Add-to-Bundle assertions from `test/p6-7-integration.test.mjs`. `git grep AddToBundle` must return nothing afterward.

- [ ] **Step 7: Run all P6-7 tests green**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-7-*.test.mjs 2>&1
```

Expected: all `ok` (the add-to-bundle-dialog test file is gone).

- [ ] **Step 8: Browser check**

Open Apps. Confirm: registry selector shows exactly "SUSE AI Library" + "Nvidia NGC"; no category filter / no reference-blueprints toggle / no Add-to-Bundle; search filters live; cards show a Helm/Container badge; clicking a card routes to the App Install wizard (or 404s cleanly before Group 3). Results summary shows the count.

- [ ] **Step 9: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/pages/apps.vue \
        ui/ai-factory/pkg/ai-factory/components/apps/AppCard.vue \
        ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml \
        ui/ai-factory/pkg/ai-factory/test/p6-7-apps-page.test.mjs \
        ui/ai-factory/pkg/ai-factory/test/p6-7-app-card.test.mjs \
        ui/ai-factory/pkg/ai-factory/test/p6-7-integration.test.mjs \
        ui/ai-factory/pkg/ai-factory/utils/mock-api.ts
git rm ui/ai-factory/pkg/ai-factory/components/apps/AddToBundleDialog.vue \
       ui/ai-factory/pkg/ai-factory/test/p6-7-add-to-bundle-dialog.test.mjs
git commit -m "feat(ui): align Apps catalog with reference — 2-registry selector, click-to-install, drop bundle/category/ref-blueprint chrome"
```

---

## Group 2: Blueprints

### User-Facing Features & Behaviors

- Open **Blueprints** → a gallery of tiles grouped by lineage, each with a **version dropdown**.
- Toolbar: **search**, a **"Show deprecated"** toggle (deprecated versions hidden by default), a **Create** button, and **Refresh**.
- Each tile has an **Install** button plus a **three-dot (⋮) menu**.
- Three-dot menu actions: **Copy** (available to all users); **Edit**, **Deprecate/Undeprecate** (a single toggle whose label reflects current state), and **Delete** — the latter three visible **only to a Rancher global Admin**.
- **Create Blueprint** — a **4-step wizard**: Basic Info (lineage name, **semver-validated** version, use case, description) → **Select Apps** (search the catalog and add apps as components, version per app) → **Configuration** (per-component Helm values with a "Load defaults" button) → **Review & Create**. Steps are gated until valid.
- **Copy** opens the wizard pre-filled from a source blueprint; the lineage name stays editable so the user can rename it into a new lineage.
- **Edit** opens the wizard pre-filled; the lineage name is **locked**; the user bumps the version to save a new version (blueprint+version uniqueness enforced, 409 on conflict).
- **Deprecate/Undeprecate** opens a confirmation modal that **warns which active Workloads use this version**, then toggles the blueprint's phase.
- **Delete** opens a confirmation modal that **lists affected Workloads**; deletion is workload-count guarded on the backend.
- A tile's **Install** button navigates to the Blueprint Install wizard (Group 4); before Group 4 ships it 404s — intended interim behavior.

### Task 2-1: Blueprint write API (POST / PATCH / DELETE)

New `BlueprintsHandler` with three endpoints: `POST /api/v1/blueprints` (create), `PATCH /api/v1/blueprints/{name}/{version}` (toggle deprecated), `DELETE /api/v1/blueprints/{name}/{version}` (delete, with workload-count guard). Uses `client.Client` directly, same pattern as `SettingsHandler`.

**Files:**
- Create: `internal/api/blueprints.go`
- Create: `internal/api/blueprints_test.go`
- Modify: `cmd/operator/main.go`

- [ ] **Step 1: Write failing tests**

Create `internal/api/blueprints_test.go`:

```go
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	aifv1 "github.com/SUSE/aif/api/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	kruntime "k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
)

func newBlueprintScheme(t *testing.T) *kruntime.Scheme {
	t.Helper()
	s := kruntime.NewScheme()
	if err := aifv1.AddToScheme(s); err != nil {
		t.Fatalf("add aif scheme: %v", err)
	}
	return s
}

func newBlueprintFakeClient(t *testing.T, objects ...client.Object) client.Client {
	t.Helper()
	return fake.NewClientBuilder().
		WithScheme(newBlueprintScheme(t)).
		WithStatusSubresource(&aifv1.Blueprint{}).
		WithObjects(objects...).
		Build()
}

func fakeBlueprintCounter(count int32) blueprintDeploymentCounter {
	return &stubCounter{n: count}
}

type stubCounter struct{ n int32 }

func (s *stubCounter) CountByBlueprint(_ context.Context, _, _ string) (int32, error) {
	return s.n, nil
}

func newBlueprintsHandlerForTest(c client.Client, counter blueprintDeploymentCounter) http.Handler {
	mux := http.NewServeMux()
	NewBlueprintsHandler(c, counter).Register(mux)
	return mux
}

func sampleBlueprintCR(lineage, version string) *aifv1.Blueprint {
	return &aifv1.Blueprint{
		ObjectMeta: metav1.ObjectMeta{
			Name: lineage + "." + version,
			Labels: map[string]string{
				"ai.suse.com/blueprint-name":    lineage,
				"ai.suse.com/blueprint-version": version,
			},
		},
		Spec: aifv1.BlueprintSpec{
			BlueprintName: lineage,
			Version:       version,
			UseCase:       "inference",
			Source:        aifv1.BlueprintSource{Type: aifv1.BlueprintSourcePublished},
			Components: []aifv1.ComponentRef{
				{Name: "nim", Kind: aifv1.ComponentKindApp},
			},
			PublishedBy: "admin",
		},
	}
}

// --- POST /api/v1/blueprints ---

func TestBlueprintsCreate_HappyPath(t *testing.T) {
	c := newBlueprintFakeClient(t)
	h := newBlueprintsHandlerForTest(c, fakeBlueprintCounter(0))

	body := map[string]any{
		"blueprintName": "rag",
		"version":       "1.0.0",
		"useCase":       "inference",
		"publishedBy":   "admin",
		"components":    []map[string]any{{"name": "nim", "kind": "App"}},
		"source":        map[string]any{"type": "Published"},
	}
	buf, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/api/v1/blueprints", bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Impersonate-User", "admin")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestBlueprintsCreate_MissingUser(t *testing.T) {
	c := newBlueprintFakeClient(t)
	h := newBlueprintsHandlerForTest(c, fakeBlueprintCounter(0))

	req := httptest.NewRequest("POST", "/api/v1/blueprints", bytes.NewReader([]byte(`{}`)))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rr.Code)
	}
}

func TestBlueprintsCreate_InvalidBody(t *testing.T) {
	c := newBlueprintFakeClient(t)
	h := newBlueprintsHandlerForTest(c, fakeBlueprintCounter(0))

	req := httptest.NewRequest("POST", "/api/v1/blueprints", bytes.NewReader([]byte("not-json")))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Impersonate-User", "admin")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rr.Code)
	}
}

// --- PATCH /api/v1/blueprints/{name}/{version} ---

func TestBlueprintsDeprecate_HappyPath(t *testing.T) {
	bp := sampleBlueprintCR("rag", "1.0.0")
	bp.Status.Phase = aifv1.BlueprintPhaseActive
	c := newBlueprintFakeClient(t, bp)
	h := newBlueprintsHandlerForTest(c, fakeBlueprintCounter(0))

	body := map[string]any{"deprecated": true}
	buf, _ := json.Marshal(body)
	req := httptest.NewRequest("PATCH", "/api/v1/blueprints/rag/1.0.0", bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Impersonate-User", "admin")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestBlueprintsDeprecate_NotFound(t *testing.T) {
	c := newBlueprintFakeClient(t)
	h := newBlueprintsHandlerForTest(c, fakeBlueprintCounter(0))

	body := map[string]any{"deprecated": true}
	buf, _ := json.Marshal(body)
	req := httptest.NewRequest("PATCH", "/api/v1/blueprints/rag/9.9.9", bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Impersonate-User", "admin")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}

// --- DELETE /api/v1/blueprints/{name}/{version} ---

func TestBlueprintsDelete_HappyPath(t *testing.T) {
	bp := sampleBlueprintCR("rag", "1.0.0")
	c := newBlueprintFakeClient(t, bp)
	h := newBlueprintsHandlerForTest(c, fakeBlueprintCounter(0))

	req := httptest.NewRequest("DELETE", "/api/v1/blueprints/rag/1.0.0", nil)
	req.Header.Set("Impersonate-User", "admin")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestBlueprintsDelete_BlockedByWorkloads(t *testing.T) {
	bp := sampleBlueprintCR("rag", "1.0.0")
	c := newBlueprintFakeClient(t, bp)
	h := newBlueprintsHandlerForTest(c, fakeBlueprintCounter(2))

	req := httptest.NewRequest("DELETE", "/api/v1/blueprints/rag/1.0.0", nil)
	req.Header.Set("Impersonate-User", "admin")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusConflict {
		t.Errorf("expected 409, got %d", rr.Code)
	}
}

func TestBlueprintsDelete_NotFound(t *testing.T) {
	c := newBlueprintFakeClient(t)
	h := newBlueprintsHandlerForTest(c, fakeBlueprintCounter(0))

	req := httptest.NewRequest("DELETE", "/api/v1/blueprints/rag/9.9.9", nil)
	req.Header.Set("Impersonate-User", "admin")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rr.Code)
	}
}
```

- [ ] **Step 2: Run to confirm failures**

```bash
go test ./internal/api/... -run "TestBlueprints" -v 2>&1 | tail -10
```

Expected: compile error — `NewBlueprintsHandler` undefined.

- [ ] **Step 3: Implement internal/api/blueprints.go**

Create `internal/api/blueprints.go`:

```go
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	aifv1 "github.com/SUSE/aif/api/v1alpha1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

// blueprintDeploymentCounter is the consumer-defined port for checking whether
// any Workloads reference a given Blueprint version before allowing deletion.
type blueprintDeploymentCounter interface {
	CountByBlueprint(ctx context.Context, name, version string) (int32, error)
}

// BlueprintsHandler serves the Blueprint write endpoints: POST (create),
// PATCH (deprecate/undeprecate), DELETE (delete). Read endpoints are served
// via the Steve store (direct K8s API) from the UI.
type BlueprintsHandler struct {
	client  client.Client
	counter blueprintDeploymentCounter
	logger  *slog.Logger
}

// NewBlueprintsHandler wires the handler. counter may be nil if delete is not
// used (tests that only exercise create/patch can pass nil).
func NewBlueprintsHandler(c client.Client, counter blueprintDeploymentCounter) *BlueprintsHandler {
	return &BlueprintsHandler{client: c, counter: counter, logger: slog.Default()}
}

func (h *BlueprintsHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/blueprints", h.create)
	mux.HandleFunc("PATCH /api/v1/blueprints/{name}/{version}", h.deprecate)
	mux.HandleFunc("DELETE /api/v1/blueprints/{name}/{version}", h.delete)
}

// createBlueprintRequest mirrors the minimal fields needed to create a Blueprint CR.
type createBlueprintRequest struct {
	BlueprintName     string                   `json:"blueprintName"`
	Version           string                   `json:"version"`
	UseCase           string                   `json:"useCase"`
	Description       string                   `json:"description,omitempty"`
	ChangeDescription string                   `json:"changeDescription,omitempty"`
	Source            aifv1.BlueprintSource    `json:"source"`
	Components        []aifv1.ComponentRef     `json:"components"`
	ValueOverrides    map[string]string        `json:"valueOverrides,omitempty"`
	PublishedBy       string                   `json:"publishedBy"`
}

func (h *BlueprintsHandler) create(w http.ResponseWriter, r *http.Request) {
	user, _ := ExtractUser(r)
	if user == "" {
		writeError(w, http.StatusForbidden, fmt.Errorf("%w: Impersonate-User header missing", ErrForbidden))
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var req createBlueprintRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("%w: invalid request body: %v", ErrInvalidInput, err))
		return
	}
	if req.BlueprintName == "" || req.Version == "" || len(req.Components) == 0 {
		writeError(w, http.StatusBadRequest, fmt.Errorf("%w: blueprintName, version, and components are required", ErrInvalidInput))
		return
	}

	crName := req.BlueprintName + "." + req.Version
	bp := &aifv1.Blueprint{
		ObjectMeta: metav1.ObjectMeta{
			Name: crName,
			Labels: map[string]string{
				"ai.suse.com/blueprint-name":    req.BlueprintName,
				"ai.suse.com/blueprint-version": req.Version,
				"ai.suse.com/blueprint-source":  "published",
			},
		},
		Spec: aifv1.BlueprintSpec{
			BlueprintName:     req.BlueprintName,
			Version:           req.Version,
			UseCase:           req.UseCase,
			Description:       req.Description,
			ChangeDescription: req.ChangeDescription,
			Source:            req.Source,
			Components:        req.Components,
			ValueOverrides:    req.ValueOverrides,
			PublishedBy:       user,
			PublishedAt:       metav1.NewTime(time.Now().UTC()),
		},
	}

	if err := h.client.Create(r.Context(), bp); err != nil {
		if apierrors.IsAlreadyExists(err) {
			writeError(w, http.StatusConflict, ErrConflict)
			return
		}
		h.logger.Error("create blueprint failed", "name", crName, "error", err)
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}

	writeJSON(w, http.StatusCreated, bp)
}

type deprecateRequest struct {
	Deprecated bool `json:"deprecated"`
}

func (h *BlueprintsHandler) deprecate(w http.ResponseWriter, r *http.Request) {
	user, _ := ExtractUser(r)
	if user == "" {
		writeError(w, http.StatusForbidden, fmt.Errorf("%w: Impersonate-User header missing", ErrForbidden))
		return
	}

	lineage := r.PathValue("name")
	version := r.PathValue("version")

	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	var req deprecateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("%w: invalid request body", ErrInvalidInput))
		return
	}

	bp, err := h.findBlueprint(r.Context(), lineage, version)
	if err != nil {
		if apierrors.IsNotFound(err) {
			writeError(w, http.StatusNotFound, ErrNotFound)
			return
		}
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}

	if req.Deprecated {
		bp.Status.Phase = aifv1.BlueprintPhaseDeprecated
		if bp.Status.Deprecation == nil {
			bp.Status.Deprecation = &aifv1.DeprecationStatus{}
		}
		bp.Status.Deprecation.ActionedBy = user
		bp.Status.Deprecation.ActionedAt = metav1.NewTime(time.Now().UTC())
	} else {
		bp.Status.Phase = aifv1.BlueprintPhaseActive
		bp.Status.Deprecation = nil
	}

	if err := h.client.Status().Update(r.Context(), bp); err != nil {
		h.logger.Error("deprecate blueprint failed", "name", bp.Name, "error", err)
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}

	writeJSON(w, http.StatusOK, bp)
}

func (h *BlueprintsHandler) delete(w http.ResponseWriter, r *http.Request) {
	user, _ := ExtractUser(r)
	if user == "" {
		writeError(w, http.StatusForbidden, fmt.Errorf("%w: Impersonate-User header missing", ErrForbidden))
		return
	}

	lineage := r.PathValue("name")
	version := r.PathValue("version")

	bp, err := h.findBlueprint(r.Context(), lineage, version)
	if err != nil {
		if apierrors.IsNotFound(err) {
			writeError(w, http.StatusNotFound, ErrNotFound)
			return
		}
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}

	if h.counter != nil {
		count, err := h.counter.CountByBlueprint(r.Context(), lineage, version)
		if err != nil {
			writeError(w, http.StatusInternalServerError, ErrInternal)
			return
		}
		if count > 0 {
			writeError(w, http.StatusConflict, fmt.Errorf("%w: %d workload(s) still reference this blueprint version", ErrConflict, count))
			return
		}
	}

	if err := h.client.Delete(r.Context(), bp); err != nil {
		if apierrors.IsNotFound(err) {
			writeError(w, http.StatusNotFound, ErrNotFound)
			return
		}
		h.logger.Error("delete blueprint failed", "name", bp.Name, "error", err)
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// findBlueprint looks up a Blueprint CR by lineage name + version using label selectors.
func (h *BlueprintsHandler) findBlueprint(ctx context.Context, lineage, version string) (*aifv1.Blueprint, error) {
	sel, err := labels.Parse(fmt.Sprintf("ai.suse.com/blueprint-name=%s,ai.suse.com/blueprint-version=%s", lineage, version))
	if err != nil {
		return nil, err
	}
	var list aifv1.BlueprintList
	if err := h.client.List(ctx, &list, &client.ListOptions{LabelSelector: sel}); err != nil {
		return nil, err
	}
	if len(list.Items) == 0 {
		return nil, apierrors.NewNotFound(
			aifv1.GroupVersion.WithResource("blueprints").GroupResource(),
			lineage+"."+version,
		)
	}
	return &list.Items[0], nil
}

var _ Handler = (*BlueprintsHandler)(nil)
```

- [ ] **Step 4: Run tests**

```bash
go test ./internal/api/... -run "TestBlueprints" -v 2>&1 | grep -E "^(=== RUN|--- PASS|--- FAIL|FAIL|ok)"
```

Expected: all `--- PASS`

- [ ] **Step 5: Wire BlueprintsHandler in main.go**

Add after the `workloadsHandler` construction in `cmd/operator/main.go`:

```go
workloadCounter := workloadK8sRepo.AsDeploymentCounter()
blueprintsHandler := api.NewBlueprintsHandler(mgr.GetClient(), workloadCounter)
```

And add `blueprintsHandler` to the `manager.Register(...)` call.

- [ ] **Step 6: Build**

```bash
go build ./... 2>&1
```

Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add internal/api/blueprints.go internal/api/blueprints_test.go cmd/operator/main.go
git commit -m "feat(api): add Blueprint create, deprecate, and delete endpoints"
```

---

### Task 2-2: operator-api.ts Blueprint write functions

Add `createBlueprint`, `deprecateBlueprint`, and `deleteBlueprint` to the typed fetch wrapper. Add matching l10n keys for blueprint CRUD dialogs.

**Existing state:** `operator-api.ts` already has the read functions — do NOT recreate them: `listBlueprints`, `getBlueprint`, `getBlueprintVersion`, `listWorkloads`, `getWorkload`, `deleteWorkload`. The write functions (`createBlueprint`, `deprecateBlueprint`, `deleteBlueprint`) are still missing and must be added.

**Files:**
- Modify: `ui/ai-factory/pkg/ai-factory/utils/operator-api.ts`
- Modify: `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`

- [ ] **Step 1: Add Blueprint write functions to operator-api.ts**

Add the following to the existing file in `ui/ai-factory/pkg/ai-factory/utils/operator-api.ts`, after the existing `getBlueprintVersion` function:

```typescript
export function createBlueprint(spec: any): Promise<any> {
  return operatorFetch('/api/v1/blueprints', { method: 'POST', body: JSON.stringify(spec) });
}

export function deprecateBlueprint(name: string, version: string, deprecated: boolean): Promise<any> {
  return operatorFetch(`/api/v1/blueprints/${ encodeURIComponent(name) }/${ encodeURIComponent(version) }`, {
    method: 'PATCH',
    body:   JSON.stringify({ deprecated }),
  });
}

export function deleteBlueprint(name: string, version: string): Promise<void> {
  return operatorFetch(`/api/v1/blueprints/${ encodeURIComponent(name) }/${ encodeURIComponent(version) }`, {
    method: 'DELETE',
  });
}
```

- [ ] **Step 2: Add l10n keys for blueprint CRUD dialogs**

In `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`, add inside the `blueprints` section (after existing `actions:`). These are the dialog keys; the toolbar / menu-action / warning keys are added in Task 2-5 (`toolbar.*`, `actions.install|copy|edit|deprecate|undeprecate|delete`, `activeWorkloadsWarning`).

```yaml
      createModal:
        title: 'Create Blueprint'
        blueprintName: 'Blueprint Name'
        version: 'Version'
        useCase: 'Use Case'
        description: 'Description'
        components: 'Components'
        cancel: 'Cancel'
        create: 'Create'
      deprecateModal:
        title: 'Deprecate Blueprint'
        body: 'Deprecate {name} v{version}? Deprecated blueprints are hidden by default; existing workloads keep running.'
        confirm: 'Deprecate'
        cancel: 'Cancel'
      undeprecateModal:
        title: 'Undeprecate Blueprint'
        body: 'Undeprecate {name} v{version} as a recommended version?'
        confirm: 'Undeprecate'
        cancel: 'Cancel'
      deleteModal:
        title: 'Delete Blueprint'
        body: 'Delete {name} v{version}?'
        confirm: 'Delete'
        cancel: 'Cancel'
```

- [ ] **Step 3: Build to verify no TS errors**

```bash
cd ui/ai-factory && npm run build 2>&1 | grep -i error | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/utils/operator-api.ts \
        ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml
git commit -m "feat(ui): add Blueprint create/deprecate/delete to operator-api and l10n"
```

---

### Task 2-3: Blueprint Create wizard (4-step, catalog-driven)

**Authoritative reference:** `/home/matamagu/suse-ai-lifecycle-manager/pkg/suse-ai-lifecycle-manager/pages/components/BlueprintCreateWizard.vue` (+ its `wizard/Blueprint*Step.vue` steps). Four steps: **Basic Info → Select Apps → Configuration → Review**. Adds the route and the "New Blueprint" entry point in `blueprints.vue`. `createBlueprint` (Task 2-2) is called from the wizard.

**Reference parity notes:**
- **Select Apps is catalog-driven** — search `listApps` and pick apps as components (each component carries the app `id`, `name`, `repo`, `chart`, `version`). NOT free-text repo/chart/version entry.
- **Configuration step** sets per-component default Helm values; a "Load defaults" button fetches the chart defaults via `getAppValues(appId, version)` (Task 3-0) and the result is captured into `valueOverrides[componentName]` as a YAML string.
- **Semver validation** on `version` gates leaving step 0 and the final Publish.
- **Step-readiness gating** — Next is disabled until the next step's prerequisites are met (mirrors the reference's `wizardSteps[i].ready`).
- aif uses `blueprintName` (lineage) + `useCase` — keep these (richer than the reference's `displayName`). Edit-mode name-locking is added in Task 2-4.

**Backend:** no new backend work — `BlueprintSpec.ValueOverrides` and Task 2-1's `createBlueprintRequest.ValueOverrides` already exist and map through to the CR.

**Depends on:** Task F-1 (`WizardStepIndicator`), Task 2-2 (`createBlueprint`), and **Task 3-0 (`getAppValues`)**. If Group 2 is executed before Group 3, complete Task 3-0 first so the `getAppValues` import resolves.

**Files:**
- Create: `ui/ai-factory/pkg/ai-factory/test/p6-9-blueprint-create-wizard.test.mjs`
- Create: `ui/ai-factory/pkg/ai-factory/pages/wizards/blueprint-create.vue`
- Modify: `ui/ai-factory/pkg/ai-factory/routing/index.ts`
- Modify: `ui/ai-factory/pkg/ai-factory/pages/blueprints.vue`
- Modify: `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`

- [ ] **Step 1: Write failing scaffold tests**

Create `ui/ai-factory/pkg/ai-factory/test/p6-9-blueprint-create-wizard.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${ p }`, import.meta.url), 'utf8');

test('blueprint-create.vue: exports name BlueprintCreateWizard', () => {
  const src = read('pages/wizards/blueprint-create.vue');
  assert.match(src, /name:\s*'BlueprintCreateWizard'/);
});

test('blueprint-create.vue: uses WizardStepIndicator', () => {
  const src = read('pages/wizards/blueprint-create.vue');
  assert.match(src, /WizardStepIndicator/);
});

test('blueprint-create.vue: has 4 steps (basicInfo, selectApps, configuration, review)', () => {
  const src = read('pages/wizards/blueprint-create.vue');
  assert.match(src, /aif\.pages\.wizards\.create\.steps\.basicInfo/);
  assert.match(src, /aif\.pages\.wizards\.create\.steps\.selectApps/);
  assert.match(src, /aif\.pages\.wizards\.create\.steps\.configuration/);
  assert.match(src, /aif\.pages\.wizards\.create\.steps\.review/);
});

test('blueprint-create.vue: calls createBlueprint with valueOverrides', () => {
  const src = read('pages/wizards/blueprint-create.vue');
  assert.match(src, /createBlueprint/);
  assert.match(src, /operator-api/);
  assert.match(src, /valueOverrides/);
});

test('blueprint-create.vue: has blueprintName, version, useCase fields', () => {
  const src = read('pages/wizards/blueprint-create.vue');
  assert.match(src, /aif\.pages\.wizards\.create\.blueprintName/);
  assert.match(src, /aif\.pages\.wizards\.create\.version/);
  assert.match(src, /aif\.pages\.wizards\.create\.useCase/);
});

test('blueprint-create.vue: validates version as semver', () => {
  const src = read('pages/wizards/blueprint-create.vue');
  assert.match(src, /SEMVER|semver/);
});

test('blueprint-create.vue: Select Apps step is catalog-driven (listApps)', () => {
  const src = read('pages/wizards/blueprint-create.vue');
  assert.match(src, /listApps/);
  assert.match(src, /aif\.pages\.wizards\.create\.selectApps\.search/);
});

test('blueprint-create.vue: Configuration step loads per-component defaults via getAppValues', () => {
  const src = read('pages/wizards/blueprint-create.vue');
  assert.match(src, /getAppValues/);
  assert.match(src, /aif\.pages\.wizards\.create\.config\.loadDefaults/);
});

test('blueprint-create.vue: gates Next on step readiness', () => {
  const src = read('pages/wizards/blueprint-create.vue');
  assert.match(src, /stepReady|:disabled/);
});

test('blueprints.vue: has New Blueprint navigation button', () => {
  const src = read('pages/blueprints.vue');
  assert.match(src, /blueprint-create/);
});
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-9-blueprint-create-wizard.test.mjs 2>&1 | tail -10
```

Expected: `not ok` — file not found.

- [ ] **Step 3: Add l10n keys**

In `l10n/en-us.yaml`, add a `create` section inside `aif.pages.wizards`:

```yaml
      create:
        title: 'New Blueprint'
        editTitle: 'Edit Blueprint'
        blueprintName: 'Blueprint Name (lineage identifier)'
        version: 'Version (e.g. 1.0.0)'
        versionInvalid: 'Version must be valid semver (e.g. 1.0.0).'
        useCase: 'Use Case'
        useCaseOptions:
          rag: 'RAG'
          vision: 'Vision'
          fineTuning: 'Fine-Tuning'
          inference: 'Inference'
          other: 'Other'
        description: 'Description (optional)'
        steps:
          basicInfo: 'Basic Info'
          selectApps: 'Select Apps'
          configuration: 'Configuration'
          review: 'Review'
        selectApps:
          search: 'Search applications'
          empty: 'No apps selected yet — search and add at least one.'
          add: 'Add'
          remove: 'Remove'
          version: 'Version'
        config:
          intro: 'Set default Helm values for each app in this blueprint.'
          loadDefaults: 'Load defaults'
          valuesPlaceholder: 'Helm values (YAML) — leave blank to use chart defaults'
        publish: 'Publish Blueprint'
        publishing: 'Publishing...'
        saveAsNewVersion: 'Save as New Version'
        cancel: 'Cancel'
        back: 'Back'
        next: 'Next'
      newBlueprint: 'New Blueprint'
```

Add `newBlueprint` under `aif.pages.blueprints` (not inside `wizards`):

```yaml
      newBlueprint: 'New Blueprint'
```

- [ ] **Step 4: Create blueprint-create.vue**

Create `ui/ai-factory/pkg/ai-factory/pages/wizards/blueprint-create.vue`:

```vue
<template>
  <div class="aif-wizard">
    <h1>{{ t('aif.pages.wizards.create.title') }}</h1>

    <WizardStepIndicator
      :steps="steps"
      :current-step="currentStep"
      @go-to-step="goToStep"
    />

    <!-- Step 0: Basic Info -->
    <div v-if="currentStep === 0" class="aif-wizard__step">
      <label>
        {{ t('aif.pages.wizards.create.blueprintName') }}
        <input v-model="form.blueprintName" type="text" class="input" />
      </label>
      <label>
        {{ t('aif.pages.wizards.create.version') }}
        <input v-model="form.version" type="text" class="input" placeholder="1.0.0" />
        <span v-if="form.version && !versionValid" class="aif-wizard__field-error">
          {{ t('aif.pages.wizards.create.versionInvalid') }}
        </span>
      </label>
      <label>
        {{ t('aif.pages.wizards.create.useCase') }}
        <select v-model="form.useCase" class="select">
          <option value="rag">{{ t('aif.pages.wizards.create.useCaseOptions.rag') }}</option>
          <option value="vision">{{ t('aif.pages.wizards.create.useCaseOptions.vision') }}</option>
          <option value="fine-tuning">{{ t('aif.pages.wizards.create.useCaseOptions.fineTuning') }}</option>
          <option value="inference">{{ t('aif.pages.wizards.create.useCaseOptions.inference') }}</option>
          <option value="other">{{ t('aif.pages.wizards.create.useCaseOptions.other') }}</option>
        </select>
      </label>
      <label>
        {{ t('aif.pages.wizards.create.description') }}
        <textarea v-model="form.description" class="input" rows="3" />
      </label>
    </div>

    <!-- Step 1: Select Apps (catalog-driven) -->
    <div v-if="currentStep === 1" class="aif-wizard__step">
      <input v-model="appSearch" type="search" class="input" :placeholder="t('aif.pages.wizards.create.selectApps.search')" />
      <ul class="aif-wizard__catalog">
        <li v-for="app in catalogResults" :key="app.id" class="aif-wizard__catalog-row">
          <span>{{ app.displayName || app.name }}</span>
          <button class="btn btn-sm role-secondary" :disabled="isSelected(app)" @click="addApp(app)">
            {{ t('aif.pages.wizards.create.selectApps.add') }}
          </button>
        </li>
      </ul>

      <p v-if="!form.components.length" class="aif-wizard__hint">
        {{ t('aif.pages.wizards.create.selectApps.empty') }}
      </p>
      <div v-for="(comp, idx) in form.components" :key="comp.name" class="aif-wizard__comp-row">
        <span class="aif-wizard__comp-name">{{ comp.name }}</span>
        <span class="aif-wizard__comp-chart">{{ comp.repo }}/{{ comp.chart }}</span>
        <span>{{ t('aif.pages.wizards.create.selectApps.version') }}: {{ comp.version }}</span>
        <button class="btn btn-sm role-danger" @click="removeComponent(idx)">
          {{ t('aif.pages.wizards.create.selectApps.remove') }}
        </button>
      </div>
    </div>

    <!-- Step 2: Configuration (per-component default values) -->
    <div v-if="currentStep === 2" class="aif-wizard__step">
      <p class="aif-wizard__hint">{{ t('aif.pages.wizards.create.config.intro') }}</p>
      <div v-for="comp in form.components" :key="comp.name" class="aif-wizard__config-panel">
        <div class="aif-wizard__config-head">
          <strong>{{ comp.name }}</strong>
          <button class="btn btn-sm role-secondary" :disabled="loadingDefaults[comp.name]" @click="loadComponentDefaults(comp)">
            {{ t('aif.pages.wizards.create.config.loadDefaults') }}
          </button>
        </div>
        <textarea
          v-model="form.valueOverrides[comp.name]"
          class="aif-wizard__yaml-editor"
          rows="10"
          :placeholder="t('aif.pages.wizards.create.config.valuesPlaceholder')"
        />
      </div>
    </div>

    <!-- Step 3: Review -->
    <div v-if="currentStep === 3" class="aif-wizard__step aif-wizard__review">
      <dl>
        <dt>{{ t('aif.pages.wizards.create.blueprintName') }}</dt><dd>{{ form.blueprintName }}</dd>
        <dt>{{ t('aif.pages.wizards.create.version') }}</dt><dd>{{ form.version }}</dd>
        <dt>{{ t('aif.pages.wizards.create.useCase') }}</dt><dd>{{ form.useCase }}</dd>
        <dt>{{ t('aif.pages.wizards.create.description') }}</dt><dd>{{ form.description || '—' }}</dd>
      </dl>
      <ul>
        <li v-for="comp in form.components" :key="comp.name">
          {{ comp.name }} — {{ comp.repo }}/{{ comp.chart }}@{{ comp.version }}
          <em v-if="form.valueOverrides[comp.name]">({{ t('aif.pages.wizards.create.config.loadDefaults') }})</em>
        </li>
      </ul>
    </div>

    <div class="aif-wizard__nav">
      <button v-if="currentStep > 0" class="btn role-secondary" @click="back">
        {{ t('aif.pages.wizards.create.back') }}
      </button>
      <button class="btn role-secondary" @click="cancel">
        {{ t('aif.pages.wizards.create.cancel') }}
      </button>
      <button v-if="currentStep < steps.length - 1" class="btn role-primary" :disabled="!stepReady(currentStep + 1)" @click="next">
        {{ t('aif.pages.wizards.create.next') }}
      </button>
      <button v-else class="btn role-primary" :disabled="publishing || !stepReady(3)" @click="publish">
        {{ publishing ? t('aif.pages.wizards.create.publishing') : t('aif.pages.wizards.create.publish') }}
      </button>
    </div>

    <div v-if="publishError" class="aif-wizard__error">{{ publishError.message }}</div>
  </div>
</template>

<script>
import { defineComponent } from 'vue';
import WizardStepIndicator from '../../components/wizards/WizardStepIndicator.vue';
import { createBlueprint, listApps, getAppValues } from '../../utils/operator-api';
import { PRODUCT_NAME, MANAGEMENT_CLUSTER } from '../../config/types';
import yaml from 'js-yaml';

// SemVer: MAJOR.MINOR.PATCH with optional -prerelease / +build.
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export default defineComponent({
  name: 'BlueprintCreateWizard',

  components: { WizardStepIndicator },

  // Catalog for the Select Apps step. 'suse' merges App Collection + SUSE Registry
  // (same source the Apps page calls "SUSE AI Library").
  async fetch() {
    try {
      this.catalogApps = await listApps({ source: 'suse' });
    } catch (e) {
      this.catalogApps = [];
    }
  },

  data() {
    return {
      currentStep:     0,
      publishing:      false,
      publishError:    null,
      catalogApps:     [],
      appSearch:       '',
      loadingDefaults: {},
      form: {
        blueprintName:  '',
        version:        '',
        useCase:        'inference',
        description:    '',
        components:     [],   // [{ name, appId, repo, chart, version }]
        valueOverrides: {},   // { [componentName]: yamlString }
      },
    };
  },

  computed: {
    steps() {
      return [
        { label: this.t('aif.pages.wizards.create.steps.basicInfo') },
        { label: this.t('aif.pages.wizards.create.steps.selectApps') },
        { label: this.t('aif.pages.wizards.create.steps.configuration') },
        { label: this.t('aif.pages.wizards.create.steps.review') },
      ];
    },

    versionValid() {
      return SEMVER.test(this.form.version);
    },

    catalogResults() {
      const q = this.appSearch.trim().toLowerCase();
      const list = this.catalogApps || [];
      if (!q) {
        return list.slice(0, 20);
      }
      return list
        .filter((a) => (a.name || '').toLowerCase().includes(q) || (a.displayName || '').toLowerCase().includes(q))
        .slice(0, 20);
    },
  },

  methods: {
    // Mirrors the reference wizardSteps[i].ready gating.
    stepReady(index) {
      switch (index) {
        case 0:  return true;
        case 1:  return this.form.blueprintName.trim() !== '' && this.versionValid;
        case 2:  return this.form.components.length > 0;
        case 3:  return this.form.components.length > 0;
        default: return false;
      }
    },

    goToStep(index) {
      // Free to step backward; forward only when that step is reachable.
      if (index <= this.currentStep || this.stepReady(index)) {
        this.currentStep = index;
      }
    },
    next() { if (this.stepReady(this.currentStep + 1)) this.currentStep++; },
    back() { this.currentStep--; },

    cancel() {
      this.$router.push({ name: `${ PRODUCT_NAME }-c-cluster-blueprints`, params: { cluster: MANAGEMENT_CLUSTER } });
    },

    isSelected(app) {
      return this.form.components.some((c) => c.appId === app.id);
    },

    addApp(app) {
      if (this.isSelected(app)) {
        return;
      }
      const name = app.chartRef?.chart || app.name || app.id;
      this.form.components.push({
        name,
        appId:   app.id,
        repo:    app.chartRef?.repo || '',
        chart:   app.chartRef?.chart || name,
        version: app.version || '',
      });
    },

    removeComponent(idx) {
      const [removed] = this.form.components.splice(idx, 1);
      if (removed) {
        delete this.form.valueOverrides[removed.name];
      }
    },

    async loadComponentDefaults(comp) {
      this.loadingDefaults = { ...this.loadingDefaults, [comp.name]: true };
      try {
        const { values } = await getAppValues(comp.appId, comp.version);
        this.form.valueOverrides[comp.name] = yaml.dump(values || {});
      } catch (e) {
        this.publishError = e;
      } finally {
        this.loadingDefaults = { ...this.loadingDefaults, [comp.name]: false };
      }
    },

    async publish() {
      if (!this.stepReady(1)) {
        this.publishError = new Error(this.t('aif.pages.wizards.create.versionInvalid'));
        return;
      }
      this.publishing   = true;
      this.publishError = null;
      try {
        // Drop blank overrides so those components fall back to chart defaults.
        const valueOverrides = {};
        for (const [k, v] of Object.entries(this.form.valueOverrides)) {
          if (v && v.trim()) {
            valueOverrides[k] = v;
          }
        }
        await createBlueprint({
          blueprintName: this.form.blueprintName,
          version:       this.form.version,
          useCase:       this.form.useCase,
          description:   this.form.description,
          components:    this.form.components.map((c) => ({
            name: c.name,
            kind: 'App',
            app:  { repo: c.repo, chart: c.chart, version: c.version },
          })),
          valueOverrides,
        });
        this.$router.push({ name: `${ PRODUCT_NAME }-c-cluster-blueprints`, params: { cluster: MANAGEMENT_CLUSTER } });
      } catch (e) {
        this.publishError = e;
      } finally {
        this.publishing = false;
      }
    },
  },
});
</script>

<style scoped>
.aif-wizard { max-width: 760px; padding: 24px; }
.aif-wizard__step { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
.aif-wizard__catalog { list-style: none; padding: 0; margin: 0; max-height: 220px; overflow-y: auto; border: 1px solid var(--border); border-radius: 4px; }
.aif-wizard__catalog-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--border); }
.aif-wizard__catalog-row:last-child { border-bottom: none; }
.aif-wizard__comp-row { display: grid; grid-template-columns: 1fr 2fr auto auto; gap: 8px; align-items: center; }
.aif-wizard__comp-name { font-weight: 600; }
.aif-wizard__config-panel { border: 1px solid var(--border); border-radius: 4px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.aif-wizard__config-head { display: flex; justify-content: space-between; align-items: center; }
.aif-wizard__yaml-editor { width: 100%; font-family: monospace; font-size: 0.85rem; }
.aif-wizard__review dt { font-weight: 600; }
.aif-wizard__nav { display: flex; gap: 8px; justify-content: flex-end; margin-top: 24px; }
.aif-wizard__error { color: var(--error); margin-top: 12px; }
.aif-wizard__field-error { color: var(--error); font-size: 0.8rem; }
.aif-wizard__hint { color: var(--muted); }
</style>
```

- [ ] **Step 5: Add route and wire New Blueprint button**

In `routing/index.ts`, append to the routes array:

```typescript
  {
    name:      `${ PRODUCT_NAME }-c-cluster-blueprint-create`,
    path:      `/c/:cluster/${ PRODUCT_NAME }/blueprints/create`,
    component: () => import('../pages/wizards/blueprint-create.vue'),
    meta:      { product: PRODUCT_NAME }
  },
```

In `blueprints.vue`, add a "New Blueprint" button to the page header (alongside the title). Import `MANAGEMENT_CLUSTER` from `../config/types` if not already imported:

```vue
<button
  class="btn role-primary"
  @click="$router.push({ name: `${ PRODUCT_NAME }-c-cluster-blueprint-create`, params: { cluster: MANAGEMENT_CLUSTER } })"
>
  {{ t('aif.pages.blueprints.newBlueprint') }}
</button>
```

- [ ] **Step 6: Run scaffold tests**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-9-blueprint-create-wizard.test.mjs 2>&1
```

Expected: all `ok`

- [ ] **Step 7: Verify existing blueprints page tests still pass**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-5-blueprints-page.test.mjs 2>&1
```

Expected: all `ok`

- [ ] **Step 8: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/pages/wizards/blueprint-create.vue \
        ui/ai-factory/pkg/ai-factory/test/p6-9-blueprint-create-wizard.test.mjs \
        ui/ai-factory/pkg/ai-factory/routing/index.ts \
        ui/ai-factory/pkg/ai-factory/pages/blueprints.vue \
        ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml
git commit -m "feat(ui): Blueprint Create 4-step wizard (catalog apps + per-component values) and New Blueprint entry point"
```

---

### Task 2-4: Blueprint Copy + Edit

The old `suse-ai-lifecycle-manager` had a "copy blueprint" feature. Users should be able to copy an existing blueprint (pre-populate the create wizard with its spec, allowing lineage rename or version bump) and edit a blueprint version (pre-populate with existing data to create a new version in the same lineage).

**Files:**
- Modify: `ui/ai-factory/pkg/ai-factory/pages/wizards/blueprint-create.vue`
- Modify: `ui/ai-factory/pkg/ai-factory/pages/blueprints.vue`
- Modify: `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`
- Modify: `ui/ai-factory/pkg/ai-factory/test/p6-9-blueprint-create-wizard.test.mjs`

**Surfacing:** Copy and Edit are invoked from the per-tile three-dot `ActionMenuShell` menu (Copy = all users; Edit = admin-only). That menu and its `onCardCopy` / `onCardEdit` navigation are wired in **Task 2-5** — do NOT add inline Copy/Edit buttons here. This task implements only the **wizard side**: reading the query params and pre-populating the form.

**Approach:** Extend blueprint-create.vue to accept optional route query params `?copyFrom=<lineage>&copyVersion=<version>` (for copy) or `?editFrom=<lineage>&editVersion=<version>` (for edit/new-version). When present, the wizard pre-fetches the source blueprint from the Steve store and pre-fills the form.

- **Copy**: pre-fills all fields; the `blueprintName` field stays editable so the user can rename it into a new lineage.
- **Edit** (new version): pre-fills all fields; the `blueprintName` field is **locked/disabled** (same lineage, matching the reference's edit flow); the user bumps `version`. Blueprint+version uniqueness is enforced by the Task 2-1 backend (409 on conflict).

- [ ] **Step 1: Add scaffold tests for copy/edit pre-population**

Add to `ui/ai-factory/pkg/ai-factory/test/p6-9-blueprint-create-wizard.test.mjs`:

```javascript
test('blueprint-create.vue: reads copyFrom and copyVersion from route query', () => {
  const src = read('pages/wizards/blueprint-create.vue');
  assert.match(src, /copyFrom|query\.copyFrom/);
  assert.match(src, /copyVersion|query\.copyVersion/);
});

test('blueprint-create.vue: reads editFrom and editVersion from route query', () => {
  const src = read('pages/wizards/blueprint-create.vue');
  assert.match(src, /editFrom|query\.editFrom/);
  assert.match(src, /editVersion|query\.editVersion/);
});

test('blueprint-create.vue: has loadSourceBlueprint method', () => {
  const src = read('pages/wizards/blueprint-create.vue');
  assert.match(src, /loadSourceBlueprint/);
});

test('blueprint-create.vue: locks blueprintName field in edit mode', () => {
  const src = read('pages/wizards/blueprint-create.vue');
  // The name input is disabled/readonly when editing an existing lineage
  assert.match(src, /isEditMode|editMode|editFrom/);
  assert.match(src, /:disabled|:readonly/);
});
```

> The Copy/Edit menu actions in `blueprints.vue` are asserted by Task 2-5's scaffold tests (BlueprintCard emits `copy`/`edit`; menu labels `aif.pages.blueprints.actions.copy`/`.edit`). Do not duplicate those assertions here.

- [ ] **Step 2: Run to confirm failures**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-9-blueprint-create-wizard.test.mjs 2>&1 | grep "not ok"
```

Expected: the new tests fail.

- [ ] **Step 3: Add created() hook and loadSourceBlueprint to blueprint-create.vue**

In `blueprint-create.vue`, add a `created()` lifecycle hook that reads route query params and fetches the source blueprint:

```javascript
async created() {
  const { copyFrom, copyVersion, editFrom, editVersion } = this.$route.query || {};
  if (copyFrom && copyVersion) {
    await this.loadSourceBlueprint(copyFrom, copyVersion);
  } else if (editFrom && editVersion) {
    this.editMode = true;   // locks the blueprintName field (same lineage)
    await this.loadSourceBlueprint(editFrom, editVersion);
  }
},
```

Add `editMode: false` to `data()`. In the Basic Info step template, disable the name input in edit mode: `:disabled="editMode"` (or `:readonly="editMode"`) on the `blueprintName` `<input>`. Copy mode leaves it editable so the user can rename into a new lineage.

Add the `loadSourceBlueprint` method:

```javascript
async loadSourceBlueprint(lineage, version) {
  try {
    const blueprints = await this.$store.dispatch('management/findAll', { type: CRD_TYPES.BLUEPRINT });
    const source = blueprints.find(
      (b) => b.spec.blueprintName === lineage && b.spec.version === version
    );
    if (!source) return;
    this.form.blueprintName = source.spec.blueprintName;
    this.form.version       = source.spec.version;
    this.form.useCase       = source.spec.useCase || 'inference';
    this.form.description   = source.spec.description || '';
    this.form.components    = (source.spec.components || []).map((c) => ({
      name:    c.name,
      appId:   '',            // not stored on the CR; "Load defaults" is unavailable for copied/edited components, but values remain hand-editable
      repo:    c.app?.repo || '',
      chart:   c.app?.chart || '',
      version: c.app?.version || '',
    }));
    // Carry over the source blueprint's per-component value overrides.
    this.form.valueOverrides = { ...(source.spec.valueOverrides || {}) };
  } catch (e) {
    // non-fatal — wizard opens empty if source not found
  }
},
```

Add `CRD_TYPES` to the import from `../../config/types`.

> **Note:** The Copy/Edit *menu actions* and their navigation (`onCardCopy` / `onCardEdit`) are added in Task 2-5, and the `actions.copy` / `actions.edit` l10n keys are added there too. This task does NOT add buttons or l10n keys to `blueprints.vue`.

- [ ] **Step 4: Run scaffold tests**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-9-blueprint-create-wizard.test.mjs 2>&1
```

Expected: all `ok`

- [ ] **Step 5: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/pages/wizards/blueprint-create.vue \
        ui/ai-factory/pkg/ai-factory/test/p6-9-blueprint-create-wizard.test.mjs
git commit -m "feat(ui): Blueprint Copy/Edit — pre-populate Create wizard; lock lineage name in edit mode"
```

---

### Task 2-5: Blueprint gallery actions — reference parity (Install, three-dot menu, admin-gated CRUD)

**Authoritative reference:** `/home/matamagu/suse-ai-lifecycle-manager/pkg/suse-ai-lifecycle-manager/pages/Blueprints.vue`. Read it before implementing — this task reworks the P6-5 gallery so its user-visible behavior matches that file exactly. The P6-5 implementation diverges and MUST be brought into line (it is NOT just "wiring").

**Reference behavior to reproduce (per tile):**
- An **Install** button — always present, navigates to the Blueprint Install wizard (`blueprint-install` route is created in Task 4-1; until then the click 404s, which is the intended interim behavior).
- A **three-dot `ActionMenuShell`** menu (`@shell/components/ActionMenuShell`): `Copy` for all users; `Edit`, `Deprecate`/`Undeprecate` (a single toggle, label depends on current phase), and `Delete` — all three **admin-only**.
- A per-tile **version dropdown** (`BlueprintVersionPicker`); deprecated versions hidden unless "Show deprecated" is checked.
- **Delete** and **Deprecate** confirmation modals that **fetch and list the active Workloads** that source this blueprint version (warning banner), via `listWorkloads()`.
- Admin actions gated by a real **`checkAdminRole`** that queries `management.cattle.io.globalrolebinding` and checks `globalRoleName === 'admin'` for the current user (mirror the reference's `checkAdminRole`).

**Removed for strict parity (no reference equivalent — confirmed: backend PATCH in Task 2-1 only toggles `Active ↔ Deprecated`, `Withdrawn` is never settable):**
- The `Start Bundle` button (disabled stub).
- The publisher section (`isPublisher` + Deprecate/Withdraw/Reactivate buttons).
- The `View versions` button and the `BlueprintVersionsPanel` side panel.
- The use-case filter dropdown and the lineage/version count pills in the header.

**Files:**
- Modify: `ui/ai-factory/pkg/ai-factory/components/blueprints/BlueprintCard.vue`
- Modify: `ui/ai-factory/pkg/ai-factory/pages/blueprints.vue`
- Modify: `ui/ai-factory/pkg/ai-factory/components/blueprints/BlueprintVersionPicker.vue` (rename `showWithdrawn` prop → `showDeprecated`; filter versions whose `phase !== 'Active'`)
- Delete: `ui/ai-factory/pkg/ai-factory/components/blueprints/BlueprintVersionsPanel.vue`
- Modify: `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`
- Modify: `ui/ai-factory/pkg/ai-factory/test/p6-5-blueprints-page.test.mjs`

> **Cross-task note:** The Install button + its `onCardDeploy` navigation are added HERE (Task 2-5), so the BlueprintCard rework is done in one place. Task 4-1 only creates the `blueprint-install` page/route; its Step 3b is reduced to a verification that the navigation resolves once the route exists.

- [ ] **Step 1: Re-baseline the P6-5 scaffold tests**

The existing `p6-5-blueprints-page.test.mjs` asserts the OLD structure (`view-versions`, `showWithdrawn`, `useCaseFilter`, publisher buttons). Remove/replace those assertions — they describe behavior we are deliberately deleting. Run the file first to see the current green baseline, then rewrite its assertions per Step 2.

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-5-blueprints-page.test.mjs 2>&1
```

- [ ] **Step 2: Write the reference-parity scaffold tests**

Replace the structure-specific assertions in `p6-5-blueprints-page.test.mjs` with:

```javascript
// ── BlueprintCard: three-dot menu + Install, no legacy chrome ────────────────
test('BlueprintCard.vue: uses ActionMenuShell three-dot menu', () => {
  const src = read('components/blueprints/BlueprintCard.vue');
  assert.match(src, /ActionMenuShell/);
});

test('BlueprintCard.vue: emits copy, edit, deprecate, delete, deploy', () => {
  const src = read('components/blueprints/BlueprintCard.vue');
  for (const ev of ['copy', 'edit', 'deprecate', 'delete', 'deploy']) {
    assert.match(src, new RegExp(`['"]${ ev }['"]`));
  }
});

test('BlueprintCard.vue: admin-only actions gated on isAdmin', () => {
  const src = read('components/blueprints/BlueprintCard.vue');
  assert.match(src, /isAdmin/);
});

test('BlueprintCard.vue: legacy chrome removed (publisher, Start Bundle, view-versions, withdraw/reactivate)', () => {
  const src = read('components/blueprints/BlueprintCard.vue');
  assert.doesNotMatch(src, /isPublisher|publisher-actions/);
  assert.doesNotMatch(src, /startBundle/i);
  assert.doesNotMatch(src, /view-versions/);
  assert.doesNotMatch(src, /withdraw|reactivate/i);
});

// ── blueprints.vue: admin role, toolbar, toggle, modals ──────────────────────
test('blueprints.vue: checks admin role via globalrolebinding', () => {
  const src = read('pages/blueprints.vue');
  assert.match(src, /globalrolebinding/);
  assert.match(src, /globalRoleName/);
  assert.match(src, /isAdmin/);
});

test('blueprints.vue: toolbar has Create and Refresh', () => {
  const src = read('pages/blueprints.vue');
  assert.match(src, /aif\.pages\.blueprints\.toolbar\.create/);
  assert.match(src, /aif\.pages\.blueprints\.toolbar\.refresh/);
});

test('blueprints.vue: Show deprecated toggle replaces Show withdrawn', () => {
  const src = read('pages/blueprints.vue');
  assert.match(src, /showDeprecated/);
  assert.match(src, /aif\.pages\.blueprints\.toolbar\.showDeprecated/);
  assert.doesNotMatch(src, /showWithdrawn/);
});

test('blueprints.vue: legacy chrome removed (use-case filter, versions panel)', () => {
  const src = read('pages/blueprints.vue');
  assert.doesNotMatch(src, /useCaseFilter/);
  assert.doesNotMatch(src, /BlueprintVersionsPanel/);
});

test('blueprints.vue: imports blueprint write functions', () => {
  const src = read('pages/blueprints.vue');
  assert.match(src, /deprecateBlueprint/);
  assert.match(src, /deleteBlueprint/);
});

test('blueprints.vue: deprecate is a toggle (deprecate/undeprecate)', () => {
  const src = read('pages/blueprints.vue');
  assert.match(src, /currentlyDeprecated/);
  assert.match(src, /aif\.pages\.blueprints\.undeprecateModal\.title/);
});

test('blueprints.vue: delete & deprecate modals warn about active workloads', () => {
  const src = read('pages/blueprints.vue');
  assert.match(src, /listWorkloads/);
  assert.match(src, /activeWorkloads/);
});
```

- [ ] **Step 3: Run to confirm failures**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-5-blueprints-page.test.mjs 2>&1 | grep "not ok"
```

Expected: the new tests fail.

- [ ] **Step 4: Rework `BlueprintCard.vue` to the reference action model**

Replace the entire `bp-card__actions` block and the publisher section with an Install button + three-dot menu, and update the script:

```vue
<div class="bp-card__actions">
  <button
    type="button"
    class="btn btn-sm role-primary"
    @click="$emit('deploy', selected)"
  >
    {{ t('aif.pages.blueprints.actions.install') }}
  </button>
  <ActionMenuShell
    button-variant="tertiary"
    button-aria-label="More options"
    :custom-actions="tileActions"
    @action-invoked="onAction"
  />
</div>
```

Script changes:
- `import ActionMenuShell from '@shell/components/ActionMenuShell';` and add it to `components`.
- Props: **remove** `isPublisher`; **add** `isAdmin: { type: Boolean, default: false }`; **rename** `showWithdrawn` → `showDeprecated` (pass through to `BlueprintVersionPicker` as `:show-deprecated`).
- `emits: ['deploy', 'copy', 'edit', 'deprecate', 'delete']`.
- In `setup`, obtain the i18n helper via `const vm = getCurrentInstance().proxy;` and build the menu:

```javascript
const isDeprecated = computed(() => selected.value.phase !== 'Active');

const tileActions = computed(() => {
  const actions = [
    { action: 'copy', label: vm.t('aif.pages.blueprints.actions.copy'), enabled: true },
  ];
  if (props.isAdmin) {
    actions.push(
      { action: 'edit', label: vm.t('aif.pages.blueprints.actions.edit'), enabled: true },
      {
        action:  'deprecate',
        label:   isDeprecated.value
          ? vm.t('aif.pages.blueprints.actions.undeprecate')
          : vm.t('aif.pages.blueprints.actions.deprecate'),
        enabled: true,
      },
      { divider: true, label: '', enabled: true },
      { action: 'delete', label: vm.t('aif.pages.blueprints.actions.delete'), enabled: true },
    );
  }
  return actions;
});

function onAction(payload) {
  // payload.action is one of copy|edit|deprecate|delete
  emit(payload.action, selected.value);
}
```

- **Delete** the entire `bp-card__publisher-actions` template block, the `Start Bundle` and old disabled `Deploy` buttons, and the `view-versions` button. Remove the now-dead `originKey`/`originTooltip` only if unused elsewhere (keep — still rendered in `bp-card__meta`).

- [ ] **Step 5: Rework `blueprints.vue` to the reference page + admin gating + modals**

**5-i. Imports & components:** (the three-dot menu lives in `BlueprintCard`, so the page itself does NOT import `ActionMenuShell`)
```javascript
import { deprecateBlueprint, deleteBlueprint, listWorkloads } from '../utils/operator-api';
import { PRODUCT_NAME, MANAGEMENT_CLUSTER, CRD_TYPES } from '../config/types';
```
Remove the `BlueprintVersionsPanel` import and its component registration. Delete the file `components/blueprints/BlueprintVersionsPanel.vue`.

**5-ii. data():** remove `useCaseFilter`, `panelLineage`; rename `showWithdrawn` → `showDeprecated`; add:
```javascript
isAdmin:         false,
deprecateTarget: null,   // { lineage, version, currentlyDeprecated, activeWorkloads }
deleteTarget:    null,   // { lineage, version, activeWorkloads }
crudError:       null,
```

**5-iii. fetch():** after the existing `findAll` calls, also `await this.checkAdminRole();`

**5-iv. computed:** delete `useCases` and `totalVersions` (count pills removed); in `visibleLineages`, replace the `showWithdrawn`/`Withdrawn` filter with: hide lineages whose every version has `phase !== 'Active'` unless `showDeprecated`. Remove the `useCaseFilter` branch.

**5-v. methods** (mirror the reference's `checkAdminRole`, `fetchActiveWorkloads`, confirm/execute pairs):
```javascript
async checkAdminRole() {
  try {
    const grbs   = await this.$store.dispatch('management/findAll', { type: 'management.cattle.io.globalrolebinding' });
    const userId = this.$store.getters['auth/user']?.id;
    this.isAdmin = !!(userId && grbs.some((g) => g.userName === userId && g.globalRoleName === 'admin'));
  } catch (e) {
    this.isAdmin = false;
  }
},

async fetchActiveWorkloads(lineage, version) {
  try {
    const res = await listWorkloads();
    return (res.items || res || []).filter((wl) => {
      const bp = wl.spec?.source?.blueprint;
      return bp?.name === lineage && bp?.version === version;
    });
  } catch {
    return [];
  }
},

navigateCreate() {
  this.$router.push({ name: `${ PRODUCT_NAME }-c-cluster-blueprint-create`, params: { cluster: MANAGEMENT_CLUSTER } });
},

onCardDeploy(v) {
  this.$router.push({
    name: `${ PRODUCT_NAME }-c-cluster-blueprint-install`,
    params: { cluster: MANAGEMENT_CLUSTER },
    query: { bpName: v.lineage || v.blueprintName, bpVersion: v.version || v.id },
  });
},

onCardCopy(v) {
  this.$router.push({
    name: `${ PRODUCT_NAME }-c-cluster-blueprint-create`,
    params: { cluster: MANAGEMENT_CLUSTER },
    query: { copyFrom: v.lineage || v.blueprintName, copyVersion: v.version || v.id },
  });
},

onCardEdit(v) {
  this.$router.push({
    name: `${ PRODUCT_NAME }-c-cluster-blueprint-create`,
    params: { cluster: MANAGEMENT_CLUSTER },
    query: { editFrom: v.lineage || v.blueprintName, editVersion: v.version || v.id },
  });
},

async onCardDeprecate(v) {
  const lineage = v.lineage || v.blueprintName;
  const version = v.version || v.id;
  const currentlyDeprecated = v.phase !== 'Active';
  this.deprecateTarget = {
    lineage, version, currentlyDeprecated,
    activeWorkloads: currentlyDeprecated ? [] : await this.fetchActiveWorkloads(lineage, version),
  };
},

async doDeprecate() {
  const { lineage, version, currentlyDeprecated } = this.deprecateTarget;
  try {
    await deprecateBlueprint(lineage, version, !currentlyDeprecated);
    this.deprecateTarget = null;
    await this.$fetch();
  } catch (e) {
    this.crudError = e?.message || String(e);
    this.deprecateTarget = null;
  }
},

async onCardDelete(v) {
  const lineage = v.lineage || v.blueprintName;
  const version = v.version || v.id;
  this.deleteTarget = { lineage, version, activeWorkloads: await this.fetchActiveWorkloads(lineage, version) };
},

async doDelete() {
  const { lineage, version } = this.deleteTarget;
  try {
    await deleteBlueprint(lineage, version);
    this.deleteTarget = null;
    await this.$fetch();
  } catch (e) {
    this.crudError = e?.message || String(e);
    this.deleteTarget = null;
  }
},
```

**5-vi. template — header & toolbar** (mirror the reference): a single `<h1>`, then a toolbar with search, a "Show deprecated" `Checkbox` (`v-model:value="showDeprecated"`), a **Create** button (`@click="navigateCreate"`), and a **Refresh** button (`@click="$fetch()"`). Remove the use-case `<select>` and the count pills.

**5-vii. template — gallery binding:**
```vue
<BlueprintCard
  v-for="l in visibleLineages"
  :key="l.lineage"
  :lineage="l"
  :is-admin="isAdmin"
  :show-deprecated="showDeprecated"
  @deploy="onCardDeploy"
  @copy="onCardCopy"
  @edit="onCardEdit"
  @deprecate="onCardDeprecate"
  @delete="onCardDelete"
/>
```

**5-viii. template — modals** (place before the closing root `</div>`). Both mirror the reference, including the active-workloads warning banner:
```vue
<!-- Deprecate / Undeprecate -->
<div v-if="deprecateTarget" class="aif-modal-backdrop" @click.self="deprecateTarget = null">
  <div class="aif-modal">
    <h3>{{ deprecateTarget.currentlyDeprecated
      ? t('aif.pages.blueprints.undeprecateModal.title')
      : t('aif.pages.blueprints.deprecateModal.title') }}</h3>
    <p>{{ deprecateTarget.currentlyDeprecated
      ? t('aif.pages.blueprints.undeprecateModal.body', { name: deprecateTarget.lineage, version: deprecateTarget.version })
      : t('aif.pages.blueprints.deprecateModal.body', { name: deprecateTarget.lineage, version: deprecateTarget.version }) }}</p>
    <Banner v-if="!deprecateTarget.currentlyDeprecated && deprecateTarget.activeWorkloads.length" color="warning">
      {{ t('aif.pages.blueprints.activeWorkloadsWarning', { count: deprecateTarget.activeWorkloads.length }) }}
    </Banner>
    <div class="aif-modal__actions">
      <button class="btn role-secondary" @click="deprecateTarget = null">{{ t('aif.pages.blueprints.deprecateModal.cancel') }}</button>
      <button class="btn role-primary" @click="doDeprecate">
        {{ deprecateTarget.currentlyDeprecated
          ? t('aif.pages.blueprints.undeprecateModal.confirm')
          : t('aif.pages.blueprints.deprecateModal.confirm') }}
      </button>
    </div>
  </div>
</div>

<!-- Delete -->
<div v-if="deleteTarget" class="aif-modal-backdrop" @click.self="deleteTarget = null">
  <div class="aif-modal">
    <h3>{{ t('aif.pages.blueprints.deleteModal.title') }}</h3>
    <p>{{ t('aif.pages.blueprints.deleteModal.body', { name: deleteTarget.lineage, version: deleteTarget.version }) }}</p>
    <Banner v-if="deleteTarget.activeWorkloads.length" color="warning">
      {{ t('aif.pages.blueprints.activeWorkloadsWarning', { count: deleteTarget.activeWorkloads.length }) }}
    </Banner>
    <div class="aif-modal__actions">
      <button class="btn role-secondary" @click="deleteTarget = null">{{ t('aif.pages.blueprints.deleteModal.cancel') }}</button>
      <button class="btn role-danger" @click="doDelete">{{ t('aif.pages.blueprints.deleteModal.confirm') }}</button>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Add l10n keys**

The modal dialog keys (`createModal`, `deprecateModal`, `undeprecateModal`, `deleteModal`) are already added in **Task 2-2**. Here, add only the toolbar, menu-action, and warning keys under `aif.pages.blueprints`:
```yaml
      toolbar:
        search: 'Search blueprints'
        showDeprecated: 'Show deprecated'
        create: 'Create'
        refresh: 'Refresh'
      actions:
        install: 'Install'
        copy: 'Copy'
        edit: 'Edit'
        deprecate: 'Deprecate'
        undeprecate: 'Undeprecate'
        delete: 'Delete'
      activeWorkloadsWarning: '{count} active workload(s) use this blueprint version and will lose their source reference.'
```
**Remove** the obsolete keys left over from P6-5: `startBundle*`, `deploy*ComingSoon`, `publisher*`, `withdraw`, `reactivate`, and the old `showWithdrawn` toolbar key.

- [ ] **Step 7: Run all blueprints scaffold tests**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-5-blueprints-page.test.mjs 2>&1
```

Expected: all `ok`.

- [ ] **Step 8: Browser check (manual)**

Open Blueprints. Confirm: each tile shows an Install button + a three-dot menu; a non-admin sees only **Copy**; an admin additionally sees **Edit**, **Deprecate/Undeprecate**, **Delete**. Deprecate/Delete modals list affected workloads. "Show deprecated" reveals deprecated versions. No Start Bundle, no publisher section, no View-versions panel, no use-case filter.

- [ ] **Step 9: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/pages/blueprints.vue \
        ui/ai-factory/pkg/ai-factory/components/blueprints/BlueprintCard.vue \
        ui/ai-factory/pkg/ai-factory/components/blueprints/BlueprintVersionPicker.vue \
        ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml \
        ui/ai-factory/pkg/ai-factory/test/p6-5-blueprints-page.test.mjs
git rm ui/ai-factory/pkg/ai-factory/components/blueprints/BlueprintVersionsPanel.vue
git commit -m "feat(ui): align Blueprint gallery with reference — Install + three-dot admin-gated menu, deprecate toggle, workload-aware modals"
```

---

## Group 3: App Installation & Manage

### User-Facing Features & Behaviors

- **App Install wizard** — a **4-step** flow opened by clicking an App card:
  - **Basic Info** — instance name (**DNS-label validated**), namespace (auto-suggested as `<name>-system`).
  - **Target** — pick one or more clusters; choose delivery strategy **Helm** or **GitOps**.
  - **Configuration** — the chart's **default Helm values** are loaded and shown as editable YAML; a "Reset to defaults" button reloads them.
  - **Review** — summary before commit.
- Wizard form state **persists in localStorage** across steps and page reloads.
- Clicking **Install** opens a **per-cluster Install Progress modal** (installing → success / failed); **Done** closes it and navigates to the Workloads page.
- **App Manage page** — opened from a Running App workload; pre-populated with the workload's current values; editing values and clicking **Apply** sends a PATCH and the workload transitions **Pending → Running**.
- **Manage is disabled** for any App workload whose phase is not Running.

### Task 3-0: Chart default-values endpoint (backend + operator-api)

The reference App Install "Configuration" step shows the chart's real default values for editing. aif's `getApp` returns only metadata — no chart values — so the Configuration step would otherwise be a blank textarea. This task adds a backend endpoint that pulls a chart and returns its default `values.yaml` (plus the chart's `questions.yaml` if present), and a frontend client for it. Tasks 3-1 and 3-2 consume it.

**Grounding (verified in aif):**
- `pkg/helm/engine.go` already pulls + loads charts with `loader.Load(chartPath)` and reads `chart.Values` (the parsed default values.yaml) — see `engine.go:59,66,222,236`. Factor out a "pull + load + return defaults" path rather than duplicating the pull logic.
- `AppsHandler` (`internal/api/apps.go`) currently depends only on the read-only `apps.Catalog` port and registers `GET /api/v1/apps`, `/categories`, `/{id}`. It needs a new dependency for chart values.
- The App metadata carries `chartRef` (repo + chart), so the handler can resolve repo/chart from the `{id}` via the catalog, and take `version` from the query string.

**Files:**
- Modify: `pkg/helm/interface.go` — add a `ChartInspector` port (or extend `ValueRenderer`): `DefaultValues(ctx, repo, chart, version string) (values map[string]any, questions map[string]any, err error)`. `questions` is best-effort (nil if the chart has no `questions.yaml`).
- Modify: `pkg/helm/engine.go` — implement `DefaultValues`: pull the chart (reuse the existing pull path), `loader.Load`, return `chart.Values`; scan `chart.Raw`/`chart.Files` for `questions.yaml` and parse it if present.
- Modify: `pkg/helm/fake_engine.go` — add a fake `DefaultValues` returning canned values for tests.
- Modify: `internal/api/apps.go` — inject the inspector port; register `GET /api/v1/apps/{id}/values`; resolve repo/chart from the catalog App, read `?version=`, return `{ "values": {...}, "questions": {...}|null }`.
- Modify: `internal/api/apps_test.go` — happy-path + not-found + missing-version tests (use the fake).
- Modify: `cmd/operator/main.go` — pass the helm engine (already constructed) as the inspector into `NewAppsHandler`.
- Modify: `ui/ai-factory/pkg/ai-factory/utils/operator-api.ts` — add `getAppValues(id, version)`.

- [ ] **Step 1: Write failing backend tests** in `internal/api/apps_test.go`:

```go
func TestAppValues_HappyPath(t *testing.T) {
    // catalog returns an app whose chartRef => repo/chart; fake inspector returns
    // values {"replicaCount": 1}. GET /api/v1/apps/<id>/values?version=1.0.0 => 200,
    // body.values.replicaCount == 1.
}

func TestAppValues_NotFound(t *testing.T)     { /* unknown id => 404 */ }
func TestAppValues_MissingVersion(t *testing.T) { /* no ?version => 400 */ }
```

- [ ] **Step 2: Add the `DefaultValues` port + engine impl + fake**

Extend `pkg/helm` per the Files list. Keep `questions` best-effort. Do NOT apply image-rewrite or overrides — this is layer-1 defaults only.

- [ ] **Step 3: Add the handler endpoint + wire main.go**

`GET /api/v1/apps/{id}/values?version={v}`: resolve the App via the catalog (404 if unknown), 400 if `version` missing, else call `inspector.DefaultValues(ctx, repo, chart, version)` and write `{ values, questions }`. Reuse the existing `mapCatalogErr`/`writeError`/`writeJSON` helpers.

- [ ] **Step 4: Add `getAppValues` to operator-api.ts**

```typescript
export function getAppValues(id: string, version: string): Promise<{ values: Record<string, any>; questions: Record<string, any> | null }> {
  return operatorFetch(`/api/v1/apps/${ encodeURIComponent(id) }/values?version=${ encodeURIComponent(version) }`);
}
```

- [ ] **Step 5: Run backend tests + build UI**

```bash
go test ./internal/api/... ./pkg/helm/... 2>&1 | grep -E "^(ok|FAIL|---)"
cd ui/ai-factory && npm run build 2>&1 | grep -i error | head
```

- [ ] **Step 6: Commit**

```bash
git add pkg/helm/interface.go pkg/helm/engine.go pkg/helm/fake_engine.go \
        internal/api/apps.go internal/api/apps_test.go cmd/operator/main.go \
        ui/ai-factory/pkg/ai-factory/utils/operator-api.ts
git commit -m "feat: add chart default-values endpoint (GET /api/v1/apps/{id}/values) for the install Configuration step"
```

---

### Task 3-1: App Install Wizard (4-step) — default-values config, progress modal, DNS validation

Four-step wizard: Basic Info → Target → Configuration → Review. localStorage persistence. Two delivery strategies (`helm` / `gitops` — the aif `WorkloadSpec.deployStrategy` CRD enum; the reference's third "FleetBundle" option is subsumed into aif's `helm`, which always delivers via Fleet). The Configuration step loads the chart's default values via `getAppValues` (Task 3-0). After submit, an `InstallProgressModal` shows per-cluster progress (same component Task 4-1 uses).

**Files:**
- Create: `ui/ai-factory/pkg/ai-factory/test/p6-8-app-install-wizard.test.mjs`
- Create: `ui/ai-factory/pkg/ai-factory/pages/wizards/app-install.vue`

- [ ] **Step 1: Write failing scaffold tests**

Create `ui/ai-factory/pkg/ai-factory/test/p6-8-app-install-wizard.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${ p }`, import.meta.url), 'utf8');

test('app-install.vue: exports name AppInstallWizard', () => {
  const src = read('pages/wizards/app-install.vue');
  assert.match(src, /name:\s*'AppInstallWizard'/);
});

test('app-install.vue: uses WizardStepIndicator', () => {
  const src = read('pages/wizards/app-install.vue');
  assert.match(src, /WizardStepIndicator/);
});

test('app-install.vue: has 4 steps (basicInfo, target, configuration, review)', () => {
  const src = read('pages/wizards/app-install.vue');
  assert.match(src, /aif\.pages\.wizards\.steps\.basicInfo/);
  assert.match(src, /aif\.pages\.wizards\.steps\.target/);
  assert.match(src, /aif\.pages\.wizards\.steps\.configuration/);
  assert.match(src, /aif\.pages\.wizards\.steps\.review/);
});

test('app-install.vue: calls createWorkload from operator-api', () => {
  const src = read('pages/wizards/app-install.vue');
  assert.match(src, /createWorkload/);
  assert.match(src, /operator-api/);
});

test('app-install.vue: persists state to localStorage on step change', () => {
  const src = read('pages/wizards/app-install.vue');
  assert.match(src, /localStorage/);
});

test('app-install.vue: has instance name and namespace fields in step 1', () => {
  const src = read('pages/wizards/app-install.vue');
  assert.match(src, /aif\.pages\.wizards\.install\.instanceName/);
  assert.match(src, /aif\.pages\.wizards\.install\.namespace/);
});

test('app-install.vue: has target clusters and delivery strategy in step 2', () => {
  const src = read('pages/wizards/app-install.vue');
  assert.match(src, /aif\.pages\.wizards\.install\.targetClusters/);
  assert.match(src, /aif\.pages\.wizards\.install\.deliveryStrategy/);
});

test('app-install.vue: validates instance name as DNS label', () => {
  const src = read('pages/wizards/app-install.vue');
  assert.match(src, /DNS_LABEL/);
});

test('app-install.vue: Configuration step loads chart defaults via getAppValues', () => {
  const src = read('pages/wizards/app-install.vue');
  assert.match(src, /getAppValues/);
});

test('app-install.vue: shows InstallProgressModal after submit', () => {
  const src = read('pages/wizards/app-install.vue');
  assert.match(src, /InstallProgressModal/);
  assert.match(src, /showProgressModal/);
});

test('app-install.vue: keys valueOverrides by the instance name (not empty string)', () => {
  const src = read('pages/wizards/app-install.vue');
  // valueOverrides must be keyed by the workload name, e.g. { [this.form.name]: ... }
  assert.match(src, /\[\s*this\.form\.name\s*\]|\[\s*form\.name\s*\]/);
  assert.doesNotMatch(src, /valueOverrides:\s*\{\s*''\s*:/);
});
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-8-app-install-wizard.test.mjs 2>&1 | tail -10
```

Expected: `not ok` — file not found.

- [ ] **Step 3: Create the wizards directory and implement app-install.vue**

```bash
mkdir -p ui/ai-factory/pkg/ai-factory/pages/wizards
```

Create `ui/ai-factory/pkg/ai-factory/pages/wizards/app-install.vue`:

```vue
<template>
  <div class="aif-wizard">
    <h1>{{ t('aif.pages.wizards.install.title', { name: appId }) }}</h1>

    <WizardStepIndicator
      :steps="steps"
      :current-step="currentStep"
      @go-to-step="goToStep"
    />

    <!-- Step 0: Basic Info -->
    <div v-if="currentStep === 0" class="aif-wizard__step">
      <label>
        {{ t('aif.pages.wizards.install.instanceName') }}
        <input v-model="form.name" type="text" class="input" />
      </label>
      <label>
        {{ t('aif.pages.wizards.install.namespace') }}
        <input v-model="form.namespace" type="text" class="input" />
      </label>
      <label>
        {{ t('aif.pages.wizards.install.chartVersion') }}
        <select v-model="form.chartVersion" class="select">
          <option v-for="v in availableVersions" :key="v" :value="v">{{ v }}</option>
        </select>
      </label>
    </div>

    <!-- Step 1: Target -->
    <div v-if="currentStep === 1" class="aif-wizard__step">
      <label>{{ t('aif.pages.wizards.install.targetClusters') }}</label>
      <div v-for="cluster in availableClusters" :key="cluster.id" class="aif-wizard__cluster-row">
        <input
          :id="cluster.id"
          v-model="form.targetClusters"
          type="checkbox"
          :value="cluster.id"
        />
        <label :for="cluster.id">{{ cluster.nameDisplay || cluster.id }}</label>
      </div>
      <fieldset class="aif-wizard__strategy">
        <legend>{{ t('aif.pages.wizards.install.deliveryStrategy') }}</legend>
        <label>
          <input v-model="form.deployStrategy" type="radio" value="helm" />
          {{ t('aif.pages.wizards.install.strategyHelm') }}
        </label>
        <label>
          <input v-model="form.deployStrategy" type="radio" value="gitops" />
          {{ t('aif.pages.wizards.install.strategyGitops') }}
        </label>
      </fieldset>
    </div>

    <!-- Step 2: Configuration (pre-filled with the chart's default values from getAppValues) -->
    <div v-if="currentStep === 2" class="aif-wizard__step">
      <label>{{ t('aif.pages.wizards.install.helmValues') }}</label>
      <div v-if="loadingValues" class="aif-wizard__loading"><Loading /></div>
      <textarea v-else v-model="form.valuesYaml" class="aif-wizard__yaml-editor" rows="16" />
      <button class="btn btn-sm role-secondary" :disabled="loadingValues" @click="resetValues">
        {{ t('aif.pages.wizards.install.resetDefaults') }}
      </button>
    </div>

    <!-- Step 3: Review -->
    <div v-if="currentStep === 3" class="aif-wizard__step aif-wizard__review">
      <dl>
        <dt>{{ t('aif.pages.wizards.install.instanceName') }}</dt><dd>{{ form.name }}</dd>
        <dt>{{ t('aif.pages.wizards.install.namespace') }}</dt><dd>{{ form.namespace }}</dd>
        <dt>{{ t('aif.pages.wizards.install.chartVersion') }}</dt><dd>{{ form.chartVersion }}</dd>
        <dt>{{ t('aif.pages.wizards.install.targetClusters') }}</dt><dd>{{ form.targetClusters.join(', ') }}</dd>
        <dt>{{ t('aif.pages.wizards.install.deliveryStrategy') }}</dt><dd>{{ form.deployStrategy }}</dd>
      </dl>
    </div>

    <div class="aif-wizard__nav">
      <button v-if="currentStep > 0" class="btn role-secondary" @click="back">
        {{ t('aif.pages.wizards.install.back') }}
      </button>
      <button class="btn role-secondary" @click="cancel">
        {{ t('aif.pages.wizards.install.cancel') }}
      </button>
      <button v-if="currentStep < steps.length - 1" class="btn role-primary" @click="next">
        {{ t('aif.pages.wizards.install.next') }}
      </button>
      <button v-else class="btn role-primary" :disabled="installing" @click="install">
        {{ installing ? t('aif.pages.wizards.install.installing') : t('aif.pages.wizards.install.install') }}
      </button>
    </div>

    <div v-if="installError" class="aif-wizard__error">{{ installError.message }}</div>

    <InstallProgressModal
      :show="showProgressModal"
      :title="t('aif.pages.wizards.install.title', { name: appId })"
      :progress="installProgress"
      @done="onProgressDone"
      @cancel="onProgressCancel"
    />
  </div>
</template>

<script>
import { defineComponent } from 'vue';
import Loading from '@shell/components/Loading';
import WizardStepIndicator from '../../components/wizards/WizardStepIndicator.vue';
import InstallProgressModal from '../../components/wizards/InstallProgressModal.vue';
import { getApp, getAppValues, createWorkload } from '../../utils/operator-api';
import { PRODUCT_NAME, MANAGEMENT_CLUSTER } from '../../config/types';
import yaml from 'js-yaml';

const STORAGE_KEY = 'aif-app-install-wizard';
// DNS-1123 label: lowercase alphanumeric + hyphens, 1–63 chars.
const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export default defineComponent({
  name: 'AppInstallWizard',

  components: { WizardStepIndicator, InstallProgressModal, Loading },

  async fetch() {
    const id  = this.$route.params.id;
    this.app  = await getApp(id);
    const clusters = await this.$store.dispatch('management/findAll', { type: 'management.cattle.io.cluster' });
    this.availableClusters = clusters.filter((c) => c.id !== 'local');

    // Default chart version + namespace suggestion before restoring saved state.
    this.form.chartVersion = this.app?.version || '';
    if (!this.form.namespace && this.form.name) {
      this.form.namespace = `${ this.form.name }-system`;
    }

    const saved = localStorage.getItem(`${ STORAGE_KEY }:${ id }`);
    if (saved) {
      try {
        Object.assign(this.form, JSON.parse(saved));
      } catch (_) { /* ignore corrupt storage */ }
    }
  },

  data() {
    return {
      app:               null,
      availableClusters: [],
      currentStep:       0,
      installing:        false,
      installError:      null,
      loadingValues:     false,
      valuesLoaded:      false,
      showProgressModal: false,
      installProgress:   [],
      form: {
        name:           '',
        namespace:      '',
        chartVersion:   '',
        targetClusters: [],
        deployStrategy: 'helm',
        valuesYaml:     '',
      },
    };
  },

  watch: {
    // Suggest "<name>-system" only while the namespace field is still empty,
    // so we never clobber a namespace the user has typed.
    'form.name'(name) {
      if (!this.form.namespace) {
        this.form.namespace = name ? `${ name }-system` : '';
      }
    },
  },

  computed: {
    appId() {
      return this.$route.params.id;
    },

    availableVersions() {
      return this.app ? [this.app.version] : [];
    },

    steps() {
      return [
        { label: this.t('aif.pages.wizards.steps.basicInfo') },
        { label: this.t('aif.pages.wizards.steps.target') },
        { label: this.t('aif.pages.wizards.steps.configuration') },
        { label: this.t('aif.pages.wizards.steps.review') },
      ];
    },
  },

  methods: {
    async goToStep(index) {
      this.currentStep = index;
      if (index === 2) {
        await this.ensureDefaultValues();
      }
    },

    async next() {
      this.saveToStorage();
      this.currentStep++;
      if (this.currentStep === 2) {
        await this.ensureDefaultValues();
      }
    },

    back() {
      this.currentStep--;
    },

    cancel() {
      this.clearStorage();
      this.$router.push({ name: `${ PRODUCT_NAME }-c-cluster-apps`, params: { cluster: MANAGEMENT_CLUSTER } });
    },

    saveToStorage() {
      localStorage.setItem(`${ STORAGE_KEY }:${ this.appId }`, JSON.stringify(this.form));
    },

    clearStorage() {
      localStorage.removeItem(`${ STORAGE_KEY }:${ this.appId }`);
    },

    // Load the chart's default values (Task 3-0 endpoint) the first time the
    // Configuration step is shown, unless saved/edited values already exist.
    async ensureDefaultValues() {
      if (this.valuesLoaded || this.form.valuesYaml) {
        return;
      }
      await this.loadDefaultValues();
    },

    async loadDefaultValues() {
      this.loadingValues = true;
      try {
        const { values } = await getAppValues(this.appId, this.form.chartVersion);
        this.form.valuesYaml = yaml.dump(values || {});
        this.valuesLoaded = true;
      } catch (e) {
        this.installError = e;
      } finally {
        this.loadingValues = false;
      }
    },

    resetValues() {
      // "Reset to defaults" reloads the chart defaults rather than clearing.
      this.valuesLoaded = false;
      this.form.valuesYaml = '';
      return this.loadDefaultValues();
    },

    async install() {
      if (!DNS_LABEL.test(this.form.name)) {
        this.installError = new Error(this.t('aif.pages.wizards.install.nameInvalid'));
        return;
      }
      this.installing    = true;
      this.installError  = null;
      this.installProgress = (this.form.targetClusters.length ? this.form.targetClusters : ['local']).map((c) => ({
        clusterId: c, clusterName: c, status: 'installing', message: this.t('aif.pages.wizards.install.creating'),
      }));
      this.showProgressModal = true;
      try {
        await createWorkload({
          metadata: { name: this.form.name, namespace: this.form.namespace },
          spec: {
            source: {
              kind: 'App',
              app: {
                repo:    this.app?.chartRef?.repo || '',
                chart:   this.app?.chartRef?.chart || this.appId,
                version: this.form.chartVersion,
              },
            },
            targetClusters:  this.form.targetClusters,
            deployStrategy:  this.form.deployStrategy,
            // App sources use ONE component keyed by the workload name
            // (deployer.go: desiredComponent.name = req.SpecName for SourceKindApp).
            valueOverrides:  { [this.form.name]: this.form.valuesYaml },
          },
        });
        this.installProgress = this.installProgress.map((p) => ({ ...p, status: 'success', message: this.t('aif.pages.wizards.install.created') }));
        this.clearStorage();
      } catch (e) {
        this.installError = e;
        this.installProgress = this.installProgress.map((p) => ({ ...p, status: 'failed', message: e?.message || 'Error' }));
      } finally {
        this.installing = false;
      }
    },

    onProgressDone() {
      this.showProgressModal = false;
      this.$router.push({ name: `${ PRODUCT_NAME }-c-cluster-workloads`, params: { cluster: MANAGEMENT_CLUSTER } });
    },

    onProgressCancel() {
      this.showProgressModal = false;
    },
  },
});
</script>

<style scoped>
.aif-wizard {
  max-width: 720px;
  padding: 24px;
}

.aif-wizard__step {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.aif-wizard__yaml-editor {
  width: 100%;
  font-family: monospace;
  font-size: 0.85rem;
}

.aif-wizard__review dt {
  font-weight: 600;
}

.aif-wizard__nav {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 24px;
}

.aif-wizard__error {
  color: var(--error);
  margin-top: 12px;
}

.aif-wizard__strategy {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.aif-wizard__cluster-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
```

> **Dependency:** this wizard imports `js-yaml` (`yaml.dump` to render the default values as editable YAML). It is already a transitive Rancher UI dependency; if `npm run build` reports it missing, add it to the extension's `package.json`.

- [ ] **Step 3b: Add the new l10n keys**

In `l10n/en-us.yaml`, add under `aif.pages.wizards.install` (alongside the existing keys added in F-3 Step 22):

```yaml
        nameInvalid: 'Instance name must be a DNS label: lowercase letters, digits and hyphens, 1–63 characters.'
        creating: 'Creating workload…'
        created: 'Workload created'
        resetDefaults: 'Reset to defaults'
        helmValues: 'Helm values'
        strategyHelm: 'Helm'
        strategyGitops: 'GitOps'
```
(Skip any key that already exists from F-3 Step 22.)

- [ ] **Step 4: Run scaffold tests**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-8-app-install-wizard.test.mjs 2>&1
```

Expected: all `ok`

- [ ] **Step 5: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/pages/wizards/app-install.vue \
        ui/ai-factory/pkg/ai-factory/test/p6-8-app-install-wizard.test.mjs
git commit -m "feat(ui): implement App Install 4-step wizard"
```

---

### Task 3-2: App Manage (PATCH handler + Manage page)

This task combines the PATCH workload endpoint (already implemented in Task F-3 Steps 15–19) with the App Manage page. The PATCH handler work is complete if Task F-3 was done; this task only needs the UI page. Add a brief cross-check step and then implement manage.vue.

**Files:**
- Create: `ui/ai-factory/pkg/ai-factory/test/p6-8-manage-page.test.mjs`
- Create: `ui/ai-factory/pkg/ai-factory/pages/manage.vue`

- [ ] **Step 1: Confirm PATCH handler is present from Task F-3**

```bash
go test ./internal/api/... -run "TestWorkloadsPatch" -v 2>&1 | grep -E "^(--- PASS|--- FAIL|FAIL|ok)"
```

Expected: all `--- PASS`. If any fail, complete Task F-3 Steps 15–19 before continuing.

- [ ] **Step 2: Write failing scaffold tests**

Create `ui/ai-factory/pkg/ai-factory/test/p6-8-manage-page.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${ p }`, import.meta.url), 'utf8');

test('manage.vue: exports name ManagePage', () => {
  const src = read('pages/manage.vue');
  assert.match(src, /name:\s*'ManagePage'/);
});

test('manage.vue: calls getWorkload to pre-populate form', () => {
  const src = read('pages/manage.vue');
  assert.match(src, /getWorkload/);
});

test('manage.vue: calls patchWorkload on apply', () => {
  const src = read('pages/manage.vue');
  assert.match(src, /patchWorkload/);
});

test('manage.vue: reads ns and name from route params', () => {
  const src = read('pages/manage.vue');
  assert.match(src, /params\.ns|route\.params\.ns/);
  assert.match(src, /params\.name|route\.params\.name/);
});

test('manage.vue: has Apply button with manage l10n key', () => {
  const src = read('pages/manage.vue');
  assert.match(src, /aif\.pages\.wizards\.manage\.apply/);
});

test('manage.vue: keys valueOverrides by the workload name (not empty string)', () => {
  const src = read('pages/manage.vue');
  assert.match(src, /\[\s*this\.\$route\.params\.name\s*\]/);
  assert.doesNotMatch(src, /valueOverrides\s*=\s*\{\s*''\s*:/);
});
```

- [ ] **Step 3: Run to confirm failures**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-8-manage-page.test.mjs 2>&1 | tail -10
```

Expected: `not ok` — file not found.

- [ ] **Step 4: Implement manage.vue**

Create `ui/ai-factory/pkg/ai-factory/pages/manage.vue`:

```vue
<template>
  <div class="aif-wizard">
    <h1>{{ t('aif.pages.wizards.manage.title', { name: workloadName }) }}</h1>

    <div v-if="loading" class="aif-wizard__loading">
      <Loading />
    </div>

    <template v-else>
      <div class="aif-wizard__step">
        <label>
          {{ t('aif.pages.wizards.install.chartVersion') }}
          <input v-model="form.chartVersion" type="text" class="input" />
        </label>
        <label>{{ t('aif.pages.wizards.install.helmValues') }}</label>
        <textarea v-model="form.valuesYaml" class="aif-wizard__yaml-editor" rows="16" />
      </div>

      <div class="aif-wizard__nav">
        <button class="btn role-secondary" @click="cancel">
          {{ t('aif.pages.wizards.install.cancel') }}
        </button>
        <button class="btn role-primary" :disabled="applying" @click="applyChanges">
          {{ applying ? t('aif.pages.wizards.install.installing') : t('aif.pages.wizards.manage.apply') }}
        </button>
      </div>

      <div v-if="applyError" class="aif-wizard__error">{{ applyError.message }}</div>
      <div v-if="applySuccess" class="aif-wizard__success">{{ t('aif.pages.wizards.manage.applySuccess') }}</div>
    </template>
  </div>
</template>

<script>
import { defineComponent } from 'vue';
import Loading from '@shell/components/Loading';
import { getWorkload, patchWorkload } from '../utils/operator-api';
import { PRODUCT_NAME, MANAGEMENT_CLUSTER } from '../config/types';

export default defineComponent({
  name: 'ManagePage',

  components: { Loading },

  async fetch() {
    this.loading = true;
    try {
      const wl = await getWorkload(this.$route.params.ns, this.$route.params.name);
      this.workload = wl;
      this.form.chartVersion = wl.spec?.source?.app?.version || '';
      // App workloads key valueOverrides by the workload name (deployer.go:
      // desiredComponent.name = req.SpecName). The install wizard wrote the
      // full effective values under that key, so manage shows them verbatim.
      const overrides = wl.spec?.valueOverrides || {};
      this.form.valuesYaml = overrides[this.$route.params.name] ?? Object.values(overrides)[0] ?? '';
    } finally {
      this.loading = false;
    }
  },

  data() {
    return {
      workload:     null,
      loading:      true,
      applying:     false,
      applyError:   null,
      applySuccess: false,
      form: {
        chartVersion: '',
        valuesYaml:   '',
      },
    };
  },

  computed: {
    workloadName() {
      return this.$route.params.name;
    },
  },

  methods: {
    cancel() {
      this.$router.push({ name: `${ PRODUCT_NAME }-c-cluster-workloads`, params: { cluster: MANAGEMENT_CLUSTER } });
    },

    async applyChanges() {
      this.applying     = true;
      this.applyError   = null;
      this.applySuccess = false;
      try {
        const spec = JSON.parse(JSON.stringify(this.workload?.spec || {}));
        if (spec.source?.app) {
          spec.source.app.version = this.form.chartVersion;
        }
        // Key by the workload name to match the deployer's App component name.
        spec.valueOverrides = { [this.$route.params.name]: this.form.valuesYaml };
        await patchWorkload(this.$route.params.ns, this.$route.params.name, { spec });
        this.applySuccess = true;
      } catch (e) {
        this.applyError = e;
      } finally {
        this.applying = false;
      }
    },
  },
});
</script>

<style scoped>
.aif-wizard {
  max-width: 720px;
  padding: 24px;
}

.aif-wizard__step {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.aif-wizard__yaml-editor {
  width: 100%;
  font-family: monospace;
  font-size: 0.85rem;
}

.aif-wizard__nav {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.aif-wizard__error {
  color: var(--error);
  margin-top: 12px;
}

.aif-wizard__success {
  color: var(--success);
  margin-top: 12px;
}
</style>
```

- [ ] **Step 5: Run scaffold tests**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-8-manage-page.test.mjs 2>&1
```

Expected: all `ok`

- [ ] **Step 6: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/pages/manage.vue \
        ui/ai-factory/pkg/ai-factory/test/p6-8-manage-page.test.mjs
git commit -m "feat(ui): implement App Manage page with pre-populated wizard"
```

---

## Group 4: Blueprint Installation

### User-Facing Features & Behaviors

- **Blueprint Install wizard** — a **3-step** flow: Basic Info (instance name **DNS-label validated**, namespace) → Target (one or more clusters + delivery strategy **Helm**/**GitOps**) → Review (shows the blueprint name + version, instance name, namespace, clusters, strategy).
- The **Install button on every Blueprint tile is now live** (no longer "coming soon") and opens the wizard **pre-filled** with that blueprint's name and version — the user does not retype them, and they are non-editable.
- Clicking **Install** shows the shared **per-cluster progress modal**; **Done** navigates to the Workloads page, where the new row shows source type **Blueprint** and the chosen version.

### Task 4-1: Blueprint Install Wizard (3-step: Basic Info → Target → Review)

Three-step wizard matching `BlueprintInstallWizard.vue` in the legacy UI. Includes InstallProgressModal after submit and DNS-label validation on the workload name. Reuses the `POST /api/v1/workloads` endpoint with `source.kind: Blueprint`.

**Files:**
- Create: `ui/ai-factory/pkg/ai-factory/test/p6-8-blueprint-install-wizard.test.mjs`
- Create: `ui/ai-factory/pkg/ai-factory/pages/wizards/blueprint-install.vue`
- Reuse (created in Task F-1): `components/wizards/InstallProgressModal.vue`

- [ ] **Step 1: Write failing scaffold tests**

Create `ui/ai-factory/pkg/ai-factory/test/p6-8-blueprint-install-wizard.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${ p }`, import.meta.url), 'utf8');

test('blueprint-install.vue: exports name BlueprintInstallWizard', () => {
  const src = read('pages/wizards/blueprint-install.vue');
  assert.match(src, /name:\s*'BlueprintInstallWizard'/);
});

test('blueprint-install.vue: uses WizardStepIndicator', () => {
  const src = read('pages/wizards/blueprint-install.vue');
  assert.match(src, /WizardStepIndicator/);
});

test('blueprint-install.vue: has 3 steps (basicInfo, target, review)', () => {
  const src = read('pages/wizards/blueprint-install.vue');
  assert.match(src, /aif\.pages\.wizards\.steps\.basicInfo/);
  assert.match(src, /aif\.pages\.wizards\.steps\.target/);
  assert.match(src, /aif\.pages\.wizards\.steps\.review/);
});

test('blueprint-install.vue: calls createWorkload with Blueprint source kind', () => {
  const src = read('pages/wizards/blueprint-install.vue');
  assert.match(src, /createWorkload/);
  assert.match(src, /Blueprint/);
});

test('blueprint-install.vue: reads bpName and bpVersion from route params', () => {
  const src = read('pages/wizards/blueprint-install.vue');
  assert.match(src, /bpName|params\.bpName/);
  assert.match(src, /bpVersion|params\.bpVersion/);
});

test('blueprint-install.vue: shows InstallProgressModal after submit', () => {
  const src = read('pages/wizards/blueprint-install.vue');
  assert.match(src, /InstallProgressModal/);
  assert.match(src, /showProgressModal/);
});

test('blueprint-install.vue: validates workload name with DNS_LABEL', () => {
  const src = read('pages/wizards/blueprint-install.vue');
  assert.match(src, /DNS_LABEL/);
});
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-8-blueprint-install-wizard.test.mjs 2>&1 | tail -10
```

Expected: `not ok` — file not found.

- [ ] **Step 3: Implement blueprint-install.vue**

> `InstallProgressModal` is already created in **Task F-1** (shared wizard components). Import it from `../../components/wizards/InstallProgressModal.vue` — do NOT recreate it.

Create `ui/ai-factory/pkg/ai-factory/pages/wizards/blueprint-install.vue`:

```vue
<template>
  <div class="aif-wizard">
    <h1>{{ t('aif.pages.wizards.install.title', { name: bpName }) }}</h1>

    <div class="aif-wizard__bp-banner">
      <span class="badge badge--primary">{{ bpName }}</span>
      <span class="badge badge--secondary">v{{ bpVersion }}</span>
    </div>

    <WizardStepIndicator
      :steps="steps"
      :current-step="currentStep"
      @go-to-step="goToStep"
    />

    <!-- Step 0: Basic Info -->
    <div v-if="currentStep === 0" class="aif-wizard__step">
      <label>
        {{ t('aif.pages.wizards.install.instanceName') }}
        <input v-model="form.name" type="text" class="input" />
      </label>
      <label>
        {{ t('aif.pages.wizards.install.namespace') }}
        <input v-model="form.namespace" type="text" class="input" :placeholder="`${ form.name || 'workload' }-system`" />
      </label>
    </div>

    <!-- Step 1: Target -->
    <div v-if="currentStep === 1" class="aif-wizard__step">
      <label>{{ t('aif.pages.wizards.install.targetClusters') }}</label>
      <div v-for="cluster in availableClusters" :key="cluster.id" class="aif-wizard__cluster-row">
        <input
          :id="cluster.id"
          v-model="form.targetClusters"
          type="checkbox"
          :value="cluster.id"
        />
        <label :for="cluster.id">{{ cluster.nameDisplay || cluster.id }}</label>
      </div>
      <fieldset class="aif-wizard__strategy">
        <legend>{{ t('aif.pages.wizards.install.deliveryStrategy') }}</legend>
        <label>
          <input v-model="form.deployStrategy" type="radio" value="helm" />
          {{ t('aif.pages.wizards.install.strategyHelm') }}
        </label>
        <label>
          <input v-model="form.deployStrategy" type="radio" value="gitops" />
          {{ t('aif.pages.wizards.install.strategyGitops') }}
        </label>
      </fieldset>
    </div>

    <!-- Step 2: Review -->
    <div v-if="currentStep === 2" class="aif-wizard__step aif-wizard__review">
      <dl>
        <dt>Blueprint</dt><dd>{{ bpName }} v{{ bpVersion }}</dd>
        <dt>{{ t('aif.pages.wizards.install.instanceName') }}</dt><dd>{{ form.name }}</dd>
        <dt>{{ t('aif.pages.wizards.install.namespace') }}</dt><dd>{{ form.namespace }}</dd>
        <dt>{{ t('aif.pages.wizards.install.targetClusters') }}</dt><dd>{{ form.targetClusters.join(', ') }}</dd>
        <dt>{{ t('aif.pages.wizards.install.deliveryStrategy') }}</dt><dd>{{ form.deployStrategy }}</dd>
      </dl>
    </div>

    <div class="aif-wizard__nav">
      <button v-if="currentStep > 0" class="btn role-secondary" @click="back">
        {{ t('aif.pages.wizards.install.back') }}
      </button>
      <button class="btn role-secondary" @click="cancel">
        {{ t('aif.pages.wizards.install.cancel') }}
      </button>
      <button v-if="currentStep < steps.length - 1" class="btn role-primary" @click="next">
        {{ t('aif.pages.wizards.install.next') }}
      </button>
      <button v-else class="btn role-primary" :disabled="installing" @click="install">
        {{ installing ? t('aif.pages.wizards.install.installing') : t('aif.pages.wizards.install.install') }}
      </button>
    </div>

    <div v-if="installError" class="aif-wizard__error">{{ installError.message }}</div>

    <InstallProgressModal
      :show="showProgressModal"
      :title="t('aif.pages.wizards.install.title', { name: bpName })"
      :progress="installProgress"
      @done="onProgressDone"
      @cancel="onProgressCancel"
    />
  </div>
</template>

<script>
import { defineComponent } from 'vue';
import WizardStepIndicator from '../../components/wizards/WizardStepIndicator.vue';
import InstallProgressModal from '../../components/wizards/InstallProgressModal.vue';
import { createWorkload } from '../../utils/operator-api';
import { PRODUCT_NAME, MANAGEMENT_CLUSTER } from '../../config/types';

const DNS_LABEL = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$/;

export default defineComponent({
  name: 'BlueprintInstallWizard',

  components: { WizardStepIndicator, InstallProgressModal },

  async fetch() {
    const clusters = await this.$store.dispatch('management/findAll', { type: 'management.cattle.io.cluster' });
    this.availableClusters = clusters.filter((c) => c.id !== 'local');
  },

  data() {
    return {
      availableClusters:  [],
      currentStep:        0,
      installing:         false,
      installError:       null,
      showProgressModal:  false,
      installProgress:    [],
      form: {
        name:           '',
        namespace:      '',
        targetClusters: [],
        deployStrategy: 'helm',
      },
    };
  },

  computed: {
    bpName() {
      return this.$route.params.bpName;
    },

    bpVersion() {
      return this.$route.params.bpVersion;
    },

    steps() {
      return [
        { label: this.t('aif.pages.wizards.steps.basicInfo') },
        { label: this.t('aif.pages.wizards.steps.target') },
        { label: this.t('aif.pages.wizards.steps.review') },
      ];
    },
  },

  methods: {
    goToStep(index) {
      this.currentStep = index;
    },

    next() {
      this.currentStep++;
    },

    back() {
      this.currentStep--;
    },

    cancel() {
      this.$router.push({ name: `${ PRODUCT_NAME }-c-cluster-blueprints`, params: { cluster: MANAGEMENT_CLUSTER } });
    },

    async install() {
      if (!DNS_LABEL.test(this.form.name)) {
        this.installError = new Error('Name must be lowercase alphanumeric and hyphens only, 1–63 characters.');
        return;
      }
      this.installing      = true;
      this.installError    = null;
      this.installProgress = this.form.targetClusters.map((c) => ({
        clusterId: c, clusterName: c, status: 'installing', message: 'Creating Workload CR…',
      }));
      this.showProgressModal = true;
      try {
        await createWorkload({
          metadata: { name: this.form.name, namespace: this.form.namespace },
          spec: {
            source: {
              kind:      'Blueprint',
              blueprint: { name: this.bpName, version: this.bpVersion },
            },
            targetClusters: this.form.targetClusters,
            deployStrategy: this.form.deployStrategy,
          },
        });
        this.installProgress = this.installProgress.map((p) => ({
          ...p, status: 'success', message: 'Workload created',
        }));
      } catch (e) {
        this.installError    = e;
        this.installProgress = this.installProgress.map((p) => ({
          ...p, status: 'failed', message: e?.message || 'Unknown error',
        }));
      } finally {
        this.installing = false;
      }
    },

    onProgressDone() {
      this.showProgressModal = false;
      this.$router.push({ name: `${ PRODUCT_NAME }-c-cluster-workloads`, params: { cluster: MANAGEMENT_CLUSTER } });
    },

    onProgressCancel() {
      this.showProgressModal = false;
    },
  },
});
</script>

<style scoped>
.aif-wizard {
  max-width: 720px;
  padding: 24px;
}

.aif-wizard__bp-banner {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.aif-wizard__step {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.aif-wizard__review dt {
  font-weight: 600;
}

.aif-wizard__nav {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 24px;
}

.aif-wizard__error {
  color: var(--error);
  margin-top: 12px;
}

.aif-wizard__strategy {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.aif-wizard__cluster-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
```

- [ ] **Step 3b: Verify the BlueprintCard Install button reaches this wizard**

The BlueprintCard **Install** button and its `onCardDeploy` navigation were already implemented in **Task 2-5** (the Install button emits `deploy`; `blueprints.vue#onCardDeploy` pushes the `blueprint-install` route with `query: { bpName, bpVersion }`). Before Task 4-1, that click 404'd because the route did not exist. Now that `blueprint-install.vue` is created and the route is registered (F-3 Step 21), this step just confirms the end-to-end path resolves.

**3b-i.** Confirm the existing Task 2-5 scaffold test still passes (BlueprintCard emits `deploy`, no `deployComingSoon`, page handles `@deploy` → `blueprint-install`):

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-5-blueprints-page.test.mjs 2>&1
```

**3b-ii.** Confirm `onCardDeploy` passes the param shape this wizard reads. The wizard reads `bpName` / `bpVersion` from the route query (Step 1 tests). The card emits the selected version object; `onCardDeploy(v)` maps `v.lineage`/`v.version` (or `v.id`) → `bpName`/`bpVersion`. If the BlueprintVersionPicker's version object uses different field names, adjust `onCardDeploy` so the query keys are exactly `bpName` and `bpVersion`.

**3b-iii.** Browser check: open Blueprints → click **Install** on a card → confirm the wizard opens with the name and version pre-filled and non-editable.

- [ ] **Step 4: Run scaffold tests**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-8-blueprint-install-wizard.test.mjs 2>&1
```

Expected: all `ok`

- [ ] **Step 5: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/pages/wizards/blueprint-install.vue \
        ui/ai-factory/pkg/ai-factory/test/p6-8-blueprint-install-wizard.test.mjs
git commit -m "feat(ui): Blueprint Install wizard — 3-step with progress modal and DNS validation"
```

---

## Group 5: Workloads

### User-Facing Features & Behaviors

- **Workloads table** with columns: **State** (colour-coded badge — green Running, amber Degraded, red Failed, blue/info for Pending/unknown), **Name**, **Namespace** (monospace chip), **Source** (type badge + chart/blueprint name), **Deploy** (strategy badge), **Version**, **Actions**.
- **Search** filters rows in real time by name, display name, namespace, or source type.
- The table **auto-refreshes silently every 10 seconds** (no spinner, no error-banner flash on a transient blip); a **Refresh** button forces an immediate reload.
- **Manage** button on **App**-sourced rows (greyed out unless phase is Running) → navigates to the App Manage page for that workload.
- **Upgrade** button on **Blueprint**-sourced rows (shown instead of Manage — mutually exclusive; greyed out unless Running) → opens a **version-picker modal** listing all versions of the same lineage; selecting one re-applies the workload on the chosen version.
- **Delete** on every row → confirmation modal (warns that the workload's Fleet Bundle / GitRepo is also removed).
- **Empty state** message when no workloads exist.

### Task 5-1: Workloads table (state, source, search, delete)

Replace the stub with the full Workloads table: state badge, name, namespace, source badge, deploy strategy, version; Delete action with confirmation modal; 10-second auto-refresh.

**Files:**
- Create: `ui/ai-factory/pkg/ai-factory/test/p6-6-workloads-page.test.mjs`
- Modify: `ui/ai-factory/pkg/ai-factory/pages/workloads.vue`
- Modify: `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`

- [ ] **Step 1: Write failing scaffold tests**

Create `ui/ai-factory/pkg/ai-factory/test/p6-6-workloads-page.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${ p }`, import.meta.url), 'utf8');

test('workloads.vue: exports name WorkloadsPage', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /name:\s*'WorkloadsPage'/);
});

test('workloads.vue: uses defineComponent and async fetch', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /defineComponent/);
  assert.match(src, /async fetch\s*\(/);
});

test('workloads.vue: calls listWorkloads from operator-api', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /listWorkloads/);
  assert.match(src, /operator-api/);
});

test('workloads.vue: renders State, Name, Namespace, Source columns', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /aif\.pages\.workloads\.columns\.state/);
  assert.match(src, /aif\.pages\.workloads\.columns\.name/);
  assert.match(src, /aif\.pages\.workloads\.columns\.namespace/);
  assert.match(src, /aif\.pages\.workloads\.columns\.source/);
});

test('workloads.vue: has delete action with confirmation modal', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /deleteWorkload/);
  assert.match(src, /confirmDelete|deleteConfirm/);
});

test('workloads.vue: has 10-second silent auto-refresh', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /10[_\s]*[*]\s*1000|10000/);
  // The background poll must be silent (does not flash the error banner).
  assert.match(src, /silentRefresh/);
  assert.match(src, /setInterval\([^)]*silentRefresh/);
});

test('workloads.vue: has manual Refresh button', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /aif\.pages\.workloads\.toolbar\.refresh/);
});

test('workloads.vue: empty state key present', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /aif\.pages\.workloads\.empty/);
});

test('workloads.vue: renders Deploy and Version columns', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /aif\.pages\.workloads\.columns\.deploy/);
  assert.match(src, /aif\.pages\.workloads\.columns\.version/);
});

test('workloads.vue: Manage button shown only for App source workloads', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /aif\.pages\.workloads\.actions\.manage/);
  assert.match(src, /source\.kind.*['"']App['"]|['"']App['"].*source\.kind/);
});

test('workloads.vue: Manage button disabled when phase is not Running', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /phase.*Running|Running.*phase/);
  assert.match(src, /:disabled/);
});

test('workloads.vue: Manage navigates to the workload-manage route with ns + name params', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /workload-manage/);
  assert.match(src, /metadata\.namespace/);
  assert.match(src, /metadata\.name/);
});
```

- [ ] **Step 2: Run tests to confirm failures**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-6-workloads-page.test.mjs 2>&1 | tail -20
```

Expected: multiple `not ok` lines because workloads.vue is still a stub.

- [ ] **Step 3: Add l10n keys for the workloads page**

In `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`, replace the `workloads` section:

```yaml
    workloads:
      title: 'Workloads'
      toolbar:
        refresh: 'Refresh'
      columns:
        state: 'State'
        name: 'Name'
        namespace: 'Namespace'
        source: 'Source'
        deploy: 'Deploy'
        version: 'Version'
      actions:
        delete: 'Delete'
        manage: 'Manage'
        upgrade: 'Upgrade'
      deleteModal:
        title: 'Delete Workload'
        body: 'Delete workload "{name}"? This also removes the Fleet Bundle or GitRepo that drives it.'
        confirm: 'Delete'
        cancel: 'Cancel'
      empty:
        none: 'No workloads yet. Install an App or Blueprint to create one.'
        error: 'Failed to load workloads'
      phase:
        running: 'Running'
        pending: 'Pending'
        degraded: 'Degraded'
        failed: 'Failed'
        unknown: 'Unknown'
```

- [ ] **Step 4: Implement workloads.vue**

Replace `ui/ai-factory/pkg/ai-factory/pages/workloads.vue` with:

```vue
<template>
  <div class="aif-workloads">
    <div class="aif-workloads__header">
      <h1>{{ t('aif.pages.workloads.title') }}</h1>
      <button class="btn btn-sm role-secondary" @click="refresh">
        {{ t('aif.pages.workloads.toolbar.refresh') }}
      </button>
    </div>

    <Banner v-if="error" color="error" :label="t('aif.pages.workloads.empty.error')" />

    <div v-else-if="loading" class="aif-workloads__loading">
      <Loading />
    </div>

    <div v-else-if="workloads.length === 0" class="aif-workloads__empty">
      <p>{{ t('aif.pages.workloads.empty.none') }}</p>
    </div>

    <table v-else class="aif-workloads__table">
      <thead>
        <tr>
          <th>{{ t('aif.pages.workloads.columns.state') }}</th>
          <th>{{ t('aif.pages.workloads.columns.name') }}</th>
          <th>{{ t('aif.pages.workloads.columns.namespace') }}</th>
          <th>{{ t('aif.pages.workloads.columns.source') }}</th>
          <th>{{ t('aif.pages.workloads.columns.deploy') }}</th>
          <th>{{ t('aif.pages.workloads.columns.version') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="wl in workloads" :key="`${ wl.metadata.namespace }/${ wl.metadata.name }`">
          <td>
            <span :class="`badge badge--${ phaseBadge(wl) }`">{{ phaseLabel(wl) }}</span>
          </td>
          <td>{{ wl.metadata.name }}</td>
          <td><span class="aif-workloads__mono-chip">{{ wl.metadata.namespace }}</span></td>
          <td>
            <span class="badge badge--primary">{{ sourceKind(wl) }}</span>
            {{ sourceName(wl) }}
          </td>
          <td><span class="badge badge--secondary">{{ wl.spec.deployStrategy || 'helm' }}</span></td>
          <td>{{ sourceVersion(wl) }}</td>
          <td class="aif-workloads__actions">
            <button
              v-if="wl.spec?.source?.kind === 'App'"
              class="btn btn-sm role-secondary"
              :disabled="wl.status?.phase !== 'Running'"
              @click="navigateManage(wl)"
            >
              {{ t('aif.pages.workloads.actions.manage') }}
            </button>
            <button class="btn btn-sm role-danger" @click="confirmDelete(wl)">
              {{ t('aif.pages.workloads.actions.delete') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Delete confirmation modal -->
    <div v-if="deleteTarget" class="aif-workloads__modal-backdrop" @click.self="deleteTarget = null">
      <div class="aif-workloads__modal">
        <h3>{{ t('aif.pages.workloads.deleteModal.title') }}</h3>
        <p>{{ t('aif.pages.workloads.deleteModal.body', { name: deleteTarget.metadata.name }) }}</p>
        <div class="aif-workloads__modal-actions">
          <button class="btn role-secondary" @click="deleteTarget = null">
            {{ t('aif.pages.workloads.deleteModal.cancel') }}
          </button>
          <button class="btn role-danger" :disabled="deleting" @click="doDelete">
            {{ t('aif.pages.workloads.deleteModal.confirm') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue';
import Loading from '@shell/components/Loading';
import { Banner } from '@components/Banner';
import { listWorkloads, deleteWorkload } from '../utils/operator-api';
import { PRODUCT_NAME, MANAGEMENT_CLUSTER } from '../config/types';

export default defineComponent({
  name: 'WorkloadsPage',

  components: { Loading, Banner },

  async fetch() {
    await this.loadWorkloads();
  },

  data() {
    return {
      workloads:    [],
      loading:      false,
      error:        null,
      deleteTarget: null,
      deleting:     false,
      _timer:       null,
    };
  },

  mounted() {
    // Background poll is silent (see silentRefresh) — no spinner, no error flash,
    // matching the reference AIWorkloads.vue silentRefresh.
    this._timer = setInterval(() => this.silentRefresh(), 10 * 1000);
  },

  beforeUnmount() {
    clearInterval(this._timer);
  },

  methods: {
    async loadWorkloads() {
      this.loading = this.workloads.length === 0;
      this.error = null;
      try {
        this.workloads = await listWorkloads();
      } catch (e) {
        this.error = e;
      } finally {
        this.loading = false;
      }
    },

    // 10s background poll: refresh rows but keep the last good data on a
    // transient failure — never surface the error banner or a spinner mid-poll.
    async silentRefresh() {
      if (this.loading) {
        return;
      }
      try {
        this.workloads = await listWorkloads();
      } catch (e) {
        /* swallow — user can hit Refresh if needed */
      }
    },

    async refresh() {
      await this.loadWorkloads();
    },

    confirmDelete(wl) {
      this.deleteTarget = wl;
    },

    async doDelete() {
      if (!this.deleteTarget) {
        return;
      }
      this.deleting = true;
      try {
        await deleteWorkload(this.deleteTarget.metadata.namespace, this.deleteTarget.metadata.name);
        this.deleteTarget = null;
        await this.loadWorkloads();
      } catch (e) {
        this.error = e;
      } finally {
        this.deleting = false;
      }
    },

    phaseBadge(wl) {
      // Matches the reference phaseBadgeColor mapping.
      switch (wl.status?.phase) {
        case 'Running':  return 'success';
        case 'Degraded': return 'warning';
        case 'Failed':   return 'error';
        default:         return 'info';
      }
    },

    phaseLabel(wl) {
      const phase = wl.status?.phase || 'Unknown';
      const key   = `aif.pages.workloads.phase.${ phase.toLowerCase() }`;
      return this.t(key, undefined, true) || phase;
    },

    sourceKind(wl) {
      return wl.spec?.source?.kind || 'Unknown';
    },

    sourceName(wl) {
      const src = wl.spec?.source;
      if (!src) {
        return '';
      }
      if (src.app) {
        return src.app.chart;
      }
      if (src.blueprint) {
        return src.blueprint.name;
      }
      return '';
    },

    sourceVersion(wl) {
      const src = wl.spec?.source;
      if (!src) {
        return '';
      }
      if (src.app) {
        return src.app.version;
      }
      if (src.blueprint) {
        return src.blueprint.version;
      }
      return '';
    },

    navigateManage(wl) {
      // Matches the workload-manage route registered in F-3 Step 21
      // (path /workloads/:ns/:name/manage). manage.vue reads route.params.ns /
      // route.params.name and calls getWorkload(ns, name) to pre-populate — no
      // query params needed (cleaner than the reference's query-param passing,
      // same user-visible result).
      this.$router.push({
        name:   `${ PRODUCT_NAME }-c-cluster-workload-manage`,
        params: { cluster: MANAGEMENT_CLUSTER, ns: wl.metadata.namespace, name: wl.metadata.name },
      });
    },
  },
});
</script>

<style scoped>
.aif-workloads__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.aif-workloads__table {
  width: 100%;
  border-collapse: collapse;
}

.aif-workloads__table th,
.aif-workloads__table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.aif-workloads__modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.aif-workloads__modal {
  background: var(--body-bg);
  border-radius: 4px;
  padding: 24px;
  max-width: 480px;
  width: 100%;
}

.aif-workloads__modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

.aif-workloads__actions {
  display: flex;
  gap: 6px;
}

.aif-workloads__mono-chip {
  font-family: monospace;
  background: var(--accent-btn);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  border: 1px solid var(--border);
}
</style>
```

- [ ] **Step 5: Run scaffold tests**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-6-workloads-page.test.mjs 2>&1
```

Expected: all `ok` lines

- [ ] **Step 6: Add search filter to workloads.vue**

In `test/p6-6-workloads-page.test.mjs`, append one test:

```javascript
test('workloads.vue: has search input', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /aif\.pages\.workloads\.toolbar\.search/);
});
```

In `l10n/en-us.yaml`, add to the `toolbar` section under `workloads`:

```yaml
        search: 'Search'
```

In `workloads.vue`, make three changes:

**1.** Add `search: ''` to `data()`.

**2.** Add a `computed` block (Vue Options API style, after `data()`):

```javascript
computed: {
  filteredWorkloads() {
    const q = (this.search || '').toLowerCase();
    if (!q) return this.workloads;
    return this.workloads.filter((wl) => (
      wl.metadata.name.toLowerCase().includes(q) ||
      (wl.spec?.displayName || '').toLowerCase().includes(q) ||
      wl.metadata.namespace.toLowerCase().includes(q) ||
      (wl.spec?.source?.kind || '').toLowerCase().includes(q)
    ));
  },
},
```

**3.** In the template, add a search `<input>` just before the `<table>` element (after the empty-state blocks), and change `v-for="wl in workloads"` → `v-for="wl in filteredWorkloads"`:

```vue
<input
  v-model="search"
  type="search"
  class="input"
  :placeholder="t('aif.pages.workloads.toolbar.search')"
/>
```

- [ ] **Step 7: Re-run scaffold tests**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-6-workloads-page.test.mjs 2>&1
```

Expected: all `ok` including the new search test.

- [ ] **Step 8: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/pages/workloads.vue \
        ui/ai-factory/pkg/ai-factory/test/p6-6-workloads-page.test.mjs \
        ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml
git commit -m "feat(ui): implement Workloads table page with search and delete confirmation"
```

---

### Task 5-2: Blueprint workload version upgrade

Adds an Upgrade action to Blueprint-sourced rows in `workloads.vue`. Opens a modal listing all available versions of the same lineage (fetched from Steve store) and calls `patchWorkload` with the selected version.

**Existing state:** The backend upgrade endpoint already exists — `POST /api/v1/workloads/{namespace}/{name}/upgrade` is implemented in `WorkloadsHandler` (`internal/api/workloads.go`). However, the `upgradeWorkload` client function is NOT yet in `operator-api.ts` — that is the one missing function to add. The UI upgrade modal does NOT exist yet.

**Existing operator-api.ts functions (do NOT recreate):** `listWorkloads`, `getWorkload`, `deleteWorkload`, `listBlueprints`, `getBlueprint`, `getBlueprintVersion`. Still missing: `upgradeWorkload` (add it in Step 4 alongside `patchWorkload`).

**Files:**
- Modify: `ui/ai-factory/pkg/ai-factory/pages/workloads.vue`
- Modify: `ui/ai-factory/pkg/ai-factory/utils/operator-api.ts` (add `upgradeWorkload`)
- Modify: `ui/ai-factory/pkg/ai-factory/test/p6-6-workloads-page.test.mjs`
- Modify: `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`

- [ ] **Step 1: Add scaffold tests**

In `test/p6-6-workloads-page.test.mjs`, append:

```javascript
test('workloads.vue: has upgrade action for Blueprint workloads', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /aif\.pages\.workloads\.actions\.upgrade/);
  assert.match(src, /upgradeTarget/);
});

test('workloads.vue: Upgrade button is Blueprint-only (v-else branch) and disabled when not Running', () => {
  const src = read('pages/workloads.vue');
  // Upgrade rendered via v-else to the App-only Manage button
  assert.match(src, /v-else/);
  // Disabled binding checks phase === Running
  assert.match(src, /phase.*Running|Running.*phase/);
  assert.match(src, /:disabled/);
});

test('workloads.vue: has upgrade modal with version picker', () => {
  const src = read('pages/workloads.vue');
  assert.match(src, /aif\.pages\.workloads\.upgradeModal\.title/);
  assert.match(src, /patchWorkload/);
});
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-6-workloads-page.test.mjs 2>&1 | grep "not ok"
```

Expected: the two new tests fail.

- [ ] **Step 3: Add l10n keys**

In `l10n/en-us.yaml`, add to the `pages.workloads` section:

```yaml
      upgradeModal:
        title: 'Upgrade Blueprint Workload'
        body: 'Select a new version for "{name}".'
        selectVersion: 'Target Version'
        confirm: 'Upgrade'
        cancel: 'Cancel'
```

- [ ] **Step 4: Add upgrade action and modal to workloads.vue**

**1.** Add `patchWorkload` to the import from `../utils/operator-api`. Add `CRD_TYPES` to the import from `../config/types`.

**2.** In `async fetch()` (or in `loadWorkloads`), also fetch blueprints:

```javascript
this.blueprints = await this.$store.dispatch('management/findAll', { type: CRD_TYPES.BLUEPRINT });
```

Add `blueprints: []` to `data()`.

**3.** Add to `data()`:

```javascript
upgradeTarget:          null,
upgradeSelectedVersion: '',
availableVersions:      [],
upgrading:              false,
```

**4.** Add methods:

```javascript
blueprintVersionsForLineage(lineageName) {
  return this.blueprints
    .filter((b) => b.spec.blueprintName === lineageName)
    .map((b) => b.spec.version)
    .sort();
},

confirmUpgrade(wl) {
  this.upgradeTarget          = wl;
  this.upgradeSelectedVersion = wl.spec?.source?.blueprint?.version || '';
  this.availableVersions      = this.blueprintVersionsForLineage(
    wl.spec?.source?.blueprint?.name || ''
  );
},

async doUpgrade() {
  if (!this.upgradeTarget || !this.upgradeSelectedVersion) return;
  this.upgrading = true;
  try {
    await patchWorkload(
      this.upgradeTarget.metadata.namespace,
      this.upgradeTarget.metadata.name,
      {
        spec: {
          ...this.upgradeTarget.spec,
          source: {
            ...this.upgradeTarget.spec.source,
            blueprint: {
              ...this.upgradeTarget.spec.source.blueprint,
              version: this.upgradeSelectedVersion,
            },
          },
        },
      }
    );
    this.upgradeTarget = null;
    await this.loadWorkloads();
  } catch (e) {
    this.error = e;
  } finally {
    this.upgrading = false;
  }
},
```

**5.** In the table's actions column, replace the Manage `<button>` (from Task 5-1) with the full Manage+Upgrade pair. The Manage button already has `v-if="wl.spec?.source?.kind === 'App'"` — add `v-else` on the Upgrade button so both conditions are mutually exclusive:

```vue
<button
  v-else
  class="btn btn-sm role-secondary"
  :disabled="wl.status?.phase !== 'Running'"
  @click="confirmUpgrade(wl)"
>
  {{ t('aif.pages.workloads.actions.upgrade') }}
</button>
```

Place this immediately after the existing Manage `<button>` (which closes with `</button>`). The template then reads: Manage (v-if App), Upgrade (v-else), Delete.

**6.** Add the upgrade modal template alongside the existing delete modal:

```vue
<!-- Upgrade version modal -->
<div v-if="upgradeTarget" class="aif-workloads__modal-backdrop" @click.self="upgradeTarget = null">
  <div class="aif-workloads__modal">
    <h3>{{ t('aif.pages.workloads.upgradeModal.title') }}</h3>
    <p>{{ t('aif.pages.workloads.upgradeModal.body', { name: upgradeTarget.metadata.name }) }}</p>
    <label>
      {{ t('aif.pages.workloads.upgradeModal.selectVersion') }}
      <select v-model="upgradeSelectedVersion" class="select">
        <option v-for="v in availableVersions" :key="v" :value="v">{{ v }}</option>
      </select>
    </label>
    <div class="aif-workloads__modal-actions">
      <button class="btn role-secondary" @click="upgradeTarget = null">
        {{ t('aif.pages.workloads.upgradeModal.cancel') }}
      </button>
      <button class="btn role-primary" :disabled="upgrading" @click="doUpgrade">
        {{ t('aif.pages.workloads.upgradeModal.confirm') }}
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 5: Re-run scaffold tests**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-6-workloads-page.test.mjs 2>&1
```

Expected: all `ok`

- [ ] **Step 6: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/pages/workloads.vue \
        ui/ai-factory/pkg/ai-factory/test/p6-6-workloads-page.test.mjs \
        ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml
git commit -m "feat(ui): Blueprint workload version upgrade modal in Workloads page"
```

---

## Group 6: Overview

### User-Facing Features & Behaviors

- **Overview** is the default landing page when opening the extension.
- **Four summary cards** (clickable): **Total Workloads**, **Running**, **With Issues** (Degraded + Failed), **Active Blueprints** (distinct lineages that have an Active version). Clicking a workload card navigates to Workloads; the Active Blueprints card navigates to Blueprints.
- **Recent Workloads** panel — the 5 most recently created workloads (state badge, name, source label); a **View all** link → Workloads. Empty-state message when none.
- **Active Blueprints** panel — up to 5 active **lineages**, each shown with its **latest active version**; a **View all** link → Blueprints. Empty-state message when none.
- **Quick Actions** — three cards: **Browse Apps**, **Manage Blueprints**, **View Workloads**.
- The dashboard **auto-refreshes silently every 10 seconds**; a **Refresh** button forces an immediate reload.

### Task 6-1: Overview dashboard

Replace the stub with the Overview dashboard: 4 summary cards, Recent Workloads panel, Active Blueprints panel, 3 Quick Action cards, 10-second auto-refresh.

**Files:**
- Create: `ui/ai-factory/pkg/ai-factory/test/p6-10-overview.test.mjs`
- Modify: `ui/ai-factory/pkg/ai-factory/pages/overview.vue`
- Modify: `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`

- [ ] **Step 1: Write failing scaffold tests**

Create `ui/ai-factory/pkg/ai-factory/test/p6-10-overview.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${ p }`, import.meta.url), 'utf8');

test('overview.vue: exports name OverviewPage', () => {
  const src = read('pages/overview.vue');
  assert.match(src, /name:\s*'OverviewPage'/);
});

test('overview.vue: uses defineComponent and async fetch', () => {
  const src = read('pages/overview.vue');
  assert.match(src, /defineComponent/);
  assert.match(src, /async fetch\s*\(/);
});

test('overview.vue: calls listWorkloads and uses Steve for blueprints', () => {
  const src = read('pages/overview.vue');
  assert.match(src, /listWorkloads/);
  assert.match(src, /CRD_TYPES\.BLUEPRINT/);
  assert.match(src, /management\/findAll/);
});

test('overview.vue: renders 4 summary card keys', () => {
  const src = read('pages/overview.vue');
  assert.match(src, /aif\.pages\.overview\.cards\.totalWorkloads/);
  assert.match(src, /aif\.pages\.overview\.cards\.running/);
  assert.match(src, /aif\.pages\.overview\.cards\.withIssues/);
  assert.match(src, /aif\.pages\.overview\.cards\.activeBlueprints/);
});

test('overview.vue: renders Recent Workloads panel', () => {
  const src = read('pages/overview.vue');
  assert.match(src, /aif\.pages\.overview\.recentWorkloads\.title/);
});

test('overview.vue: renders Active Blueprints panel', () => {
  const src = read('pages/overview.vue');
  assert.match(src, /aif\.pages\.overview\.activeBlueprints\.title/);
});

test('overview.vue: has 10-second auto-refresh', () => {
  const src = read('pages/overview.vue');
  assert.match(src, /10[_\s]*[*]\s*1000|10000/);
  assert.match(src, /setInterval/);
});

test('overview.vue: has Quick Actions section', () => {
  const src = read('pages/overview.vue');
  assert.match(src, /aif\.pages\.overview\.quickActions/);
});

test('overview.vue: Active Blueprints grouped by lineage (latest per lineage)', () => {
  const src = read('pages/overview.vue');
  assert.match(src, /groupByLineage/);
  assert.match(src, /latestActive/);
});

test('overview.vue: Recent Workloads shows a source label, not just kind', () => {
  const src = read('pages/overview.vue');
  assert.match(src, /sourceLabel/);
});

test('overview.vue: background poll is silent (does not reuse loadData error path)', () => {
  const src = read('pages/overview.vue');
  assert.match(src, /silentRefresh/);
  assert.match(src, /setInterval\([^)]*silentRefresh/);
});
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-10-overview.test.mjs 2>&1 | tail -15
```

Expected: multiple `not ok` — overview.vue is a stub.

- [ ] **Step 3: Add l10n keys for overview**

In `ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml`, replace the `overview` section:

```yaml
    overview:
      title: 'Overview'
      refresh: 'Refresh'
      cards:
        totalWorkloads: 'Total Workloads'
        running: 'Running'
        withIssues: 'With Issues'
        activeBlueprints: 'Active Blueprints'
      recentWorkloads:
        title: 'Recent Workloads'
        viewAll: 'View all'
        empty: 'No workloads yet'
      activeBlueprints:
        title: 'Active Blueprints'
        viewAll: 'View all'
        empty: 'No blueprints yet'
      quickActions:
        title: 'Quick Actions'
        browseApps: 'Browse Apps'
        browseAppsDesc: 'Explore and install AI applications'
        manageBlueprints: 'Manage Blueprints'
        manageBlueprintsDesc: 'Create and deploy AI stacks'
        viewWorkloads: 'View Workloads'
        viewWorkloadsDesc: 'Monitor running deployments'
      error: 'Failed to load overview data'
```

- [ ] **Step 4: Implement overview.vue**

Replace `ui/ai-factory/pkg/ai-factory/pages/overview.vue` with:

```vue
<template>
  <div class="aif-overview">
    <div class="aif-overview__header">
      <h1>{{ t('aif.pages.overview.title') }}</h1>
      <button class="btn btn-sm role-secondary" @click="refresh">
        {{ t('aif.pages.overview.refresh') }}
      </button>
    </div>

    <Banner v-if="error" color="error" :label="t('aif.pages.overview.error')" />

    <!-- Summary cards -->
    <div class="aif-overview__cards">
      <div class="aif-overview__card" @click="goTo('workloads')">
        <div class="aif-overview__card-value">{{ counts.total }}</div>
        <div class="aif-overview__card-label">{{ t('aif.pages.overview.cards.totalWorkloads') }}</div>
      </div>
      <div class="aif-overview__card aif-overview__card--success" @click="goTo('workloads')">
        <div class="aif-overview__card-value">{{ counts.running }}</div>
        <div class="aif-overview__card-label">{{ t('aif.pages.overview.cards.running') }}</div>
      </div>
      <div class="aif-overview__card aif-overview__card--warning" @click="goTo('workloads')">
        <div class="aif-overview__card-value">{{ counts.withIssues }}</div>
        <div class="aif-overview__card-label">{{ t('aif.pages.overview.cards.withIssues') }}</div>
      </div>
      <div class="aif-overview__card" @click="goTo('blueprints')">
        <div class="aif-overview__card-value">{{ counts.activeBlueprints }}</div>
        <div class="aif-overview__card-label">{{ t('aif.pages.overview.cards.activeBlueprints') }}</div>
      </div>
    </div>

    <!-- Recent Workloads + Active Blueprints panels -->
    <div class="aif-overview__panels">
      <div class="aif-overview__panel">
        <div class="aif-overview__panel-header">
          <h3>{{ t('aif.pages.overview.recentWorkloads.title') }}</h3>
          <a @click.prevent="goTo('workloads')">{{ t('aif.pages.overview.recentWorkloads.viewAll') }}</a>
        </div>
        <p v-if="recentWorkloads.length === 0" class="aif-overview__empty">
          {{ t('aif.pages.overview.recentWorkloads.empty') }}
        </p>
        <table v-else class="aif-overview__mini-table">
          <tbody>
            <tr v-for="wl in recentWorkloads" :key="`${ wl.metadata?.namespace }/${ wl.metadata?.name }`">
              <td><span :class="`badge badge--${ phaseBadge(wl) }`">{{ wl.status?.phase || 'Unknown' }}</span></td>
              <td>{{ wl.metadata?.name }}</td>
              <td>{{ sourceLabel(wl) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="aif-overview__panel">
        <div class="aif-overview__panel-header">
          <h3>{{ t('aif.pages.overview.activeBlueprints.title') }}</h3>
          <a @click.prevent="goTo('blueprints')">{{ t('aif.pages.overview.activeBlueprints.viewAll') }}</a>
        </div>
        <p v-if="activeBlueprints.length === 0" class="aif-overview__empty">
          {{ t('aif.pages.overview.activeBlueprints.empty') }}
        </p>
        <ul v-else class="aif-overview__bp-list">
          <li v-for="bp in activeBlueprints" :key="bp.lineage">
            {{ bp.lineage }}
            <span class="badge badge--primary">{{ bp.version }}</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="aif-overview__quick-actions">
      <h3>{{ t('aif.pages.overview.quickActions.title') }}</h3>
      <div class="aif-overview__actions-grid">
        <div class="aif-overview__action-card" @click="goTo('apps')">
          <strong>{{ t('aif.pages.overview.quickActions.browseApps') }}</strong>
          <p>{{ t('aif.pages.overview.quickActions.browseAppsDesc') }}</p>
        </div>
        <div class="aif-overview__action-card" @click="goTo('blueprints')">
          <strong>{{ t('aif.pages.overview.quickActions.manageBlueprints') }}</strong>
          <p>{{ t('aif.pages.overview.quickActions.manageBlueprintsDesc') }}</p>
        </div>
        <div class="aif-overview__action-card" @click="goTo('workloads')">
          <strong>{{ t('aif.pages.overview.quickActions.viewWorkloads') }}</strong>
          <p>{{ t('aif.pages.overview.quickActions.viewWorkloadsDesc') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue';
import { Banner } from '@components/Banner';
import { CRD_TYPES, PRODUCT_NAME, MANAGEMENT_CLUSTER } from '../config/types';
import { listWorkloads } from '../utils/operator-api';
import { groupByLineage } from '../utils/blueprint';

export default defineComponent({
  name: 'OverviewPage',

  components: { Banner },

  async fetch() {
    await this.loadData();
  },

  data() {
    return {
      workloads:        [],
      blueprints:       [],
      error:            null,
      _timer:           null,
    };
  },

  computed: {
    counts() {
      const total      = this.workloads.length;
      const running    = this.workloads.filter((w) => w.status?.phase === 'Running').length;
      const withIssues = this.workloads.filter((w) => ['Degraded', 'Failed'].includes(w.status?.phase)).length;
      // Count distinct lineages that have at least one Active version (matches the
      // reference's "active blueprint families" — not raw CR count).
      const activeBlueprints = groupByLineage(this.blueprints).filter((l) => l.latestActive).length;
      return { total, running, withIssues, activeBlueprints };
    },

    recentWorkloads() {
      return [...this.workloads]
        .sort((a, b) => new Date(b.metadata?.creationTimestamp || 0) - new Date(a.metadata?.creationTimestamp || 0))
        .slice(0, 5);
    },

    // Group by lineage and show the latest Active version of each (max 5),
    // mirroring the reference's activeBlueprintList.
    activeBlueprints() {
      return groupByLineage(this.blueprints)
        .filter((l) => l.latestActive)
        .map((l) => ({ lineage: l.lineage, version: l.latestActive.version }))
        .slice(0, 5);
    },
  },

  mounted() {
    // Background poll is silent (see silentRefresh) — no spinner, no error flash.
    this._timer = setInterval(() => this.silentRefresh(), 10 * 1000);
  },

  beforeUnmount() {
    clearInterval(this._timer);
  },

  methods: {
    async fetchData() {
      const [workloads, blueprints] = await Promise.all([
        listWorkloads(),
        this.$store.dispatch('management/findAll', { type: CRD_TYPES.BLUEPRINT }),
      ]);
      this.workloads  = workloads;
      this.blueprints = blueprints;
    },

    async loadData() {
      this.error = null;
      try {
        await this.fetchData();
      } catch (e) {
        this.error = e;
      }
    },

    // 10s background poll: refresh data but keep the last good state on a
    // transient failure — never surface the error banner mid-poll.
    async silentRefresh() {
      try {
        await this.fetchData();
      } catch (e) {
        /* swallow — keep last good data */
      }
    },

    async refresh() {
      await this.loadData();
    },

    goTo(page) {
      this.$router.push({ name: `${ PRODUCT_NAME }-c-cluster-${ page }`, params: { cluster: MANAGEMENT_CLUSTER } });
    },

    sourceLabel(wl) {
      const src = wl.spec?.source;
      if (src?.app) {
        return src.app.chart || 'App';
      }
      if (src?.blueprint) {
        return `${ src.blueprint.name } v${ src.blueprint.version }`;
      }
      return src?.kind || '—';
    },

    phaseBadge(wl) {
      // Matches the reference phaseBadgeColor mapping.
      switch (wl.status?.phase) {
        case 'Running':  return 'success';
        case 'Degraded': return 'warning';
        case 'Failed':   return 'error';
        default:         return 'info';
      }
    },
  },
});
</script>

<style scoped>
.aif-overview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.aif-overview__cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.aif-overview__card {
  background: var(--body-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 20px;
  cursor: pointer;
  text-align: center;
}

.aif-overview__card-value {
  font-size: 2rem;
  font-weight: 700;
}

.aif-overview__panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}

.aif-overview__panel {
  background: var(--body-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 16px;
}

.aif-overview__panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.aif-overview__mini-table {
  width: 100%;
  border-collapse: collapse;
}

.aif-overview__mini-table td {
  padding: 4px 8px;
}

.aif-overview__actions-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 12px;
}

.aif-overview__action-card {
  background: var(--body-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 16px;
  cursor: pointer;
}
</style>
```

- [ ] **Step 5: Run scaffold tests**

```bash
cd ui/ai-factory && node --test pkg/ai-factory/test/p6-10-overview.test.mjs 2>&1
```

Expected: all `ok`

- [ ] **Step 6: Commit**

```bash
git add ui/ai-factory/pkg/ai-factory/pages/overview.vue \
        ui/ai-factory/pkg/ai-factory/test/p6-10-overview.test.mjs \
        ui/ai-factory/pkg/ai-factory/l10n/en-us.yaml
git commit -m "feat(ui): implement Overview dashboard with summary cards and panels"
```

---

## Self-Review

### Spec coverage check

| Spec section | Task(s) covering it |
|---|---|
| §4 Overview dashboard | Task 6-1 |
| §5 Apps catalog (existing) | Pre-Task 0 (retained) |
| §5 Apps catalog reference parity (registry selector, click-to-install, cleanup) | Task 1-1 (rework — P6-7 diverged) |
| §6 Blueprints gallery (existing) | Pre-Task 0 (retained) |
| §6 Blueprint Create/Deprecate/Delete | Tasks 2-1, 2-2, 2-5 |
| §6 Blueprint Create wizard | Task 2-3 |
| §6 Blueprint Copy + Edit | Task 2-4 |
| §7 Workloads table + Delete | Tasks F-2, F-3, 5-1 |
| §9.1 App Install Wizard | Tasks F-3, 3-0, 3-1 |
| §9.1 Chart default-values endpoint (Configuration step) | Task 3-0 |
| §9.2 Blueprint Install Wizard | Tasks F-3, 4-1 |
| §9.3 App Manage | Tasks F-3, 3-2 |
| §6.6 Fleet Bundle delivery | Task F-4 (DONE — landed P4-3b) |
| §6.6 Workload phase from Fleet Bundle | Task F-4 (DONE — landed P4-3b) |
| §6.6 Fleet GitRepo delivery | Task F-6 (DONE — landed P4-3) |
| §6.6 Workload phase from Fleet GitRepo | Task F-6 (DONE — landed P4-3) |
| §6.6 Git publish endpoint | Task F-5 (DONE — landed P4-3) |
| §7.3 Blueprint workload version upgrade | Task 5-2 |
| §11 Bundle out of scope (UI hidden) | Pre-Task 0 |
| Settings field parity verification | Pre-Task 0 Step 9 |
| Workloads search filter | Task 5-1 Steps 6–8 |
| Blueprint Install wizard (3-step, progress modal, DNS validation) | Task 4-1 |

### Known Gaps (deferred from MVP1)

| Gap | Reference behavior | Why deferred | Revisit |
|---|---|---|---|
| Apps **installation status** | `Apps.vue` shows "Installed in: \<cluster chips\>" per app + an "Installed" filter checkbox + a list "Clusters" column, computed client-side by probing Rancher Helm releases across clusters (`discoverExistingInstall`). | aif has no Rancher-apps discovery service and the `App` model carries no install data; adding it is a meaningful new client-side service. Product owner accepted deferral for MVP1. | Post-MVP1: port a discovery service and add the install-status UI to Task 1-1's card + list. |
| Apps **NVIDIA registry config** | — | The Apps "Nvidia NGC" registry selector option exists, but Settings has no NVIDIA registry field yet (separate story). The Nvidia option may return an empty grid until that lands. | Separate Settings story. |

### Type consistency

- `workloadReader` (List, Get) and `workloadMutator` (Create, Delete, Patch) together cover the same methods added to `*workload.k8sRepository` and `*workload.FakeRepository` in Task F-2. Both interfaces are ≤4 methods (ISP).
- `blueprintDeploymentCounter.CountByBlueprint` signature matches `workload.DeploymentCounter` interface.
- `createWorkload` in operator-api.ts sends `{ metadata: {...}, spec: {...} }` matching the `createWorkloadRequest` struct in Task F-3.
- `patchWorkload` sends `{ spec: {...} }` matching `patchWorkloadRequest` in Task F-3.
- Fleet Bundle name is `"wl-" + workload.Name` consistently (F-4 DONE, F-6 DONE).
- Fleet GitRepo name is `"wl-" + workload.Name`; manifest paths are `[]string{"bundles/" + workload.Name + ".yaml"}` — already implemented consistently in `pkg/fleet/gitrepo_engine.go` (F-5/F-6 DONE).
- `createBlueprint` in operator-api.ts sends `{ blueprintName, version, useCase, description, components[], valueOverrides }` matching the `createBlueprintRequest` struct in Task 2-1 (which already carries `ValueOverrides map[string]string`). Components carry `kind: 'App'` and an `app: { repo, chart, version }` sub-object; `valueOverrides` is keyed by component name (YAML string per component).
- Blueprint Create wizard (Task 2-3) is 4-step (Basic Info → Select Apps → Configuration → Review). Select Apps is catalog-driven (`listApps({ source: 'suse' })`); the Configuration step's "Load defaults" reuses `getAppValues` (Task 3-0), so Task 2-3 depends on Task 3-0. `version` is semver-validated; steps are readiness-gated.
- Blueprint Install Wizard (Task 4-1) passes `valueOverrides: Record<string,string>` (component name → YAML) in the `createWorkload` body; this matches `WorkloadSpec.ValueOverrides` in `api/v1alpha1`.
- Blueprint upgrade modal (Task 5-2) calls `patchWorkload` with a full updated `spec` — the same `patchWorkloadRequest` struct as the App Manage flow (Task 3-2).
- **App `valueOverrides` keying:** for `source.kind: App`, the deployer creates a single component named after the workload (`deployer.go`: `desiredComponent.name = req.SpecName`). So the App Install wizard (Task 3-1) and App Manage page (Task 3-2) both key `valueOverrides` by the workload/instance name — NOT `''`. The Manage read tolerates legacy `''`-keyed data via an `Object.values(...)[0]` fallback.
- **App deploy strategy:** the wizard offers `helm` / `gitops` only — the `WorkloadSpec.deployStrategy` CRD enum (`workload_types.go`: `Enum=helm;gitops`). The reference UI's third "FleetBundle" option does not exist in aif (its `helm` strategy always delivers via Fleet Bundle).
- **Chart default values:** Task 3-1's Configuration step is pre-filled from `GET /api/v1/apps/{id}/values` (Task 3-0), which returns the chart's `values.yaml` defaults via `pkg/helm` `loader.Load` → `chart.Values`. Rendered as editable YAML (`js-yaml`).
- Blueprint Copy (Task 2-4) uses `?copyFrom=<lineage>&copyVersion=<version>` query params; Edit uses `?editFrom=<lineage>&editVersion=<version>`. The `loadSourceBlueprint` method populates `this.form` in the same shape as the manual wizard, ensuring `createBlueprint` receives the identical payload shape.

### Commit note

Per `CLAUDE.md` at the repo root: no Co-Authored-By trailer, no AI attribution, no automated footers in any commit message.
