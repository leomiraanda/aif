package controller

import (
	"context"

	aifv1 "github.com/SUSE/aif/api/v1alpha1"
)

// SettingsSnapshot is the deref'd, defaults-applied view of an aifv1.Settings
// CR that the reconciler hands to the SettingsApplier bus.
//
// Each field is a value type (no pointers, no aifv1 imports). Defaults are
// applied at translation time so downstream engines see the in-code default
// when a CR field is nil/empty (per ARCHITECTURE.md §4.5 final paragraph
// "Defaults handled in code, not schema").
type SettingsSnapshot struct {
	SUSERegistry          string // §4.5 default "registry.suse.com"
	SUSERegistryUser      string // resolved from spec.suseRegistry.userSecretRef
	SUSERegistryToken     string // resolved from spec.suseRegistry.tokenSecretRef
	AppCollectionRegistry string // §4.5 default "dp.apps.rancher.io"
	AppCollectionAPI      string // §4.5 default "https://api.apps.rancher.io"
	AppCollectionUser     string
	AppCollectionToken    string
	AppCollectionMode     string // "api" (default) | "registry-fallback" | "disabled"

	ImageRewriteEnabled bool
	ImageRewriteRules   []ImageRewriteRule

	// BlueprintClassification stored for future engine consumption (P2-7
	// wrapper). Not pushed by the bus today; see follow-up note 4.
	BlueprintForceReference     []ChartRef
	BlueprintForceBuildingBlock []ChartRef
}

// ImageRewriteRule mirrors aifv1.ImageRewriteRule and helm.ImageRewriteRule.
// Defined here so the snapshot doesn't import aifv1 OR pkg/helm — the bus
// translates to the engine's own type at projection time.
type ImageRewriteRule struct {
	Match   string
	Replace string
}

// ChartRef mirrors aifv1.ChartRef. Defined here for snapshot independence.
type ChartRef struct {
	Repo  string
	Chart string
}

// Credentials is the resolved (user, token) pair the reconciler assembles
// from Secret resolution before calling translateSettings. Keeps the
// translation function pure (no Secret reads).
type Credentials struct {
	User  string
	Token string
}

// SettingsApplier is the bus port the reconciler calls on every reconcile.
// Production implementation projects SettingsSnapshot into per-engine
// EngineSettings types and pushes via each engine's UpdateSettings.
//
// Returns error even though no engine fails today: forward-looking. If any
// engine grows fallibility (validation rejecting a snapshot, persistence
// errors, etc.), the port already has the return shape and the reconciler
// can wrap into Ready=False.
type SettingsApplier interface {
	Apply(ctx context.Context, s SettingsSnapshot) error
}

// translateSettings derefs an aifv1.Settings into a SettingsSnapshot,
// applying §4.5 in-code defaults wherever a CR field is nil/empty. Pure
// function: never reads Secrets (caller resolves first and passes
// Credentials in), never mutates the input CR.
func translateSettings(s *aifv1.Settings, sc, ac Credentials) SettingsSnapshot {
	out := SettingsSnapshot{
		SUSERegistry:          "registry.suse.com",
		AppCollectionRegistry: "dp.apps.rancher.io",
		AppCollectionAPI:      "https://api.apps.rancher.io",
		AppCollectionMode:     "api",
		ImageRewriteEnabled:   false,
		SUSERegistryUser:      sc.User,
		SUSERegistryToken:     sc.Token,
		AppCollectionUser:     ac.User,
		AppCollectionToken:    ac.Token,
	}
	if s == nil {
		return out
	}
	if re := s.Spec.RegistryEndpoints; re != nil {
		if re.SUSERegistry != "" {
			out.SUSERegistry = re.SUSERegistry
		}
		if re.ApplicationCollection != "" {
			out.AppCollectionRegistry = re.ApplicationCollection
		}
		// Symmetric with the other endpoints: empty == unset (Go's zero
		// value for omitempty fields can't distinguish unset from explicit
		// ""), so we keep the default. The explicit "disable HTTP discovery"
		// signal lives on CatalogDiscovery.ApplicationCollectionMode="disabled"
		// (handled below; the bus then projects to APIURL="").
		if re.ApplicationCollectionAPI != "" {
			out.AppCollectionAPI = re.ApplicationCollectionAPI
		}
	}
	if ir := s.Spec.ImageRewrite; ir != nil {
		out.ImageRewriteEnabled = ir.Enabled
		for _, r := range ir.Rules {
			out.ImageRewriteRules = append(out.ImageRewriteRules, ImageRewriteRule{
				Match: r.Match, Replace: r.Replace,
			})
		}
	}
	if cd := s.Spec.CatalogDiscovery; cd != nil && cd.ApplicationCollectionMode != "" {
		out.AppCollectionMode = cd.ApplicationCollectionMode
	}
	if bc := s.Spec.BlueprintClassification; bc != nil {
		for _, c := range bc.ForceReferenceBlueprint {
			out.BlueprintForceReference = append(out.BlueprintForceReference, ChartRef{
				Repo: c.Repo, Chart: c.Chart,
			})
		}
		for _, c := range bc.ForceBuildingBlock {
			out.BlueprintForceBuildingBlock = append(out.BlueprintForceBuildingBlock, ChartRef{
				Repo: c.Repo, Chart: c.Chart,
			})
		}
	}
	return out
}
