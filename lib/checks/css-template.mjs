/**
 * css-template.mjs — 坑①：CSS 模板字符串里的反引号。
 *
 * 真实事故（两次，其中一次进了 commit）：客户端样式是一个模板字符串，
 * 注释里写一个反引号就把它提前结束。伤的地方不在当时报错的地方：
 * 打包器报的是 **TypeScript** 的 parse error，指向某一行 CSS，同时
 * `lib/client.js` 保持旧内容不变 —— 看起来改成功了，其实没发货。
 *
 * 检查方式刻意和源头那份一致：从 `const CSS = \`` 进去，遇到"只有反引号
 * 的一行"才出来，这期间任何反引号都是问题。宽松匹配会把检查变成噪声。
 *
 * 检查对象：生成的产物优先（lib/client.js），没有产物时退回 src 里的 TS。
 */
import { linesOf, readIfExists, report } from '../util.mjs'

const ENTRY_RE = /^\s*(?:export\s+)?(?:const|let|var)\s+CSS\s*=\s*`/
const CLOSE_RE = /^\s*`\s*;?\s*$/

export const id = 'css-template'
export const title = 'CSS 模板字符串里没有游离的反引号'
export const why =
  '反引号会提前结束模板字符串，报错却指向 CSS 行，且旧产物原地不动 —— 改坏了也不发货'

/** 候选文件，按优先级：产物优先，其次源文件。 */
const CANDIDATES = [
  'lib/client.js',
  'lib/client/client.js',
  'lib/client/styles.js',
  'src/client/index.ts',
  'src/client/index.js',
  'src/client/styles.ts',
  'src/client/styles.js',
]

/** 扫一个文件，返回问题行（`{ line, text }`） */
function scan(path) {
  const lines = linesOf(path)
  if (lines === null) return { scanned: false, hasEntry: false, problems: [], unclosed: false }
  let inside = false
  let hasEntry = false
  const problems = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!inside) {
      if (ENTRY_RE.test(line)) {
        inside = true
        hasEntry = true
      }
      continue
    }
    if (CLOSE_RE.test(line)) {
      inside = false
      continue
    }
    if (line.includes('`')) problems.push({ line: i + 1, text: line.trim() })
  }
  return { scanned: true, hasEntry, problems, unclosed: inside }
}

export function run(root) {
  const candidates = CANDIDATES
  const target = candidates.map((p) => [p, readIfExists(`${root}/${p}`)]).find(([, text]) => text !== null)
  if (!target) {
    report('skip', title, '没有客户端样式文件（没有 CSS 模板字符串的插件不适用）')
    return { severity: 'skip' }
  }
  const [path] = target
  const { problems, unclosed } = scan(`${root}/${path}`)
  if (unclosed) {
    report('fail', title, `${path}: 模板字符串没有闭合`)
    return { severity: 'fail', detail: `${path}: unclosed template literal` }
  }
  if (problems.length > 0) {
    report('fail', title, `${path}: ${problems.length} 处反引号`)
    for (const p of problems) console.log(`\x1b[2m      ${path}:${p.line}  ${p.text}\x1b[0m`)
    return { severity: 'fail', detail: `${path}: backtick on line(s) ${problems.map((p) => p.line).join(', ')}` }
  }
  report('ok', title, path)
  return { severity: 'ok', detail: path }
}