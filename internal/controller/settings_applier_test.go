package controller

import (
	"reflect"
	"testing"

	aifv1 "github.com/SUSE/aif/api/v1alpha1"
)

// TestTranslateSettings_Empty: nil CR + empty creds → all defaults applied.
func TestTranslateSettings_Empty(t *testing.T) {
	got := translateSettings(nil, Credentials{}, Credentials{})
	want := SettingsSnapshot{
		SUSERegistry:          "registry.suse.com",
		AppCollectionRegistry: "dp.apps.rancher.io",
		AppCollectionAPI:      "https://api.apps.rancher.io",
		AppCollectionMode:     "api",
		ImageRewriteEnabled:   false,
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %#v, want %#v", got, want)
	}
}

// TestTranslateSettings_RegistryEndpointsOverride: SUSERegistry override
// reflected; other defaults preserved.
func TestTranslateSettings_RegistryEndpointsOverride(t *testing.T) {
	in := &aifv1.Settings{
		Spec: aifv1.SettingsSpec{
			RegistryEndpoints: &aifv1.RegistryEndpointsSpec{
				SUSERegistry: "harbor.example.com",
			},
		},
	}
	got := translateSettings(in, Credentials{}, Credentials{})
	if got.SUSERegistry != "harbor.example.com" {
		t.Errorf("SUSERegistry: got %q, want harbor.example.com", got.SUSERegistry)
	}
	// Other endpoint defaults preserved.
	if got.AppCollectionRegistry != "dp.apps.rancher.io" {
		t.Errorf("AppCollectionRegistry: default not preserved, got %q", got.AppCollectionRegistry)
	}
	if got.AppCollectionAPI != "https://api.apps.rancher.io" {
		t.Errorf("AppCollectionAPI: default not preserved, got %q", got.AppCollectionAPI)
	}
}

// TestTranslateSettings_ImageRewriteRulesProjected: rules + enabled flag pass through.
func TestTranslateSettings_ImageRewriteRulesProjected(t *testing.T) {
	in := &aifv1.Settings{
		Spec: aifv1.SettingsSpec{
			ImageRewrite: &aifv1.ImageRewriteSpec{
				Enabled: true,
				Rules: []aifv1.ImageRewriteRule{
					{Match: "registry.suse.com/", Replace: "harbor.example.com/suse/"},
				},
			},
		},
	}
	got := translateSettings(in, Credentials{}, Credentials{})
	if !got.ImageRewriteEnabled {
		t.Error("ImageRewriteEnabled must be true")
	}
	wantRules := []ImageRewriteRule{{Match: "registry.suse.com/", Replace: "harbor.example.com/suse/"}}
	if !reflect.DeepEqual(got.ImageRewriteRules, wantRules) {
		t.Errorf("rules: got %#v, want %#v", got.ImageRewriteRules, wantRules)
	}
}

// TestTranslateSettings_CatalogDiscoveryMode: ApplicationCollectionMode stored
// verbatim in snapshot (bus does the APIURL projection, not the snapshot).
func TestTranslateSettings_CatalogDiscoveryMode(t *testing.T) {
	in := &aifv1.Settings{
		Spec: aifv1.SettingsSpec{
			CatalogDiscovery: &aifv1.CatalogDiscoverySpec{
				ApplicationCollectionMode: "disabled",
			},
		},
	}
	got := translateSettings(in, Credentials{}, Credentials{})
	if got.AppCollectionMode != "disabled" {
		t.Errorf("AppCollectionMode: got %q, want disabled", got.AppCollectionMode)
	}
	// AppCollectionAPI default preserved (snapshot is a faithful deref;
	// bus interprets mode+URL together at projection time).
	if got.AppCollectionAPI != "https://api.apps.rancher.io" {
		t.Errorf("AppCollectionAPI: default must remain in snapshot, got %q", got.AppCollectionAPI)
	}
}

// TestTranslateSettings_PartialNilSpecsUseDefaults: every nil sub-spec →
// defaults intact, no panic.
func TestTranslateSettings_PartialNilSpecsUseDefaults(t *testing.T) {
	in := &aifv1.Settings{
		Spec: aifv1.SettingsSpec{
			RegistryEndpoints:       nil,
			ImageRewrite:            nil,
			CatalogDiscovery:        nil,
			BlueprintClassification: nil,
		},
	}
	got := translateSettings(in, Credentials{}, Credentials{})
	if got.SUSERegistry != "registry.suse.com" {
		t.Errorf("SUSERegistry default lost: %q", got.SUSERegistry)
	}
	if got.AppCollectionMode != "api" {
		t.Errorf("AppCollectionMode default lost: %q", got.AppCollectionMode)
	}
}

// TestTranslateSettings_PureFunction_InputsUnchanged: snapshot the input CR
// before the call; assert deep-equal after.
func TestTranslateSettings_PureFunction_InputsUnchanged(t *testing.T) {
	in := &aifv1.Settings{
		Spec: aifv1.SettingsSpec{
			RegistryEndpoints: &aifv1.RegistryEndpointsSpec{SUSERegistry: "harbor.example.com"},
			ImageRewrite: &aifv1.ImageRewriteSpec{
				Enabled: true,
				Rules:   []aifv1.ImageRewriteRule{{Match: "a/", Replace: "b/"}},
			},
		},
	}
	clone := in.DeepCopy()
	_ = translateSettings(in, Credentials{User: "u", Token: "t"}, Credentials{})
	if !reflect.DeepEqual(in, clone) {
		t.Errorf("input mutated:\n  before: %#v\n  after:  %#v", clone, in)
	}
}

// TestTranslateSettings_BlueprintClassification_StoredInSnapshot: ChartRef
// slices translated; bus does not push them today (follow-up note 4).
func TestTranslateSettings_BlueprintClassification_StoredInSnapshot(t *testing.T) {
	in := &aifv1.Settings{
		Spec: aifv1.SettingsSpec{
			BlueprintClassification: &aifv1.BlueprintClassificationSpec{
				ForceReferenceBlueprint: []aifv1.ChartRef{{Repo: "oci://x", Chart: "rag"}},
				ForceBuildingBlock:      []aifv1.ChartRef{{Repo: "oci://y", Chart: "llm"}},
			},
		},
	}
	got := translateSettings(in, Credentials{}, Credentials{})
	wantRef := []ChartRef{{Repo: "oci://x", Chart: "rag"}}
	wantBB := []ChartRef{{Repo: "oci://y", Chart: "llm"}}
	if !reflect.DeepEqual(got.BlueprintForceReference, wantRef) {
		t.Errorf("BlueprintForceReference: got %#v, want %#v", got.BlueprintForceReference, wantRef)
	}
	if !reflect.DeepEqual(got.BlueprintForceBuildingBlock, wantBB) {
		t.Errorf("BlueprintForceBuildingBlock: got %#v, want %#v", got.BlueprintForceBuildingBlock, wantBB)
	}
}
