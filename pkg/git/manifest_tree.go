package git

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
)

// dnsInvalid matches any character outside DNS-1123 subdomain alphabet.
var dnsInvalid = regexp.MustCompile(`[^a-z0-9-]+`)

// SanitizeComponentName lower-cases s, replaces invalid characters with
// "-", collapses consecutive dashes, and trims leading/trailing dashes.
// Returns "" when the result is empty.
func SanitizeComponentName(s string) string {
	clean := dnsInvalid.ReplaceAllString(strings.ToLower(s), "-")
	for strings.Contains(clean, "--") {
		clean = strings.ReplaceAll(clean, "--", "-")
	}
	return strings.Trim(clean, "-")
}

// SanitizeComponentNameUnique returns the sanitized name, appending a
// 4-char SHA-256 prefix of the original when the sanitized name
// already exists in `seen`.
func SanitizeComponentNameUnique(original string, seen map[string]struct{}) string {
	base := SanitizeComponentName(original)
	if _, ok := seen[base]; !ok {
		return base
	}
	sum := sha256.Sum256([]byte(original))
	return base + "-" + hex.EncodeToString(sum[:])[:4]
}

// ManifestFilename returns the per-component filename inside manifests/.
// Indices 0-9 use the "1{idx}-..." form so the numeric prefix sorts
// after fleet.yaml's "00-..." namespace marker. Indices ≥10 use the
// "1-{idx}-..." form so they still sort after single-digit indices.
func ManifestFilename(index int, sanitizedName string) string {
	if index < 10 {
		return fmt.Sprintf("1%d-%s.yaml", index, sanitizedName)
	}
	return fmt.Sprintf("1-%d-%s.yaml", index, sanitizedName)
}
