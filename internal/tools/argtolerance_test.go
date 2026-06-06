package tools

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// --- shared helper unit tests -------------------------------------------------

func TestAliasedStringArgPrefersPrimaryThenAliases(t *testing.T) {
	// primary present wins over aliases.
	got, err := aliasedStringArg(map[string]any{"path": "primary", "file": "alias"}, []string{"path", "file"}, "", true, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "primary" {
		t.Fatalf("expected primary value, got %q", got)
	}

	// primary missing -> first present alias is used.
	got, err = aliasedStringArg(map[string]any{"file": "alias"}, []string{"path", "file", "file_path"}, "", true, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "alias" {
		t.Fatalf("expected alias value, got %q", got)
	}

	// alias order is respected: first matching alias in the list wins.
	got, err = aliasedStringArg(map[string]any{"filename": "second", "file": "first"}, []string{"path", "file", "filename"}, "", true, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "first" {
		t.Fatalf("expected first alias by list order, got %q", got)
	}
}

func TestAliasedStringArgMissingRequiredUsesPrimaryKeyInError(t *testing.T) {
	_, err := aliasedStringArg(map[string]any{}, []string{"path", "file"}, "", true, false)
	if err == nil || err.Error() != "path is required" {
		t.Fatalf("expected \"path is required\", got %v", err)
	}
}

func TestAliasedStringArgMissingOptionalUsesFallback(t *testing.T) {
	got, err := aliasedStringArg(map[string]any{}, []string{"cwd", "dir"}, ".", false, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "." {
		t.Fatalf("expected fallback, got %q", got)
	}
}

func TestAliasedStringArgPresentNonStringErrorsWithPrimaryKey(t *testing.T) {
	// Type-strictness is preserved: a present-but-non-string under ANY matched key
	// errors using the PRIMARY key name, not the alias.
	_, err := aliasedStringArg(map[string]any{"file": 42}, []string{"path", "file"}, "", true, false)
	if err == nil || err.Error() != "path must be a string" {
		t.Fatalf("expected \"path must be a string\", got %v", err)
	}
}

func TestAliasedStringArgEmptySemantics(t *testing.T) {
	// allowEmpty=false rejects an empty string.
	_, err := aliasedStringArg(map[string]any{"path": ""}, []string{"path"}, "", true, false)
	if err == nil || err.Error() != "path must be a non-empty string" {
		t.Fatalf("expected non-empty error, got %v", err)
	}
	// allowEmpty=true accepts an empty string.
	got, err := aliasedStringArg(map[string]any{"path": ""}, []string{"path"}, "fallback", true, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "" {
		t.Fatalf("expected empty string preserved, got %q", got)
	}
}

func TestCoerceStringSliceShapes(t *testing.T) {
	// []string passes through.
	if got := coerceStringSlice([]string{"a", "b"}); len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("[]string = %v", got)
	}
	// []any of strings/scalars/objects.
	got := coerceStringSlice([]any{
		"plain",
		42.0,
		map[string]any{"label": "Modern"},
		map[string]any{"value": "Classic"},
	})
	if len(got) != 4 || got[0] != "plain" || got[1] != "42" || got[2] != "Modern" || got[3] != "Classic" {
		t.Fatalf("[]any = %v", got)
	}
	// newline-delimited string.
	if got := coerceStringSlice("A\r\nB\n\nC"); len(got) != 3 || got[0] != "A" || got[1] != "B" || got[2] != "C" {
		t.Fatalf("string = %v", got)
	}
	// nil -> nil, never errors.
	if got := coerceStringSlice(nil); got != nil {
		t.Fatalf("nil = %v", got)
	}
}

// --- per-tool alias acceptance tests -----------------------------------------

func TestReadFileToolAcceptsPathAliases(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "notes.txt"), "alpha\nbeta")
	for _, key := range []string{"file", "file_path", "filepath", "filename"} {
		res := NewReadFileTool(root).Run(context.Background(), map[string]any{key: "notes.txt"})
		if res.Status != StatusOK {
			t.Fatalf("alias %q: expected ok, got %s: %s", key, res.Status, res.Output)
		}
		if !strings.Contains(res.Output, "alpha") {
			t.Fatalf("alias %q: expected file contents, got %q", key, res.Output)
		}
	}
}

func TestListDirectoryToolAcceptsDirAliases(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "sub", "x.txt"), "data")
	for _, key := range []string{"directory", "dir"} {
		res := NewListDirectoryTool(root).Run(context.Background(), map[string]any{key: "sub"})
		if res.Status != StatusOK {
			t.Fatalf("alias %q: expected ok, got %s: %s", key, res.Status, res.Output)
		}
		if !strings.Contains(res.Output, "x.txt") {
			t.Fatalf("alias %q: expected listing, got %q", key, res.Output)
		}
	}
}

