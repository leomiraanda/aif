package fleet

import (
	"context"
	"io"
	"log/slog"
	"testing"

	fleetv1 "github.com/rancher/fleet/pkg/apis/fleet.cattle.io/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
)

func newScheme(t *testing.T) *runtime.Scheme {
	t.Helper()
	s := runtime.NewScheme()
	if err := clientgoscheme.AddToScheme(s); err != nil {
		t.Fatal(err)
	}
	if err := fleetv1.AddToScheme(s); err != nil {
		t.Fatal(err)
	}
	return s
}

func newSilentLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestBundleEngine_Apply_CreatesBundle(t *testing.T) {
	s := newScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).Build()
	e := NewBundleEngine(newSilentLogger(), c)

	spec := BundleDeploymentSpec{
		WorkloadID:     "demo",
		WorkloadNS:     "team-a",
		TargetClusters: []string{"c1"},
		Components:     []ComponentBundle{{Name: "x", ChartRef: "oci://r/x:1", Values: map[string]any{}}},
		Owner:          OwnerRef{APIVersion: "ai.suse.com/v1alpha1", Kind: "Workload", Name: "demo", UID: "u-1"},
	}

	obs, err := e.Apply(context.Background(), spec)
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if len(obs.PerCluster) != 1 {
		t.Fatalf("PerCluster len = %d, want 1", len(obs.PerCluster))
	}

	var got fleetv1.Bundle
	if err := c.Get(context.Background(),
		client.ObjectKey{Namespace: "team-a", Name: "team-a-demo"},
		&got); err != nil {
		t.Fatalf("Bundle not created: %v", err)
	}
	if got.Spec.Helm == nil || got.Spec.Helm.Chart != "oci://r/x:1" {
		t.Fatalf("Bundle.Spec.Helm wrong: %+v", got.Spec.Helm)
	}
}

func TestBundleEngine_Apply_Idempotent(t *testing.T) {
	s := newScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).Build()
	e := NewBundleEngine(newSilentLogger(), c)

	spec := BundleDeploymentSpec{
		WorkloadID:     "demo",
		WorkloadNS:     "team-a",
		TargetClusters: []string{"c1"},
		Components:     []ComponentBundle{{Name: "x", ChartRef: "oci://r/x:1", Values: map[string]any{"v": 1}}},
		Owner:          OwnerRef{APIVersion: "ai.suse.com/v1alpha1", Kind: "Workload", Name: "demo", UID: "u-1"},
	}

	if _, err := e.Apply(context.Background(), spec); err != nil {
		t.Fatalf("first Apply: %v", err)
	}
	var afterFirst fleetv1.Bundle
	if err := c.Get(context.Background(),
		client.ObjectKey{Namespace: "team-a", Name: "team-a-demo"}, &afterFirst); err != nil {
		t.Fatal(err)
	}

	if _, err := e.Apply(context.Background(), spec); err != nil {
		t.Fatalf("second Apply: %v", err)
	}
	var afterSecond fleetv1.Bundle
	if err := c.Get(context.Background(),
		client.ObjectKey{Namespace: "team-a", Name: "team-a-demo"}, &afterSecond); err != nil {
		t.Fatal(err)
	}

	// Spec content must be unchanged across the two Applies (idempotency).
	if afterFirst.Spec.Helm.Chart != afterSecond.Spec.Helm.Chart {
		t.Fatalf("chart drifted across applies: %q vs %q",
			afterFirst.Spec.Helm.Chart, afterSecond.Spec.Helm.Chart)
	}
	// Avoid unused metav1 import
	_ = metav1.ObjectMeta{}
}

func TestBundleEngine_Apply_RejectsInvalidSpec(t *testing.T) {
	s := newScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).Build()
	e := NewBundleEngine(newSilentLogger(), c)
	_, err := e.Apply(context.Background(), BundleDeploymentSpec{})
	if err == nil {
		t.Fatal("expected ErrBundleInvalidSpec, got nil")
	}
}

func TestBundleEngine_Teardown_DeletesAndIsIdempotent(t *testing.T) {
	s := newScheme(t)
	c := fake.NewClientBuilder().WithScheme(s).
		WithObjects(&fleetv1.Bundle{
			ObjectMeta: metav1.ObjectMeta{Namespace: "team-a", Name: "team-a-demo"},
		}).Build()
	e := NewBundleEngine(newSilentLogger(), c)
	ctx := context.Background()
	if err := e.Teardown(ctx, "team-a", "demo"); err != nil {
		t.Fatalf("first Teardown: %v", err)
	}
	if err := e.Teardown(ctx, "team-a", "demo"); err != nil {
		t.Fatalf("second Teardown (should be no-op): %v", err)
	}
}
