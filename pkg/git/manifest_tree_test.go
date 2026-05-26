package git_test

import (
	"strings"
	"testing"

	"github.com/SUSE/aif/pkg/git"
)

func TestManifestFilename_SmallIndex(t *testing.T) {
	got := git.ManifestFilename(0, "nim-llm")
	want := "10-nim-llm.yaml"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestManifestFilename_DoubleDigit(t *testing.T) {
	got := git.ManifestFilename(10, "nim-llm")
	want := "1-10-nim-llm.yaml"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestSanitizeComponentName_LowercaseAndStrip(t *testing.T) {
	got := git.SanitizeComponentName("My Component_Name!")
	if got != "my-component-name" {
		t.Fatalf("got %q", got)
	}
}

func TestSanitizeComponentName_CollisionSuffix(t *testing.T) {
	seen := map[string]struct{}{}
	a := git.SanitizeComponentNameUnique("My Component", seen)
	seen[a] = struct{}{}
	b := git.SanitizeComponentNameUnique("My_Component", seen)
	if a == b {
		t.Fatalf("expected unique names, got %q and %q", a, b)
	}
	if !strings.HasPrefix(b, "my-component-") || len(b) != len("my-component-")+4 {
		t.Fatalf("expected 4-char suffix on collision; got %q", b)
	}
}
