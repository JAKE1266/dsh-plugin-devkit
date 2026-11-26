/**
 * check-css-template.mjs — 坑①：CSS 模板字符串里的反引号。
 *
 * 由 `dsh-plugin-devkit` 生成，原样保留在仓库里 —— 生成物不依赖 devkit，
 * 也能自己跑。
 *
 * 真实事故：样式住在模板字符串里，注释里一个反引号就把它提前结束。伤的地方
 * 不在报错的地方：打包器报 **TypeScript** parse error 指向某行 CSS，同时旧的
 * lib/client.js 原地不动，于是"改坏了也不发货"。
 *
 * Usage: node scripts/check-css-template.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const TARGET = join(HERE, '..', 'src', 'client', 'styles.ts')

const ENTRY_RE = /^\s*export\s+const\s+CSS\s*=\s*`|^\s*const\s+CSS\s*=\s*`/
const CLOSE_RE = /^\s*`\s*;?\s*$/

let text
try {
  text = readFileSync(TARGET, 'utf8')
} catch {
  console.log(`check-css-template: SKIP (no ${TARGET})`)
  process.exit(0)
}

const lines = text.split(/\r?\n/)
let inside = false
const problems = []

lines.forEach((line, index) => {
  const at = index + 1
  if (!inside) {
    if (ENTRY_RE.test(line)) inside = true
    return
  }
  // 只有反引号（加空白和可选分号）的一行才闭合样式表。
  if (CLOSE_RE.test(line)) {
    inside = false
    return
  }
  if (line.includes('`')) {
    problems.push(`${at}: ${line.trim()}`)
  }
})

if (inside) {
  console.error('check-css-template: the CSS template literal is never closed')
  process.exit(1)
}

if (problems.length > 0) {
  console.error('check-css-template: backtick inside the CSS template literal.')
  console.error('The sheet is a template literal, so a backtick in a comment ends it early')
  console.error('and the bundler will report a confusing parse error on a CSS line.')
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}

console.log('check-css-template: ok (no stray backticks in the CSS sheet)')