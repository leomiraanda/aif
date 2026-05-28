package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	aifv1 "github.com/SUSE/aif/api/v1alpha1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// blueprintRepository is the consumer-defined port the handler needs from
// pkg/blueprint. Holding ≤4 methods (ISP) keeps it narrow:
//   - Create persists a new Blueprint CR
//   - Delete removes a Blueprint CR by name
//   - FindByLineageVersion looks up by ({lineage}, {version}) — used by
//     PATCH/DELETE which address the CR via path segments rather than name
//   - UpdateStatus persists status changes (deprecate / undeprecate)
//
// Satisfied by *blueprint.k8sRepository and *blueprint.FakeRepository.
type blueprintRepository interface {
	Create(ctx context.Context, bp *aifv1.Blueprint) error
	Delete(ctx context.Context, name string) error
	FindByLineageVersion(ctx context.Context, lineage, version string) (*aifv1.Blueprint, error)
	UpdateStatus(ctx context.Context, bp *aifv1.Blueprint) error
}

// blueprintDeploymentCounter checks how many Workloads reference a given
// Blueprint version. The DELETE handler refuses to proceed while the count is
// non-zero to avoid orphaning live workloads.
//
// Satisfied by *workload.k8sRepository (.AsDeploymentCounter()) and tests'
// fakeBlueprintCounter.
type blueprintDeploymentCounter interface {
	CountByBlueprint(ctx context.Context, name, version string) (int32, error)
}

// BlueprintsHandler serves the Blueprint write endpoints: POST (create),
// PATCH (deprecate/undeprecate), DELETE (delete). Reads flow through the
// Steve store (direct K8s API) from the UI, so there is no GET here.
//
// Blueprint is cluster-scoped, so SAR checks pass namespace="" — the
// RequireResource middleware handles that via a nil ResourceSelector.
//
// checker may be nil; when nil, SAR enforcement is skipped (useful for tests
// that drive the handler directly without authorization concerns). Production
// wiring in cmd/operator always supplies the SAR-backed checker.
type BlueprintsHandler struct {
	repo           blueprintRepository
	counter        blueprintDeploymentCounter
	authMiddleware *AuthMiddleware
	checker        AuthChecker
	logger         *slog.Logger
}

// NewBlueprintsHandler constructs a BlueprintsHandler. counter must be
// supplied — DELETE guards against active workloads before allowing the
// removal. checker may be nil; see type doc.
func NewBlueprintsHandler(repo blueprintRepository, counter blueprintDeploymentCounter, checker AuthChecker, logger *slog.Logger) *BlueprintsHandler {
	h := &BlueprintsHandler{
		repo:    repo,
		counter: counter,
		checker: checker,
		logger:  logger,
	}
	if checker != nil {
		h.authMiddleware = NewAuthMiddleware(checker)
	}
	return h
}

// Register wires this handler's routes onto the provided mux. PATCH/DELETE
// run through RequireResource (the namespace selector is nil because
// Blueprint is cluster-scoped). POST is wrapped in a thin guard that
// performs the SAR before invoking the handler — same shape, no
// path-derived namespace.
func (h *BlueprintsHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/blueprints", h.guard("create", h.create))
	mux.HandleFunc("PATCH /api/v1/blueprints/{name}/{version}", h.guard("update", h.deprecate))
	mux.HandleFunc("DELETE /api/v1/blueprints/{name}/{version}", h.guard("delete", h.delete))
}

// guard wraps next in a cluster-scoped SAR (namespace="") for verb on
// "blueprints" (ai.suse.com group). When the handler has no checker (test
// setups), the wrapper is a no-op — handlers still self-check that
// Impersonate-User is present so the 403-on-missing-user contract is
// preserved.
func (h *BlueprintsHandler) guard(verb string, next http.HandlerFunc) http.HandlerFunc {
	if h.authMiddleware == nil {
		return next
	}
	return h.authMiddleware.RequireResource("ai.suse.com", verb, "blueprints", nil, next)
}

// createBlueprintRequest mirrors the minimal fields needed to create a
// Blueprint CR. PublishedBy is intentionally absent — the handler stamps it
// from the Impersonate-User header so callers cannot spoof authorship.
type createBlueprintRequest struct {
	BlueprintName     string                `json:"blueprintName"`
	Version           string                `json:"version"`
	UseCase           string                `json:"useCase,omitempty"`
	Description       string                `json:"description,omitempty"`
	ChangeDescription string                `json:"changeDescription,omitempty"`
	Source            aifv1.BlueprintSource `json:"source"`
	Components        []aifv1.ComponentRef  `json:"components"`
	ValueOverrides    map[string]string     `json:"valueOverrides,omitempty"`
}

