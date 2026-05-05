# AIF Go Codebase OOP / Hexagonal Audit

Scope: `/home/thbertoldi/suse/aif` at HEAD `5c7e084`. Focus: object orientation, ports/adapters readiness, and developer-guidance gaps in `CLAUDE.md`. No code edits.

The `pkg/bundle/` triplet (`types.go` + `interface.go` + `manager.go` + `conversions.go`) is taken as the template per the task brief, despite the "manager" naming being itself an anti-pattern this report calls out.

---

## 1. Findings — file:line evidence

### 1A. OOP / SOLID

| # | Evidence | Smell | Notes |
|---|----------|-------|-------|
| 1 | `pkg/bundle/manager.go:14`, `pkg/blueprint/manager.go:12`, `pkg/workload/manager.go:6`, `pkg/apps/catalog.go:9`, `pkg/publish/workflow.go:6`, `pkg/git/git.go:6`, `pkg/helm/helm.go:6`, `pkg/nvidia/discovery.go:6`, `pkg/nvidia/deployer.go:6` | "Manager" / "Engine" used as the only noun, with no role distinction. | Five different responsibilities (cache, validator, workflow, repository, engine) all called `Manager`. |
| 2 | `pkg/bundle/interface.go:6` `Manager` mixes write (`Upsert`) and read (`Get`) on an in-memory cache; comment at `:15` admits Phase 3 will add `Create/List/Update/Delete/ListPendingReview`. | ISP violation in the making — REST handlers will only need readers; controller only needs writer. | Split now into `bundle.Repository` (Get/List) + `bundle.Service` (Upsert/Create/Update/Delete) + `bundle.ReviewQueue` (ListPendingReview). |
| 3 | `pkg/blueprint/interface.go:8-16` `Manager.ValidateSpec` takes `*aifv1.Blueprint` and `ComputeDeploymentCount` takes `*aifv1.Blueprint, []aifv1.Workload`. | Anemic-model + leaky abstraction. Validation belongs on a `Blueprint` domain type; counting deployments is a query that should live in a `WorkloadRepository`/`DeploymentCounter`. | Two different responsibilities glued together because the package is named "Manager". |
| 4 | `pkg/blueprint/manager.go:24-52` `ValidateSpec` is a pure function — no `m` receiver state used (only `m.logger`, never read). | Should be a free function `Validate(bp Blueprint) error` or a method on the domain type, not a struct method. | Constructor `New(logger)` exists only to satisfy interface symmetry. |
| 5 | `pkg/blueprint/manager.go:56-67` `ComputeDeploymentCount` filters `[]aifv1.Workload` and counts. | Belongs on a `WorkloadRepository.CountByBlueprint(name, version)` query, not on `blueprint.Manager`. The reconciler at `internal/controller/blueprint_controller.go:119-126` lists ALL workloads cluster-wide on every reconcile — wasteful. | Move to `pkg/workload.Repository` with a label-selector query. |
| 6 | `internal/controller/bundle_controller.go:152-167` re-implements condition merging by hand. `internal/controller/blueprint_controller.go:184-190` and `internal/controller/workload_controller.go:174-180` correctly use `meta.SetStatusCondition`. | Inconsistency. Same logic, three implementations, one buggy variant (Bundle's `setCondition` rewrites `LastTransitionTime` even when status didn't transition — violates K8s convention). | Extract `pkg/conditions.Set(ptr, cond)` helper and replace all three. |
| 7 | `internal/controller/settings_controller.go:38-44`, `:225-235` — five string fields stored on the reconciler struct, set by `applySettingsToEngines` but never read. | SRP violation: reconciler is also a credential cache. The credential cache should be its own component (or, per spec §6.2, pushed to engines via `UpdateSettings(EngineSettings)`). | Remove the fields; introduce `pkg/settings.Resolver` returning a `Resolved` value object that the reconciler then forwards to engines. |
| 8 | `internal/controller/settings_controller.go:158` hardcodes namespace `"aif"` inside `resolveSecretKeyRef`. | Hidden coupling to deployment topology; not testable; not mentioned in CLAUDE.md as a constraint. | Inject the operator namespace via flag/env (already plumbed in main); pass into reconciler. |
| 9 | `internal/controller/settings_controller.go:213-221` `isSecretNotFound` / `isInvalidSecretKey` use string-matching on error messages. | Fragile, leaks formatting from `resolveSecretKeyRef`. | Define sentinel errors `ErrSecretNotFound`, `ErrInvalidSecretKey` in `pkg/settings` and use `errors.Is`. |
| 10 | `internal/controller/blueprint_controller.go:33-38` `BlueprintReconciler` embeds `client.Client` AND holds `Manager blueprint.Manager`. Same in `bundle_controller.go:23-28`. | Mixing two patterns (embedding vs composition) hides whether the controller talks to K8s directly or through a port. | Pick composition only; controller depends on `blueprint.Validator` + `workload.Counter`, not on raw `client.Client` (which it should NOT need beyond status updates). |
| 11 | `pkg/publish/workflow.go:6-15` `Workflow` struct holds only a logger and has no methods. | Stub with no interface, no behaviour. ARCHITECTURE.md §6.2:1276 already specifies the contract (`Submit/Withdraw/Approve/RequestChanges`). | Land `pkg/publish/interface.go` now to lock the surface even before P3-1 implements it. |
| 12 | `pkg/apps/catalog.go:9-20`, `pkg/workload/manager.go:6-15`, `pkg/nvidia/{discovery,deployer}.go` — concrete structs with no interfaces. | DIP violation. The `cmd/operator/main.go:88-98` "log managers exist" hack at line 88 is itself a code smell signalling these are not yet wired. | All five need an `interface.go` per CLAUDE.md convention (which is currently silent on *when*). |

