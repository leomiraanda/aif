package fleet

import "errors"

// Sentinel errors for the FleetBundleEngine. Consumers MUST use
// errors.Is to classify; no strings.Contains on error messages.
//
// Names are prefixed with the engine (Bundle vs GitRepo) so the parallel
// GitRepo engine can add its own sentinels without collision.
var (
	// ErrBundleNotReady marks a transient state: the Bundle exists but
	// Fleet has not finished applying it. Reconciler should requeue.
	ErrBundleNotReady = errors.New("fleet bundle not ready")

	// ErrBundleApplyFailed wraps a hard failure from the apiserver
	// (server-side apply rejected, network error, etc.).
	ErrBundleApplyFailed = errors.New("fleet bundle apply failed")

	// ErrBundleConflict wraps an SSA conflict — another field manager
	// owns conflicting fields. Reconciler should retry with backoff.
	ErrBundleConflict = errors.New("fleet bundle conflict")

	// ErrBundleInvalidSpec is returned from Apply when the input
	// BundleDeploymentSpec fails validateSpec checks.
	ErrBundleInvalidSpec = errors.New("fleet bundle invalid spec")

	// ErrConnectionLost signals downstream-cluster connectivity loss
	// observed by either engine (Bundle or GitRepo); deliberately
	// unprefixed because the failure mode is engine-agnostic. Surfaced
	// via BundleObservedStatus for the Bundle engine; the reconciler
	// maps it to ClusterFailed.
	ErrConnectionLost = errors.New("fleet bundle connection error")
)

// --- GitRepo engine sentinels. Parallel set to the Bundle sentinels
// above so callers can errors.Is on a GitRepo failure without picking
// up a Bundle failure (and vice versa). The Bundle-named sentinels are
// for the Bundle engine only; the GitRepo engine uses these.

var (
	// ErrGitRepoNotReady marks a transient state: the GitRepo exists
	// but Fleet has not finished reconciling it. Reconciler should
	// requeue.
	ErrGitRepoNotReady = errors.New("fleet gitrepo not ready")

	// ErrGitRepoApplyFailed wraps a hard failure from the apiserver
	// (server-side apply rejected, network error, etc.).
	ErrGitRepoApplyFailed = errors.New("fleet gitrepo apply failed")

	// ErrGitRepoConflict wraps an SSA conflict — another field manager
	// owns conflicting fields on the GitRepo CR. Reconciler should
	// retry with backoff.
	ErrGitRepoConflict = errors.New("fleet gitrepo conflict")

	// ErrGitRepoInvalidSpec is returned from Apply when the input
	// GitRepoDeploymentSpec fails validateGitRepoSpec checks.
	ErrGitRepoInvalidSpec = errors.New("fleet gitrepo invalid spec")
)
