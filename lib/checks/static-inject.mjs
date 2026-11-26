/**
 * static-inject.mjs — 坑②：客户端 bundle 里出现静态 `inject`。
 *
 * 真实事故：客户端加载器把**任何不是 active 的条目**当致命错误
 * （`web boot: N entry did not activate`），于是**整个 GUI 打不开**。
 * 静态 `inject` 就是在宿主给不出某个 service 时把 fiber 按在 pending 的那只手：
 *
 *   dsh-boot-animation: pending (waiting for service: uisession)
 *
 * 正解是 bundle **不导出静态 inject**，两个 service 都用 cordis 的动态注入
 * `ctx.inject([...], cb)`。宿主给不出时插件静默闲置 —— 对一个装饰性插件，
 * 这才是正确的失败方式。
 *
 * 这里做静态检查：产物存在时直接读产物断言 `inject` 不存在；产物不存在时
 * 检查源码里有没有把 `inject` 写进 bundle 导出的形状。
 */
import { readIfExists, report } from '../util.mjs'

export const id = 'static-inject'
export const title = '客户端 bundle 不导出静态 inject'
export const why = '静态 inject 会让条目停在 pending，客户端加载器随即判整个 GUI 启动失败'

/** 在产物文本里找 `inject` 导出的几种常见写法。 */
function findStaticInject(text) {
  const hits = []
  const patterns = [
    { re: /(?:export\s*\{[^}]*?)\binject\b[^}]*\}/g, note: 'export list 里有 inject' },
    { re: /(?:export\s+(?:const|let|var|function)\s+inject\b)/g, note: 'export 了名为 inject 的绑定' },
    { re: /\binject\s*:\s*\[/g, note: '字面量里有 inject: [...] 的静态声明' },
    { re: /export\s+default\s*\{[^}]*\binject\b/g, note: 'default export 对象里有 inject' },
  ]
  for (const { re, note } of patterns) {
    let m
    while ((m = re.exec(text)) !== null) {
      const line = text.slice(0, m.index).split('\n').length
      hits.push({ line, note })
    }
  }
  return hits
}

export function run(root) {
  const artifact = `${root}/lib/client.js`
  const text = readIfExists(artifact)
  if (text === null) {
    report('skip', title, '没有 lib/client.js（先 build 再查，或源码里也别写静态 inject）')
    return { severity: 'skip' }
  }
  const hits = findStaticInject(text)
  if (hits.length > 0) {
    report('fail', title, `${artifact} 里有 ${hits.length} 处静态 inject`)
    for (const h of hits) console.log(`\x1b[2m      :${h.line}  ${h.note}\x1b[0m`)
    return { severity: 'fail', detail: 'static inject present in client bundle' }
  }
  report('ok', title, artifact)
  return { severity: 'ok', detail: artifact }
}