### 1B. Domain ↔ representation decoupling

| # | Package | v1alpha1 import? | Verdict | Recommendation |
|---|---------|---|---|---|
| 12 | `pkg/bundle` (`types.go:4`, `conversions.go:4`, `interface.go` clean) | Yes — but limited to leaf types in `types.go`. | Mostly correct — but `Submission`, `Review`, `Components`, `PublishedVersions` still re-use `aifv1.*` value types (`types.go:14-29`). | Phase 3: lift those into pure-Go domain structs in `pkg/bundle/types.go`, expand `conversions.go`. |
| 13 | `pkg/blueprint` (`interface.go:4`, `manager.go:8`) | Yes — *interface signatures* take `*aifv1.Blueprint`. | Wrong direction — port leaks K8s API into domain. | (a) add `pkg/blueprint/types.go` with `Blueprint` domain struct; (b) `Validator.Validate(Blueprint) error`; (c) `conversions.go` with `FromCR/ToCR`. Pattern from `pkg/bundle`. |
| 14 | `pkg/workload` (`manager.go`) | No — but the package is empty, so n/a yet. | Should follow the pattern from day one. | Add `types.go`, `interface.go` with `Repository` + `Deployer` ports. P5-1 will add the state machine — pre-place a `pkg/workload/state.go` and a `WorkloadPhase` domain enum mirroring `aifv1.WorkloadPhase`. |
| 15 | `pkg/apps`, `pkg/nvidia`, `pkg/source_collection` | No (all stubs). | Should NOT import `v1alpha1` — these are catalog/discovery adapters speaking to external systems. | Add `types.go` with `CatalogApp`, `NIMEntry`, `ChartMetadata` (already specified in ARCHITECTURE.md §6.2:1422-1440). Conversion lives in the controller, not the adapter. |
| 16 | `pkg/helm`, `pkg/git` | No (stubs). | Pure engines — must NEVER import `v1alpha1`. ARCHITECTURE.md §6.2:1336-1369 confirms. | Add `pkg/helm/interface.go` (`Engine` + `InstallRequest` + `ReleaseStatus` + `EngineSettings`) and `pkg/git/interface.go` per spec. The Workload reconciler (P5-1) builds `[]ResolvedComponent` and hands to engines. |
| 17 | `pkg/publish/workflow.go` | No (stub). | This is the only orchestrator that *must* speak K8s — needs to read Bundles, mint Blueprints, raise events. | Should depend on `bundle.Repository`, `blueprint.Repository`, and `record.EventRecorder` *interfaces*, not `client.Client` directly. |
| 18 | `pkg/conditions/types.go` | No. | Correct — pure constants, no behaviour. | Add a small `Set(conds *[]metav1.Condition, c metav1.Condition)` helper to absorb the duplication called out in finding #6. |

### 1C. Ports & Adapters / Hexagonal boundaries

