package workload

import "testing"

func TestMapFleetStateToPhase(t *testing.T) {
	cases := []struct {
		state string
		want  ClusterPhase
	}{
		{"Ready", ClusterRunning},
		{"Modified", ClusterRunning}, // critical: GC'd-Job drift is healthy
		{"ErrApplied", ClusterFailed},
		{"Pending", ClusterDeploying},
		{"WaitApplied", ClusterDeploying},
		{"OutOfSync", ClusterDeploying},
		{"WaitCheckIn", ClusterDeploying},
		// NotInstalled is an explicit arm (not default fall-through):
		// Fleet emits it as the transient pre-install state, not
		// terminal manifest-rejection. Locks the decision documented
		// on MapFleetStateToPhase's case arm.
		{"NotInstalled", ClusterDeploying},
		{"", ClusterDeploying},
		{"SomeUnknownFutureState", ClusterDeploying},
	}
	for _, c := range cases {
		t.Run(c.state, func(t *testing.T) {
			if got := MapFleetStateToPhase(c.state); got != c.want {
				t.Fatalf("MapFleetStateToPhase(%q) = %v, want %v", c.state, got, c.want)
			}
		})
	}
}

func TestAggregateClusterPhases(t *testing.T) {
	cases := []struct {
		name  string
		in    []ClusterPhase
		want  Phase
	}{
		{"empty", []ClusterPhase{}, PhasePending},
		{"all running", []ClusterPhase{ClusterRunning, ClusterRunning}, PhaseRunning},
		{"any failed", []ClusterPhase{ClusterRunning, ClusterFailed}, PhaseFailed},
		{"any deploying no failed", []ClusterPhase{ClusterRunning, ClusterDeploying}, PhaseDeploying},
		{"all deploying", []ClusterPhase{ClusterDeploying, ClusterDeploying}, PhaseDeploying},
		{"all pending", []ClusterPhase{ClusterPending, ClusterPending}, PhasePending},
		{"pending mixed with deploying yields deploying", []ClusterPhase{ClusterPending, ClusterDeploying}, PhaseDeploying},
		{"single running", []ClusterPhase{ClusterRunning}, PhaseRunning},
		{"single pending", []ClusterPhase{ClusterPending}, PhasePending},
		// Strict-all-Running cases per AggregateClusterPhases docstring.
		// Reviewer #2 flagged these as missing: the old code returned
		// Running for [Running, Pending] (anyRunning && !anyDeploying
		// branch), which would flap a partially-deployed workload to
		// Running on first cluster Ready while others still image-pull.
		{"running plus pending → deploying (no premature Running)", []ClusterPhase{ClusterRunning, ClusterPending}, PhaseDeploying},
		{"running plus deploying plus pending → deploying", []ClusterPhase{ClusterRunning, ClusterDeploying, ClusterPending}, PhaseDeploying},
		// any-Failed precedence over allPending.
		{"failed plus pending → failed (failed beats all-pending)", []ClusterPhase{ClusterFailed, ClusterPending}, PhaseFailed},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := AggregateClusterPhases(c.in); got != c.want {
				t.Fatalf("got %v want %v", got, c.want)
			}
		})
	}
}
