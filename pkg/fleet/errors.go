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

	// ErrConnectionLost is surfaced via BundleObservedStatus when a
	// per-cluster BundleDeployment reports downstream connectivity loss.
	// The reconciler maps this to ClusterFailed.
	ErrConnectionLost = errors.New("fleet bundle connection error")
)

// --- GitRepo engine sentinels. The parallel GitRepo engine consumes
// these; declared here so its package files can land without editing
// this file.

var (
	ErrGitRepoNotReady    = errors.New("fleet gitrepo not ready")
	ErrGitRepoApplyFailed = errors.New("fleet gitrepo apply failed")
)