| # | Boundary | Current state | Proposed port (≤4 methods) | Adapter file | Consumers |
|---|----------|---------------|----------------------------|--------------|-----------|
| 19 | **Catalog discovery — SUSE App Collection** | Empty stub `pkg/apps/catalog.go`; `pkg/source_collection/` is empty (.gitkeep only). | `pkg/source_collection.Client` (`List`, `GetChart`, `UpdateSettings`). Already drafted in ARCHITECTURE.md §6.2:1410-1421. | `pkg/source_collection/api_client.go` (HTTP) + `pkg/source_collection/oci_fallback.go` (registry walk). | Apps catalog REST handler (P1-10), preflight (P3-8), wrapper-blueprint generator (P2-5). |
| 20 | **Catalog discovery — NIM index** | `pkg/nvidia/discovery.go` (stub, struct only). | `pkg/nvidia.Discovery` (`Index`, `Refresh`, `LookupModel`, `UpdateSettings`). Spec at §6.2:1377-1387. | `pkg/nvidia/registry_walker.go` (walks `oci://registry.suse.com/ai/charts/nvidia/`). | NIM picker REST handler (P2-3), workload deployer pre-validation. |
| 21 | **Helm engine** | Stub `pkg/helm/helm.go` — no methods. | `pkg/helm.Engine` (`InstallChartFromRepo`, `Uninstall`, `Status`, `Rollback`, `History`, `UpdateSettings`) — 6 methods, exceeds the ≤4 target; split into `Engine` (install/uninstall/status) and `Releaser` (rollback/history) so deploy code doesn't see rollback API. | `pkg/helm/sdk_engine.go` wrapping `helm.sh/helm/v3`. | Workload reconciler (P5-1), publish.Workflow.Approve (test deploy). |
| 22 | **Git/Fleet engine** | Stub `pkg/git/git.go` — `FleetEngine` struct only. | `pkg/git.FleetEngine` (`Push`, `Remove`, `UpdateSettings`). Spec at §6.2:1342-1353. | `pkg/git/go_git_engine.go` using go-git + auth providers in `pkg/git/auth/`. | Workload reconciler when `spec.deployStrategy=fleet`. |
| 23 | **K8s persistence — per-domain repositories** | Currently controllers call `r.Get/r.List/r.Status().Update` against `client.Client` directly. `internal/controller/blueprint_controller.go:119-123` lists workloads through `r.List`. | One `Repository` per CRD: `bundle.Repository` (Get/List/Update/UpdateStatus), `blueprint.Repository` (Get/List/Update/UpdateStatus), `workload.Repository` (Get/List/CountByBlueprint/UpdateStatus), `settings.Repository` (Get/UpdateStatus). | `pkg/{bundle,blueprint,workload,settings}/k8s_repository.go` wrapping `client.Client`. | All reconcilers + the upcoming HTTP handlers — both surfaces depend on the same port, so the REST API and the controller share business logic. |
| 24 | **Authorization (SubjectAccessReview)** | Not yet present in code (`grep SubjectAccessReview` returns nothing). Will be needed by `/bundles/{ns}/{name}/approve` and `/withdraw`. | `pkg/authz.Authorizer` (`Allowed(ctx, user, verb, resource) (bool, error)`). | `pkg/authz/sar_authorizer.go` calling `authorizationv1.SubjectAccessReview`. Plus `pkg/authz/fake.go` for tests. | Every REST handler that performs a privileged action (publish.Workflow methods take a `User` and consult Authorizer); future webhooks that need user-aware decisions. |
| 25 | **Webhook validators** | One handler: `internal/webhook/blueprint_immutability.go:18` — concrete struct, no interface. | `internal/webhook.Validator` (`Validate(ctx, oldObj, newObj runtime.Object) admission.Response`) — one type per resource (`BlueprintValidator`, `BundleValidator`, etc.). | Already in `internal/webhook/`. Add a registry pattern in `internal/manager/setup.go:17` so `SetupWebhooks` iterates over a slice instead of hand-registering each path. | Manager wiring only. |

### 1D. Missing CLAUDE.md guidance

