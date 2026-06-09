package zeroline

import (
	"strings"
	"testing"

	"github.com/charmbracelet/lipgloss"
)

func TestHomeWordmarkTaglineHintChips(t *testing.T) {
	d := HomeData{
		Variant: 0, Dark: true, Width: 90, Height: 30,
		Header:    Header{Model: "claude-sonnet-4-5"},
		Chips:     []string{"Add a --version flag", "Why is go vet failing?", "Create hello.txt"},
		ChipIndex: 1,
	}
	out := RenderHome(d)
	if h := lipgloss.Height(out); h != 30 {
		t.Fatalf("home height = %d, want 30 (frame-exact)", h)
	}
	for _, line := range strings.Split(out, "\n") {
		if lipgloss.Width(line) > 90 {
			t.Fatalf("home line exceeds width 90: %d (%q)", lipgloss.Width(line), stripANSI(line))
		}
	}
	plain := stripANSI(out)
	for _, want := range []string{
		"std-lib-first", "running", "zero", "against", "claude-sonnet-4-5",
		"Add a --version flag", "Why is go vet failing?", "Create hello.txt", "❯",
	} {
		if !strings.Contains(plain, want) {
			t.Errorf("home missing %q", want)
		}
	}
}

func TestHomeChipSelectionHighlighted(t *testing.T) {
	s := newCanvasStyles(Resolve(0, true), 0, true)
	sel := stripANSI(s.chipRow("do a thing", true, 50))
	un := stripANSI(s.chipRow("do a thing", false, 50))
	if sel == un {
		t.Fatal("selected chip must differ from unselected in plain text (tests have no color)")
	}
	if !strings.Contains(sel, "▌") {
		t.Errorf("selected chip should show the accent rail, got %q", sel)
	}
	if strings.Contains(un, "▌") {
		t.Errorf("unselected chip should not show the rail, got %q", un)
	}
	for _, c := range []string{sel, un} {
		if !strings.Contains(c, "❯") || !strings.Contains(c, "do a thing") {
			t.Errorf("chip must carry arrow + label, got %q", c)
		}
	}
}
