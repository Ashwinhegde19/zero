# zero

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## Provider catalog

Providers and gateways are discovered from descriptor files in `src/providers/catalog/definitions`.
Add one file there for an OpenAI-compatible provider or gateway; set `kind` to
`provider` or `gateway` in the descriptor. The TUI `/provider` flow picks it up
without another source edit.

First-party model metadata lives separately in `src/providers/catalog/models`.
Only add a model file when the model should be globally reusable across routes.

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
