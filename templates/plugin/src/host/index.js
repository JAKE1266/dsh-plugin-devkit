/**
 * src/host/index.js — 宿主半边（服务端侧）的入口。
 *
 * cordis 的约定：本文件 export 一个 `apply(ctx)`，在插件被挂载时调用一次，
 * 返回一个 dispose 或什么都不返回。ctx 上有宿主提供的各种 service。
 *
 * 两条本仓库坚持的做法：
 *
 * 1. **不在顶层静态 import 任何 @deepseek-ai/* 包**。模块求值期的抛错发生在
 *    cordis 调用 apply 之前，插件会静默不激活 —— 没有日志说明原因。需要宿主
 *    能力时，从 ctx 上取（ctx.webServer、ctx.llm），或者动态 import()。
 *
 * 2. **启动路径上不做任何会阻塞的事**。一次 DNS 查询、一次 fetch 大桥都可能
 *    把 fiber 留在 pending，而 pending 的条目会让整个 DSH 启动失败。真的需要
 *    预热，放到 ctx.effect 里异步做。
 *
 * 契约检查：`dpd check` 的 lazy-import / manifest 项守着这两条。
 */

/** 默认配置。cordis.patch.yml 里的值会覆盖同名字段。 */
const DEFAULTS = {
  greeting: 'hello',
}

export function apply(ctx) {
  // 从 ctx 取插件自己的 config（挂载时由 patch 的 config 合并进来）。
  const config = { ...DEFAULTS, ...(ctx.config ?? {}) }

  // ctx.effect：副作用在这里登记，dispose 时自动清理。拿不到就给个空实现，
  // 免得这个插件在旧宿主上直接抛错（拿不到 service 时闲置，而不是崩）。
  const effect = typeof ctx.effect === 'function' ? ctx.effect : (fn) => fn()

  const disposers = []

  // ── 路由：宿主 webserver 存在时，挂一个只读的健康检查端点 ──────────────
  // 注意 prefix 不带尾部斜杠：宿主用
  //   pathname !== prefix && !pathname.startsWith(prefix + '/')
  // 匹配，尾部斜杠会让这一族路由全部静默 404。
  const webServer = ctx.webServer
  if (webServer && typeof webServer.route === 'function') {
    const prefix = '/{{name}}'
    disposers.push(
      effect(() =>
        webServer.route({
          method: 'GET',
          path: `${prefix}/status`,
          handler: async () => ({
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ok: true, greeting: config.greeting }),
          }),
        }),
      ),
    )
  }

  // ── 客户端要用的数据 ────────────────────────────────────────────────────
  // host 侧把读到的状态发布出去，客户端通过它自己的路由取。
  if (webServer && typeof webServer.route === 'function') {
    const prefix = '/{{name}}'
    disposers.push(
      effect(() =>
        webServer.route({
          method: 'GET',
          path: `${prefix}/state`,
          handler: async () => ({
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ greeting: config.greeting, ready: true }),
          }),
        }),
      ),
    )
  }

  // 返回一个 dispose：宿主卸载插件时调用。挂载了什么都必须在配对地摘掉，
  // 否则重启/热替换后旧路由还活着，现象是"插件卸载了但端点还在"。
  return function dispose() {
    for (const disposeOne of disposers.reverse()) {
      try {
        disposeOne?.()
      } catch {
        // dispose 里抛错不该阻断卸载链。
      }
    }
  }
}

export default apply