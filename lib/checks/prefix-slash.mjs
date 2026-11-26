/**
 * prefix-slash.mjs — 坑④：路由 prefix 带了尾部斜杠。
 *
 * 真实事故：webserver 用
 *   `pathname !== prefix && !pathname.startsWith(prefix + '/')`
 * 匹配。注册 `.../media/` 后，浏览器请求 `/media/<id>` 拼出来是
 * `/media//<id>`，`startsWith(prefix + '/')` 永远不成立 —— 那一族路由
 * 全 404，而且现象是"文件都在，就是播不出来"。
 *
 * 检查方式：找注册 prefix 的调用，看字符串字面量是不是以 `/` 结尾。
 * 只在 src/ 与 lib/ 的 JS/TS 里扫，避免把 README 里的示例算成问题。
 */
import { walk, readIfExists, report } from '../util.mjs'

export const id = 'prefix-slash'
export const title = '路由 prefix 不带尾部斜杠'
export const why = '尾部斜杠会让 prefix + "/" 匹配永远失败，整族路由静默 404'

const CALL_RE = /\b(?:prefix|route|mount|serve)\s*[:(]\s*[`'"]([^`'"]+)[`'"]/gi

export function run(root) {
  const files = walk(root).filter((f) => /\.(?:js|mjs|ts|cjs)$/.test(f))
  if (files.length === 0) {
    report('skip', title, '目录里没有 JS/TS 源文件')
    return { severity: 'skip' }
  }
  const hits = []
  for (const file of files) {
    const text = readIfExists(`${root}/${file}`)
    if (text === null) continue
    const lines = text.split(/\r?\n/)
    lines.forEach((line, i) => {
      // 注释行里的示例不算。
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) return
      CALL_RE.lastIndex = 0
      let m
      while ((m = CALL_RE.exec(line)) !== null) {
        const literal = m[1]
        if (literal.length > 1 && literal.endsWith('/')) {
          hits.push({ file, line: i + 1, literal, text: trimmed })
        }
      }
    })
  }
  if (hits.length > 0) {
    report('warn', title, `${hits.length} 处 prefix 以 / 结尾`)
    for (const h of hits) console.log(`\x1b[2m      ${h.file}:${h.line}  ${h.literal}\x1b[0m`)
    return { severity: 'warn', detail: `${hits.length} prefix literal(s) end with /` }
  }
  report('ok', title, `${files.length} 个源文件`)
  return { severity: 'ok', detail: `${files.length} file(s) scanned` }
}