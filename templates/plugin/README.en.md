# {{pkgName}}

{{descriptionEn}}

> 简体中文：[README.md](README.md)

---

## What it does

_Say plainly what problem it solves for you._ One sentence, then a feature
table. Never "this is a plugin" — users want "why should I install this".

| Feature | Description |
|---|---|
| A footer button | Click it to see the plugin's own state |
| A read-only status endpoint | `GET /{{name}}/state`, for the client and for debugging |

## Supported DSH versions

| DSH version line | Status |
|---|---|
| `0.1.5-rc.x` | ✅ |
| `0.2.0-rc.x` | ✅ |

> This plugin deliberately declares **no `@deepseek-ai/*` peerDependencies**.
> The host side only takes services from `ctx`, and the client side uses dynamic
> injection exclusively. That way it can never be skipped wholesale by the DSH
> 0.2.0+ compatibility gate — a gate that silently drops any plugin whose
> peerDependencies do not resolve. The symptom is "installed, but nothing happens
> after a restart", with no error anywhere.

## Install

```sh
dsh plugin --profile web add <npm spec, or a path to this directory>
```

Local development (no network):

```sh
dsh plugin --profile web add link:<the directory you cloned>
```

**A DSH restart is required** — bundles are assembled during startup:

```sh
# stop the running dsh web, then
dsh web
```

### Installed but nothing changed?

The client bundle is served with
`cache-control: max-age=31536000, immutable`, and the `rev` in its URL is a
**process nonce** that does not change when the file's content does. The browser
keeps serving the copy it captured the first time. Press **Ctrl+Shift+R** (hard
reload) in a fresh window after installing or updating. A plain F5 is not enough.

## Usage

Once installed, a `{{name}}` button appears in the sidebar footer. Hovering it
shows the greeting the host side read.

To change the greeting, edit `config.greeting` in `cordis.patch.yml`, then restart
DSH.

## Development

```sh
npm test            # contract tests (mount declaration, bilingual README, no static inject…)
npm run check       # CSS backtick + client-boot invariants
npm run preflight   # actually boot DSH once on a throwaway profile, to prove you did not brick it
```

**Run `npm run preflight` before you ever point this plugin at a real profile.**
A plugin that never settles its fiber stops DSH from starting at all. Verifying
against a throwaway profile takes seconds; gambling on the production profile is
a different proposition.

## Known limitations

_Not writing this section would be dishonest._ One line is enough, but have one.

- No build output `lib/` is committed: this repo ships source, so
  artifact-level checks in `npm run check` will skip

## What might come next

- _Put your roadmap here. Anyone willing to help needs somewhere to start._

## License

MIT — see [LICENSE](LICENSE).