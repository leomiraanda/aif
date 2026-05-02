package blueprint

import (
	"log/slog"
	"os"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	aifv1 "github.com/SUSE/aif/api/v1alpha1"
)

func TestManager_ValidateSpec_ValidSemver(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mgr := New(logger)

	testCases := []string{
		"1.0.0",
		"2.1.3",
		"1.0.0-rc.1",
		"3.2.1-alpha.1",
	}

	for _, version := range testCases {
		bp := &aifv1.Blueprint{
			Spec: aifv1.BlueprintSpec{
				Version: version,
				Source: aifv1.BlueprintSource{
					Type: aifv1.BlueprintSourcePublished,
				},
			},
		}

		err := mgr.ValidateSpec(bp)
		if err != nil {
			t.Errorf("expected valid semver %s, got error: %v", version, err)
		}
	}
}

func TestManager_ValidateSpec_InvalidSemver(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mgr := New(logger)

	testCases := []string{
		"1.0",       // Missing patch
		"v1.0.0",    // Has v prefix (CRD doesn't store it)
		"1.0.0.0",   // Too many parts
		"invalid",   // Not semver
		"",          // Empty
	}

	for _, version := range testCases {
		bp := &aifv1.Blueprint{
			Spec: aifv1.BlueprintSpec{
				Version: version,
				Source: aifv1.BlueprintSource{
					Type: aifv1.BlueprintSourcePublished,
				},
			},
		}

		err := mgr.ValidateSpec(bp)
		if err == nil {
			t.Errorf("expected error for invalid semver %s, got nil", version)
		}
	}
}

func TestManager_ValidateSpec_ValidSourceType(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mgr := New(logger)

	testCases := []aifv1.BlueprintSourceType{
		aifv1.BlueprintSourcePublished,
		aifv1.BlueprintSourceWrapsVendorChart,
	}

	for _, sourceType := range testCases {
		bp := &aifv1.Blueprint{
			Spec: aifv1.BlueprintSpec{
				Version: "1.0.0",
				Source: aifv1.BlueprintSource{
					Type: sourceType,
				},
			},
		}

		err := mgr.ValidateSpec(bp)
		if err != nil {
			t.Errorf("expected valid source type %s, got error: %v", sourceType, err)
		}
	}
}

func TestManager_ValidateSpec_InvalidSourceType(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mgr := New(logger)

	testCases := []aifv1.BlueprintSourceType{
		"",          // Empty
		"External",  // Old name (renamed per §4.3)
		"Invalid",   // Unknown
	}

	for _, sourceType := range testCases {
		bp := &aifv1.Blueprint{
			Spec: aifv1.BlueprintSpec{
				Version: "1.0.0",
				Source: aifv1.BlueprintSource{
					Type: sourceType,
				},
			},
		}

		err := mgr.ValidateSpec(bp)
		if err == nil {
			t.Errorf("expected error for invalid source type %s, got nil", sourceType)
		}
	}
}

func TestManager_ComputeDeploymentCount_Empty(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mgr := New(logger)

	bp := &aifv1.Blueprint{
		Spec: aifv1.BlueprintSpec{
			BlueprintName: "test-blueprint",
			Version:       "1.0.0",
		},
	}

	workloads := []aifv1.Workload{}

	count := mgr.ComputeDeploymentCount(bp, workloads)
	if count != 0 {
		t.Errorf("expected count=0 for empty workload list, got %d", count)
	}
}

func TestManager_ComputeDeploymentCount_Match(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mgr := New(logger)

	bp := &aifv1.Blueprint{
		Spec: aifv1.BlueprintSpec{
			BlueprintName: "test-blueprint",
			Version:       "1.0.0",
		},
	}

	workloads := []aifv1.Workload{
		{
			Spec: aifv1.WorkloadSpec{
				Source: aifv1.WorkloadSource{
					Kind: aifv1.WorkloadSourceKindBlueprint,
					Blueprint: &aifv1.BlueprintRef{
						Name:    "test-blueprint",
						Version: "1.0.0",
					},
				},
			},
		},
	}

	count := mgr.ComputeDeploymentCount(bp, workloads)
	if count != 1 {
		t.Errorf("expected count=1 for matching workload, got %d", count)
	}
}

