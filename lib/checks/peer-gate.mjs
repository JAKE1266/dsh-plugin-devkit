/**
 * peer-gate.mjs — 坑⑦：peerDependencies 对不上，整包被静默跳过。
 *
 * DSH 0.2.0 起装了版本兼容闸门：peerDependencies 对不上的插件**整包跳过**。
 * 现象是"装上了、但重启后什么也没发生"，而且不报错 —— 市场自己的兼容守卫
 * 也会拦。修法通常是把宿主侧依赖写成 `^0.1.5-rc.3 || ^0.2.0-rc.1` 这种
 * `||` 列表，或者干脆**不声明宿主 peerDependencies**（像开机动画插件那样）。
 *
 * 这里检查两件事：
 *   1. 有没有声明 `@deepseek-ai/*` 的 peer 依赖 —— 有就要提醒闸门风险
 *   2. 如果声明了，它是否 optional（optional 的 peer 不进闸门判定）
 */
import { readIfExists, report } from '../util.mjs'

export const id = 'peer-gate'
export const title = 'peerDependencies 不会把整包推进兼容闸门'
export const why = '0.2.0 起 peerDeps 对不上的插件整包跳过，装上了但重启后毫无反应且不报错'

const HOST_SCOPES = ['@deepseek-ai/']

export function run(root) {
  const pkgText = readIfExists(`${root}/package.json`)
  if (pkgText === null) {
    report('skip', title, '没有 package.json')
    return { severity: 'skip' }
  }
  let pkg
  try {
    pkg = JSON.parse(pkgText)
  } catch {
    report('skip', title, 'package.json 不是合法 JSON，跳过')
    return { severity: 'skip' }
  }
  const peers = Object.keys(pkg.peerDependencies ?? {})
  if (peers.length === 0) {
    report('ok', title, '未声明 peerDependencies —— 永远不会被版本闸门跳过')
    return { severity: 'ok', detail: 'no peerDependencies' }
  }
  const optional = pkg.peerDependenciesMeta ?? {}
  const problems = []
  for (const dep of peers) {
    const required = !optional[dep]?.optional
    if (required && HOST_SCOPES.some((s) => dep.startsWith(s))) {
      problems.push(
        `${dep} 是**必选**宿主 peer 依赖 —— 版本对不上时整个插件会被静默跳过。改 optional，或改成 \`^0.1.5-rc.3 || ^0.2.0-rc.1\` 的多版本线，或干脆不声明`,
      )
    }
  }
  const reactish = peers.filter((d) => /^react($|\/|-)/.test(d))
  if (reactish.length > 0 && !reactish.every((d) => optional[d]?.optional)) {
    problems.push(
      `react 类 peer 依赖（${reactish.join(', ')}）建议标 optional —— 插件常被装在没有 React 的服务端侧`,
    )
  }
  if (problems.length > 0) {
    report('warn', title, `${problems.length} 处`)
    for (const p of problems) console.log(`\x1b[2m      - ${p}\x1b[0m`)
    return { severity: 'warn', detail: problems.join('; ') }
  }
  report('ok', title, `${peers.length} 个 peer 依赖，全部 optional`)
  return { severity: 'ok', detail: `${peers.length} optional peer(s)` }
}