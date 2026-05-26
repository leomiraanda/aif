package git_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"path/filepath"
	"sync"
	"testing"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"

	"github.com/SUSE/aif/pkg/git"
)

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestEngine_ErrNotConfiguredWhenRepoURLEmpty(t *testing.T) {
	e := git.NewEngine(quietLogger())
	_, err := e.Push(context.Background(), git.PushRequest{})
	if !errors.Is(err, git.ErrNotConfigured) {
		t.Fatalf("got %v, want ErrNotConfigured", err)
	}
}

func TestEngine_PushAndNoOp(t *testing.T) {
	bareURL := newSeededBareRepo(t, "main")

	e := git.NewEngine(quietLogger())
	e.UpdateSettings(git.EngineSettings{RepoURL: bareURL, Branch: "main"})

	req := git.PushRequest{
		Subtrees: []git.ManifestSubtree{{
			Path:  "gitops/cluster-a/wl-1",
			Files: map[string][]byte{"manifests/00-namespace.yaml": []byte("kind: Namespace\n")},
		}},
		CommitMessage: "aif: apply workload wl-1",
		AuthorName:    "AIF Operator",
		AuthorEmail:   "aif-operator@suse.com",
	}
	res, err := e.Push(context.Background(), req)
	if err != nil {
		t.Fatalf("first Push: %v", err)
	}
	if res.NoOp || res.CommitSHA == "" {
		t.Fatalf("expected commit on first push; got %+v", res)
	}

	res2, err := e.Push(context.Background(), req)
	if err != nil {
		t.Fatalf("second Push: %v", err)
	}
	if !res2.NoOp {
		t.Fatalf("expected NoOp on identical push; got %+v", res2)
	}
}

func TestEngine_ConcurrentPushSerializes(t *testing.T) {
	bareURL := newSeededBareRepo(t, "main")

	e := git.NewEngine(quietLogger())
	e.UpdateSettings(git.EngineSettings{RepoURL: bareURL, Branch: "main"})

	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			req := git.PushRequest{
				Subtrees: []git.ManifestSubtree{{
					Path:  "gitops/c/wl",
					Files: map[string][]byte{"f.yaml": []byte("v: " + string(rune('a'+i)) + "\n")},
				}},
				CommitMessage: "aif: concurrent " + string(rune('a'+i)),
			}
			_, err := e.Push(context.Background(), req)
			errs <- err
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent Push error: %v", err)
		}
	}
}

// newSeededBareRepo creates a bare repo on disk, seeds it with one commit
// on the named branch, and returns the file:// URL. The engine clones
// with SingleBranch:true so the branch must exist before Push runs.
func newSeededBareRepo(t *testing.T, branch string) string {
	t.Helper()

	bareDir := filepath.Join(t.TempDir(), "bare.git")
	if _, err := gogit.PlainInit(bareDir, true); err != nil {
		t.Fatalf("PlainInit bare: %v", err)
	}

	// Build a working repo and push a seed commit into the bare.
	workDir := t.TempDir()
	work, err := gogit.PlainInit(workDir, false)
	if err != nil {
		t.Fatalf("PlainInit work: %v", err)
	}
	if _, err := work.CreateRemote(&config.RemoteConfig{
		Name: "origin",
		URLs: []string{"file://" + bareDir},
	}); err != nil {
		t.Fatalf("CreateRemote: %v", err)
	}

	wt, err := work.Worktree()
	if err != nil {
		t.Fatalf("Worktree: %v", err)
	}
	readme, err := wt.Filesystem.Create("README")
	if err != nil {
		t.Fatalf("create README: %v", err)
	}
	if _, err := readme.Write([]byte("seed\n")); err != nil {
		t.Fatalf("write README: %v", err)
	}
	_ = readme.Close()

	if _, err := wt.Add("README"); err != nil {
		t.Fatalf("Add: %v", err)
	}
	sig := &object.Signature{Name: "seed", Email: "seed@example.com"}
	hash, err := wt.Commit("seed", &gogit.CommitOptions{Author: sig, Committer: sig})
	if err != nil {
		t.Fatalf("Commit: %v", err)
	}

	// Force the local ref to refs/heads/<branch>, then push it.
	ref := plumbing.NewHashReference(plumbing.NewBranchReferenceName(branch), hash)
	if err := work.Storer.SetReference(ref); err != nil {
		t.Fatalf("SetReference: %v", err)
	}
	if err := work.Push(&gogit.PushOptions{
		RemoteName: "origin",
		RefSpecs: []config.RefSpec{
			config.RefSpec("refs/heads/" + branch + ":refs/heads/" + branch),
		},
	}); err != nil && !errors.Is(err, gogit.NoErrAlreadyUpToDate) {
		t.Fatalf("seed push: %v", err)
	}

	return "file://" + bareDir
}
