# Agentia Profile Trim

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 18+](https://img.shields.io/badge/node-%3E%3D18-blue.svg)](package.json)
[![Agentia 0.122](https://img.shields.io/badge/agentia-0.122.0--alpha.1-blue.svg)](https://developer.copado.com/docs)

**Profile Trim** reports noise in Profile XML with an optional safe
cleanup. Fully offline with zero org calls, perfect for pre commit use.

Smaller diffs, fewer conflicts. Built for the **Agentia Headless Virtual
Hackathon** as an oclif plugin.

---

## Table of Contents

- [The Problem](#the-problem)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Live Demo Workflow](#live-demo-workflow)
- [Command Reference](#command-reference)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [How It Works](#how-it-works)
- [Security](#security)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Hackathon Fit](#hackathon-fit)
- [License](#license)

---

## The Problem

Profile XML files carry noise that drowns real changes: trailing
whitespace from editors plus verbatim duplicated permission blocks from
merges. Reviews slow down, diffs bloat, and conflicts multiply over
lines nobody changed on purpose.

## Features

- **Two conservative rules** — trailing whitespace plus verbatim
  duplicate permission blocks only. Nothing semantic is ever touched.
- **Report by default** — counts plus rule names with zero writes
  unless `--write` is passed.
- **Safe apply** — `--write` requires `--out`, so the original file is
  never overwritten in place.
- **Format guard** — refuses non Profile XML instead of mangling it.
- **Fully offline** — no credentials, no network, no org calls.
- **Zero private imports** — pure local file work, not even a CLI call.

## Installation

### Prerequisites

- Node 18 or newer.
- Agentia CLI beta for plugin hosting: `npm install -g @copado/agentia-cli@beta`

### Install from source

```sh
git clone https://github.com/devkdas/agentia-profile-trim.git
cd agentia-profile-trim
npm install
npm run build
agentia plugins link .
```

Re-run `npm run build` after every change to the TypeScript files.

## Quick Start

### 1. Report noise

```sh
agentia profile trim --file ./Admin.profile-meta.xml --json
```

### 2. Apply to a new file

```sh
agentia profile trim --file ./Admin.profile-meta.xml --write --out ./Admin.clean.xml
```

## Live Demo Workflow

Verified live on a synthetic profile:

```text
1. agentia profile trim --file Admin.xml --json
   -> trailing-whitespace plus duplicate-blocks found with counts
2. Re-run with --write --out cleaned.xml
   -> original untouched, cleaned copy written
3. Missing file plus non XML inputs rejected with clear errors
```

## Command Reference

### `agentia profile trim`

| Flag | Description |
|---|---|
| `-f, --file <path>` | Local Profile XML file (required) |
| `-o, --out <path>` | Output path, required with `--write` |
| `--write` | Apply cleanup (default is report only) |
| `-j, --json` | Machine readable JSON output |

### `agentia profile compare`

| Flag | Description |
|---|---|
| `--file-a/--file-b <path>` | Older plus newer local Profile XML files |
| `-p, --profile <name>` | Profile API name for org mode |
| `--source-credential-id/--source-org-id` | Source org pair for org mode |
| `--target-credential-id/--target-org-id` | Target org pair for org mode |
| `--pipeline-id` | Pipeline ID scoping gateway calls |
| `-j, --json` | Machine readable JSON output |

Diffs two profiles grant by grant into added, removed and changed sets
with before plus after values. File mode is fully offline. Org mode
fetches both ends read only.

## Configuration

None. The two cleanup rules are fixed and documented so output stays
predictable across machines and CI runners.

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Refuses the file | Not Profile XML | Pass a real `*.profile-meta.xml` file |
| Zero findings | Already clean file | Correct behavior, nothing to do |
| `--write` without `--out` | Safety interlock | Originals are never overwritten in place |
| ESM auto-transpile warning | Linked ESM plugin notice | Benign, compiled output is used |

## How It Works

```text
agentia profile trim --file
  -> format guard (Profile XML or refuse)
  -> trailing whitespace plus duplicate block scan
  -> report, or cleaned copy with --write --out
```

## Security

No network, no credentials, no org access. The original file is never
modified. Review the report before applying anything.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript on Node 18+ |
| CLI Framework | oclif v4 (ESM, matching the host CLI) |
| Runtime calls | None. Pure local file processing. |

## Architecture

```text
Developer / CI gate
       |
agentia profile trim --file [--write --out]
       |
Profile Trim (this plugin)
  |- guard   -> Profile XML check
  |- scan    -> whitespace plus duplicate rules
  |- writer  -> cleaned copy, original untouched
       |
Report plus optional cleaned file
```

## Hackathon Fit

Improves productivity plus reliability at the laptop layer where
pipelines cannot reach, with deterministic output safe for pre commit
use.

## License

MIT License — see [LICENSE](LICENSE) for details.
