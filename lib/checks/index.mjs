/**
 * checks/index.mjs — 检查注册表。
 *
 * 每个检查是一个独立模块，导出：
 *   id      —— 命令行里 `dpd check --only <id>` 用的短名
 *   title   —— 一行中文说明
 *   why     —— 这个坑出过什么事（headless 模式下会打印）
 *   run(root) —— 返回 { severity, detail }
 *
 * 加新检查 = 加一个文件 + 在这里 import。不需要改 CLI。
 */
import * as cssTemplate from './css-template.mjs'
import * as staticInject from './static-inject.mjs'
import * as manifest from './manifest.mjs'
import * as prefixSlash from './prefix-slash.mjs'
import * as secrets from './secrets.mjs'
import * as bilingual from './bilingual.mjs'
import * as peerGate from './peer-gate.mjs'
import * as lazyImport from './lazy-import.mjs'

export const checks = [
  cssTemplate,
  staticInject,
  manifest,
  prefixSlash,
  secrets,
  bilingual,
  peerGate,
  lazyImport,
]

export const checkIds = checks.map((c) => c.id)

/** 按 id 取一个检查，找不到返回 undefined。 */
export function getCheck(id) {
  return checks.find((c) => c.id === id)
}

/** 打印全部检查及其背后的坑，供 `dpd check --list` 用。 */
export function printCatalog({ verbose = false } = {}) {
  for (const c of checks) {
    console.log(`\x1b[1m${c.id}\x1b[0m  ${c.title}`)
    if (verbose) console.log(`\x1b[2m       ${c.why}\x1b[0m`)
  }
}