| # | Gap | Where it bit us |
|---|-----|------------------|
| 26 | No layering rule. | `pkg/blueprint/interface.go:11` exposes `*aifv1.Blueprint` in the port; nothing in CLAUDE.md says "ports must not import api/v1alpha1". |
| 27 | No criterion for when a package gets `interface.go`. | Six packages have none (`workload`, `apps`, `helm`, `git`, `publish`, `nvidia`). The doc says "interfaces in interface.go per package" — but doesn't say *every* package, *which* package, or *when*. |
| 28 | No interface-size guidance (ISP). | `bundle.Manager` will grow to 6 methods (per spec §6.2:1260-1267). No rule says "split when >4". |
| 29 | No naming guidance — "Manager" is everywhere. | All nine `pkg/*` types are called Manager / Engine / Workflow / Catalog / Discovery / Deployer with no rule of thumb. |
| 30 | No statement of where invariants live (CEL vs `validateSpec` vs webhook). | `pkg/bundle/manager.go:55-82` re-implements the DNS-1123 + UseCase-enum invariants that `api/v1alpha1/bundle_types.go:38,42` already enforces via kubebuilder markers. Duplication today; drift tomorrow. |
| 31 | No test-double convention. | `make install-tools` installs `mockgen` (CLAUDE.md:75) but no `pkg/.../mock_*.go` exists; tests use ad-hoc fakes. |
| 32 | No "external integration" recipe. | All four upcoming external integrations (App Collection, NIM index, Fleet, SUSE Registry) have nothing to copy from. |

---

## 2. Prioritized refactor backlog

### Theme A — OOP cleanup

- **A1 (S)** Add `pkg/conditions.Set(conds *[]metav1.Condition, c metav1.Condition)` and replace `setCondition` in `bundle_controller.go:152`, `blueprint_controller.go:184`, `workload_controller.go:174`, `settings_controller.go:257`. Removes finding #6 + Bundle's wrong `LastTransitionTime` rewrite.
- **A2 (S)** Drop the dead `Manager` field and `applySettingsToEngines` cache from `SettingsReconciler` (settings_controller.go:38-44, :225-235); replace with a `Resolved` value object passed forward.
- **A3 (S)** Convert `pkg/blueprint.Manager.ValidateSpec` to a pure free function `Validate(Blueprint) error` (manager.go:24); the receiver state is unused.
- **A4 (M)** Rename "Manager" per package: `pkg/bundle.Manager` → split into `Repository` + `Service` + `ReviewQueue`; `pkg/blueprint.Manager` → `Validator` + delete `ComputeDeploymentCount` (move to `pkg/workload.Repository.CountByBlueprint`); `pkg/publish.Workflow` keep as-is (it really is a workflow); `pkg/helm.Engine` keep; `pkg/git.FleetEngine` keep. Update `cmd/operator/main.go:82-85`.
- **A5 (M)** Replace `BlueprintReconciler` cluster-wide `r.List(&workloadList)` (blueprint_controller.go:120) with `workloadRepo.CountByBlueprint(ctx, name, version)` using a label selector. Add `blueprint-name=` and `blueprint-version=` labels in the workload controller when source.kind=Blueprint. Performance + SOLID win.

### Theme B — Domain decoupling

- **B1 (S)** Move `pkg/blueprint`'s domain type out of `aifv1`: add `pkg/blueprint/types.go` (`Blueprint`, `Source`, `VendorChartRef`) + `pkg/blueprint/conversions.go` (`FromCR`/`ToCR`). Update `interface.go:11` to take `Blueprint` not `*aifv1.Blueprint`.
- **B2 (S)** Lift `pkg/bundle/types.go:14-29` `aifv1.SubmissionStatus` / `aifv1.ReviewStatus` / `aifv1.ComponentRef` / `aifv1.PublishedVersionRef` into pure-Go domain structs in the same file; expand `conversions.go`.
- **B3 (M)** Author `pkg/workload/types.go` (`Workload`, `Source`, `Phase` enum) + `pkg/workload/interface.go` (`Repository`, `StateMachine`, `Deployer`) before P5-1 starts. Lock the contract early.
- **B4 (M)** Author `pkg/source_collection/{types.go, interface.go, api_client.go, oci_fallback.go}` per spec §6.2:1410-1440. Empty `.gitkeep` is hiding a real story.
- **B5 (S)** Author `pkg/nvidia/types.go` (`NIMEntry`, `GenerateRequest`) + `pkg/nvidia/interface.go` (split `Discovery` and `Deployer`). Discovery and deployment have nothing in common — separate packages or, at minimum, separate interface files.

