/**
 * test/run.mjs — devkit 自测。
 *
 * 两条最重要的保证：
 *   1. dpd new 生成的插件，dpd check 必须全绿 —— 脚手架自己不能教坏习惯。
 *   2. 每个检查必须能抓到自己那个坑 —— 只会说 ok 的检查比没有更危险。
 */
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { render, normalizePluginName } from '../lib/util.mjs'
import { runChecks } from '../lib/check.mjs'
import { checks } from '../lib/checks/index.mjs'
import { scaffold } from '../lib/new.mjs'
import { main } from '../lib/cli.mjs'

const tmp = () => mkdtempSync(join(tmpdir(), 'dpd-test-'))
const writeIn = (dir, rel, content) => {
  mkdirSync(join(dir, ...rel.split('/').slice(0, -1)), { recursive: true })
  writeFileSync(join(dir, ...rel.split('/')), content, 'utf8')
}
const runOne = (id, dir) => {
  const c = checks.find((x) => x.id === id)
  const saved = console.log
  let text = ''
  console.log = (...a) => { text += a.join(' ') + '\n' }
  let out
  try { out = c.run(dir) } finally { console.log = saved }
  return { ...out, text }
}
const expectTrap = (id, build) => {
  const dir = tmp()
  build(dir)
  const out = runOne(id, dir)
  if (!(out.severity === 'fail' || out.severity === 'warn')) throw new Error(`${id} 没抓到写错：\n${out.text.slice(0, 400)}`)
  rmSync(dir, { recursive: true, force: true })
}
const expectClean = (id, build) => {
  const dir = tmp()
  build(dir)
  const out = runOne(id, dir)
  if (!(out.severity === 'ok' || out.severity === 'skip')) throw new Error(`${id} 在干净目录上报 ${out.severity}：\n${out.text.slice(0, 400)}`)
  rmSync(dir, { recursive: true, force: true })
}
const capture = async (fn) => {
  const saved = { log: console.log, err: console.error, warn: console.warn }
  const out = []
  const sink = (...a) => out.push(a.map(String).join(' '))
  console.log = sink; console.error = sink; console.warn = sink
  const prev = process.exitCode
  process.exitCode = 0
  let r
  try { r = await fn() } finally {
    console.log = saved.log; console.error = saved.err; console.warn = saved.warn
  }
  const code = process.exitCode
  process.exitCode = prev
  return { r, text: out.join('\n'), exitCode: code }
}

let passed = 0, failed = 0
const runTest = async (title, fn) => {
  try { await fn(); passed += 1; console.log(`\x1b[32mok\x1b[0m   ${title}`) }
  catch (e) { failed += 1; console.log(`\x1b[31mFAIL\x1b[0m ${title}\n\x1b[2m      ${String(e?.message ?? e)}\x1b[0m`) }
}

