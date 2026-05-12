package helm

import (
	"io"
	"log/slog"
	"sync"
	"testing"

	"k8s.io/client-go/rest"
)

// TestEngine_UpdateSettings_Race hammers UpdateSettings concurrently with
// snapshot reads. Must be run under -race; the validation command in P4-1
// is `go test -race ./pkg/helm/`.
func TestEngine_UpdateSettings_Race(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	e := New(logger, &rest.Config{}).(*engine)

	const writers = 8
	const readers = 8
	const iters = 1000

	var wg sync.WaitGroup
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < iters; j++ {
				e.UpdateSettings(EngineSettings{
					RegistryEndpoints: RegistryEndpoints{SUSERegistry: "r"},
				})
			}
		}()
	}
	for i := 0; i < readers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < iters; j++ {
				// Mirrors the documented sole-reader pattern on engine.mu:
				// acquire RLock, snapshot the value, release. P5-7 will
				// add the first production reader (Pull credential lookup)
				// using the same shape.
				e.mu.RLock()
				_ = e.settings
				e.mu.RUnlock()
			}
		}()
	}
	wg.Wait()
}

// TestEngine_New_AppliesOptions verifies functional options are applied.
func TestEngine_New_AppliesOptions(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	e := New(logger, &rest.Config{}, WithChartDir("/tmp/custom")).(*engine)
	if e.chartDir != "/tmp/custom" {
		t.Errorf("WithChartDir not applied: %q", e.chartDir)
	}
}