### Theme C — Port extraction

- **C1 (M)** `pkg/helm/interface.go` per spec §6.2:1284-1334. Split into `Engine` (install/uninstall/status) + `Releaser` (rollback/history) for ISP. Keep `UpdateSettings` on both.
- **C2 (M)** `pkg/git/interface.go` per spec §6.2:1339-1369.
- **C3 (S)** `pkg/publish/interface.go` per spec §6.2:1273-1282 — define now even with stub bodies, so REST handlers (P1-10/P3-2..P3-6) compile against the interface.
- **C4 (S)** Per-CRD `Repository` interfaces in `pkg/{bundle,blueprint,workload,settings}/repository.go`. Methods: `Get`, `List`, `Update`, `UpdateStatus` (≤4). Backed by `k8s_repository.go` wrapping `client.Client`.
- **C5 (M)** `pkg/authz/{interface.go,sar_authorizer.go,fake.go}`. Pre-empts the impersonation/SAR sprawl that will otherwise land inline in HTTP handlers.
- **C6 (S)** `internal/webhook/registry.go` — slice of `Validator` registrations consumed by `internal/manager/setup.go:17`. Eliminates per-webhook wiring boilerplate.

### Theme D — Doc updates

- **D1 (S)** Apply the unified diff in §3 to `CLAUDE.md`. Touches "Code Conventions → Go" and adds "How to Add a New External Integration".
- **D2 (S)** Add a short architecture-decision note in `docs/spec/ARCHITECTURE.md` cross-referencing CLAUDE.md's new layering rule (one sentence, one link).

### Theme E — Larger / multi-story

- **E1 (L)** Pull all `client.Client` usage out of reconcilers and into `Repository` adapters (depends on C4). Each reconciler ends up depending on 2-3 ports + a `record.EventRecorder` interface. Enables true unit tests without `envtest`.
- **E2 (L)** Decide and document where invariants live: CRD-level (kubebuilder marker → CEL) for shape; webhook for cross-field; `pkg/<x>.Validator` for business rules. Then deduplicate `pkg/bundle/manager.go:55-82` against `api/v1alpha1/bundle_types.go:38,42`.

---

## 3. Diff proposal for CLAUDE.md

