package agent

import (
	"testing"
)

func TestOptionsDeferThresholdFieldExists(t *testing.T) {
	options := Options{DeferThreshold: 10}
	if options.DeferThreshold != 10 {
		t.Fatalf("expected DeferThreshold 10, got %d", options.DeferThreshold)
	}
}

func TestToolResultLoadedToolsField(t *testing.T) {
	result := ToolResult{LoadedTools: []string{"Alpha", "Beta"}}
	if len(result.LoadedTools) != 2 || result.LoadedTools[0] != "Alpha" || result.LoadedTools[1] != "Beta" {
		t.Fatalf("expected LoadedTools [Alpha Beta], got %#v", result.LoadedTools)
	}
	// Default zero value is nil for an ordinary result.
	if (ToolResult{}).LoadedTools != nil {
		t.Fatalf("expected nil LoadedTools by default")
	}
}
