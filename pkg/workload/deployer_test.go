package workload

import (
	"context"
	"errors"
	"log/slog"
	"testing"

	aifv1 "github.com/SUSE/aif/api/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

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

func TestResolveSource_Blueprint_FetchesAndCopiesComponents(t *testing.T) {
	d := newTestDeployer(t)

	bpRepo := d.blueprintRepo.(*blueprint.FakeRepository)
	bpRepo.Seed(&aifv1.Blueprint{
		ObjectMeta: metav1.ObjectMeta{Name: "rag-1.2.0"},
		Spec: aifv1.BlueprintSpec{
			BlueprintName: "rag",
			Version:       "1.2.0",
			Components: []aifv1.ComponentRef{
				{Name: "llm", Kind: aifv1.ComponentKindApp, App: &aifv1.AppRef{Repo: "r", Chart: "nim-llm", Version: "1"}},
				{Name: "vec", Kind: aifv1.ComponentKindApp, App: &aifv1.AppRef{Repo: "r", Chart: "milvus", Version: "4"}},
			},
			ValueOverrides: map[string]string{
				"llm": "image:\n  repository: registry.suse.com/ai/llm",
			},
		},
	})

	req := DeployRequest{
		Source: SourceRef{
			Kind:      SourceKindBlueprint,
			Blueprint: &BlueprintRef{Name: "rag", Version: "1.2.0"},
		},
	}

	components, _, err := d.resolveSource(context.Background(), req)
	if err != nil {
		t.Fatalf("resolveSource: %v", err)
	}
	if len(components) != 2 {
		t.Fatalf("components len=%d, want 2", len(components))
	}
	if components[0].name != "llm" || components[0].chart != "nim-llm" {
		t.Errorf("component[0]=%+v", components[0])
	}
	if components[0].blueprintOverride == "" {
		t.Errorf("blueprintOverride[0] empty; should carry valueOverrides[llm]")
	}
	if components[1].name != "vec" {
		t.Errorf("component[1]=%+v", components[1])
	}
}

func TestResolveSource_Blueprint_NotFound_ReturnsErrSourceNotResolved(t *testing.T) {
	d := newTestDeployer(t)
	req := DeployRequest{
		Source: SourceRef{Kind: SourceKindBlueprint, Blueprint: &BlueprintRef{Name: "nope", Version: "1"}},
	}
	_, _, err := d.resolveSource(context.Background(), req)
	if !errors.Is(err, ErrSourceNotResolved) {
		t.Errorf("err=%v, want ErrSourceNotResolved", err)
	}
}

func TestResolveSource_Blueprint_RejectsNestedBlueprint(t *testing.T) {
	d := newTestDeployer(t)
	bpRepo := d.blueprintRepo.(*blueprint.FakeRepository)
	bpRepo.Seed(&aifv1.Blueprint{
		ObjectMeta: metav1.ObjectMeta{Name: "outer-1.0"},
		Spec: aifv1.BlueprintSpec{
			Components: []aifv1.ComponentRef{
				{Name: "child", Kind: aifv1.ComponentKindBlueprint, Blueprint: &aifv1.BlueprintRef{Name: "inner", Version: "1"}},
			},
		},
	})
	req := DeployRequest{
		Source: SourceRef{Kind: SourceKindBlueprint, Blueprint: &BlueprintRef{Name: "outer", Version: "1.0"}},
	}
	_, _, err := d.resolveSource(context.Background(), req)
	if !errors.Is(err, ErrNestedBlueprintNotSupported) {
		t.Errorf("err=%v, want ErrNestedBlueprintNotSupported", err)
	}
}

func TestResolveSource_BundleTest_RecordsObservedGeneration(t *testing.T) {
	d := newTestDeployer(t)

	bnRepo := d.bundleRepo.(*bundle.FakeRepository)
	bnRepo.Seed(&aifv1.Bundle{
		ObjectMeta: metav1.ObjectMeta{Namespace: "ns", Name: "b1", Generation: 7},
		Spec: aifv1.BundleSpec{
			Components: []aifv1.ComponentRef{
				{Name: "c1", Kind: aifv1.ComponentKindApp, App: &aifv1.AppRef{Repo: "r", Chart: "c", Version: "1"}},
			},
		},
	})

	req := DeployRequest{
		Source: SourceRef{
			Kind: SourceKindBundleTest,
			BundleTest: &BundleTestRef{Namespace: "ns", Name: "b1", Generation: 5},
		},
	}

	components, observedGen, err := d.resolveSource(context.Background(), req)
	if err != nil {
		t.Fatalf("resolveSource: %v", err)
	}
	if observedGen != 7 {
		t.Errorf("observedGen=%d, want 7 (current bundle.metadata.generation)", observedGen)
	}
	if len(components) != 1 {
		t.Errorf("components=%+v", components)
	}
}

func TestResolveSource_BundleTest_NotFound_ReturnsErrSourceNotResolved(t *testing.T) {
	d := newTestDeployer(t)
	req := DeployRequest{
		Source: SourceRef{Kind: SourceKindBundleTest, BundleTest: &BundleTestRef{Namespace: "ns", Name: "nope", Generation: 1}},
	}
	_, _, err := d.resolveSource(context.Background(), req)
	if !errors.Is(err, ErrSourceNotResolved) {
		t.Errorf("err=%v, want ErrSourceNotResolved", err)
	}
}

func TestDetectOrphans_ReturnsRemovedComponents(t *testing.T) {
	previous := []ComponentRelease{
		{Name: "a", ReleaseName: "wid-a"},
		{Name: "b", ReleaseName: "wid-b"},
		{Name: "c", ReleaseName: "wid-c"},
	}
	desired := []desiredComponent{
		{name: "a"}, {name: "c"},
	}
	got := detectOrphans(previous, desired)
	if len(got) != 1 || got[0].Name != "b" {
		t.Errorf("orphans=%+v, want [b]", got)
	}
}

func TestDetectOrphans_EmptyPrevious_ReturnsEmpty(t *testing.T) {
	got := detectOrphans(nil, []desiredComponent{{name: "a"}})
	if len(got) != 0 {
		t.Errorf("orphans=%+v, want empty", got)
	}
}

func TestDetectOrphans_EmptyDesired_ReturnsAllPrevious(t *testing.T) {
	previous := []ComponentRelease{{Name: "a"}, {Name: "b"}}
	got := detectOrphans(previous, nil)
	if len(got) != 2 {
		t.Errorf("orphans=%+v, want all 2", got)
	}
}

func TestDeploy_App_NonNIM_HappyPath(t *testing.T) {
	d := newTestDeployer(t)
	// FakeEngine default returns Status="deployed", Revision=1 — no override needed.

	req := DeployRequest{
		Namespace: "ns", ID: "wid", SpecName: "my-llm",
		Source: SourceRef{Kind: SourceKindApp, App: &AppRef{Repo: "oci://r", Chart: "milvus", Version: "1.0"}},
		Overrides: map[string]string{"my-llm": "replicaCount: 5"},
	}

	result, err := d.Deploy(context.Background(), req)
	if err != nil {
		t.Fatalf("Deploy: %v", err)
	}

	if len(result.Components) != 1 {
		t.Fatalf("Components len=%d, want 1", len(result.Components))
	}
	c := result.Components[0]
	if c.Name != "my-llm" {
		t.Errorf("Name=%q, want my-llm", c.Name)
	}
	wantRelease := ComposeReleaseName("wid", "my-llm")
	if c.ReleaseName != wantRelease {
		t.Errorf("ReleaseName=%q, want %q", c.ReleaseName, wantRelease)
	}
	if c.Status != "deployed" {
		t.Errorf("Status=%q, want deployed", c.Status)
	}

	helmEng := d.helm.(*helm.FakeEngine)
	installs := filterInstallCalls(helmEng.Calls)
	if len(installs) != 1 {
		t.Fatalf("install calls=%d, want 1", len(installs))
	}
	call := installs[0]
	if call.Request.ChartRef != "oci://r/milvus:1.0" {
		t.Errorf("ChartRef=%q, want oci://r/milvus:1.0", call.Request.ChartRef)
	}
	rc, ok := call.Request.Overrides.Workload["replicaCount"]
	if !ok {
		t.Errorf("Workload override missing replicaCount: %+v", call.Request.Overrides.Workload)
	}
	// YAML unmarshals integers as float64 OR int depending on the library;
	// sigs.k8s.io/yaml routes through JSON, so it's float64. Accept either.
	switch v := rc.(type) {
	case int, int32, int64:
		if v != 5 && v != int32(5) && v != int64(5) {
			t.Errorf("replicaCount=%v, want 5", v)
		}
	case float64:
		if v != 5 {
			t.Errorf("replicaCount=%v, want 5", v)
		}
	default:
		t.Errorf("replicaCount type=%T value=%v, want numeric 5", rc, rc)
	}
	if call.Request.Overrides.NIMGenerated != nil {
		t.Errorf("NIMGenerated=%+v, want nil (non-NIM)", call.Request.Overrides.NIMGenerated)
	}
}

func TestDeploy_Blueprint_3Components_InstallsInOrder(t *testing.T) {
	d := newTestDeployer(t)

	bpRepo := d.blueprintRepo.(*blueprint.FakeRepository)
	bpRepo.Seed(&aifv1.Blueprint{
		ObjectMeta: metav1.ObjectMeta{Name: "rag-1.0"},
		Spec: aifv1.BlueprintSpec{
			Components: []aifv1.ComponentRef{
				{Name: "llm", Kind: aifv1.ComponentKindApp, App: &aifv1.AppRef{Repo: "r", Chart: "milvus", Version: "1"}},
				{Name: "vec", Kind: aifv1.ComponentKindApp, App: &aifv1.AppRef{Repo: "r", Chart: "vec", Version: "1"}},
				{Name: "ret", Kind: aifv1.ComponentKindApp, App: &aifv1.AppRef{Repo: "r", Chart: "ret", Version: "1"}},
			},
		},
	})

	req := DeployRequest{
		Namespace: "ns", ID: "wid",
		Source: SourceRef{Kind: SourceKindBlueprint, Blueprint: &BlueprintRef{Name: "rag", Version: "1.0"}},
	}

	result, err := d.Deploy(context.Background(), req)
	if err != nil {
		t.Fatalf("Deploy: %v", err)
	}

	if len(result.Components) != 3 {
		t.Fatalf("Components len=%d, want 3", len(result.Components))
	}
	wantOrder := []string{"llm", "vec", "ret"}
	for i, name := range wantOrder {
		if result.Components[i].Name != name {
			t.Errorf("Components[%d].Name=%q, want %q", i, result.Components[i].Name, name)
		}
	}
}

// filterInstallCalls returns only the InstallChartFromRepo entries from the
// FakeEngine call log — there's no per-method slice; the fake records all
// methods in one Calls slice.
func filterInstallCalls(calls []helm.FakeCall) []helm.FakeCall {
	out := make([]helm.FakeCall, 0, len(calls))
	for _, c := range calls {
		if c.Method == "InstallChartFromRepo" {
			out = append(out, c)
		}
	}
	return out
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
