package helm_oci

import (
	"bytes"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestReadAllLimited_WithinLimit(t *testing.T) {
	body := []byte("hello world")
	got, err := ReadAllLimited(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !bytes.Equal(got, body) {
		t.Fatalf("got %q, want %q", got, body)
	}
}

func TestReadAllLimited_ExactLimit(t *testing.T) {
	body := []byte("abcdef")
	got, err := ReadAllLimited(bytes.NewReader(body), 6)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !bytes.Equal(got, body) {
		t.Fatalf("got %q, want %q", got, body)
	}
}

func TestReadAllLimited_ExceedsLimit(t *testing.T) {
	body := strings.Repeat("x", 100)
	_, err := ReadAllLimited(strings.NewReader(body), 10)
	if err == nil {
		t.Fatalf("expected error for stream exceeding limit, got nil")
	}
	if !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("expected 'exceeds' in error, got: %v", err)
	}
}

type errReader struct{ err error }

func (r *errReader) Read(_ []byte) (int, error) { return 0, r.err }

func TestReadAllLimited_ReadError_Wrapped(t *testing.T) {
	sentinel := errors.New("disk on fire")
	_, err := ReadAllLimited(&errReader{err: sentinel}, 100)
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected wrapped sentinel, got: %v", err)
	}
}

func TestReadAllLimited_ZeroLimit(t *testing.T) {
	// Edge case: a zero limit should still allow an empty stream through.
	got, err := ReadAllLimited(bytes.NewReader(nil), 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("got %d bytes, want 0", len(got))
	}
}

// io.Reader interface compliance check (for documentation, not test
// execution). Keeps the io import live if tests are pruned.
var _ io.Reader = (*errReader)(nil)
