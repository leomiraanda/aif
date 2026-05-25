package fleet

import (
	"context"
	"testing"
)

func TestFakeBundleEngine_RecordsApplyAndTeardown(t *testing.T) {
	f := NewFakeBundleEngine()
	spec := BundleDeploymentSpec{
		WorkloadID: "x", WorkloadNS: "n",
		Components:     []ComponentBundle{{Name: "c", ChartRef: "oci://r/c:1", Values: map[string]any{}}},
		TargetClusters: []string{"a", "b"},
		Owner:          OwnerRef{Name: "x"},
	}
	obs, err := f.Apply(context.Background(), spec)
	if err != nil {
		t.Fatal(err)
	}
	if len(obs.PerCluster) != 2 {
		t.Fatalf("PerCluster len = %d, want 2", len(obs.PerCluster))
	}
	if f.Applied[0].WorkloadID != "x" {
		t.Fatalf("Apply not recorded")
	}
	if err := f.Teardown(context.Background(), "n", "x"); err != nil {
		t.Fatal(err)
	}
	if len(f.TornDown) != 1 || f.TornDown[0] != "n/x" {
		t.Fatalf("Teardown not recorded: %v", f.TornDown)
	}
}
