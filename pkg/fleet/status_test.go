package fleet

import (
	"testing"

	fleetv1 "github.com/rancher/fleet/pkg/apis/fleet.cattle.io/v1alpha1"
)

func TestMirrorStatus_EmptyTargets(t *testing.T) {
	got := mirrorStatus(fleetv1.BundleStatus{}, nil)
	if len(got.PerCluster) != 0 {
		t.Fatalf("want empty PerCluster, got %d", len(got.PerCluster))
	}
}

func TestMirrorStatus_MissingDeploymentForTarget(t *testing.T) {
	got := mirrorStatus(fleetv1.BundleStatus{}, []string{"c1", "c2"})
	if len(got.PerCluster) != 2 {
		t.Fatalf("want 2 entries, got %d", len(got.PerCluster))
	}
	for _, e := range got.PerCluster {
		if e.FleetState != "" {
			t.Errorf("expected empty FleetState for missing deployment on %s, got %q", e.ClusterName, e.FleetState)
		}
	}
}

// Note: the schema for status.display/summary varies across Fleet
// versions. We assert the function returns one entry per target and
// that ConnectionError defaults to false; richer assertions ride along
// with the live test against a real Fleet manager.
func TestMirrorStatus_OneEntryPerTarget(t *testing.T) {
	got := mirrorStatus(fleetv1.BundleStatus{}, []string{"east", "west", "central"})
	want := []string{"east", "west", "central"}
	if len(got.PerCluster) != len(want) {
		t.Fatalf("want %d entries, got %d", len(want), len(got.PerCluster))
	}
	for i, e := range got.PerCluster {
		if e.ClusterName != want[i] {
			t.Errorf("entry[%d].ClusterName = %q, want %q", i, e.ClusterName, want[i])
		}
		if e.ConnectionError {
			t.Errorf("entry[%d].ConnectionError should default to false", i)
		}
	}
}
