package publish

import (
	"context"
	"log/slog"

	"github.com/SUSE/aif/pkg/blueprint"
	"github.com/SUSE/aif/pkg/bundle"
)

type Workflow interface {
	Submit(ctx context.Context, namespace, name string, req SubmitRequest) (bundle.Bundle, error)
	Withdraw(ctx context.Context, namespace, name string, user string) (bundle.Bundle, error)
	RequestChanges(ctx context.Context, namespace, name string, req ReviewRequest) (bundle.Bundle, error)
	Approve(ctx context.Context, namespace, name string, req ApproveRequest) (PublishedBlueprintRef, error)
}

type SubmitRequest struct {
	User              string
	ProposedVersion   string
	ChangeDescription string
}

type ApproveRequest struct {
	User string
}

type ReviewRequest struct {
	User    string
	Comment string
}

type Authorizer interface {
	Allowed(ctx context.Context, user, verb, resource string) (bool, error)
}

type Deps struct {
	Bundles    bundle.Repository
	Blueprints blueprint.Repository
	Authz      Authorizer
	Logger     *slog.Logger
}

type AllowAllAuthorizer struct{}

func (AllowAllAuthorizer) Allowed(_ context.Context, _, _, _ string) (bool, error) {
	return true, nil
}
