package controller

import (
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/events"
)

// fakeRecorder implements events.EventRecorder for testing
type fakeRecorder struct {
	events []string
}

func (f *fakeRecorder) Eventf(regarding runtime.Object, related runtime.Object, eventtype, reason, action, note string, args ...interface{}) {
	message := fmt.Sprintf(note, args...)
	f.events = append(f.events, eventtype+":"+reason+":"+message)
}

var _ events.EventRecorder = &fakeRecorder{}

// findCondition finds a condition by type in a condition list
//
//nolint:unused // Used in test files
func findCondition(conditions []metav1.Condition, condType string) *metav1.Condition {
	for i := range conditions {
		if conditions[i].Type == condType {
			return &conditions[i]
		}
	}
	return nil
}

// containsEventReason checks if an event string contains the given reason
//
//nolint:unused // Used in test files
func containsEventReason(event, reason string) bool {
	parts := strings.Split(event, ":")
	if len(parts) >= 2 {
		return parts[1] == reason
	}
	return false
}
