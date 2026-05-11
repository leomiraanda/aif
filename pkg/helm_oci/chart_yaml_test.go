package helm_oci

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"errors"
	"testing"
)

// makeChartTarGz builds an in-memory chart tarball with the given files.
// Each entry is (path, content). Returns the gzipped tarball bytes.
func makeChartTarGz(t *testing.T, entries map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for path, content := range entries {
		hdr := &tar.Header{
			Name: path,
			Mode: 0o644,
			Size: int64(len(content)),
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatalf("tar header: %v", err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatalf("tar body: %v", err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("tar close: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("gz close: %v", err)
	}
	return buf.Bytes()
}

func TestExtractChartYamlAnnotations_HappyPath(t *testing.T) {
	chartYaml := `apiVersion: v2
name: my-chart
version: 1.0.0
annotations:
  ai.suse.com/role: reference-blueprint
  ai.suse.com/use-case: rag
  ai.suse.com/display-name: My RAG Chart
`
	tgz := makeChartTarGz(t, map[string]string{
		"my-chart/Chart.yaml":       chartYaml,
		"my-chart/values.yaml":      "key: value",
		"my-chart/templates/foo.yaml": "{}",
	})
	got, err := ExtractChartYamlAnnotations(bytes.NewReader(tgz))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got["ai.suse.com/role"] != "reference-blueprint" {
		t.Errorf("role: got %q, want reference-blueprint", got["ai.suse.com/role"])
	}
	if got["ai.suse.com/use-case"] != "rag" {
		t.Errorf("use-case: got %q, want rag", got["ai.suse.com/use-case"])
	}
	if got["ai.suse.com/display-name"] != "My RAG Chart" {
		t.Errorf("display-name: got %q, want %q", got["ai.suse.com/display-name"], "My RAG Chart")
	}
}

func TestExtractChartYamlAnnotations_NoChartYaml_ReturnsNilNil(t *testing.T) {
	tgz := makeChartTarGz(t, map[string]string{
		"my-chart/values.yaml": "key: value",
	})
	got, err := ExtractChartYamlAnnotations(bytes.NewReader(tgz))
	if err != nil {
		t.Fatalf("expected nil error for missing Chart.yaml, got %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil map, got %v", got)
	}
}

func TestExtractChartYamlAnnotations_NoAnnotationsBlock_ReturnsNilNil(t *testing.T) {
	chartYaml := `apiVersion: v2
name: my-chart
version: 1.0.0
`
	tgz := makeChartTarGz(t, map[string]string{
		"my-chart/Chart.yaml": chartYaml,
	})
	got, err := ExtractChartYamlAnnotations(bytes.NewReader(tgz))
	if err != nil {
		t.Fatalf("expected nil error for missing annotations block, got %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil map, got %v", got)
	}
}

func TestExtractChartYamlAnnotations_MalformedYAML_ReturnsError(t *testing.T) {
	tgz := makeChartTarGz(t, map[string]string{
		"my-chart/Chart.yaml": "not: valid: yaml: at: all\n  bad indent",
	})
	_, err := ExtractChartYamlAnnotations(bytes.NewReader(tgz))
	if err == nil {
		t.Fatalf("expected error for malformed YAML, got nil")
	}
}

func TestExtractChartYamlAnnotations_TopLevelChartYaml(t *testing.T) {
	chartYaml := `apiVersion: v2
name: my-chart
annotations:
  ai.suse.com/role: reference-blueprint
`
	tgz := makeChartTarGz(t, map[string]string{
		"Chart.yaml": chartYaml,
	})
	got, err := ExtractChartYamlAnnotations(bytes.NewReader(tgz))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got["ai.suse.com/role"] != "reference-blueprint" {
		t.Fatalf("got %v, want role=reference-blueprint", got)
	}
}

func TestExtractChartYamlAnnotations_GzipCorrupt_ReturnsError(t *testing.T) {
	_, err := ExtractChartYamlAnnotations(bytes.NewReader([]byte("not gzip")))
	if err == nil {
		t.Fatalf("expected error for non-gzip input, got nil")
	}
	_ = errors.Is // import keeper
}