func (h *BlueprintsHandler) create(w http.ResponseWriter, r *http.Request) {
	user, _ := ExtractUser(r)
	if user == "" {
		writeError(w, http.StatusForbidden, fmt.Errorf("%w: Impersonate-User header missing", ErrForbidden))
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var req createBlueprintRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("%w: invalid request body: %v", ErrInvalidInput, err))
		return
	}
	if req.BlueprintName == "" || req.Version == "" || len(req.Components) == 0 {
		writeError(w, http.StatusBadRequest, fmt.Errorf("%w: blueprintName, version, and components are required", ErrInvalidInput))
		return
	}

	crName := req.BlueprintName + "." + req.Version
	bp := &aifv1.Blueprint{
		ObjectMeta: metav1.ObjectMeta{
			Name: crName,
			Labels: map[string]string{
				"ai.suse.com/blueprint-name":    req.BlueprintName,
				"ai.suse.com/blueprint-version": req.Version,
				"ai.suse.com/blueprint-source":  "published",
			},
		},
		Spec: aifv1.BlueprintSpec{
			BlueprintName:     req.BlueprintName,
			Version:           req.Version,
			UseCase:           req.UseCase,
			Description:       req.Description,
			ChangeDescription: req.ChangeDescription,
			Source:            req.Source,
			Components:        req.Components,
			ValueOverrides:    req.ValueOverrides,
			PublishedBy:       user,
			PublishedAt:       metav1.NewTime(time.Now().UTC()),
		},
	}

	if err := h.repo.Create(r.Context(), bp); err != nil {
		if apierrors.IsAlreadyExists(err) {
			writeError(w, http.StatusConflict, fmt.Errorf("%w: blueprint %s already exists", ErrConflict, crName))
			return
		}
		LoggerFromContext(r.Context()).Error("create blueprint failed", "name", crName, "error", err)
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}

	LoggerFromContext(r.Context()).Info("blueprint created", "name", crName, "user", user)
	writeJSON(w, http.StatusCreated, bp)
}

// deprecateRequest is the PATCH body — a single boolean toggle. true sets
// the phase to Deprecated and records who/when; false reverts to Active and
// clears the deprecation block.
type deprecateRequest struct {
	Deprecated bool `json:"deprecated"`
}

func (h *BlueprintsHandler) deprecate(w http.ResponseWriter, r *http.Request) {
	user, _ := ExtractUser(r)
	if user == "" {
		writeError(w, http.StatusForbidden, fmt.Errorf("%w: Impersonate-User header missing", ErrForbidden))
		return
	}

	lineage := r.PathValue("name")
	version := r.PathValue("version")

	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	var req deprecateRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("%w: invalid request body: %v", ErrInvalidInput, err))
		return
	}

	bp, err := h.repo.FindByLineageVersion(r.Context(), lineage, version)
	if err != nil {
		if apierrors.IsNotFound(err) {
			writeError(w, http.StatusNotFound, fmt.Errorf("%w: blueprint %s.%s", ErrNotFound, lineage, version))
			return
		}
		LoggerFromContext(r.Context()).Error("find blueprint failed", "lineage", lineage, "version", version, "error", err)
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}

	if req.Deprecated {
		bp.Status.Phase = aifv1.BlueprintPhaseDeprecated
		bp.Status.Deprecation = &aifv1.DeprecationStatus{
			ActionedBy: user,
			ActionedAt: metav1.NewTime(time.Now().UTC()),
		}
	} else {
		bp.Status.Phase = aifv1.BlueprintPhaseActive
		bp.Status.Deprecation = nil
	}

	if err := h.repo.UpdateStatus(r.Context(), bp); err != nil {
		LoggerFromContext(r.Context()).Error("deprecate blueprint failed", "name", bp.Name, "error", err)
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}

	LoggerFromContext(r.Context()).Info("blueprint deprecation toggled",
		"name", bp.Name, "deprecated", req.Deprecated, "user", user)
	writeJSON(w, http.StatusOK, bp)
}

func (h *BlueprintsHandler) delete(w http.ResponseWriter, r *http.Request) {
	user, _ := ExtractUser(r)
	if user == "" {
		writeError(w, http.StatusForbidden, fmt.Errorf("%w: Impersonate-User header missing", ErrForbidden))
		return
	}

	lineage := r.PathValue("name")
	version := r.PathValue("version")

	bp, err := h.repo.FindByLineageVersion(r.Context(), lineage, version)
	if err != nil {
		if apierrors.IsNotFound(err) {
			writeError(w, http.StatusNotFound, fmt.Errorf("%w: blueprint %s.%s", ErrNotFound, lineage, version))
			return
		}
		LoggerFromContext(r.Context()).Error("find blueprint failed", "lineage", lineage, "version", version, "error", err)
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}

	count, err := h.counter.CountByBlueprint(r.Context(), lineage, version)
	if err != nil {
		LoggerFromContext(r.Context()).Error("count workloads failed", "lineage", lineage, "version", version, "error", err)
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}
	if count > 0 {
		writeError(w, http.StatusConflict, fmt.Errorf("%w: %d workload(s) still reference blueprint %s.%s", ErrConflict, count, lineage, version))
		return
	}

	if err := h.repo.Delete(r.Context(), bp.Name); err != nil {
		// Lost-update race: another caller deleted the Blueprint between our
		// FindByLineageVersion and Delete. Treat as success-equivalent for
		// the client (the resource is gone either way) but log it.
		if apierrors.IsNotFound(err) {
			LoggerFromContext(r.Context()).Info("blueprint already deleted by concurrent caller",
				"name", bp.Name, "user", user)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		LoggerFromContext(r.Context()).Error("delete blueprint failed", "name", bp.Name, "error", err)
		writeError(w, http.StatusInternalServerError, ErrInternal)
		return
	}

	LoggerFromContext(r.Context()).Info("blueprint deleted", "name", bp.Name, "user", user)
	w.WriteHeader(http.StatusNoContent)
}

// Compile-time assertion that BlueprintsHandler satisfies api.Handler.
var _ Handler = (*BlueprintsHandler)(nil)
