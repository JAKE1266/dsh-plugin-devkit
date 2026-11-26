/**
 * cli.mjs — 命令分发。
 *
 * 四个命令，每个都对应一次真实事故的"怎么防患于未然"：
 *
 *   dpd new        → 一次把契约铺全，而不是 clone 一个老插件再慢慢改歪
 *   dpd check      → 编译/打包不一定能过不等于能装进 env 跑起来（这里跑的是
 *                    那几条静态不变量）
 *   dpd doctor     → check 加上"这台机器上还缺什么"的诊断（env 侧）
 *   dpd preflight  → 用一次性 profile 真启动一次 DSH，确认没把它弄死
 *
 * 刻意零依赖：不引任何 CLI 框架。这个工具要在别人刚 clone 完、什么都没装的
 * 情况下可用。参数解析一共几十行，比引一个框架更好维护。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { runChecks } from './check.mjs'
import { scaffold, reportScaffold } from './new.mjs'
import { checkIds, checks } from './checks/index.mjs'
import { heading, report, isDir } from './util.mjs'

export const VERSION = '0.1.0'

/**
 * 朴素但正确的参数解析。
 *
 * 支持三种：`--flag`（布尔）、`--key value`、逗号分隔的 repeat（`--only=a,b`）。
 * 返回 { positional, flags }，flags[key] 是 string[]（多次出现累加）。
 * 刻意不用 getopt 类库：那几个命令的参数形就这么几种。
 */
function parseArgs(argv, { valued = [] }) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue
    if (!arg.startsWith('--')) {
      if (!arg.startsWith('-')) positional.push(arg)
      continue
    }
    const body = arg.slice(2)
    const eq = body.indexOf('=')
    if (eq !== -1) {
      const key = body.slice(0, eq)
      const value = body.slice(eq + 1)
      ;(flags[key] ??= []).push(value)
      continue
    }
    if (valued.includes(body)) {
      const value = argv[i + 1]
      if (value !== undefined && !value.startsWith('-')) i += 1
      ;(flags[body] ??= []).push(value ?? '')
      continue
    }
    ;(flags[body] ??= []).push('')
  }
  return { positional, flags }
}

function printHelp() {
  console.log(`
\x1b[1mdpd\x1b[0m — DSH 插件脚手架（dsh-plugin-devkit） ${VERSION}

用法：
  \x1b[1mdpd new <name>\x1b[0m [--dir <path>] [--description <text>] [--force]
      生成一个"直接能过检查"的插件骨架，生成后当场自查一遍。

  \x1b[1mdpd check\x1b[0m [dir] [--only <id,...>] [--skip <id,...>] [--json] [--list] [--why]
      对一个插件目录跑 ${checkIds.length} 项静态检查。
      dir 缺省为当前目录。--why 顺带把每条检查背后的坑讲一遍。

  \x1b[1mdpd doctor\x1b[0m [dir]
      check + 这台机器上的环境诊断（Node 版本、npm、DSH 启动器、DSH_HOME）。

  \x1b[1mdpd preflight\x1b[0m [dir]
      调用插件自带的 test/preflight-boot.mjs：用一次性 profile 真启动一次 DSH。
      在把插件指向任何真实 profile 之前先跑它。

检查项（每个都对应一次真实事故）：
${checks.map((c) => `  \x1b[2m${c.id.padEnd(14)}\x1b[0m ${c.title}`).join('\n')}
`.trim())
}

/** 决定检查哪个目录：缺省 cwd，给了就必须是目录。 */
function resolveDir(arg, cwd) {
  if (arg === undefined) return cwd
  const dir = resolve(cwd, arg)
  if (!isDir(dir)) {
    console.error(`\x1b[31m不是目录：${dir}\x1b[0m`)
    process.exitCode = 1
    return null
  }
  return dir
}

function cmdNew(argv) {
  const { positional, flags } = parseArgs(argv, {
    valued: ['dir', 'description', 'description-en'],
  })
  const name = positional[0]
  if (name === undefined) {
    console.error('\x1b[31m用法：dpd new <name>\x1b[0m')
    process.exitCode = 1
    return
  }
  const result = scaffold(name, {
    cwd: process.cwd(),
    dir: flags.dir?.[0],
    description: flags.description?.[0],
    descriptionEn: flags['description-en']?.[0],
    force: 'force' in flags || 'f' in flags,
  })
  if (result === null) return
  reportScaffold(result)
  if (!('force' in flags)) {
    heading('生成的插件立刻自查')
    const { failures } = runChecks(result.dir)
    if (failures.length > 0) process.exitCode = 1
  }
}

function cmdCheck(argv, { extraDiagnostics = false } = {}) {
  const { positional, flags } = parseArgs(argv, { valued: ['only', 'skip'] })
  const only = (flags.only ?? []).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean)
  const skip = (flags.skip ?? []).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean)
  const json = 'json' in flags
  const list = 'list' in flags || 'l' in flags
  const why = 'why' in flags || 'v' in flags

  if (list) {
    runChecks(process.cwd(), { list: true, verbose: why })
    return
  }
  const dir = resolveDir(positional[0], process.cwd())
  if (dir === null) return

  if (why) {
    heading(`这 ${checkIds.length} 条检查背后的事`)
    for (const c of checks) {
      console.log(`\n\x1b[1m${c.id}\x1b[0m — ${c.title}`)
      console.log(`\x1b[2m  ${c.why}\x1b[0m`)
    }
    console.log('')
  }

  const { failures } = runChecks(dir, { json, only, skip, why })
  if (extraDiagnostics) runDiagnostics(dir)
  // runChecks 对未知检查项把退出码设为 2；那种情况不被下面的 1 覆盖。
  if (failures.length > 0 && process.exitCode !== 2) process.exitCode = 1
}

