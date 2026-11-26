/**
 * bilingual.mjs — 坑⑥：README 只有中文，海外用户进门就撞墙。
 *
 * 这不是"漏翻译"，是分发问题：GitHub 默认语言是英文，一个只有中文 README
 * 的仓库在英文用户眼里等于没文档。反之亦然。规则很简单：
 *   - README.md 与 README.en.md / README.zh-CN.md 必须成对
 *   - 两份都应该包含一段版本支持表（哪个 DSH 版本能用）
 *   - 两份都应该有安装命令
 *
 * 也检查 CHANGELOG 的存在：没有 changelog 的插件，用户无法判断
 * "这个 bug 修了没有"，只能靠 issue 追问。
 */
import { readIfExists, report } from '../util.mjs'

export const id = 'bilingual'
export const title = 'README 中英成对，且带版本支持表'
export const why = '单语 README 等于把另一半用户关在门外；没有版本表，用户猜不出装得上不上'

const PAIR_HINTS = [
  ['README.en.md', '英文'],
  ['README.zh-CN.md', '简体中文'],
]

export function run(root) {
  const zh = readIfExists(`${root}/README.md`)
  if (zh === null) {
    report('skip', title, '没有 README.md')
    return { severity: 'skip' }
  }
  const problems = []

  const secondary = PAIR_HINTS.find(([name]) => readIfExists(`${root}/${name}`) !== null)
  if (!secondary) {
    problems.push('只有 README.md，没有 README.en.md / README.zh-CN.md —— 另一语言的用户读不到文档')
  }

  // 版本支持表：中英两份都该有。
  for (const name of ['README.md', secondary?.[0]].filter(Boolean)) {
    const text = readIfExists(`${root}/${name}`)
    if (text !== null && !/DSH\s*版本|Version.{0,20}(support|compat)|supported DSH|支持的 DSH/i.test(text)) {
      problems.push(`${name} 里没有版本支持表（哪个 DSH 版本能用）`)
    }
    if (text !== null && !/dsh\s+plugin|npm\s+(?:i|install)|pnpm\s+(?:add|i|dlx)|git\s+clone/.test(text)) {
      problems.push(`${name} 里没有安装命令`)
    }
  }

  if (readIfExists(`${root}/CHANGELOG.md`) === null) {
    problems.push('没有 CHANGELOG.md —— 用户没法判断某个修复是否已在版本里')
  }

  if (problems.length > 0) {
    report('warn', title, `${problems.length} 处`)
    for (const p of problems) console.log(`\x1b[2m      - ${p}\x1b[0m`)
    return { severity: 'warn', detail: problems.join('; ') }
  }
  report('ok', title, `README.md + ${secondary[0]}`)
  return { severity: 'ok', detail: secondary[0] }
}