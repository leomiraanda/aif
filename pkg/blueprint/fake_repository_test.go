package blueprint

import "testing"

func TestFakeRepository_ImplementsWrappedBlueprintStore(t *testing.T) {
	var _ WrappedBlueprintStore = NewFakeRepository()
}
