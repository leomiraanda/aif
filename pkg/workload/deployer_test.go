package workload

import (
	"context"
	"log/slog"
	"testing"

	"github.com/SUSE/aif/pkg/blueprint"
	"github.com/SUSE/aif/pkg/bundle"
	"github.com/SUSE/aif/pkg/helm"
	"github.com/SUSE/aif/pkg/nvidia"
)

func TestNewDeployer_ConstructsWithDeps(t *testing.T) {
	helmEng := helm.NewFake()
	bpRepo := blueprint.NewFakeRepository()
	bnRepo := bundle.NewFakeRepository()
	disc, _ := nvidia.NewDiscovery(slog.Default())
	dep := nvidia.NewDeployer(slog.Default())

	d := NewDeployer(helmEng, bpRepo, bnRepo, disc, dep, slog.Default())
	if d == nil {
		t.Fatal("NewDeployer returned nil")
	}
}

func TestResolveSource_App_SynthesizesOneComponent(t *testing.T) {
	d := newTestDeployer(t)

	req := DeployRequest{
		ID: "wid", SpecName: "my-llm",
		Source: SourceRef{
			Kind: SourceKindApp,
			App:  &AppRef{Repo: "oci://r", Chart: "c", Version: "1.0"},
		},
	}

	components, observedGen, err := d.resolveSource(context.Background(), req)
	if err != nil {
		t.Fatalf("resolveSource: %v", err)
	}
	if observedGen != 0 {
		t.Errorf("observedGen=%d, want 0 (App source)", observedGen)
	}
	if len(components) != 1 {
		t.Fatalf("components len=%d, want 1", len(components))
	}
	c := components[0]
	if c.name != "my-llm" || c.chart != "c" || c.version != "1.0" || c.repo != "oci://r" {
		t.Errorf("component=%+v", c)
	}
}

// newTestDeployer is a helper used by all deployer_test.go tests.
// Builds a real *deployer with fakes for every dependency.
//
// Uses the codebase's actual fake constructors (verified in Task 14):
//   helm.NewFake() → *helm.FakeEngine
//   blueprint.NewFakeRepository() → *blueprint.FakeRepository
//   bundle.NewFakeRepository() → *bundle.FakeRepository
//   nvidia.NewDiscovery(logger) → (Discovery, AnnotationReader) — take first
//   nvidia.NewDeployer(logger) → Deployer
func newTestDeployer(t *testing.T) *deployer {
	t.Helper()
	logger := slog.Default()
	disc, _ := nvidia.NewDiscovery(logger)
	return &deployer{
		helm:           helm.NewFake(),
		blueprintRepo:  blueprint.NewFakeRepository(),
		bundleRepo:     bundle.NewFakeRepository(),
		nvidiaDisc:     disc,
		nvidiaDeployer: nvidia.NewDeployer(logger),
		logger:         logger,
	}
}