func TestManager_ComputeDeploymentCount_NoMatch(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mgr := New(logger)

	bp := &aifv1.Blueprint{
		Spec: aifv1.BlueprintSpec{
			BlueprintName: "test-blueprint",
			Version:       "1.0.0",
		},
	}

	workloads := []aifv1.Workload{
		{
			Spec: aifv1.WorkloadSpec{
				Source: aifv1.WorkloadSource{
					Kind: aifv1.WorkloadSourceKindBlueprint,
					Blueprint: &aifv1.BlueprintRef{
						Name:    "different-blueprint", // Different name
						Version: "1.0.0",
					},
				},
			},
		},
		{
			Spec: aifv1.WorkloadSpec{
				Source: aifv1.WorkloadSource{
					Kind: aifv1.WorkloadSourceKindBlueprint,
					Blueprint: &aifv1.BlueprintRef{
						Name:    "test-blueprint",
						Version: "2.0.0", // Different version
					},
				},
			},
		},
	}

	count := mgr.ComputeDeploymentCount(bp, workloads)
	if count != 0 {
		t.Errorf("expected count=0 for non-matching workloads, got %d", count)
	}
}

func TestManager_ComputeDeploymentCount_AppSource(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mgr := New(logger)

	bp := &aifv1.Blueprint{
		Spec: aifv1.BlueprintSpec{
			BlueprintName: "test-blueprint",
			Version:       "1.0.0",
		},
	}

	workloads := []aifv1.Workload{
		{
			Spec: aifv1.WorkloadSpec{
				Source: aifv1.WorkloadSource{
					Kind: aifv1.WorkloadSourceKindApp, // App source, not Blueprint
					App: &aifv1.AppRef{
						Repo:    "https://example.com/charts",
						Chart:   "test-app",
						Version: "1.0.0",
					},
				},
			},
		},
	}

	count := mgr.ComputeDeploymentCount(bp, workloads)
	if count != 0 {
		t.Errorf("expected count=0 for App-sourced workload, got %d", count)
	}
}

func TestManager_ComputeDeploymentCount_Multiple(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	mgr := New(logger)

	bp := &aifv1.Blueprint{
		Spec: aifv1.BlueprintSpec{
			BlueprintName: "test-blueprint",
			Version:       "1.0.0",
		},
	}

	workloads := []aifv1.Workload{
		{
			ObjectMeta: metav1.ObjectMeta{Name: "workload-1"},
			Spec: aifv1.WorkloadSpec{
				Source: aifv1.WorkloadSource{
					Kind: aifv1.WorkloadSourceKindBlueprint,
					Blueprint: &aifv1.BlueprintRef{
						Name:    "test-blueprint",
						Version: "1.0.0",
					},
				},
			},
		},
		{
			ObjectMeta: metav1.ObjectMeta{Name: "workload-2"},
			Spec: aifv1.WorkloadSpec{
				Source: aifv1.WorkloadSource{
					Kind: aifv1.WorkloadSourceKindBlueprint,
					Blueprint: &aifv1.BlueprintRef{
						Name:    "test-blueprint",
						Version: "1.0.0",
					},
				},
			},
		},
		{
			ObjectMeta: metav1.ObjectMeta{Name: "workload-3"},
			Spec: aifv1.WorkloadSpec{
				Source: aifv1.WorkloadSource{
					Kind: aifv1.WorkloadSourceKindApp,
					App: &aifv1.AppRef{
						Repo:    "https://example.com/charts",
						Chart:   "test-app",
						Version: "1.0.0",
					},
				},
			},
		},
	}

	count := mgr.ComputeDeploymentCount(bp, workloads)
	if count != 2 {
		t.Errorf("expected count=2 for two matching workloads, got %d", count)
	}
}
