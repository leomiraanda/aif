package helm_oci

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"path"

	"sigs.k8s.io/yaml"
)

// chartYamlMeta is the subset of Chart.yaml we read. The annotations
// block is the only field we consume.
type chartYamlMeta struct {
	Annotations map[string]string `json:"annotations,omitempty"`
}

// ExtractChartYamlAnnotations reads a Helm chart tar.gz from r, finds
// the first entry whose path basename is "Chart.yaml", parses it, and
// returns the annotations map.
//
// Returns (nil, nil) when there is no Chart.yaml entry OR when Chart.yaml
// has no annotations block — both are legitimate "no annotations" cases.
// Returns a wrapped error for malformed gzip, malformed tar, or malformed
// YAML.
func ExtractChartYamlAnnotations(r io.Reader) (map[string]string, error) {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return nil, fmt.Errorf("helm_oci: gzip reader: %w", err)
	}
	defer func() { _ = gz.Close() }()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("helm_oci: tar reader: %w", err)
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		if path.Base(hdr.Name) != "Chart.yaml" {
			continue
		}
		body, err := io.ReadAll(tr)
		if err != nil {
			return nil, fmt.Errorf("helm_oci: read Chart.yaml: %w", err)
		}
		var meta chartYamlMeta
		if err := yaml.Unmarshal(body, &meta); err != nil {
			return nil, fmt.Errorf("helm_oci: parse Chart.yaml: %w", err)
		}
		if len(meta.Annotations) == 0 {
			return nil, nil
		}
		return meta.Annotations, nil
	}
}
