package helm_oci

import (
	"fmt"
	"io"
)

// ReadAllLimited reads from r up to limit bytes and returns the buffer.
// If the stream contains more than limit bytes, returns an error rather
// than truncating — defense against malicious or misconfigured upstreams
// that could otherwise stream unbounded payloads into memory.
//
// Read errors from r are returned wrapped so callers can branch via
// errors.Is on whatever sentinel the underlying reader exposes.
func ReadAllLimited(r io.Reader, limit int64) ([]byte, error) {
	lr := &io.LimitedReader{R: r, N: limit + 1}
	buf, err := io.ReadAll(lr)
	if err != nil {
		return nil, fmt.Errorf("helm_oci: read body: %w", err)
	}
	if int64(len(buf)) > limit {
		return nil, fmt.Errorf("helm_oci: stream exceeds %d-byte limit", limit)
	}
	return buf, nil
}
