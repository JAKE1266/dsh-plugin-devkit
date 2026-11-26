/**
 * preflight-boot.mjs — 坑⑨：把插件装进真实 profile，DSH 起不来了。
 *
 * 由 `dsh-plugin-devkit` 生成，原样保留在仓库里。
 *
 * 真实事故：一个 fiber 从不 settle 的插件会让 DSH 完全启动不了 ——
 * 在用户手动禁用它之前，整个 harness 是死的。开发时判断"能不能装进真实
 * profile"不需要拿生产 profile 冒险：用一个**一次性 profile** 加一个临时
 * DSH_HOME 启动一次，看应用能不能到达可服务状态即可。
 *
 * 本脚本不装任何东西、不碰任何 profile。
 *
 * Usage:
 *   node test/preflight-boot.mjs            # 真正启动一次 web 应用
 *   node test/preflight-boot.mjs --dump     # 只组装树，不挂载
 *
 * 退出码：应用起来了（或组装成功）为 0，否则 1。
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '..')

/** 桌面版随附的启动器。 */
const LAUNCHER =
  process.env.DSH_LAUNCHER ??
  'C:/Users/lenovo/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd'

const dumpOnly = process.argv.includes('--dump')
/** 多久没起来就算失败。 */
const BOOT_TIMEOUT_MS = Number(process.env.DSH_PREFLIGHT_TIMEOUT_MS ?? 120_000)

if (!existsSync(LAUNCHER)) {
  console.log(`SKIP  no launcher at ${LAUNCHER}`)
  console.log('      set DSH_LAUNCHER to the dsh.cmd of an installed DSH, or use --dump elsewhere')
  process.exit(0)
}

/** 一次性的 harness home，不读也不写任何真实 profile。 */
const home = mkdtempSync(join(tmpdir(), 'dsh-preflight-'))
const profile = 'preflight'

/**
 * 停掉启动器和它启动的一切。
 *
 * 在 Windows 上 `child.kill()` 不够：启动器是 `.cmd`，真实应用是它的孙进程，
 * 杀掉外壳会留下一个孤儿服务进程占着输出管道，把本脚本挂死。`taskkill /T`
 * 会连整棵树一起走。POSIX 上子进程就是普通进程，`kill` 就够。
 */
function stopTree(child) {
  if (child === undefined || child.killed) return
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    child.kill('SIGTERM')
  } catch {
    // 已经没了。
  }
}

/**
 * 跑启动器，settle 时 resolve。
 *
 * 某些沙箱下 `stdio: 'pipe'` 抓不到输出，所以这里用 inherit，以退出码和存活
 * 时长来判断，而不是解析输出。
 *
 * 启动器在 Windows 上是 `.cmd`，路径还带空格（应用装在"DeepSeek Harness"）。
 * `cmd.exe /c "…"` 不能把带引号的程序当第一个 token，除非用 `call`，所以命令
 * 行是手工拼成 `call "<path>" <args>` 的。
 */
function run(args, { timeoutMs }) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32'
    // 每个参数都加引号：`link:` spec 的插件路径也带空格。
    const commandLine = `call "${LAUNCHER}" ${args.map((a) => `"${a}"`).join(' ')}`
    const child = spawn(isWindows ? commandLine : LAUNCHER, isWindows ? [] : args, {
      env: { ...process.env, DSH_HOME: home },
      stdio: 'inherit',
      windowsHide: true,
    })
    let settled = false
    const finish = (ok, reason) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stopTree(child)
      resolve({ ok, reason })
    }
    const timer = setTimeout(() => finish(false, `timed out after ${timeoutMs}ms`), timeoutMs)
    child.on('exit', (code, signal) => {
      if (code === 0) finish(true, `exited 0`)
      else finish(false, signal ? `killed by ${signal}` : `exit code ${code}`)
    })
    child.on('error', (error) => finish(false, String(error?.message ?? error)))
  })
}

try {
  // 一次性 profile：确认这个插件在完全干净的环境下能被挂上。
  const setup = await run(['profile', 'create', profile], { timeoutMs: 60_000 })
  if (!setup.ok) {
    console.log(`note: profile create said: ${setup.reason}`)
    console.log('      (这未必是失败 —— 继续尝试 add)')
  }

  const add = await run(['plugin', '--profile', profile, 'add', `link:${pluginRoot}`], {
    timeoutMs: BOOT_TIMEOUT_MS,
  })
  if (!add.ok) {
    console.log(`FAIL  could not add the plugin: ${add.reason}`)
    process.exitCode = 1
  } else {
    console.log(`ok    plugin added to the throwaway profile "${profile}"`)
    if (!dumpOnly) {
      const booted = await run(['rescue', '--no-open'], { timeoutMs: BOOT_TIMEOUT_MS })
      if (booted.ok) {
        console.log(`ok    the app booted: ${booted.reason}`)
      } else {
        console.log(`FAIL  the app did NOT boot: ${booted.reason}`)
        console.log('      a plugin that leaves its entry pending stops DSH starting at all.')
        console.log('      look for "did not activate" in the output above.')
        process.exitCode = 1
      }
    } else {
      console.log('      (--dump: skipped the boot step)')
    }
  }
} finally {
  try {
    rmSync(home, { recursive: true, force: true })
  } catch {
    console.log(`\nnote: could not remove ${home}`)
  }
}

console.log(`\n${process.exitCode === 1 ? 'PREFLIGHT FAILED' : 'PREFLIGHT OK'}`)