# dsh-plugin-devkit

> Scaffold a DSH plugin in one command, then run static checks that catch the traps you only learn by getting burned.
> 一条命令生成带测试和 CI 的插件骨架，再用静态检查拦住那些只能靠踩坑才知道的雷。

Zero runtime dependencies, Node >= 18. CLI name: `dpd`.

## Why

For DSH plugins, "it builds" does **not** mean "it installs and runs in a profile". Most incidents are learned the hard way: a stray backtick in a CSS template string breaks the whole bundle, `peerDependencies` pushes the package into a compatibility gate, a trailing slash on a route `prefix` causes 404s, a missing README translation fails review... `npm build` sees none of these.

`dpd` turns each real incident into a check: lay down the full contract at scaffold time, then体检 with one command before publishing.

## Install

```bash
npm install -g dsh-plugin-devkit
# or from a clone
node bin/dpd.mjs --help
```

## Four commands

```
dpd new <name> [--dir PATH] [--description TEXT] [--force]
    Generate a plugin skeleton that passes checks out of the box
    (test / CI / bilingual README), then self-check it immediately.

dpd check [dir] [--only ID,...] [--skip ID,...] [--json] [--list] [--why]
    Run 8 static checks on a plugin dir. --why explains each trap.

dpd doctor [dir]
    check + local environment diagnostics (Node, npm, DSH launcher, DSH_HOME).

dpd preflight [dir]
    Run the plugin's test/preflight-boot.mjs: boot DSH once with a throwaway
    profile. Do this before pointing the plugin at any real profile.
```

## The 8 checks

| id | Trap it catches |
|---|---|
| `css-template` | No stray backticks in CSS template strings |
| `static-inject` | Client bundle does not export a static `inject` |
| `manifest` | Packaging invariants (patch / manifest / files / exports) |
| `prefix-slash` | Route `prefix` has no trailing slash |
| `secrets` | No suspected secrets in the repo |
| `bilingual` | READMEs are paired EN/ZH with a version support table |
| `peer-gate` | `peerDependencies` won't push the package into a compat gate |
| `lazy-import` | No top-level import of a package missing at runtime |

`dpd check --why` prints the real incident behind each check. Adding a check = add a file in `lib/checks/` and register it in `index.mjs`; the CLI stays untouched.

## Self-test

```bash
node test/run.mjs
```

Two core guarantees:
1. Plugins from `dpd new` must pass `dpd check` clean — the scaffold must not teach bad habits;
2. Every check must catch its own trap — a check that only says "ok" is worse than none.

## License

MIT
