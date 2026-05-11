package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/SUSE/aif/pkg/nvidia"
)

type fakeDiscovery struct {
	indexResult   []nvidia.NIMEntry
	indexErr      error
	getResult     nvidia.NIMEntry
	getErr        error
	refreshErr    error
	refreshCalled bool
}

func (f *fakeDiscovery) Index(_ context.Context) ([]nvidia.NIMEntry, error) {
	return f.indexResult, f.indexErr
}

func (f *fakeDiscovery) Get(_ context.Context, _ string) (nvidia.NIMEntry, error) {
	return f.getResult, f.getErr
}

func (f *fakeDiscovery) Refresh(_ context.Context) error {
	f.refreshCalled = true
	return f.refreshErr
}

func (f *fakeDiscovery) UpdateSettings(_ nvidia.EngineSettings) {}

func sampleNIMs() []nvidia.NIMEntry {
	return []nvidia.NIMEntry{
		{ID: "nim-llm:1.3.0", Chart: "nim-llm", Version: "1.3.0", DisplayName: "nim-llm", Type: nvidia.TypeLLM, ChartRef: "oci://registry.suse.com/ai/charts/nvidia/nim-llm:1.3.0"},
		{ID: "nim-llm:1.4.0", Chart: "nim-llm", Version: "1.4.0", DisplayName: "nim-llm", Type: nvidia.TypeLLM, ChartRef: "oci://registry.suse.com/ai/charts/nvidia/nim-llm:1.4.0"},
		{ID: "nim-vlm:2.0.0", Chart: "nim-vlm", Version: "2.0.0", DisplayName: "nim-vlm", Type: nvidia.TypeVLM, ChartRef: "oci://registry.suse.com/ai/charts/nvidia/nim-vlm:2.0.0"},
	}
}

func newNIMHandlerForTest(d nvidia.Discovery) http.Handler {
	mux := http.NewServeMux()
	NewNIMHandler(d).Register(mux)
	return mux
}

func TestNIMHandler_List_Default_ReturnsAll(t *testing.T) {
	disco := &fakeDiscovery{indexResult: sampleNIMs()}
	h := newNIMHandlerForTest(disco)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nvidia/nims", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var got []nvidia.NIMEntry
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal: %v\nbody=%s", err, rec.Body.String())
	}
	if len(got) != 3 {
		t.Errorf("expected 3 NIMs, got %d", len(got))
	}
}

func TestNIMHandler_List_FilterByTypeLLM(t *testing.T) {
	disco := &fakeDiscovery{indexResult: sampleNIMs()}
	h := newNIMHandlerForTest(disco)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nvidia/nims?type=llm", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var got []nvidia.NIMEntry
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	for _, e := range got {
		if e.Type != nvidia.TypeLLM {
			t.Errorf("got non-LLM entry in type=llm response: %+v", e)
		}
	}
	if len(got) != 2 {
		t.Errorf("expected 2 LLM NIMs, got %d", len(got))
	}
}

func TestNIMHandler_List_FilterByTypeVLM(t *testing.T) {
	disco := &fakeDiscovery{indexResult: sampleNIMs()}
	h := newNIMHandlerForTest(disco)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nvidia/nims?type=vlm", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	var got []nvidia.NIMEntry
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	for _, e := range got {
		if e.Type != nvidia.TypeVLM {
			t.Errorf("got non-VLM entry in type=vlm response: %+v", e)
		}
	}
	if len(got) != 1 {
		t.Errorf("expected 1 VLM NIM, got %d", len(got))
	}
}

func TestNIMHandler_List_InvalidType_Returns400(t *testing.T) {
	disco := &fakeDiscovery{indexResult: sampleNIMs()}
	h := newNIMHandlerForTest(disco)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nvidia/nims?type=bogus", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	var apiErr APIError
	_ = json.Unmarshal(rec.Body.Bytes(), &apiErr)
	if apiErr.Code != ErrCodeInvalidInput {
		t.Errorf("error code = %q, want %q", apiErr.Code, ErrCodeInvalidInput)
	}
}

func TestNIMHandler_List_Empty_ReturnsEmptyArray(t *testing.T) {
	disco := &fakeDiscovery{indexResult: nil}
	h := newNIMHandlerForTest(disco)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nvidia/nims", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	body := strings.TrimSpace(rec.Body.String())
	if body != "[]" {
		t.Errorf("empty list serialized as %q, want %q", body, "[]")
	}
}

