package workload

import (
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
