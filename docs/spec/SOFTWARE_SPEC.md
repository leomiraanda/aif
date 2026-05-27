# SUSE AI Factory — Software Specification

> **Audience:** Product managers, designers, customer success, and customer-facing teams.
> **Scope:** What users see, feel, and can do. No implementation or infrastructure details.
> **Version:** v1.2 (conceptual model: App / Blueprint / Workload —  matches the suse-ai-lifecycle-manager reference codebase)

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [User Personas](#2-user-personas)
3. [Platform Navigation](#3-platform-navigation)
4. [Overview Dashboard](#4-overview-dashboard)
5. [Apps — AI Catalog](#5-apps--ai-catalog)
6. [Blueprints](#6-blueprints)
7. [Workloads](#7-workloads)
8. [Settings](#8-settings)
9. [Install, Deploy, and Manage Flows](#9-install-deploy-and-manage-flows)
10. [Notifications and Feedback](#10-notifications-and-feedback)
11. [Out of Scope for v1](#11-out-of-scope-for-v1)
12. [Glossary](#12-glossary)
13. [Cross-Reference Appendix](#13-cross-reference-appendix)

---

## 1. Product Vision

**SUSE AI Factory** is the AI platform management layer built into Rancher. It gives platform engineers, AI/ML practitioners, and operations teams a single place to discover AI applications, assemble them into reusable blueprints, and deploy and monitor AI workloads on any Rancher-managed Kubernetes cluster — all without leaving the familiar Rancher Dashboard.

### Conceptual Model

SUSE AI Factory uses three nouns, each with a distinct role:

| Noun | What it is | Mutability | Scope |
|------|------------|------------|-------|
| **App** | A building-block AI application packaged as a Helm chart in a Rancher-managed repository (SUSE Application Collection, SUSE Registry, or any other ClusterRepo) | Immutable; sourced from the configured Helm repository | Catalog-wide (not a CRD; discovered from configured ClusterRepos) |
| **Blueprint** | A versioned AI stack — a named bundle of one or more Helm components with their values, defined by a user — that any team in the cluster can deploy | New versions are minted; an existing version can be deprecated or deleted, but its content is not edited in place | Cluster-scoped (CRD visible org-wide) |
| **Workload** | A running instance of an App or a Blueprint on one or more target clusters | Status-only; spec can be updated to reconfigure or upgrade | Namespaced (CRD in the workload's namespace) |

Apps and Blueprints are both deployable. A Workload's `Source` records which one it came from, so the operate experience can offer a context-appropriate action: **Manage** for an App-sourced workload, **Upgrade** for a Blueprint-sourced workload.

### Goals

- **Discover** — Browse the configured Helm repositories from a single Apps catalog (SUSE Application Collection, SUSE Registry, NVIDIA NIM charts mirrored into SUSE Registry, and any other repository the cluster admin adds).
- **Compose** — Author a Blueprint directly: combine one or more Apps with their Helm values, save it as a named, versioned, cluster-scoped resource that other teams can deploy.
- **Deploy** — Install AI workloads on downstream clusters by deploying an App directly or a Blueprint, using Helm or GitOps (Rancher Fleet) delivery.
- **Operate** — Monitor the health of every deployed AI workload, upgrade Blueprint-sourced workloads to a newer Blueprint version, reconfigure App-sourced workloads, and delete workloads with confidence.
- **Configure** — Centrally manage all platform credentials, registries, and GitOps integrations.

### What Makes It Distinct

- Zero new UIs to learn — it lives inside Rancher Dashboard as a native extension.
- Designed for environments served by SUSE Registry, SUSE Application Collection, and any other Rancher-registered Helm repository, including air-gapped deployments where those endpoints are mirrored downstream by the customer's existing OCI tooling (e.g., Harbor).
- **Air-gap as a first-class deployment scenario**: every capability — discover, compose, deploy, operate, configure — works in an air-gapped cluster. AIF reaches no external service the customer hasn't already mirrored. Settings exposes per-endpoint registry overrides and an optional image-rewrite rule list so deployed pods can pull from a customer-internal registry. Air-gap is configuration, not a separate mode.
- **Lightweight governance**: Blueprint creation, edit, and deletion are gated by Rancher's Global Administrator role (`globalRoleName: 'admin'`). Any user can deploy a Blueprint; only an admin can author or modify one.

---

## 2. User Personas

### Platform Engineer
**Responsibilities:** Manages Kubernetes clusters, configures platform integrations, authors and maintains Blueprints, governs what gets deployed. In air-gap deployments, additionally owns the customer-side mirror leg.

**How they use SUSE AI Factory:**
- Configures SUSE Registry and SUSE Application Collection credentials in Settings.
- Sets up the GitOps (Fleet) integration for production deployments.
- Authors Blueprints by combining Apps from the catalog and saving the result as a named, versioned, cluster-scoped resource.
- Edits Blueprints (creating a new version) and deprecates obsolete versions when they should no longer be promoted to new deployments.
- Monitors cluster-level workload health on the Overview dashboard.
- **Air-gap operations** (when applicable): mirrors the upstream registry content into the customer's OCI registry; configures Settings → Advanced → Registry Endpoints to point at the local registry; maintains the re-mirror cadence as new chart versions are needed.

### AI/ML Practitioner
**Responsibilities:** Experiments with AI models, deploys Apps and Blueprints for their project, manages the lifecycle of their own deployments.

**How they use SUSE AI Factory:**
- Browses the Apps catalog to discover NVIDIA NIM models and SUSE-certified AI applications.
- Installs individual Apps directly from the catalog using the App Install wizard.
- Deploys existing Blueprints to a target cluster via the Blueprint Install wizard.
- Refreshes the catalog and Blueprint list as new content becomes available.

### Operations Engineer
**Responsibilities:** Keeps deployed AI workloads healthy, responds to incidents, drives upgrades and reconfigurations.

**How they use SUSE AI Factory:**
- Monitors the Workloads page for unhealthy deployments.
- Inspects each Workload's source (App or Blueprint version) to plan upgrades.
- Upgrades Blueprint-sourced workloads to newer Blueprint versions as they are published.
- Reconfigures App-sourced workloads via the Manage flow.
- Deletes workloads when they are no longer needed; the platform cleans up the Fleet bundle and underlying Helm release.

---

## 3. Platform Navigation

SUSE AI Factory appears as a top-level product in the Rancher Dashboard sidebar, labeled **"SUSE AI Factory"** with the SUSE AI Factory logo mark.

The product contains five navigation pages, accessible from the left sidebar within the SUSE AI Factory product context:

| Page | Purpose |
|------|---------|
| Overview | Platform health snapshot and active workloads summary |
| Apps | AI application catalog discovered from configured ClusterRepos |
| Blueprints | Gallery of user-authored, versioned AI stacks |
| Workloads | Monitor and manage deployed AI workloads |
| Settings | Platform credentials, registries, and GitOps integration |

SUSE AI Factory operates in a **hub-on-management-cluster** model: the AIF operator and all CRs live on the Rancher management cluster. There is no cluster switcher within the product — all pages are always in the context of the management cluster. Downstream cluster selection happens at deploy time inside the install wizards (see [§9 Install, Deploy, and Manage Flows](#9-install-deploy-and-manage-flows)).

SUSE AI Factory integrates fully with Rancher's native product and sidebar framework — same keyboard navigation, same breadcrumbs, same namespace filter.

---

## 4. Overview Dashboard

The Overview page is the first page users see when entering SUSE AI Factory. It provides an at-a-glance picture of platform activity.

### Summary Cards (top section)

A row of four count cards displays:

| Card | What it shows | Click target |
|------|---------------|--------------|
| Total Workloads | Count of all AIWorkload CRs | Workloads page |
| Running | Count of workloads with `status.phase == Running` | Workloads page |
| With Issues | Count of workloads with `status.phase == Degraded` or `Failed` | Workloads page |
| Active Blueprints | Count of Blueprint families with at least one non-deprecated version | Blueprints page |

Each card is clickable and navigates to the matching page.

### Recent Workloads (lower-left panel)

A compact table of the five most-recent workloads with columns: **State** (badge), **Name** (display name or workload name), **Source** (App or Blueprint chart/blueprint name). A `View all →` link navigates to the Workloads page.

Empty state: an icon + "No workloads deployed yet."

### Active Blueprints (lower-right panel)

A compact table of up to five active Blueprint families, each showing the family name and the latest version chip (e.g., `v0.1.3`). A `View all →` link navigates to the Blueprints page.

Empty state: an icon + "No blueprints defined yet."

### Quick Actions (bottom section)

Three large action cards provide shortcuts:

| Action | Destination |
|--------|-------------|
| Browse Apps | Opens the Apps page |
| Manage Blueprints | Opens the Blueprints page |
| View Workloads | Opens the Workloads page |

### Behavior

- The page fetches Workloads and Blueprints on load.
- A manual **Refresh** button is in the page header.
- Workloads are silently re-fetched every 10 seconds; the page does not show a loading spinner during the silent refresh.
- If a data fetch fails, an error banner appears at the top of the page.

---

## 5. Apps — AI Catalog

The Apps page is the discovery hub. It aggregates AI applications from every Helm repository the cluster admin has registered with Rancher — typically SUSE Application Collection, SUSE Registry (which includes the SUSE-mirrored NVIDIA NIM charts), and any additional ClusterRepos the customer adds.

### Header and Toolbar

The page header shows the title **Applications** and a toolbar with:

| Control | Description |
|---------|-------------|
| Search box | Full-text search across app name and description (instant, client-side filtering) |
| Repository filter | Dropdown of all registered Helm repositories; default is "All Repositories" |
| Installed toggle | Checkbox: when on, only Apps that have at least one running Workload anywhere are shown |
| View toggle | Two icons — Tile view (default) and List view |
| Refresh | Re-fetches the app catalog |

### Tile View (default)

Each App tile displays:
- Logo (top-left); falls back to a generic icon if the chart has no logo
- Packaging-format badge (e.g., **Helm**) — color-coded
- Title (bold, large)
- Description (truncated with ellipsis)
- External-link icon to the app's project homepage (when available)
- Documentation-link icon (when available)
- "Installed in:" cluster chips listing every cluster on which a Workload of this App is currently running (only shown when at least one instance exists)

The entire tile is clickable — clicking it opens the **App Install wizard** for that chart.

### List View

A compact table with columns: Logo, Name, Description, Clusters (chips), Actions. Each row is clickable and opens the App Install wizard.

### Empty & Error States

- **No results:** "No applications found."
- **Error:** Error banner at the top of the page with the message text.

### Installation Discovery

For each App tile/row, the page asynchronously queries every downstream cluster to detect existing Helm releases for that chart. When an installation is found, the "Installed in:" cluster chip set appears on the tile and the App becomes visible under the **Installed** toggle filter. Discovery is best-effort: clusters that fail to respond are silently skipped.

---

## 6. Blueprints

A Blueprint is a versioned AI stack — a named bundle of one or more Helm components and their values, defined by a user. Blueprints are cluster-scoped: once created, any team in the cluster can deploy them.

A Blueprint version pins its components and their chart versions. New versions are created by editing or copying an existing Blueprint. The Blueprint backing CR (`Blueprint` in `ai-platform.suse.com/v1alpha1`) is versioned per CR instance — each version is a separate object grouped under a common family name.

### Header and Toolbar

The page shows the title **Blueprints** plus a toolbar with:

| Control | Description |
|---------|-------------|
| Search box | Filters tiles by name |
| Show deprecated | Checkbox; off by default. When off, deprecated Blueprint versions are hidden from the version dropdown and tiles containing only deprecated versions are removed from the gallery. |
| Create | Primary button — opens the **Blueprint Create wizard** |
| Refresh | Re-fetches the Blueprint list |

### Blueprint Gallery

A responsive grid of tiles. Each tile represents one Blueprint family (all versions grouped by display name) and shows:

| Element | Description |
|---------|-------------|
| Title | Blueprint display name |
| Version dropdown | Lists all versions of this family in semver-sorted order; the selected version drives the rest of the tile content. Deprecated versions are hidden unless **Show deprecated** is on. |
| App count | "N apps" — the number of components in the selected version |
| Description | The selected version's description |
| Install button | Primary action; opens the **Blueprint Install wizard** for the selected version |
| Action menu (⋯) | Context menu with version-scoped actions (see below) |

### Per-Version Actions

The action menu on each tile contains:

| Action | Who can use it | What it does |
|--------|----------------|--------------|
| Copy | Any user | Opens the Blueprint Create wizard pre-populated with the selected version's components and values, with display name `Copy of <original>` and version `1.0.0` |
| Edit | Global Administrator only | Opens the Blueprint Create wizard in **edit-as-new-version** mode: pre-populated with the selected version's content, with the version field auto-bumped to the next patch (e.g., `1.0.0 → 1.0.1`). Saving creates a new Blueprint version; the original is unchanged. |
| Deprecate / Undeprecate | Global Administrator only | Toggles `spec.deprecated` on the selected version. Deprecated versions are hidden from the gallery by default. Existing Workloads on a deprecated version continue to run; the version is no longer recommended for new deploys. |
| Delete | Global Administrator only | Permanently removes the selected version's Blueprint CR. Requires confirmation; warns if any Workload currently references this version (those Workloads continue running but lose their Blueprint source linkage). |

The Global Administrator check uses Rancher's `GlobalRoleBinding` with `globalRoleName == 'admin'`. There is no separate AIF-specific publisher role.

### Confirmation Dialogs

**Delete Blueprint** — shows the display name + version, and lists all `AIWorkload` resources that reference this version (namespace/name pairs) with a warning that their Source reference will be broken. Two buttons: Cancel and Delete.

**Deprecate Blueprint** — shows the display name + version. If the version has active Workloads, lists them in a warning panel. Two buttons: Cancel and Deprecate (or Undeprecate).

### Empty & Error States

- **No blueprints:** "No blueprints found. Click Create to define your first blueprint."
- **Error:** Error banner at the top of the page.

---

## 7. Workloads

The Workloads page gives operations teams visibility into every deployed AI workload and the ability to act on them.

### Header and Toolbar

The page shows the title **Workloads** and a toolbar with:

| Control | Description |
|---------|-------------|
| Search box | Filters by workload name, display name, namespace, or source type |
| Refresh | Re-fetches the workload list |

### Workloads Table

| Column | Description |
|--------|-------------|
| State | Status badge: Running (green) / Degraded (yellow) / Failed (red) / Pending (blue, default when no phase is set yet) |
| Name | The `metadata.name` of the AIWorkload CR (the name the user typed in the wizard) |
| Namespace | The workload's Kubernetes namespace (mono-spaced chip) |
| Source | A two-line cell: a small badge — **APP** or **BLUEPRINT** — over the chart-or-blueprint name and version (e.g., `qdrant-1.16.3`, `rag-0.1.3`) |
| Deploy | Delivery strategy: **Helm** or **FleetBundle** |
| Version | The chart version (App-sourced) or Blueprint version (Blueprint-sourced) |
| Actions | Context-appropriate buttons per row (see below) |

### Per-Row Actions

Both App and Blueprint Workloads expose:

- **Delete** *(always enabled)* — Opens a confirmation modal. On confirm, removes the AIWorkload CR; the operator tears down the underlying Fleet bundle, HelmOps, and Helm release on every target cluster. The row disappears from the table.

App-sourced Workloads additionally expose:

- **Manage** *(enabled when phase is Running)* — Navigates to the **Manage** page, which opens the same wizard used to install the App, pre-populated with the running instance's current values. The user can change values or upgrade to a newer chart version and apply.

Blueprint-sourced Workloads additionally expose:

- **Upgrade** *(enabled when phase is Running)* — Opens a small modal with a version picker listing every version of the Blueprint family. The current version is suffixed `(current)` in the dropdown. The Upgrade button is disabled when the selected version matches the current one. Confirming the upgrade patches the Workload's `spec.source.blueprint.version`; the operator rolls out the new components.

### Delete Confirmation

A modal shows the display name and namespace, warns that all associated Fleet bundles, HelmOps, and Helm releases on the target clusters will be removed, and offers Cancel / Delete. The Delete button shows a spinner while the deletion is in flight.

### Empty State

"No workloads found — Deploy an App or install a Blueprint to see workloads here."

### Behavior

- Workloads are silently re-fetched every 10 seconds (no spinner during the silent refresh).
- The manual Refresh button forces an immediate refetch with the visible loading state.
- The page does not surface raw Helm release strings — phase mapping is normalized server-side.

---

## 8. Settings

The Settings page centralizes platform configuration. The page is implemented as a stack of collapsible accordion sections, each grouping a logical set of fields.

### Page Layout

| Section | Default state | Purpose |
|---------|---------------|---------|
| SUSE Application Collection | Expanded | Credentials and category selection for `dp.apps.rancher.io` |
| SUSE Registry | Collapsed | Credentials and refresh cadence for `registry.suse.com` (includes the mirrored NVIDIA NIM charts) |
| Fleet / GitOps | Collapsed | Git repository configuration for GitOps-delivered workloads |
| Advanced | Collapsed | Registry endpoint overrides, catalog discovery mode, image rewrite rules |

A persistent **Apply** button appears at the bottom-right of the page. The page header shows the title **Settings** and a brief description.

The page reads settings via `GET /api/v1/settings` on load. If the Settings CR does not yet exist, an error banner with a helpful hint to apply the bundled example CR is shown.

---

**Section 1 — SUSE Application Collection**

| Field | Description |
|-------|-------------|
| Username secret | Reference to a Kubernetes Secret + key holding the SUSE Application Collection username |
| Token secret | Reference to a Kubernetes Secret + key holding the SUSE Application Collection access token |
| Categories | Comma-separated list of catalog categories to sync (e.g., `db, ai, observability`) |

Secrets are selected via Rancher's `SecretSelector` component; the user picks an existing Secret + key rather than typing a credential value into the form.

---

**Section 2 — SUSE Registry**

| Field | Description |
|-------|-------------|
| Username secret | Reference to a Secret + key holding the SUSE Registry username |
| Token secret | Reference to a Secret + key holding the SUSE Registry access token |
| Refresh interval (minutes) | How often the chart index at `oci://registry.suse.com/ai/charts/nvidia/` is re-fetched; must be ≥ 1 |

> The platform does not include an "NVIDIA NGC" credential section. NIM charts and images reach the platform through a SUSE-managed mirror process; AIF only ever authenticates against SUSE Registry.

---

**Section 3 — Fleet / GitOps**

| Field | Description |
|-------|-------------|
| Repository URL | Git repository URL used when a workload chooses GitOps delivery |
| Branch | Git branch (default `main`) |
| Auth Type | Dropdown: None / SSH / Token / Basic |
| Credential secret | Secret reference; only shown when Auth Type ≠ None |

When Workloads are deployed with `deployStrategy: helm`, this section's values are not used — the Fleet Bundle CR carries the OCI chart reference directly. When `deployStrategy: gitops`, the operator pushes generated manifests to this repository and creates a Fleet GitRepo CR pointing at it.

---

**Section 4 — Advanced**

Fields are grouped into three sub-areas:

| Field | Description |
|-------|-------------|
| Registry Endpoints → SUSE Registry | Override the upstream default `registry.suse.com`. Used for NIM discovery and image references. |
| Registry Endpoints → SUSE Application Collection | Override `dp.apps.rancher.io`. Used for SUSE App Collection chart pulls. |
| Registry Endpoints → Application Collection API | Override `https://api.apps.rancher.io`; leave empty to disable HTTP catalog discovery |
| Catalog Discovery Mode | Dropdown: `API` (default, uses the HTTP API) / `Registry Fallback` (try API; on connection error, list OCI catalog) / `Disabled` (skip API entirely; OCI catalog only) |
| Image Rewrite → Enabled | Checkbox |
| Image Rewrite → Rules | A repeating list of `{ match, replace }` pairs. Each rule rewrites the matched prefix on every image reference at deploy time. First match wins per field. |

Air-gap deployments typically override the registry endpoints to point at the customer's internal mirror (e.g., Harbor) and add image-rewrite rules so deployed pods can pull from that mirror.

---

### Apply

The **Apply** button is the standard Rancher `AsyncButton`. It shows a spinner while saving, a success state on success, and an error state on failure. Errors are surfaced as banners above the section list. The page does not navigate away on successful save.

---

## 9. Install, Deploy, and Manage Flows

SUSE AI Factory has four distinct wizards, each with its own step sequence. They are not a single unified wizard — each entry point opens the wizard suited to its task.

### 9.1 App Install Wizard

Opened by clicking any App tile on the Apps page. Four steps:

| Step | Title | Fields |
|------|-------|--------|
| 1 | Basic Info | Instance name (Helm release name), Namespace (existing or "create new"), Chart name (read-only), Chart version (semver dropdown) |
| 2 | Target | Cluster multi-select (sourced from `management.cattle.io/cluster`); delivery strategy radio: **Helm** (default) or **GitOps** |
| 3 | Configuration | Helm values YAML editor pre-populated from the chart's defaults plus any `questions.yaml` defaults; **Reset to defaults** button |
| 4 | Review | Read-only summary; **Install** primary button |

On Install, the wizard creates an `AIWorkload` CR with `spec.source.sourceType: App` and the user's choices.

After submission, an **Install Progress Modal** is shown. It tracks per-cluster delivery progress and presents one of four terminal states: Done (all succeeded), Retry All (all failed), Retry Failed + Continue Anyway (partial success), or spinner (in progress).

### 9.2 Blueprint Install Wizard

Opened by clicking **Install** on any Blueprint tile. Three steps:

| Step | Title | Fields |
|------|-------|--------|
| 1 | Basic Info | Workload name (becomes `metadata.name`), Namespace (existing or "create new", with a `{workloadName}-system` suggestion); the selected Blueprint name + version are shown read-only above as a banner |
| 2 | Target | Cluster multi-select; delivery strategy radio (Helm / GitOps) |
| 3 | Review | Read-only summary of all components in the Blueprint version, plus the workload name, namespace, target clusters, and strategy; **Install** primary button |

Per-component value overrides are not collected in the Blueprint Install wizard — the Blueprint pins those at authoring time. To deploy with different values, the user copies the Blueprint, edits values, saves a new version, and installs that.

On Install, the wizard creates an `AIWorkload` CR with `spec.source.sourceType: Blueprint`. The Install Progress Modal follows the same shape as the App flow.

### 9.3 Blueprint Create Wizard

Opened by clicking **Create** on the Blueprints page header, **Copy** on a tile's action menu, or **Edit** on a tile's action menu (Global Administrator only). Four steps:

| Step | Title | Fields |
|------|-------|--------|
| 1 | Basic Info | Name (display name), Version (semver; auto-bumped when entered via Edit), Description (optional) |
| 2 | Apps | Multi-select picker of Apps from the catalog. Each selection becomes a component of the Blueprint. |
| 3 | Configuration | For each selected App, a Helm values YAML editor pre-populated with the chart's default values. Authors edit values that will be baked into this Blueprint version. |
| 4 | Review | Read-only summary of basic info and components; **Create** primary button |

On Create, a new Blueprint CR is written. The wizard exits to the Blueprints page where the new tile (or new version on an existing tile) appears.

Wizard mode is determined by query parameters: no params → fresh Create; `editName + fromVersion` → Edit-as-new-version (loads the chosen version, bumps the version field); `copyFrom + copyVersion` → Copy (loads the chosen version, sets display name to `Copy of <original>` and version to `1.0.0`).

### 9.4 App Manage Page

Opened by clicking **Manage** on an App-sourced Workload row in the Workloads page. Reuses the App Install wizard in `manage` mode, pre-populated with the running instance's current values, namespace, chart, and version. The user can change values, change the chart version, and apply — the operator performs a Helm upgrade against the running release.

### Step Indicator

All wizards share the same step indicator pattern: a horizontal sequence of numbered step labels at the top, with completed steps showing a checkmark, the current step highlighted, and uncompleted steps muted. Users can click backwards through completed steps to revise input.

### Wizard Persistence

The App Install wizard persists step number and form state to browser local storage on every step change, so accidental navigation away does not lose the user's progress. The wizard restores from local storage on re-entry; the user can also choose to start fresh.

---

## 10. Notifications and Feedback

### Loading States

- Full-page loads: a centered "Loading…" message with a spinner.
- Inline data fetches (Workloads, Blueprints lists): a small spinner banner above the table; the previous content stays visible until refresh completes.
- Button-triggered actions: the button label is replaced by a spinner while the action is in progress; the button is disabled to prevent double-submission.

### Success Notifications

- For form-style actions (Settings save, Blueprint create/delete/deprecate, Workload delete/upgrade), a green toast appears in the bottom-right and auto-dismisses after a few seconds.
- For install/deploy actions, the Install Progress Modal handles success messaging directly (no separate toast).

### Error Notifications

- Page-level fetch errors: a red banner at the top of the page with the error message and a Refresh button.
- Modal errors (wizards, confirmation dialogs): an inline error banner inside the modal.
- Settings save errors: a banner near the Apply button. The form keeps the user's edits so they can retry.

### Confirmation Dialogs

Destructive or potentially confusing actions require explicit user confirmation:

| Action | Confirmation message |
|--------|---------------------|
| Delete Workload | "Delete <name> from namespace <ns>? All associated resources on the target clusters — Fleet bundles, HelmOps, and Helm releases — will be removed. This action cannot be undone." |
| Delete Blueprint version | "Delete <displayName> v<version>?" + list of any `AIWorkload`s currently referencing this version. |
| Deprecate Blueprint version | "Deprecate <displayName> v<version>? Deprecated blueprints are hidden from the Blueprints page by default. Users with existing deployments are not affected." + active-workload list. |
| Upgrade Blueprint Workload | (in-modal; not a separate confirmation) — the Upgrade button is disabled when the selected version equals the current one, preventing no-op upgrades. |

Confirmation dialogs have two buttons: **Cancel** (no action) and a primary action button. While the action is in flight, the primary button shows a spinner and both buttons are disabled.

---

## 11. Out of Scope for v1

The following features are explicitly not included in the v1 release of SUSE AI Factory:

- **Bundles, publish-by-approval workflows, and a separate "publisher" role.** Blueprints are created directly by Global Administrators; there is no Bundle workshop, no Submitted/Approved state machine, and no per-Blueprint approval queue. Authoring governance is provided by Rancher's existing Global Administrator role.
- **Pre-flight checks** — there is no in-product action that scans a Blueprint or App for missing charts/images before install. Customers verify mirror completeness through their existing OCI tooling.
- **Embedded image registry or image mirroring inside AIF** — AIF does not host or proxy an OCI registry. Container images are pulled at deploy time from SUSE Registry, SUSE Application Collection, or the customer's mirror (configured via Settings → Advanced).
- **Direct NVIDIA NGC access** — AIF does not connect to `nvcr.io`, `helm.ngc.nvidia.com`, or `integrate.api.nvidia.com`. NIMs reach the platform via a SUSE-managed mirror process running outside AIF.
- **Multi-cluster workload federation** — deploying a single workload across multiple clusters happens via Fleet's target list, but AIF does not present a federated control surface (e.g., per-cluster scaling overrides, region-aware placement). Workload `spec.targetClusters` is a flat list.
- **Editing a published Blueprint version in place** — once a Blueprint version is saved, its content is not edited. Edits create a new version.
- **In-place Blueprint upgrade of running Workloads triggered by Blueprint publication** — when a new Blueprint version is created, existing Workloads are not auto-upgraded. The Operations Engineer triggers the upgrade explicitly from the Workloads page.
- **Custom RBAC within the platform UI** — access control to SUSE AI Factory features uses Rancher's existing role model (cluster/project/namespace roles + Global Administrator). Finer-grained AIF-specific RBAC is deferred.
- **Mobile and small-screen layouts** — the UI is designed for desktop browser viewports (1280px+).
- **Workload scaling from the UI** — replica scaling is managed through Kubernetes tooling, not the AIF UI.
- **Rollback from the UI** — rollbacks are triggered through Kubernetes tooling, not the AIF UI.
- **Real-time log streaming** — pod logs are not surfaced in the AIF UI; users use Rancher's built-in log viewer.
- **An "App Instances" per-App view** — App-sourced workloads are inspected via the main Workloads page (filterable by source type and App name); there is no dedicated per-App instance list page.

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **AI Factory / AIF** | The product described by this specification — a Rancher Dashboard extension and operator that deploys and operates AI/ML workloads. |
| **App** | A Helm-chart-packaged AI application discovered from a Rancher-registered Helm repository (SUSE Application Collection, SUSE Registry, or any other ClusterRepo). Examples: Milvus, vLLM, Ollama, individual NVIDIA NIM charts. Apps are directly deployable and are also the building blocks used inside Blueprints. |
| **Blueprint** | A user-authored, versioned, cluster-scoped AI stack — a named bundle of one or more Apps with their values. New versions are created by editing or copying; the underlying CR (`Blueprint` in `ai-platform.suse.com/v1alpha1`) carries a `displayName`, `version`, `description`, `components[]`, and `deprecated` flag. |
| **Workload** | A running instance of an App or a Blueprint on one or more target clusters. Modeled as the `AIWorkload` CRD. Records its `Source` (App chart + version, or Blueprint name + version) so the operate experience offers a context-appropriate action — Manage for Apps, Upgrade for Blueprints. |
| **Global Administrator** | A Rancher role (`globalRoleName: 'admin'` in a `GlobalRoleBinding`) used by AIF to gate Blueprint authoring actions (Edit, Deprecate, Delete). Copy is available to all users. |
| **NIM** | NVIDIA Inference Microservice — containerized inference servers (e.g., Llama, Mistral) packaged as Helm charts. AIF consumes NIMs only from SUSE Registry; the originals at `nvcr.io` are reached only by the SUSE-managed mirror process. |
| **Mirror process** | A SUSE-managed offline process that copies the agreed set of NIM containers and Helm charts from NVIDIA NGC into SUSE Registry. AIF only ever sees the SUSE Registry side of this pipeline. |
| **SUSE Application Collection** | SUSE's catalog of certified applications (Milvus, Ollama, vLLM, …) at `dp.apps.rancher.io`. |
| **SUSE Registry** | SUSE's OCI image registry at `registry.suse.com`, also home to the SUSE-mirrored NVIDIA NIM charts under `/ai/charts/nvidia/`. |
| **Fleet** | Rancher's multi-cluster delivery engine. AIF uses Fleet for all workload delivery to downstream clusters. Two modes: `helm` (AIF creates a Fleet Bundle CR containing the OCI chart and values) and `gitops` (AIF pushes manifests to a configured git repo and creates a Fleet GitRepo CR). In both cases the operator never calls downstream cluster APIs directly. |
| **Fleet Bundle CR** | A `fleet.cattle.io/v1alpha1 Bundle` resource on the management cluster, created by the AIF operator when `deployStrategy: helm`. Contains the Helm chart reference and merged values. |
| **Fleet GitRepo CR** | A `fleet.cattle.io/v1alpha1 GitRepo` resource on the management cluster, created by the AIF operator when `deployStrategy: gitops`. Points to the user's git repository configured in Settings → Fleet/GitOps. |
| **deployStrategy** | How a Workload's components are delivered to the target downstream clusters. Surfaced in the Workloads table as the **Deploy** column. Values: `Helm` (Fleet Bundle CR with OCI chart + merged values, no git) or `FleetBundle` (Fleet Bundle CR via git/GitOps). |
| **Steve** | Rancher's typed API surface used by the dashboard and extensions. The AIF extension reads Blueprint and AIWorkload lists via Steve (`management/findAll`) for resources it owns. |
| **UIPlugin** | Rancher's extension registration resource (`catalog.cattle.io/v1`). Installed by AIF's `InstallAIExtension` controller. |
| **Source** *(of a Workload)* | Provenance metadata recorded on every Workload identifying where it came from: `App: <chart>@<version>` or `Blueprint: <name>@<version>`. Drives the row's action set. |
| **Air-gap** | A deployment scenario where the AIF cluster has no internet access and reaches only customer-internal services. AIF supports air-gap as a first-class configuration variant — same operator binary, same UI, same workflows; only Settings → Advanced → Registry Endpoints values and the operator chart's image config differ. |
| **Registry Endpoint Override** | A field under Settings → Advanced → Registry Endpoints that points AIF at a customer-internal registry instead of the upstream SUSE-hosted default. |
| **Image Rewrite Rule** | A `{ match, replace }` prefix substitution applied at the Helm values merge layer so deployed pods can pull from a customer-internal registry. Configured under Settings → Advanced → Image Rewrite. |

---

## 13. Cross-Reference Appendix

For technical details corresponding to each customer-facing concept:

| Customer concept (this doc) | Architecture section | Project Plan stories |
|------------------------------|------------------------|------------------------|
| §1 Product Vision (three-noun model) | `ARCHITECTURE.md` §2 System Context | P0-2 |
| §2 User Personas | `ARCHITECTURE.md` §10 Security Architecture (Rancher RBAC integration) | P6-1 |
| §3 Platform Navigation | `ARCHITECTURE.md` §7 UI Extension Architecture | P6-0, P6-1 |
| §4 Overview Dashboard | `ARCHITECTURE.md` §5 REST API (Workloads + Blueprints endpoints) | P5-1, P6-10 |
| §5 Apps — AI Catalog | `ARCHITECTURE.md` §5 REST API (Apps catalog), §7 UI (Apps page) | P2-1, P2-2, P2-3, P2-4, P6-7 |
| §6 Blueprints | `ARCHITECTURE.md` §4.3 Blueprint CRD, §5 Blueprints endpoints | P1-2, P2-5, P6-5 |
| §7 Workloads | `ARCHITECTURE.md` §4.4 Workload CRD (state machine), §6.6 Helm Values Merge | P1-3, P4-2, P5-1, P5-2, P5-3, P6-6 |
| §8 Settings | `ARCHITECTURE.md` §4.5 Settings CRD, §13.4 Image Pull Secrets | P0-2, P1-4, P5-4, P5-5, P6-9 |
| §9 Install, Deploy, and Manage Flows | `ARCHITECTURE.md` §5 (workload create/patch endpoints), §6.6 Helm Values Merge Precedence | P4-1, P4-5, P6-8 |
| §10 Notifications and Feedback | `ARCHITECTURE.md` §11 Observability (Events, Logging) | P6-10, P8-2 |
| §11 Out of Scope | `ARCHITECTURE.md` §13.4 Image Pull Secrets (rationale for no internal registry) | — |
| §12 Glossary | `ARCHITECTURE.md` §15 Glossary | — |
| **Air-gap as first-class** — §1 Vision; §5/§6 unreachable empty states; §8 Section 4 Advanced | `ARCHITECTURE.md` §4.5 Settings additions (registryEndpoints, imageRewrite, catalogDiscovery), §6.6 layer 5 image-rewrite | P5-7, P5-8, P9-6, P9-7; **admin doc:** `AIRGAP.md` |