```diff
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -94,18 +94,42 @@
 ## Code Conventions
 
 ### Go
 
+- **Layering rule (hexagonal):** Imports flow ONE direction:
+  `cmd/` → `internal/{controller,api,manager,webhook}/` → `pkg/<domain>/` → `pkg/conditions/` → stdlib.
+  `pkg/*` packages MUST NOT import `internal/*`.
+  `pkg/{helm,git,nvidia,source_collection,authz}` MUST NOT import `api/v1alpha1` — they speak in their own domain types. Translation lives in the controller.
+  `pkg/{bundle,blueprint,workload,settings}` MAY import `api/v1alpha1` ONLY inside `conversions.go`. `interface.go` and `types.go` MUST be free of `aifv1` references so ports remain framework-agnostic.
+- **When to add `interface.go`:** A package gets one when (a) it has at least one I/O dependency (K8s, HTTP, Helm SDK, git), OR (b) it is consumed by a controller/handler that needs a test double. Pure-data packages (`pkg/conditions`) do not need one.
+- **Per-package file layout:** `interface.go` (ports, ≤4 methods each), `types.go` (domain structs, no `aifv1`), `<adapter>.go` (one concrete impl per adapter), `conversions.go` (CR↔domain, only file allowed to import `aifv1`), `<adapter>_test.go`.
+- **Interface size (ISP):** Target ≤4 methods per interface. If you reach 5, split by role (Reader/Writer, Discoverer/Deployer, Engine/Releaser). One interface, one reason to mock.
+- **Naming — avoid `Manager`:** "Manager" is banned as a top-level type name. Pick the role:
+  `Repository` (CRUD over a store), `Service` (orchestrates Repository + Validator), `Validator` (pure spec checks), `StateMachine` (phase transitions), `Resolver` (dereferences a ref), `Engine` (wraps an external SDK like Helm/git), `Provider` (reads from an external API like SUSE App Collection), `UseCase`/`Workflow` (multi-step business operation like publish-by-approval).
+- **Domain types:** Domain types (the structs in `pkg/<x>/types.go`) carry behaviour. Free functions over domain structs are preferred to methods on a `Manager` struct that only holds a logger. If a struct's only field is `*slog.Logger` and the methods don't access state, those are functions, not methods.
+- **Where invariants live:**
+  - Shape (required, length, enum, regex) — `+kubebuilder:validation:*` on the CRD type. Enforced by the API server.
+  - Cross-field (discriminated unions, "exactly one of") — admission webhook in `internal/webhook/`.
+  - Business rules (e.g. "you may not publish if a Blueprint with this name+version already exists") — `pkg/<x>.Validator` called by the controller and REST handlers.
+  Do NOT duplicate kubebuilder constraints in Go validators — the API server already rejects them. Only encode what kubebuilder cannot express.
+- **Test doubles:** Hand-written fakes go in `pkg/<x>/fake_<role>.go` (e.g. `pkg/bundle/fake_repository.go`) and implement the port. Use `mockgen` only when a stable, frequently-rebuilt mock is needed (rare); generated mocks live in `pkg/<x>/mock/`. Tests in controllers MUST use the fake/mock, never `client.Client` against a real apiserver — for that, add an envtest case under `test/integration/`.
 - **Logging:** Use `log/slog` exclusively. JSON in production (`--log-format=json`), text in development. Include `request_id`, `component` in every entry. Never log credentials or PII.
 - **Errors:** Wrap with context using `fmt.Errorf("operation: %w", err)`. Use `errors.Is` and `errors.As` for comparison. No `panic` except in `init()`.
+  - Define sentinel errors per package (`pkg/<x>/errors.go`) when callers need to distinguish failure modes (e.g. `ErrSecretNotFound`, `ErrBundleNotFound`). Never let consumers `strings.Contains` on error messages.
 - **No print statements:** Never use `fmt.Println`, `log.Println`. Use `slog` or return errors.
-- **Interfaces:** Define in `interface.go` per package. Concrete implementations in separate files. Tests use fakes or mocks, never real K8s clients.
+- **Interfaces:** Define in `interface.go` per package per the layering rule above. Concrete implementations in separate files. Tests use fakes or mocks, never real K8s clients.
 - **Context:** Every I/O function accepts `context.Context` as first argument. Respect cancellation.
 - **Condition constants:** Import condition Type/Reason from `pkg/conditions/types.go`. Never use raw strings in controllers. CI enforces this with grep guards.
+- **Condition setting:** Use `pkg/conditions.Set(&status.Conditions, cond)` (built on `meta.SetStatusCondition`). Do not hand-roll condition merging in controllers; `meta.SetStatusCondition` correctly preserves `LastTransitionTime` when status hasn't changed.
 - **Phase enums:** Typed Go string constants (e.g., `type BundlePhase string; const BundlePhaseDraft BundlePhase = "Draft"`).
 - **HTTP handlers:** Never surface raw internal errors. Use `writeError(w, code, err)` helper to translate to structured JSON response.
 - **Import order:** Standard library → third-party → internal packages. Group with blank lines.
 
 **Forbidden patterns:**
 - `cluster-admin` in RBAC
 - Wildcard verbs (`"*"`) or resources in RBAC
 - Direct NVIDIA NGC calls (`nvcr.io`, `helm.ngc.nvidia.com`, `integrate.api.nvidia.com`)
 - Hardcoded registry hostnames (use `Settings.spec.registryEndpoints`)
 - Raw condition strings in controllers (use constants from `pkg/conditions/types.go`)
+- Top-level type named `Manager` in `pkg/*` (use a role-revealing name; see naming rule above)
+- `pkg/<x>/interface.go` importing `api/v1alpha1` (move types to `pkg/<x>/types.go`)
+- `pkg/{helm,git,nvidia,source_collection,authz}` importing `api/v1alpha1` at all
+- `strings.Contains(err.Error(), ...)` for error classification (use sentinel errors + `errors.Is`)
@@ -221,6 +245,30 @@
 - [ ] UI button disabled when action invalid for current phase
 
+### A New External Integration (HTTP API, OCI registry, Git, Helm SDK, etc.)
+
+1. Create `pkg/<integration>/types.go` — pure-Go value objects. Do NOT import `api/v1alpha1`.
+2. Create `pkg/<integration>/interface.go` — port with ≤4 methods. Name it by role (`Provider`, `Engine`, `Client`).
+3. Create `pkg/<integration>/<adapter>.go` — concrete implementation (one adapter = one external system + protocol). Examples: `pkg/source_collection/api_client.go` (HTTP), `pkg/source_collection/oci_fallback.go` (registry walk).
+4. Create `pkg/<integration>/fake_<role>.go` — in-memory fake implementing the port for unit tests.
+5. Create `pkg/<integration>/errors.go` — sentinel errors (`ErrUnreachable`, `ErrNotFound`, `ErrUnauthorized`).
+6. Wire credentials: integration receives a `Settings(s EngineSettings)` push from `SettingsReconciler.applySettingsToEngines` — never reads K8s Secrets directly. See `ARCHITECTURE.md §6.2 EngineSettings` and §8.2.1.
+7. Wire instance in `cmd/operator/main.go` and inject into the consuming controller(s) via the port type, never the concrete struct.
+8. Forbidden: importing `api/v1alpha1`, calling `client.Client` directly, reading Secrets directly, hardcoding hostnames (read from `EngineSettings.RegistryEndpoints`).
+
+**Checklist:**
+- [ ] `interface.go` is free of `api/v1alpha1` imports
+- [ ] Port has ≤4 methods (split if larger)
+- [ ] Adapter file is named for the protocol/source (`api_client.go`, `oci_fallback.go`, `sdk_engine.go`)
+- [ ] `fake_<role>.go` exists and is used by at least one consumer's test
+- [ ] Sentinel errors defined; no `strings.Contains` on error messages downstream
+- [ ] Credentials arrive via `UpdateSettings`, not via direct Secret reads
+- [ ] Hostnames sourced from `EngineSettings.RegistryEndpoints`, never literals
+- [ ] Consuming controller depends on the interface, not the struct
+
 ---
 
 ## Where to Look
```

---

## 4. Risks & non-goals

- **DO NOT touch `api/v1alpha1/*_types.go` kubebuilder markers.** They are the source of truth for CRD generation; rewriting them in domain-driven style would break `make manifests`. The decoupling work is on the *consumer* side (`pkg/*`), not the CRD side.
- **DO NOT replace `controller-runtime` patterns.** Reconcilers should keep using `client.Client`, `controllerutil.AddFinalizer`, `meta.SetStatusCondition`, `record.EventRecorder` — those are the framework. The hex refactor wraps them in ports, it doesn't reinvent them.
- **DO NOT split `pkg/bundle` further until P3-1 actually needs it.** Today's `Manager` (cache + Get/Upsert) is fine for P1-1; the `Repository`/`Service` split should land WITH the P3-1 endpoint expansion, not before.
- **DO NOT introduce a DI framework (wire, fx, dig).** `cmd/operator/main.go` constructor wiring at lines 76-85 is correct and explicit; keep it that way. The "log managers exist" hack at line 88 disappears once each manager is consumed by a reconciler/handler.
- **DO NOT pre-build the `Authorizer` adapter (item 24/C5) until the first REST handler that needs it lands (P1-10/P3-2).** Define the interface now (so handlers compile), implement when first consumer arrives.
- **`pkg/conditions` stays as-is in shape.** Adding a `Set` helper is additive and safe; deleting/renaming constants would break the controllers.
- The proposed CLAUDE.md edits are **append-friendly** per the living-doc rules (P0-0..P9-5 append-only window). Existing bullets in "Code Conventions → Go" are not deleted, only augmented; the new "How to Add a New External Integration" subsection is purely additive. P9-5 can later prune.

---

## Open questions (could not resolve from static reading)

1. Will the `bundle` in-memory cache (`pkg/bundle/manager.go:14-18`) survive past P1-1, or is it superseded by `bundle.Repository` reading from the apiserver? If it survives, what's the invalidation strategy?
2. Is there an intended split between "Validator" (called by webhook) and "Validator" (called by controller)? Current `pkg/bundle/manager.go:55` validates business rules the kubebuilder markers already cover — was that intentional defence-in-depth, or oversight?
3. Should `pkg/publish` own a `bundle.Repository` and a `blueprint.Repository`, or operate on raw CRs through `client.Client`? ARCHITECTURE.md §6.2:1276 specifies the verbs but not the dependencies.
