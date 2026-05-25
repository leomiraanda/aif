// Package workload — Fleet-state→phase translation helpers.
//
// These helpers are framework-agnostic (no aifv1 imports) so they can be
// reused by the controller, the deployer, and unit tests without dragging
// in K8s API types.
package workload

// ClusterPhase is the per-target-cluster phase derived from a Fleet
// BundleDeployment.status.display.state. Aggregated to workload-level
// Phase by AggregateClusterPhases.
type ClusterPhase string

const (
	ClusterPending   ClusterPhase = "Pending"
	ClusterDeploying ClusterPhase = "Deploying"
	ClusterRunning   ClusterPhase = "Running"
	ClusterFailed    ClusterPhase = "Failed"
)

// MapFleetStateToPhase translates a Fleet BundleDeployment state
// (status.display.state, verbatim) into a workload ClusterPhase.
//
// Validated against SUSE AI Lifecycle Manager
// (aiworkload_controller.go:248-258). The Modified→Running mapping is
// load-bearing: when Fleet manages a Helm chart that creates a Job,
// the cluster eventually garbage-collects the completed Job, and Fleet
// reports the BundleDeployment as Modified (drift detected). That drift
// is healthy steady state, NOT a failure — flipping it to Failed/Degraded
// would flap every workload that ships a Job.
//
// Connection/auth errors are not surfaced here; the adapter
// (pkg/fleet/status.go) detects them via typed condition reasons and
// returns ClusterFailed via the caller, not via this string mapping.
func MapFleetStateToPhase(state string) ClusterPhase {
	switch state {
	case "Ready", "Modified":
		return ClusterRunning
	case "ErrApplied":
		return ClusterFailed
	case "NotInstalled":
		// Explicit arm (not just default fall-through): Fleet's
		// NotInstalled is the transient pre-install state, not a
		// terminal manifest-rejection. Treating it as Failed would
		// flap any workload that hadn't been installed on its
		// downstream cluster yet. If live-cluster experience later
		// proves a particular NotInstalled subcase IS terminal, lift
		// that case to ClusterFailed alongside ErrApplied here.
		return ClusterDeploying
	default:
		return ClusterDeploying
	}
}

// AggregateClusterPhases collapses per-cluster phases into a single
// workload Phase.
//
//   empty                                 → Pending  (no Bundle observed yet)
//   any Failed                            → Failed   (terminal — surfaces fastest)
//   all Running                           → Running  (strict — all targets must agree)
//   all Pending                           → Pending
//   otherwise (mixed states, no Failed)   → Deploying
//
// The "all Running" arm is strict: any cluster still Pending or
// Deploying keeps the workload at Deploying. Reporting Running while
// a target is mid-image-pull would let the workload flap (Running →
// Deploying → Running) on every cluster's first reconcile and would
// surface a partially-deployed workload as healthy.
func AggregateClusterPhases(phases []ClusterPhase) Phase {
	if len(phases) == 0 {
		return PhasePending
	}
	var anyFailed bool
	allRunning := true
	allPending := true
	for _, p := range phases {
		if p != ClusterPending {
			allPending = false
		}
		if p != ClusterRunning {
			allRunning = false
		}
		if p == ClusterFailed {
			anyFailed = true
		}
	}
	switch {
	case anyFailed:
		return PhaseFailed
	case allRunning:
		return PhaseRunning
	case allPending:
		return PhasePending
	default:
		return PhaseDeploying
	}
}