const TESTS = [
  ['生成的插件必须通过全部检查', async () => {
    const dir = tmp()
    const { r: result } = await capture(() => scaffold('demo-animation', { cwd: dir, author: 'tester', description: '演示', descriptionEn: 'Demo' }))
    if (result === null) throw new Error('scaffold 返回 null')
    const { failures, warnings } = runChecks(result.dir)
    if (failures.length > 0) throw new Error(`${failures.length} 项 fail：${failures.map((f) => f.id).join(', ')}`)
    if (warnings > 0) throw new Error(`${warnings} 项 warn`)
    rmSync(result.dir, { recursive: true, force: true })
  }],
  ['生成的插件自给自足', async () => {
    const dir = tmp()
    const { r: result } = await capture(() => scaffold('self-contained', { cwd: dir, author: 'tester' }))
    if (result === null) throw new Error('scaffold 失败')
    for (const rel of result.files) {
      if (!/\.(?:js|mjs|ts|cjs)$/.test(rel)) continue
      const text = readFileSync(join(result.dir, rel), 'utf8')
      if (/dsh-plugin-devkit/.test(text.replace(/.*生成.*\n?/g, ''))) throw new Error(`${rel} 引用了 devkit`)
    }
    rmSync(result.dir, { recursive: true, force: true })
  }],
  ['模板没有未替换变量', async () => {
    const dir = tmp()
    const { r: result } = await capture(() => scaffold('no-vars-left', { cwd: dir, author: 'tester' }))
    if (result === null) throw new Error('scaffold 失败')
    for (const rel of result.files) {
      if (/\.(?:png|svg|jpg|ico)$/i.test(rel)) continue
      const text = readFileSync(join(result.dir, rel), 'utf8')
      const m = text.match(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/)
      if (m) throw new Error(`${rel} 里还有 ${m[0]}`)
    }
    rmSync(result.dir, { recursive: true, force: true })
  }],
  ['非空目录拒绝覆盖', async () => {
    const dir = tmp()
    const target = join(dir, 'anything')
    mkdirSync(target, { recursive: true })
    writeIn(target, 'README.md', 'existing')
    const { r: result, exitCode, text } = await capture(() => scaffold('anything', { cwd: dir, dir: target, author: 't' }))
    if (result !== null) throw new Error('非空目录应当拒绝')
    if (exitCode !== 1) throw new Error(`退出码 ${exitCode}`)
    if (!/不是空目录/.test(text)) throw new Error('没有说明原因')
    rmSync(dir, { recursive: true, force: true })
  }],
  ['包名规范化', async () => {
    if (normalizePluginName('My Cool Plugin!!') !== 'my-cool-plugin') throw new Error('大小写/标点')
    if (normalizePluginName('  ') !== '') throw new Error('空白')
    if (normalizePluginName('dsh-anim') !== 'dsh-anim') throw new Error('连字符')
    if (normalizePluginName('--x--') !== 'x') throw new Error('首尾连字符')
  }],
  ['渲染器', async () => {
    const r = render('你好 {{name}}，版本 {{version}}', { name: 'dsh-x' })
    if (r.text !== '你好 dsh-x，版本 ') throw new Error('缺变量未渲染空串')
    if (!r.missing.includes('version')) throw new Error('缺变量没记录')
    const r2 = render('{{a}}', { a: 0 })
    if (r2.text !== '0') throw new Error('0 被误判')
  }],
  ['css-template 抓坑', async () => {
    expectTrap('css-template', (d) => writeIn(d, 'src/client/styles.ts', 'export const CSS = `\n/* x ` y */\n.a {}\n`\n'))
    expectClean('css-template', (d) => writeIn(d, 'src/client/styles.ts', 'export const CSS = `\n/* no backtick */\n.a {}\n`\n'))
    expectClean('css-template', (d) => writeIn(d, 'package.json', '{"name":"x"}'))
  }],
  ['static-inject 抓坑', async () => {
    expectTrap('static-inject', (d) => writeIn(d, 'lib/client.js', 'export const inject = ["slots"]\nexport function apply(){}\n'))
    expectTrap('static-inject', (d) => writeIn(d, 'lib/client.js', 'export { apply, inject }\n'))
    expectClean('static-inject', (d) => writeIn(d, 'lib/client.js', 'export function apply(){ return () => {} }\n'))
  }],
  ['manifest 抓坑', async () => {
    expectTrap('manifest', (d) => writeIn(d, 'package.json', JSON.stringify({ name: 'dsh-x', type: 'module', engines: { node: '>=18' }, files: [], exports: {} })))
    expectTrap('manifest', (d) => {
      writeIn(d, 'package.json', JSON.stringify({ name: 'dsh-x', type: 'module', engines: { node: '>=18' }, files: ['cordis.patch.yml'], exports: { './package.json': './package.json' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
      writeIn(d, 'cordis.patch.yml', '- insert:\n    - id: dsh-other\n      name: x\n')
    })
    expectClean('manifest', (d) => {
      writeIn(d, 'package.json', JSON.stringify({ name: 'dsh-x', type: 'module', engines: { node: '>=18' }, files: ['cordis.patch.yml'], exports: { './package.json': './package.json' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
      writeIn(d, 'cordis.patch.yml', '- insert:\n    - id: dsh-x\n      name: x\n')
    })
  }],
  ['prefix-slash 抓坑', async () => {
    expectTrap('prefix-slash', (d) => writeIn(d, 'src/host/index.js', 'const opts = { prefix: "/media/" }\nwebServer.route(opts)\n'))
    expectTrap('prefix-slash', (d) => writeIn(d, 'src/host/index.js', 'webServer.route("/media/")\n'))
    expectClean('prefix-slash', (d) => writeIn(d, 'src/host/index.js', 'const prefix = "/media"\nconst opts = { prefix }\n'))
    expectClean('prefix-slash', (d) => writeIn(d, 'README.md', '// 用 route("/media/") 这种写法作为说明是可以的\n'))
  }],
  ['secrets 抓坑', async () => {
    expectTrap('secrets', (d) => writeIn(d, 'src/host/config.js', 'const key = "sk-abcdefghijklmnopqrstuvwxyz123456"\n'))
    expectTrap('secrets', (d) => writeIn(d, 'config.json', '{}\n'))
    expectClean('secrets', (d) => writeIn(d, 'README.md', 'const demo = "sk-XXXXXXXXXXXXXXXX"\n'))
    expectClean('secrets', (d) => writeIn(d, 'package.json', '{"name":"x"}'))
  }],
  ['peer-gate 抓坑', async () => {
    expectTrap('peer-gate', (d) => writeIn(d, 'package.json', JSON.stringify({ name: 'dsh-x', peerDependencies: { '@deepseek-ai/dsh': '^0.2.0' } })))
    expectClean('peer-gate', (d) => writeIn(d, 'package.json', JSON.stringify({ name: 'dsh-x', peerDependencies: { '@deepseek-ai/dsh': '^0.2.0' }, peerDependenciesMeta: { '@deepseek-ai/dsh': { optional: true } } })))
    expectClean('peer-gate', (d) => writeIn(d, 'package.json', JSON.stringify({ name: 'dsh-x', peerDependencies: { react: '^19' }, peerDependenciesMeta: { react: { optional: true } } })))
  }],
  ['lazy-import 抓坑', async () => {
    expectTrap('lazy-import', (d) => writeIn(d, 'src/host/index.js', "import { x } from '@deepseek-ai/dsh-webserver'\nexport function apply(){}\n"))
    expectClean('lazy-import', (d) => writeIn(d, 'src/host/index.js', "import { readFileSync } from 'node:fs'\nexport function apply(){}\n"))
  }],
  ['bilingual 抓坑', async () => {
    expectTrap('bilingual', (d) => writeIn(d, 'README.md', '# dsh-x\n安装：dsh plugin add\n'))
    expectClean('bilingual', (d) => {
      writeIn(d, 'README.md', '# dsh-x\n\n支持的 DSH 版本：0.1.5、0.2.0\n\n安装：dsh plugin --profile web add\n')
      writeIn(d, 'README.en.md', '# dsh-x\n\nSupported DSH versions: 0.1.5, 0.2.0\n\nInstall: dsh plugin --profile web add\n')
      writeIn(d, 'CHANGELOG.md', '# CHANGELOG\n')
    })
  }],
  ['CLI help/version/unknown', async () => {
    const help = await capture(() => main(['help']))
    if (!/dpd new/.test(help.text)) throw new Error('help 没讲 new')
    const version = await capture(() => main(['--version']))
    if (!/\d+\.\d+\.\d+/.test(version.text)) throw new Error('--version')
    const bogus = await capture(() => main(['frobnicate']))
    if (bogus.exitCode !== 1) throw new Error(`unknown exit ${bogus.exitCode}`)
    if (!/未知命令/.test(bogus.text)) throw new Error('unknown 说明')
  }],
  ['CLI new', async () => {
    const dir = tmp()
    const { exitCode, text } = await capture(() => main(['new', 'cli-created', '--author', 'tester', '--description', 'CLI 生成。', '--dir', join(dir, 'cli-created')]))
    if (exitCode !== 0) throw new Error(`CLI new exit ${exitCode}: ${text.slice(0, 400)}`)
    const { failures, warnings } = runChecks(join(dir, 'cli-created'))
    if (failures.length > 0) throw new Error(`fail：${failures.map((f) => f.id).join(', ')}`)
    if (warnings > 0) throw new Error(`${warnings} warn`)
    rmSync(dir, { recursive: true, force: true })
  }],
  ['CLI check', async () => {
    const dir = tmp()
    writeIn(dir, 'package.json', '{"name":"x"}')
    const a = await capture(() => main(['check', '--only', 'secrets', dir]))
    if (a.exitCode !== 0) throw new Error(`干净 dir --only secrets exit ${a.exitCode}`)
    const b = await capture(() => main(['check', '--only', 'no-such-check', dir]))
    if (b.exitCode !== 2) throw new Error(`unknown exit ${b.exitCode}`)
    const c = await capture(() => main(['check', join(dir, 'nothing', 'here')]))
    if (c.exitCode !== 1) throw new Error(`missing dir exit ${c.exitCode}`)
    rmSync(dir, { recursive: true, force: true })
  }],
  ['CLI doctor', async () => {
    const dir = tmp()
    writeIn(dir, 'package.json', '{"name":"x"}')
    const out = await capture(() => main(['doctor', dir]))
    if (!/Node/.test(out.text)) throw new Error('doctor 没报 Node')
    if (!/检查对象|汇总/.test(out.text)) throw new Error('doctor 没跑检查')
    rmSync(dir, { recursive: true, force: true })
  }],
  ['CLI preflight', async () => {
    const dir = tmp()
    writeIn(dir, 'package.json', '{"name":"x"}')
    const out = await capture(() => main(['preflight', dir]))
    if (out.exitCode !== 1) throw new Error(`exit ${out.exitCode}`)
    if (!/preflight-boot/.test(out.text)) throw new Error('没指缺文件')
    rmSync(dir, { recursive: true, force: true })
  }],
]

for (const [title, fn] of TESTS) await runTest(title, fn)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1