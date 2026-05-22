package workload_test

import (
	"fmt"

	"github.com/SUSE/aif/pkg/workload"
)

func Example_mapFleetStateToPhase() {
	for _, s := range []string{"Ready", "Modified", "ErrApplied", "Pending", ""} {
		fmt.Printf("%-10s -> %s\n", s, workload.MapFleetStateToPhase(s))
	}
	// Output:
	// Ready      -> Running
	// Modified   -> Running
	// ErrApplied -> Failed
	// Pending    -> Deploying
	//            -> Deploying
}
