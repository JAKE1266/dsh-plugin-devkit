/**
 * test/run.mjs — 插件的测试入口。
 *
 * 刻意不引任何测试框架：这么一个仓库不该为了三个断言拖进一个依赖树。
 * 加测试 = 在 TESTS 里加一项 { title, fn }，fn 里用 assert 系列函数。
 * 失败时打印是哪一项、第几行、期望什么、实际什么，然后退出码非零。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

function assert(cond, message) {
  if (!cond) throw new Error(message)
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message ?? 'not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
function ok(cond, message) {
  if (!cond) throw new Error(message ?? 'not ok')
}

/** 读 package.json 并解析，失败时测试直接失败。 */
function readPkg() {
  const text = readFileSync(join(root, 'package.json'), 'utf8')
  return JSON.parse(text)
}

const TESTS = [
  {
    title: 'package.json 可解析且 type 为 module',
    fn: () => {
      const pkg = readPkg()
      ok(pkg.name && pkg.name.startsWith('dsh-'), `name 应为 dsh- 开头，实际 ${pkg.name}`)
      equal(pkg.type, 'module', '缺少 "type": "module"')
    },
  },
  {
    title: '挂载契约：dsh.bundle.patch 与 cordis.patch.yml 的 insert id 一致',
    fn: () => {
      const pkg = readPkg()
      ok(pkg.dsh?.bundle?.patch, 'package.json 缺 dsh.bundle.patch')
      ok(existsSync(join(root, 'cordis.patch.yml')), '缺 cordis.patch.yml')
      const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
      const ids = [...patch.matchAll(/^\s*-?\s*id:\s*([^\s#]+)/gm)].map((m) => m[1])
      ok(ids.includes(pkg.name), `cordis.patch.yml 的 insert id (${ids.join(', ') || 'none'}) 与包名不一致`)
    },
  },
  {
    title: 'files 数组包含 cordis.patch.yml（否则发布包里没有挂载声明）',
    fn: () => {
      const pkg = readPkg()
      ok(Array.isArray(pkg.files), 'package.json 没有 files 数组')
      ok(pkg.files.includes('cordis.patch.yml'), 'files 数组里没有 cordis.patch.yml')
    },
  },
  {
    title: '没有声明必选的 @deepseek-ai/* peerDependencies（版本闸门会静默整包跳过）',
    fn: () => {
      const pkg = readPkg()
      const peers = Object.keys(pkg.peerDependencies ?? {})
      const optional = pkg.peerDependenciesMeta ?? {}
      for (const dep of peers) {
        const required = !optional[dep]?.optional
        ok(
          !(required && dep.startsWith('@deepseek-ai/')),
          `${dep} 是必选宿主 peer 依赖 —— 版本对不上时整包被静默跳过`,
        )
      }
    },
  },
  {
    title: 'README 中英成对',
    fn: () => {
      ok(existsSync(join(root, 'README.md')), '缺 README.md')
      ok(
        existsSync(join(root, 'README.en.md')) || existsSync(join(root, 'README.zh-CN.md')),
        '缺 README.en.md 或 README.zh-CN.md —— 另一语言的用户读不到文档',
      )
    },
  },
  {
    title: 'host 侧入口 export 了 apply',
    fn: () => {
      const text = readFileSync(join(root, 'src', 'host', 'index.js'), 'utf8')
      ok(/export\s+function\s+apply\b/.test(text) || /export\s*\{[^}]*\bapply\b/.test(text), 'src/host/index.js 没有 export apply')
    },
  },
  {
    title: 'client 侧入口没有静态 inject',
    fn: () => {
      const text = readFileSync(join(root, 'src', 'client', 'index.ts'), 'utf8')
      ok(!/^\s*(?:export\s+)?(?:const|let|var|function)\s+inject\b/m.test(text), '源码里出现了静态 inject')
      ok(!/\binject\s*:\s*\[/m.test(text), '源码里出现了 inject: [...] 静态声明')
    },
  },
  {
    title: 'CSS 样式表里没有游离的反引号',
    fn: () => {
      const stylesPath = join(root, 'src', 'client', 'styles.ts')
      if (!existsSync(stylesPath)) return
      const lines = readFileSync(stylesPath, 'utf8').split(/\r?\n/)
      const entry = /^\s*(?:export\s+)?(?:const|let|var)\s+CSS\s*=\s*`/
      const close = /^\s*`\s*;?\s*$/
      let inside = false
      let bad = 0
      for (const line of lines) {
        if (!inside) {
          if (entry.test(line)) inside = true
          continue
        }
        if (close.test(line)) {
          inside = false
          continue
        }
        if (line.includes('`')) bad += 1
      }
      ok(!inside, 'CSS 模板字符串没有闭合')
      equal(bad, 0, 'CSS 模板字符串里有游离的反引号')
    },
  },
]

let failed = 0
for (const test of TESTS) {
  try {
    await test.fn()
    console.log(`\x1b[32mok\x1b[0m   ${test.title}`)
  } catch (error) {
    failed += 1
    console.log(`\x1b[31mFAIL\x1b[0m ${test.title}`)
    console.log(`\x1b[2m      ${String(error?.message ?? error)}\x1b[0m`)
  }
}

console.log(`\n${TESTS.length - failed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1