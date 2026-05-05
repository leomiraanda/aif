# Dev-Environment & OOP Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a working local dev loop (one-command k3d cluster, sample CRs, runnable operator) and codify the hexagonal/OOP conventions so all subsequent stories follow them consistently.

**Architecture:** Two independent workstreams. Workstream A (dev-environment) is purely additive: new Make targets, an examples directory, a k3d config — no change to Go code or charts. Workstream B (OOP foundations) extends CLAUDE.md with concrete conventions and applies them to the one package (`pkg/bundle`) that already follows the pattern, making it the authoritative example, then propagates to one new package (`pkg/apps`) as a second worked example. Future packages adopt the pattern story-by-story.

**Tech Stack:** Go 1.26 (via GOTOOLCHAIN=auto), k3d, Make, controller-runtime, mockgen.

**Out of scope (explicitly):** Changing existing controllers' behavior. Refactoring `pkg/blueprint`, `pkg/workload`, `pkg/helm`, `pkg/git`, `pkg/publish`, `pkg/nvidia` in this plan — those are tracked as follow-up tasks once the code-review report (Task #2) lands and the conventions are agreed.

---

## Workstream A — Local Dev Environment

### Task A1: Create `hack/k3d-config.yaml`

**Files:**
- Create: `hack/k3d-config.yaml`

- [ ] **Step 1: Write the k3d config**

```yaml
# hack/k3d-config.yaml — minimal single-node k3d cluster for AIF dev
kind: Cluster
apiVersion: k3d.x-k8s.io/v1alpha4
name: aif-dev
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      - { containerPort: 80,  hostPort: 8080, protocol: TCP }
      - { containerPort: 443, hostPort: 8443, protocol: TCP }
```

- [ ] **Step 2: Verify it parses**

Run: `k3d create cluster --config hack/k3d-config.yaml --dry-run 2>&1 || k3d --version`
Expected: k3d binary either dry-runs OK or prints its version (we accept either; older k3ds lack --dry-run). Either confirms the YAML is at least well-formed by `k3d`.

- [ ] **Step 3: Commit**

```bash
git add hack/k3d-config.yaml
git commit -m "add minimal k3d config for local dev cluster"
```

---

### Task A2: Add `make dev-cluster` and `make dev-cluster-down` Targets

**Files:**
- Modify: `Makefile` (append targets)

- [ ] **Step 1: Append the targets**

Add to `.PHONY` line at top of `Makefile`: `dev-cluster dev-cluster-down dev-install`

Append to the end of `Makefile`:

```makefile
dev-cluster:
	@echo "Creating k3d cluster 'aif-dev'..."
	k3d create cluster --config hack/k3d-config.yaml
	@echo "Cluster ready. Use 'make dev-install' to install CRDs."

dev-cluster-down:
	@echo "Deleting k3d cluster 'aif-dev'..."
	k3d delete cluster --name aif-dev

dev-install:
	@echo "Installing CRDs..."
	kubectl apply -f charts/aif-operator/crds/
	@echo "CRDs installed. Use 'make run' to start the operator out-of-cluster."
```

- [ ] **Step 2: Verify targets are reachable**

Run: `make -n dev-cluster dev-cluster-down dev-install`
Expected: Three echo + command lines printed without error (dry run only).

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "add dev-cluster, dev-cluster-down, dev-install make targets"
```

---

### Task A3: Create `examples/` Directory with Sample CRs

**Files:**
- Create: `examples/bundle-smoke.yaml`
- Create: `examples/blueprint-smoke.yaml`
- Create: `examples/workload-smoke.yaml`
- Create: `examples/settings-smoke.yaml`
- Create: `examples/README.md`

- [ ] **Step 1: Write the Bundle example**

```yaml
# examples/bundle-smoke.yaml — smallest valid Bundle the controller will accept
apiVersion: ai.suse.com/v1alpha1
kind: Bundle
metadata:
  namespace: default
  name: smoke
