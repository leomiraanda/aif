package fleet

import "context"

// FleetBundleEngine owns the lifecycle of ONE fleet.cattle.io/v1alpha1
// Bundle CR per Workload. Idempotent: Apply with the same spec converges
// to the same Bundle (server-side-apply with stable field manager).
//
// 3 methods (within ISP ≤4 target). Implemented by *bundleEngine in
// bundle_engine.go; test double in fake_bundle_engine.go.
type FleetBundleEngine interface {
	// Apply creates or updates the Fleet Bundle for spec.WorkloadID.
	// Returns the observed Bundle status (read back after SSA) so the
	// caller can mirror it into Workload.status without a second
	// round-trip.
	Apply(ctx context.Context, spec BundleDeploymentSpec) (BundleObservedStatus, error)

	// Teardown deletes the Fleet Bundle for the given workload. Returns
	// nil if the Bundle is already absent. Called from the controller's
	// finalizer block.
	Teardown(ctx context.Context, namespace, workloadID string) error

	// UpdateSettings is called by SettingsReconciler via engine_bus.
	// Currently no-op (FleetSettings is empty); kept for symmetry.
	UpdateSettings(s FleetSettings)
}

// FleetGitRepoEngine is the sibling port for the parallel GitRepo
// engine. Declared here so engine_bus.go and cmd/operator/main.go can
// reference both ports symmetrically; the concrete implementation lives
// in gitrepo_engine.go.
type FleetGitRepoEngine interface {
	Apply(ctx context.Context, spec GitRepoDeploymentSpec) (GitRepoObservedStatus, error)
	Teardown(ctx context.Context, namespace, clusterName string) error
	UpdateSettings(s FleetSettings)
}
