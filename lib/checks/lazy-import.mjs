/**
 * lazy-import.mjs — 坑⑧：顶层静态导入一个解析不到的包，插件静默不激活。
 *
 * 真实记录（dsh-big-fat-fish）：顶层静态导入解析不到的包会在**模块求值阶段**
 * 抛错，cordis 还没调用 `apply` 就结束了。表现不是报错，而是插件 entry 显示
 * `pending` 或干脆不出现在列表里，没有任何地方说明原因。
 *
 * 检查方式：扫顶层（列 0）的静态 import/require，凡是指向
 * `@deepseek-ai/*`（宿主侧包，可能未安装）或非相对、非 node: 的 specifier，
 * 都给一条"改成动态 import()"的建议。不强行判 fail：很多插件确实静态导入
 * 自己的 devDependency，那是打包时的输入，运行时不需要。
 */
import { walk, readIfExists, report } from '../util.mjs'

export const id = 'lazy-import'
export const title = '顶层没有导入运行时不存在的包'
export const why = '模块求值期抛错发生在 cordis 挂载之前，插件静默不激活且不说明原因'

const HOST_SCOPES = ['@deepseek-ai/']

export function run(root) {
  const files = walk(root).filter((f) => /\.(?:js|mjs|ts|cjs)$/.test(f) && !/\.(?:d\.ts|test\.|spec\.)/.test(f))
  if (files.length === 0) {
    report('skip', title, '目录里没有源文件')
    return { severity: 'skip' }
  }
  const suspects = []
  for (const file of files) {
    const text = readIfExists(`${root}/${file}`)
    if (text === null) continue
    const lines = text.split(/\r?\n/)
    // 只从第一个 import 之前看顶层：缩进为 0 且不是函数体内的静态 import。
    let sawImport = false
    lines.forEach((line, i) => {
      const isTop = !/^\s+/.test(line)
      if (!isTop) return
      const importMatch = line.match(/^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/)
      const requireMatch = line.match(/^\s*(?:const|let|var)\s+.*?=\s*require\(['"]([^'"]+)['"]\)/)
      const spec = importMatch?.[1] ?? requireMatch?.[1]
      if (spec) {
        sawImport = true
        if (HOST_SCOPES.some((s) => spec.startsWith(s))) {
          suspects.push({ file, line: i + 1, spec, why: '宿主侧包，运行环境可能没装' })
        } else if (!spec.startsWith('.') && !spec.startsWith('node:') && !/^[a-z@]/.test(spec.replace('@', ''))) {
          suspects.push({ file, line: i + 1, spec, why: '不是相对路径也不是内建模块' })
        }
        return
      }
      if (sawImport && /^(?:export|const|let|var|function|class|async)\b|^ctx\.|^\}/.test(line)) sawImport = false
    })
  }
  // 只报宿主侧：普通的第三方包静态导入不是问题，否则这个检查会变噪声。
  const hostHits = suspects.filter((s) => s.why.includes('宿主'))
  if (hostHits.length > 0) {
    report('warn', title, `${hostHits.length} 处顶层导入宿主包`)
    for (const h of hostHits) console.log(`\x1b[2m      ${h.file}:${h.line}  ${h.spec}  → 改动态 import()\x1b[0m`)
    return { severity: 'warn', detail: hostHits.map((h) => `${h.file}:${h.line}`).join(', ') }
  }
  report('ok', title, `${files.length} 个源文件`)
  return { severity: 'ok', detail: `${files.length} file(s) scanned` }
}