func TestNIMHandler_Get_HappyPath(t *testing.T) {
	want := nvidia.NIMEntry{
		ID: "nim-llm:1.3.0", Chart: "nim-llm", Version: "1.3.0",
		DisplayName: "nim-llm", Type: nvidia.TypeLLM,
		ChartRef: "oci://registry.suse.com/ai/charts/nvidia/nim-llm:1.3.0",
	}
	disco := &fakeDiscovery{getResult: want}
	h := newNIMHandlerForTest(disco)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nvidia/nims/nim-llm:1.3.0", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	var got nvidia.NIMEntry
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal: %v\nbody=%s", err, rec.Body.String())
	}
	if got.ID != want.ID || got.Chart != want.Chart {
		t.Errorf("Get response = %+v, want %+v", got, want)
	}
}

func TestNIMHandler_Get_NotFound_Returns404(t *testing.T) {
	disco := &fakeDiscovery{getErr: nvidia.ErrNIMNotFound}
	h := newNIMHandlerForTest(disco)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nvidia/nims/does-not-exist:9.9.9", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body=%s", rec.Code, rec.Body.String())
	}
	var apiErr APIError
	_ = json.Unmarshal(rec.Body.Bytes(), &apiErr)
	if apiErr.Code != ErrCodeNotFound {
		t.Errorf("error code = %q, want %q", apiErr.Code, ErrCodeNotFound)
	}
}

func TestNIMHandler_Profiles_Stub_ReturnsEmptyArray(t *testing.T) {
	disco := &fakeDiscovery{getResult: nvidia.NIMEntry{ID: "nim-llm:1.3.0"}}
	h := newNIMHandlerForTest(disco)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nvidia/nims/nim-llm:1.3.0/profiles", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	body := strings.TrimSpace(rec.Body.String())
	if body != "[]" {
		t.Errorf("profiles stub serialized as %q, want %q", body, "[]")
	}
}

func TestNIMHandler_Profiles_NIMNotFound_Returns404(t *testing.T) {
	disco := &fakeDiscovery{getErr: nvidia.ErrNIMNotFound}
	h := newNIMHandlerForTest(disco)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nvidia/nims/does-not-exist:9.9.9/profiles", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body=%s", rec.Code, rec.Body.String())
	}
}

func TestNIMHandler_Refresh_HappyPath(t *testing.T) {
	disco := &fakeDiscovery{indexResult: sampleNIMs()}
	h := newNIMHandlerForTest(disco)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/nvidia/refresh", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}

	var got refreshResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal: %v\nbody=%s", err, rec.Body.String())
	}
	if got.Count != 3 {
		t.Errorf("count = %d, want 3", got.Count)
	}
	if got.LastRefresh.IsZero() {
		t.Error("lastRefresh is zero")
	}
	if !disco.refreshCalled {
		t.Error("Refresh was not called on discovery")
	}
}

func TestNIMHandler_Refresh_NotConfigured_Returns400(t *testing.T) {
	disco := &fakeDiscovery{refreshErr: nvidia.ErrNotConfigured}
	h := newNIMHandlerForTest(disco)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/nvidia/refresh", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", rec.Code, rec.Body.String())
	}
	var apiErr APIError
	_ = json.Unmarshal(rec.Body.Bytes(), &apiErr)
	if apiErr.Code != ErrCodeInvalidInput {
		t.Errorf("error code = %q, want %q", apiErr.Code, ErrCodeInvalidInput)
	}
}

func TestNIMHandler_List_IndexError_Returns500(t *testing.T) {
	disco := &fakeDiscovery{indexErr: errors.New("internal error")}
	h := newNIMHandlerForTest(disco)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nvidia/nims", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500; body=%s", rec.Code, rec.Body.String())
	}
}

func TestNIMHandler_Refresh_PostRefreshIndexError_Returns500(t *testing.T) {
	disco := &fakeDiscovery{indexErr: errors.New("internal error")}
	h := newNIMHandlerForTest(disco)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/nvidia/refresh", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500; body=%s", rec.Code, rec.Body.String())
	}
}