/** doctor 专有：这台机器还能不能跑这套东西。 */
function runDiagnostics(dir) {
  heading('这台机器')

  const nodeMajor = Number(process.versions.node.split('.')[0])
  report(
    nodeMajor >= 18 ? 'ok' : 'warn',
    `Node ${process.versions.node}`,
    nodeMajor >= 18 ? '' : 'devkit 需要 >= 18',
  )

  const npm = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8' })
  report(npm.status === 0 ? 'ok' : 'warn', `npm ${String(npm.stdout).trim() || '不可用'}`)

  const launcher =
    process.env.DSH_LAUNCHER ??
    'C:/Users/lenovo/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd'
  const launcherFound = existsSync(launcher)
  report(launcherFound ? 'ok' : 'warn', `DSH 启动器${launcherFound ? '在' : '没找到'}`, launcherFound ? launcher : '可在环境变量 DSH_LAUNCHER 里指定')

  report(
    process.env.DSH_HOME ? 'ok' : 'info',
    `DSH_HOME=${process.env.DSH_HOME ?? '(未设置，用默认位置)'}`,
  )

  const preflight = join(dir, 'test', 'preflight-boot.mjs')
  if (existsSync(preflight)) report('ok', '插件自带 preflight 脚本', preflight)
  else report('info', '插件没有 test/preflight-boot.mjs', 'npm run preflight 不可用；用 dpd new 生成的新插件默认带')

  report(
    existsSync(join(dir, 'node_modules')) ? 'ok' : 'info',
    existsSync(join(dir, 'node_modules')) ? '已装依赖' : '未装依赖（dpd check 不依赖它）',
  )
}

function cmdPreflight(argv) {
  const { positional, flags } = parseArgs(argv, { valued: [] })
  const dir = resolveDir(positional[0] ?? '.', process.cwd())
  if (dir === null) return
  const script = join(dir, 'test', 'preflight-boot.mjs')
  if (!existsSync(script)) {
    console.error(`\x1b[31m${dir} 里没有 test/preflight-boot.mjs\x1b[0m`)
    console.error('用 `dpd new` 生成的新插件默认带。老插件可以手动拷一份。')
    process.exitCode = 1
    return
  }
  const extra = []
  for (const [key, values] of Object.entries(flags)) {
    for (const value of values) extra.push(value === '' ? `--${key}` : `--${key}=${value}`)
  }
  const res = spawnSync(process.execPath, [script, ...extra], {
    stdio: 'inherit',
    env: process.env,
  })
  if (res.status !== 0) process.exitCode = res.status ?? 1
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    printHelp()
    return 0
  }
  if (argv[0] === '--version' || argv[0] === '-V') {
    console.log(VERSION)
    return 0
  }
  const [command, ...rest] = argv
  switch (command) {
    case 'new':
    case 'init':
      cmdNew(rest)
      return process.exitCode ?? 0
    case 'check':
    case 'verify':
    case 'lint':
      cmdCheck(rest)
      return process.exitCode ?? 0
    case 'doctor':
    case 'diag':
      cmdCheck(rest, { extraDiagnostics: true })
      return process.exitCode ?? 0
    case 'preflight':
    case 'boot':
      cmdPreflight(rest)
      return process.exitCode ?? 0
    default:
      console.error(`\x1b[31m未知命令：${command}\x1b[0m\n`)
      printHelp()
      process.exitCode = 1
      return 1
  }
}