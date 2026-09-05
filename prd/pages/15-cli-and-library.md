# CLI & Library API

> **Surfaces:** the `test-gen` command-line binary, and the `tester-lab` package used programmatically
> **Module:** Generation Engine
> **Access:** Local process — no authentication, no accounts, no database
> **Source:** `src/cli/index.ts`, `src/index.ts`, `scripts/generate-yaml.ts`, `examples/`

## Overview

The same generation engine the web product uses, available without the web product. A team can keep
scenarios as files in their repository and generate test scripts in a build step, or embed the
generator in their own tooling — with no server, no Supabase, and no account.

This is also the scope boundary the project publishes: the engine, the CLI, and the library are
open-source under AGPL-3.0; the managed multi-tenant service around them is developed separately.

## CLI: `test-gen`

Installed as a binary by the package; also runnable directly from the built output.

### `test-gen generate`

Generates a test script from a scenario file.

| Option | Required | Description |
| :-- | :-: | :-- |
| `-c, --config <path>` | Yes | Path to a JSON or YAML DSL file; the format is detected from the extension |
| `-o, --out <path>` | No | Where to write the generated script; parent directories are created |
| `-d, --dry-run` | No | Execute the script headlessly after generating, with self-healing |

**Output:** a generation summary (one line per step, showing the action, the matched target, the
chosen locator, and the score), then any warnings, then the dry-run verdict if requested, then the
full generated code.

**Exit codes:** `0` on success; `1` if the config file is missing, if generation failed validation, or
on any fatal error. A *failed dry run does not fail the command* — it is reported but the exit code
stays 0, which matters for anyone wiring this into CI expecting a non-zero signal.

### `test-gen inspect`

| Option | Required | Description |
| :-- | :-: | :-- |
| `-u, --url <url>` | Yes | Page to crawl |

Prints every interactive candidate the crawler found, with all of its attributes — the diagnostic tool
for "why did it match that element?".

## Library API

The package exports the full pipeline and each stage individually:

| Export | Purpose |
| :-- | :-- |
| `TestScriptGenerator` | The orchestrator — `generate(dsl, { outPath, dryRun })` runs all six stages |
| `validateDSL` | Schema validation and normalisation, standalone |
| `DOMExtractor` | The headless crawler |
| `HeuristicMatcher` | Step-to-element matching |
| `CodeGenerator` | Template rendering and formatting |
| `DryRunEngine` | Headless verification with self-healing |
| *types* | The full domain type surface — DSL, candidates, resolved steps, results |

`generate` returns success, the code, the resolved steps, warnings, logs, and — when a dry run
ran — whether it passed and any error.

## Supporting scripts

| Script | Purpose |
| :-- | :-- |
| `npm run demo` | Serves a local demo target application to generate against |
| `npm run gen-yaml` | Helper for producing YAML scenario files |
| `npm test` | Builds the project, then runs the repository's security checks |

An example YAML scenario for a Google Form survey ships in `examples/`.

## Differences from the hosted product

| Aspect | Web product | CLI / library |
| :-- | :-- | :-- |
| Authentication | Required, approval-gated | None |
| Folder | Mandatory | Not applicable |
| History | Every generation and run recorded | Nothing persisted |
| Video | Recorded and stored for runs | Not applicable — the CLI does not run tests, only dry-runs them |
| Concurrency | Server-side queue | Whatever the caller does |
| Code sanitizer | Enforced on execution and dry runs | Enforced on dry runs |
| Output | Returned to the browser | Printed, and optionally written to a file |

## Business Rules

- **Same engine, same results.** The CLI, the library, and the API share one implementation, so a
  script generated in CI is identical to one generated in the workspace from the same DSL.
- **Nothing leaves the machine except the crawl itself.** The only outbound traffic is the headless
  browser visiting the target URL.
- **YAML and JSON are interchangeable** at every entry point, and the normaliser accepts common
  variants (`type`/`input` for `fill`, `target` for `targetLabel`, missing step numbers).
- **Dry runs execute real code and are sanitised accordingly**, including any self-healed variant.
- **The published scope is the engine.** Multi-tenant key management, quotas, the dashboard, and
  distributed execution orchestration are explicitly outside this repository.
