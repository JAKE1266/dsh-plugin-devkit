/**
 * check.mjs — 检查执行器。
 *
 * 对所有检查跑一遍，汇总结果，按 severity 汇总退出码：
 *   fail 出现 → 退出码 1（CI 用）
 *   只有 warn → 退出码 0（不阻断，只提醒）
 *   没有 fail 也没有 warn → 退出码 0
 *
 * 也支持 --only / --skip / --json，方便人机两种用法。
 */
import { checks, getCheck, printCatalog } from './checks/index.mjs'
import { heading, report } from './util.mjs'

/**
 * @param {string} root 被检查目录
 * @param {{ only?: string[], skip?: string[], json?: boolean, list?: boolean, verbose?: boolean }} opts
 */
export function runChecks(root, opts = {}) {
  if (opts.list) {
    printCatalog({ verbose: opts.verbose })
    return { results: [], failures: [], warnings: 0 }
  }

  let selected = checks
  if (opts.only?.length) {
    selected = opts.only.map((id) => getCheck(id)).filter(Boolean)
    const unknown = opts.only.filter((id) => !getCheck(id))
    if (unknown.length > 0) {
      console.error(`\x1b[31m未知检查项：${unknown.join(', ')}\x1b[0m`)
      console.error(`可用：${checks.map((c) => c.id).join(', ')}`)
      process.exitCode = 2
      return { results: [], failures: unknown, warnings: 0 }
    }
  }
  if (opts.skip?.length) {
    const skip = new Set(opts.skip)
    selected = selected.filter((c) => !skip.has(c.id))
  }

  if (!opts.json) heading(`检查对象：${root}`)

  const results = []
  const failures = []
  let warnings = 0

  for (const check of selected) {
    if (!opts.json) heading(check.title)
    let result
    try {
      result = check.run(root)
    } catch (error) {
      result = { severity: 'fail', detail: `检查自身抛错：${String(error?.message ?? error)}` }
      if (!opts.json) report('fail', '检查自身抛错', result.detail)
    }
    results.push({ id: check.id, ...result })
    if (result.severity === 'fail') failures.push({ id: check.id, detail: result.detail })
    if (result.severity === 'warn') warnings += 1
  }

  if (opts.json) {
    console.log(JSON.stringify({ root, results, failures, warnings }, null, 2))
  } else {
    heading('汇总')
    const counts = results.reduce((acc, r) => {
      acc[r.severity] = (acc[r.severity] ?? 0) + 1
      return acc
    }, {})
    console.log(
      `  ok ${counts.ok ?? 0}  ·  warn ${counts.warn ?? 0}  ·  fail ${counts.fail ?? 0}  ·  skip ${counts.skip ?? 0}`,
    )
    if (failures.length > 0) {
      console.log(`\n\x1b[31m${failures.length} 项失败\x1b[0m：`)
      for (const f of failures) console.log(`  \x1b[31m- ${f.id}\x1b[0m ${f.detail ?? ''}`)
    } else if (warnings > 0) {
      console.log(`\n\x1b[33m${warnings} 项待改进（不阻断）\x1b[0m`)
    } else {
      console.log(`\n\x1b[32m全部通过\x1b[0m`)
    }
  }

  return { results, failures, warnings }
}