func TestGlobToolAcceptsPatternAndCwdAliases(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "sub", "a.go"), "package sub")
	// pattern aliases
	for _, key := range []string{"glob", "match", "query", "expression"} {
		res := NewGlobTool(root).Run(context.Background(), map[string]any{key: "**/*.go"})
		if res.Status != StatusOK {
			t.Fatalf("pattern alias %q: expected ok, got %s: %s", key, res.Status, res.Output)
		}
		if !strings.Contains(res.Output, "sub/a.go") {
			t.Fatalf("pattern alias %q: expected match, got %q", key, res.Output)
		}
	}
	// cwd aliases (scope the scan to sub/)
	for _, key := range []string{"dir", "directory", "path"} {
		res := NewGlobTool(root).Run(context.Background(), map[string]any{"pattern": "*.go", key: "sub"})
		if res.Status != StatusOK {
			t.Fatalf("cwd alias %q: expected ok, got %s: %s", key, res.Status, res.Output)
		}
		if strings.TrimSpace(res.Output) != "a.go" {
			t.Fatalf("cwd alias %q: expected a.go scoped match, got %q", key, res.Output)
		}
	}
}

func TestGrepToolAcceptsPatternAndPathAliases(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "sub", "main.go"), "func main() {}\n")
	for _, key := range []string{"query", "regex", "search", "expression"} {
		res := NewGrepTool(root).Run(context.Background(), map[string]any{key: "func main"})
		if res.Status != StatusOK {
			t.Fatalf("pattern alias %q: expected ok, got %s: %s", key, res.Status, res.Output)
		}
		if !strings.Contains(res.Output, "func main") {
			t.Fatalf("pattern alias %q: expected hit, got %q", key, res.Output)
		}
	}
	for _, key := range []string{"dir", "directory"} {
		res := NewGrepTool(root).Run(context.Background(), map[string]any{"pattern": "func main", key: "sub"})
		if res.Status != StatusOK {
			t.Fatalf("path alias %q: expected ok, got %s: %s", key, res.Status, res.Output)
		}
		if !strings.Contains(res.Output, "main.go") {
			t.Fatalf("path alias %q: expected hit, got %q", key, res.Output)
		}
	}
}

func TestWriteFileToolAcceptsPathAliases(t *testing.T) {
	root := t.TempDir()
	for _, key := range []string{"file", "file_path", "filename"} {
		res := NewWriteFileTool(root).Run(context.Background(), map[string]any{key: key + ".txt", "content": "x"})
		if res.Status != StatusOK {
			t.Fatalf("path alias %q: expected ok, got %s: %s", key, res.Status, res.Output)
		}
		if _, err := os.Stat(filepath.Join(root, key+".txt")); err != nil {
			t.Fatalf("path alias %q: expected file written: %v", key, err)
		}
	}
}

func TestEditFileToolAcceptsAliases(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "code.go")
	writeTestFile(t, path, "const a = 1\n")
	// path/old/new aliases all at once.
	res := NewEditFileTool(root).Run(context.Background(), map[string]any{
		"file": "code.go",
		"old":  "const a = 1",
		"new":  "const a = 2",
	})
	if res.Status != StatusOK {
		t.Fatalf("expected ok, got %s: %s", res.Status, res.Output)
	}
	got, _ := os.ReadFile(path)
	if string(got) != "const a = 2\n" {
		t.Fatalf("edit via aliases = %q", got)
	}

	// other alias spellings for old_string/new_string.
	writeTestFile(t, path, "const a = 1\n")
	res = NewEditFileTool(root).Run(context.Background(), map[string]any{
		"file_path": "code.go",
		"search":    "const a = 1",
		"replace":   "const a = 3",
	})
	if res.Status != StatusOK {
		t.Fatalf("expected ok, got %s: %s", res.Status, res.Output)
	}
	got, _ = os.ReadFile(path)
	if string(got) != "const a = 3\n" {
		t.Fatalf("edit via search/replace aliases = %q", got)
	}
}

func TestApplyPatchToolAcceptsDiffAlias(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "hello.txt"), "hello\nold\n")
	patch := strings.Join([]string{
		"diff --git a/hello.txt b/hello.txt",
		"--- a/hello.txt",
		"+++ b/hello.txt",
		"@@ -1,2 +1,2 @@",
		" hello",
		"-old",
		"+new",
		"",
	}, "\n")
	res := NewApplyPatchTool(root).Run(context.Background(), map[string]any{"diff": patch})
	if res.Status != StatusOK {
		t.Skipf("git apply unavailable or failed: %s", res.Output)
	}
	got, _ := os.ReadFile(filepath.Join(root, "hello.txt"))
	if strings.ReplaceAll(string(got), "\r\n", "\n") != "hello\nnew\n" {
		t.Fatalf("diff alias patched content = %q", got)
	}
}

func TestBashToolAcceptsCommandAliases(t *testing.T) {
	root := t.TempDir()
	for _, key := range []string{"cmd", "script", "shell"} {
		res := NewBashTool(root).Run(context.Background(), map[string]any{key: "echo hi"})
		if res.Status != StatusOK {
			t.Fatalf("command alias %q: expected ok, got %s: %s", key, res.Status, res.Output)
		}
		if !strings.Contains(res.Output, "hi") {
			t.Fatalf("command alias %q: expected echo output, got %q", key, res.Output)
		}
	}
}