spec:
  title: Smoke Bundle
  targetBlueprint: smoke-blueprint
  useCase: other
  description: Minimal Bundle for verifying the controller reconciles cleanly.
  components:
    - name: dummy
      repo: oci://example.com/charts
      chart: demo
      version: 0.1.0
```

- [ ] **Step 2: Write the Blueprint example**

```yaml
# examples/blueprint-smoke.yaml — smallest valid Blueprint
apiVersion: ai.suse.com/v1alpha1
kind: Blueprint
metadata:
  name: smoke-blueprint.0.1.0
spec:
  blueprintName: smoke-blueprint
  version: 0.1.0
  source:
    type: PublishedFromBundle
    publishedFrom:
      bundleNamespace: default
      bundleName: smoke
      bundleGeneration: 1
  components:
    - name: dummy
      repo: oci://example.com/charts
      chart: demo
      version: 0.1.0
  publishedAt: "2026-05-05T00:00:00Z"
  publishedBy: smoke-test
```

- [ ] **Step 3: Write the Workload example**

```yaml
# examples/workload-smoke.yaml — smallest valid Workload (BundleTest provenance)
apiVersion: ai.suse.com/v1alpha1
kind: Workload
metadata:
  namespace: default
  name: smoke
spec:
  source:
    kind: BundleTest
    bundleRef:
      namespace: default
      name: smoke
  targetCluster: local
  components:
    - name: dummy
      repo: oci://example.com/charts
      chart: demo
      version: 0.1.0
```

- [ ] **Step 4: Write the Settings example**

```yaml
# examples/settings-smoke.yaml — placeholder Settings; no real credentials
apiVersion: ai.suse.com/v1alpha1
kind: Settings
metadata:
  namespace: aif
  name: aif
spec:
  registryEndpoints:
    suseRegistry: registry.suse.com
    suseAppCollection: dp.apps.rancher.io
```

- [ ] **Step 5: Write `examples/README.md`**

```markdown
# Examples

Minimal sample CRs to verify the AIF operator reconciles cleanly in a local
dev cluster. None of these will actually deploy anything (the chart references
are placeholders).

## Quick start

```bash
make dev-cluster        # k3d create cluster
make dev-install        # kubectl apply -f charts/aif-operator/crds/
make run &              # start operator out-of-cluster
kubectl apply -f examples/bundle-smoke.yaml
kubectl get bundles -A
kubectl describe bundle -n default smoke
```

