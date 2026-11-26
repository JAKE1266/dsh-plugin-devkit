/**
 * verify-client-boot.mjs — 坑②：客户端 bundle 绝不能挂住 web boot。
 *
 * 由 `dsh-plugin-devkit` 生成，原样保留在仓库里。
 *
 * 真实事故：客户端加载器把**任何不是 active 的条目**当致命错误
 * （`web boot: N entry did not activate`），于是整个 GUI 打不开。静态
 * `inject` 就是在宿主给不出 service 时把 fiber 按在 pending 的那只手：
 *
 *   {{pkgName}}: pending (waiting for service: uisession)
 *
 * 这个脚本断言那条不变量：产物里**没有** `inject`（boot 检查遍历的正是这
 * 个字段），并且 `apply()` 在四种 service 组合下都不抛错、行为正确。
 * 这样"能打包成功"不等于"能启动"的回归进不来。
 *
 * Usage: node scripts/verify-client-boot.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE = join(HERE, '..', 'lib', 'client.js')

if (!existsSync(BUNDLE)) {
  console.log(`verify-client-boot: SKIP (no ${BUNDLE} — build the client first)`)
  process.exit(0)
}

// React stub：客户端 bundle 的动态加载器会 require('react')。这里给一个
// 够用的假实现，让脚本在完全离线、不装依赖的情况下跑。
const reactStub = {
  createElement: () => null,
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}

let loaded = null

globalThis.window = {
  __ModuleLoader__: {
    load: ({ factory }) => {
      loaded = factory((name) => {
        if (name === 'react' || name === 'react/jsx-runtime') return reactStub
        throw new Error(`unexpected require(${name})`)
      })
    },
  },
}
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, textContent: '' }),
  head: { appendChild: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
}
// 预取跑在 mount 上；保持离线和无害。
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ready: true }) })

try {
  // eslint-disable-next-line no-eval
  eval(readFileSync(BUNDLE, 'utf8'))
} catch (error) {
  console.error(`verify-client-boot: evaluating the bundle threw — ${String(error?.message ?? error)}`)
  process.exit(2)
}

const failures = []
const check = (ok, label) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures.push(label)
}

console.log(`bundle: ${BUNDLE}\n`)

console.log('static surface:')
check(loaded !== null && typeof loaded.apply === 'function', 'exports apply()')
// 这就是那条不变量。`inject` 是 boot 检查用来判定条目卡住的字段；
// 它不存在，pending 就不可能发生。
check(
  loaded.inject === undefined,
  'exports no static `inject` (the field the boot check walks — absent means it cannot be pending)',
)

/** 一个记录注册动作的 ctx。 */
function makeCtx({ withDynamicInject = true, provideServices = true } = {}) {
  const registrations = []
  const slots = {
    inject: (_name, callback) => {
      if (typeof callback === 'function') callback()
      return () => {}
    },
    register: (options) => {
      registrations.push(options.name)
      return () => {}
    },
  }
  const ctx = {
    slots,
    uiSession: provideServices ? { adapter: { current: undefined }, slots } : undefined,
    effect: (callback) => callback(),
  }
  if (withDynamicInject) {
    // 模拟 cordis：依赖存在时回调才执行。provideServices=false 模拟一个
    // 永远给不出 service 的宿主 —— 回调就不该执行。
    ctx.inject = (_deps, callback) => {
      if (provideServices) callback(ctx)
      return { dispose: () => {} }
    }
  }
  return { ctx, registrations }
}

function attempt(label, expectMounts, ctx) {
  let threw = null
  try {
    loaded.apply(ctx)
  } catch (error) {
    threw = String(error?.message ?? error)
  }
  check(threw === null, `${label} — does not throw${threw === null ? '' : ` (threw: ${threw})`}`)
}

console.log('\nbehaviour:')
{
  // service 永远不来的情况：不许抛错、不许挂载，而且因为静态 inject 不存在，
  // 条目不可能停在 pending。
  const { ctx, registrations } = makeCtx({ provideServices: false })
  attempt('services absent', ctx)
  check(registrations.length === 0, 'services absent — mounts nothing')
}
{
  const { ctx, registrations } = makeCtx({ provideServices: true })
  attempt('services present', ctx)
  check(registrations.length >= 1, `services present — mounts at least one seat (got ${registrations.length})`)
}
{
  // 没有动态注入能力的老宿主 + service 缺失：闲置，不抛错。
  const { ctx, registrations } = makeCtx({ withDynamicInject: false, provideServices: false })
  attempt('old host, no services', ctx)
  check(registrations.length === 0, 'old host, no services — stays idle')
}
{
  // 老宿主 + service 在：直接挂上去。
  const { ctx, registrations } = makeCtx({ withDynamicInject: false, provideServices: true })
  attempt('old host, services present', ctx)
  check(registrations.length >= 1, `old host, services present — direct mount (got ${registrations.length})`)
}

console.log('')
if (failures.length === 0) {
  console.log('all client-boot checks passed')
  process.exit(0)
}
console.log(`${failures.length} check(s) failed:`)
for (const f of failures) console.log('  - ' + f)
process.exit(1)