Expected: the Bundle reaches `Phase: Draft` with `conditions[0].type: Ready`,
`conditions[0].status: "True"`. If validation fails, check the operator log
and the bundle's `status.conditions` for the failure reason.
```

- [ ] **Step 6: Verify all files parse as valid YAML**

Run: `for f in examples/*.yaml; do python3 -c "import yaml,sys; yaml.safe_load(open('$f'))" && echo "OK: $f"; done`
Expected: `OK: examples/bundle-smoke.yaml` (and similar) for each file.

- [ ] **Step 7: Commit**

```bash
git add examples/
git commit -m "add examples/ with sample CRs and quickstart README"
```

---

### Task A4: Add `make examples` Target

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Append target**

Add `examples` to the `.PHONY` line. Append:

```makefile
examples:
	@echo "Applying example CRs..."
	kubectl apply -f examples/bundle-smoke.yaml
	kubectl apply -f examples/blueprint-smoke.yaml
	kubectl apply -f examples/workload-smoke.yaml
	@echo "Done. 'kubectl get bundles,blueprints,workloads -A' to see them."
```

- [ ] **Step 2: Verify**

Run: `make -n examples`
Expected: prints the kubectl apply commands.

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "add make examples target for smoke-test CRs"
```

---

### Task A5: Document the Dev Loop in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (append a new subsection under "Build & Test Commands")

- [ ] **Step 1: Append after the existing "Build & Test Commands" section**

```markdown
### Local Dev Loop

```bash
# One-time setup
make install-tools               # Go tools (controller-gen, golangci-lint, mockgen, ginkgo)
make dev-cluster                 # k3d cluster 'aif-dev' from hack/k3d-config.yaml
make dev-install                 # kubectl apply -f charts/aif-operator/crds/

# Iterate
make run                         # operator out-of-cluster (uses your kubeconfig)
make examples                    # apply minimal sample CRs in another shell
kubectl get bundles,blueprints,workloads -A

# Teardown
make dev-cluster-down
```

Sample CRs live in `examples/`. Each is the minimal valid CR for its CRD.
```

- [ ] **Step 2: Verify CLAUDE.md still under 400 lines (per P0-0 acceptance criterion)**

Run: `wc -l CLAUDE.md`
Expected: a number ≤ 400. If above, raise as a concern — P9-5 is the only story allowed to delete content; otherwise keep additions tight.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "document local dev loop in CLAUDE.md"
```

---

## Workstream B — OOP Foundations

> **Note:** Detailed code-refactor steps for `pkg/blueprint`, `pkg/workload`, etc. are deferred to follow-up plans pending the OOP code-review report (Task #2). This workstream lands the *conventions* and applies them to one new package (`pkg/apps`) as a second worked example beyond `pkg/bundle`.

### Task B1: Add OOP Conventions Section to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (append to the Go subsection of "Code Conventions")

- [ ] **Step 1: Append after the existing "Code Conventions → Go" bullet list, before "Forbidden patterns"**

```markdown
**Layering & ports/adapters:**

- **Dependency direction.** Dependencies point inward: `internal/controller/*` and `internal/api/*` depend on `pkg/*` interfaces; `pkg/*` does not depend on `internal/*`. `pkg/*` may import `api/v1alpha1` types ONLY in `conversions.go` files. Domain logic does not import `metav1.*` or kubebuilder types.
- **When to add `interface.go`.** Define a port whenever the package crosses a boundary: I/O (network, filesystem, K8s API), pluggable strategy (Helm vs Fleet), or test seam. Pure value/computation packages don't need one.
- **Interface size (ISP).** Prefer small interfaces (1–4 methods). If a port has >5 methods, split by use case (Reader/Writer, Discoverer/Deployer, etc.).
- **Naming.** Avoid `Manager` — it has no responsibility. Use:
  - `Repository` — state CRUD (often backed by K8s client or in-memory cache)
  - `Service` / `UseCase` — orchestration of multiple ports
  - `Engine` / `Provider` / `Adapter` — external integration (Helm, Git, registry)
  - `Validator`, `Resolver`, `StateMachine` — single-responsibility domain helpers
- **Domain types.** Each `pkg/{x}/` with non-trivial behavior owns a `types.go` of pure-Go domain types (no kubebuilder annotations, no `metav1.*`). K8s types from `api/v1alpha1` cross the boundary only through `conversions.go`. The reference example is `pkg/bundle/{interface,manager,types,conversions}.go`.
- **Where invariants live.** Keep them at the right layer:
  | Invariant | Location |
  |---|---|
  | Field shape, regex, length, enum | `+kubebuilder:validation:` annotation in `api/v1alpha1` (CEL) |
  | Cross-field business rule | `validate*` method on the domain type or its repository |
  | Cross-resource immutability or RBAC | Admission webhook |
- **Test doubles.** Generate mocks via `mockgen` into `pkg/{x}/mocks/`. Hand-written fakes go in `pkg/{x}/fake/`. Controllers test against fakes (simpler); HTTP handlers test against mockgen-generated mocks (assertions on calls).
```

- [ ] **Step 2: Verify CLAUDE.md still skimmable (target ≤ 400 lines)**

Run: `wc -l CLAUDE.md`
Expected: ≤ 400. If approaching the limit, flag for P9-5.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "add layering, ports/adapters, and OOP naming conventions to CLAUDE.md"
```

---

### Task B2: Add "How to Add a New External Integration" Subsection

**Files:**
- Modify: `CLAUDE.md` (new subsection under "How to Add...")

- [ ] **Step 1: Append after the last "How to Add..." subsection**

```markdown
### A New External Integration (registry, GitOps, vendor API)

External integrations are the canonical place for ports/adapters. Use this
recipe whenever you wrap a network service (SUSE Registry, SUSE App Collection,
NVIDIA NIM index, Helm OCI, Fleet Git, an LDAP/OIDC provider, etc.).

1. Define the port in `pkg/{x}/interface.go` (small — 1 to 4 methods)
2. Write the concrete adapter in `pkg/{x}/{vendor}.go` (e.g., `pkg/apps/suse_registry.go`)
3. Add a domain types file `pkg/{x}/types.go` if the response shape differs from the K8s CRD shape
4. Wire the adapter in `internal/manager/setup.go` (constructor injection, no globals)
5. Generate a mock with `mockgen` into `pkg/{x}/mocks/` and a hand-written fake in `pkg/{x}/fake/`
6. Controllers and HTTP handlers depend ONLY on the port interface — never on the vendor SDK directly

**Checklist:**
- [ ] Port lives in `pkg/{x}/interface.go`, ≤4 methods
- [ ] Vendor SDK imported only in `pkg/{x}/{vendor}.go`
- [ ] No controller or handler imports the vendor SDK
- [ ] Mock generated, fake hand-written, both committed
- [ ] Endpoint configurable via `Settings.spec.registryEndpoints` (per `ARCHITECTURE.md §4.5`)
- [ ] No hardcoded hostname (CI grep would catch this)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "add 'How to Add a New External Integration' to CLAUDE.md"
```

---

### Task B3: Apply the Pattern to `pkg/apps` as a Second Worked Example

> **Note:** This task ports the convention to a second package so future contributors have two reference points (`pkg/bundle` and `pkg/apps`). It does not change behavior — `pkg/apps/catalog.go` is currently a stub that just exists.

**Files:**
- Modify: `pkg/apps/catalog.go` (existing stub)
- Create: `pkg/apps/interface.go`
- Create: `pkg/apps/types.go`
- Create: `pkg/apps/fake/fake.go`

- [ ] **Step 1: Read the current state**

Run: `cat /home/thbertoldi/suse/aif/pkg/apps/catalog.go`
Note what's there before changing anything. If it's not a stub (someone landed P2-1 in the meantime), STOP and re-check this plan against the new state.

- [ ] **Step 2: Create `pkg/apps/types.go` — pure-Go domain types**

```go
package apps

import "time"

// App is the domain representation of a catalog entry. It is intentionally
// independent of any registry's wire format (SUSE Registry, SUSE Application
// Collection, NVIDIA NIM index) so that adapters can normalize into it.
type App struct {
	// Identity
	Name      string
	Repo      string
	Chart     string
	Version   string

	// Discovery
	Source      Source // SUSERegistry | SUSEAppCollection
	Category    string
	Tags        []string
	UpdatedAt   time.Time

	// Display
	DisplayName string
	Description string
	IconURL     string

	// Classification
	IsReferenceBlueprint bool // wrapped as Blueprint per ARCHITECTURE.md §13.1
}

// Source identifies the upstream that produced an App entry.
type Source string

const (
	SourceSUSERegistry      Source = "SUSERegistry"
	SourceSUSEAppCollection Source = "SUSEAppCollection"
)
```

- [ ] **Step 3: Create `pkg/apps/interface.go` — the port**

```go
package apps

import "context"

// Provider returns the catalog of Apps available from a single upstream.
// Adapters: SUSERegistryProvider, SUSEAppCollectionProvider.
// Composition: aggregate multiple Providers in internal/manager/setup.go.
type Provider interface {
	// List returns all Apps from this Provider's upstream. Implementations
	// are expected to be cacheable; callers do not assume freshness.
	List(ctx context.Context) ([]App, error)

	// Source identifies which upstream this Provider speaks to. Used by
	// aggregators to attribute results and by the UI to show source badges.
	Source() Source
}
```

- [ ] **Step 4: Replace `pkg/apps/catalog.go` with a thin aggregator**

```go
package apps

import (
	"context"
	"log/slog"
)

// Catalog aggregates one or more Providers into a unified App list. It is the
// type that HTTP handlers and (eventually) controllers depend on.
type Catalog struct {
	logger    *slog.Logger
	providers []Provider
}

// NewCatalog wires a set of Providers. Order is the order in which results are
// concatenated; deduplication (by Name+Version) is the caller's responsibility
// in this revision and will land with P2-3.
func NewCatalog(logger *slog.Logger, providers ...Provider) *Catalog {
	return &Catalog{logger: logger, providers: providers}
}

// List concatenates results from every Provider. Errors from any Provider are
// logged and skipped; partial results are returned.
func (c *Catalog) List(ctx context.Context) ([]App, error) {
	var out []App
	for _, p := range c.providers {
		apps, err := p.List(ctx)
		if err != nil {
			c.logger.Warn("provider failed", "source", p.Source(), "err", err)
			continue
		}
		out = append(out, apps...)
	}
	return out, nil
}
```

- [ ] **Step 5: Create `pkg/apps/fake/fake.go` — hand-written fake for tests**

```go
// Package fake provides hand-written test doubles for the apps package.
package fake

import (
	"context"

	"github.com/SUSE/aif/pkg/apps"
)

// Provider is a hand-written fake implementing apps.Provider.
// Set Apps and Err to control its behavior; concurrency-safe to read/write
// from a single test goroutine only.
type Provider struct {
	Apps   []apps.App
	Err    error
	Src    apps.Source
	Calls  int
}

func (p *Provider) List(_ context.Context) ([]apps.App, error) {
	p.Calls++
	if p.Err != nil {
		return nil, p.Err
	}
	return p.Apps, nil
}

func (p *Provider) Source() apps.Source {
	if p.Src == "" {
		return apps.SourceSUSERegistry
	}
	return p.Src
}
```

- [ ] **Step 6: Verify the package builds**

Run: `cd /home/thbertoldi/suse/aif && go build ./pkg/apps/... ./pkg/apps/fake/...`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add pkg/apps/
git commit -m "establish apps package as a ports/adapters reference (Provider port + Catalog aggregator + fake)"
```

---

## Self-Review

**Spec coverage:**
- Workstream A delivers the dev-loop the user asked for (k3d cluster, examples, run, teardown). ✓
- Workstream B lands the missing CLAUDE.md guidance and applies it to one new package. The follow-up packages will be planned once the code-review report is in. ✓

**Placeholder scan:** No "TBD"/"implement later" in steps. All code blocks are complete. The only deferral is explicit and bounded (Workstream B does not refactor existing packages — that's a separate plan).

**Type consistency:**
- `apps.App`, `apps.Provider`, `apps.Source`, `apps.Catalog`, `fake.Provider` are consistent across Tasks B3 steps.
- Make targets `dev-cluster`, `dev-cluster-down`, `dev-install`, `examples` are referenced consistently between Tasks A2, A4, A5.

**Risks:**
- Task A1's `k3d --dry-run` step is best-effort (older k3ds lack `--dry-run`). The fallback of printing version isn't a real validation; consider replacing with `yamllint` if available.
- Task B3 Step 4 changes `pkg/apps/catalog.go` from a stub to a thin aggregator. If P2-1 has already landed by the time this plan executes, STOP and re-plan — this task assumes the stub is still there.
- CLAUDE.md is supposed to stay ≤400 lines. The two B-track edits add ~50 lines. Today CLAUDE.md is ~270 lines — fits comfortably, but worth a re-check at end of B2.
