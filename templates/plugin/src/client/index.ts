/**
 * src/client/index.ts — 客户端半边（浏览器侧）的入口。
 *
 * 契约由 scripts/verify-client-boot.mjs 守着，其中最关键的一条：
 *
 *   **不要 export 静态 `inject`。**
 *
 * 为什么：客户端加载器把任何不是 active 的条目都当致命错误
 * （`web boot: N entry did not activate`），于是整个 GUI 打不开。静态
 * `inject` 就是在宿主给不出某个 service 时把 fiber 按在 pending 的那只手 ——
 * 这个仓库的原型插件就是这样把一个用户的整个 harness 弄死过：
 *
 *   {{pkgName}}: pending (waiting for service: uisession)
 *
 * 正解是只做动态注入：宿主给得出 service 就挂，给不出就静默闲置。
 * 对一个装饰性插件，"什么都不显示"是正确的失败方式，"整个 GUI 打不开"不是。
 */

/** 宿主还没答复之前，客户端不做任何显示决定。 */
let settingsLoaded = false

const state = {
  greeting: 'hello',
  ready: false,
}

/**
 * 取自己的 host 侧状态。
 *
 * 所有 fetch 都指向插件自己的路由，不用绝对路径 —— host:port 每次可能都变。
 * 失败时静默回落默认值：客户端的一条 fetch 失败不该把用户的界面弄坏。
 */
async function fetchState(): Promise<typeof state> {
  try {
    const response = await fetch('/{{name}}/state', { credentials: 'same-origin' })
    if (!response.ok) return { ...state }
    const data = (await response.json()) as Partial<typeof state>
    settingsLoaded = true
    return { ...state, ...data, ready: true }
  } catch {
    // 拿不到就保持默认状态，不要抛 —— 抛出去会冒泡到 cordis 的挂载路径。
    return { ...state }
  }
}

export function apply(ctx: any) {
  const effect = typeof ctx.effect === 'function' ? ctx.effect : (fn: () => void) => fn()

  const slots = ctx.slots
  const inject = typeof ctx.inject === 'function' ? ctx.inject : null

  /** 真正干活的部分：拿到 slots 才注册界面。 */
  const mount = (slotsService: any) => {
    const disposers: Array<() => void> = []

    // 注册一个侧边栏页脚动作。名字是宿主定义的 seat，不是我们起的。
    if (typeof slotsService?.register === 'function') {
      disposers.push(
        slotsService.register({
          name: 'sidebar.footer.action',
          render: () => renderButton(),
        }),
      )
    }

    // 拉一次状态。用 effect 包起来，dispose 时会取消。
    effect(() => {
      let cancelled = false
      void fetchState().then((next) => {
        if (!cancelled) Object.assign(state, next)
      })
      return () => {
        cancelled = true
      }
    })

    return () => {
      for (const d of disposers.reverse()) {
        try {
          d?.()
        } catch {
          // 同上：dispose 抛错不阻断卸载链。
        }
      }
    }
  }

  let disposeMount: (() => void) | null = null

  if (inject) {
    // 动态注入：宿主给不出 service 时回调不执行，条目停在"闲置"而不是
    // pending —— 这条区别就是能不能启动的分别。
    const fiber = inject(['slots', 'uiSession'], (c: any) => {
      disposeMount = mount(c.slots ?? c.uiSession?.slots)
      return () => disposeMount?.()
    })
    return () => fiber?.dispose?.()
  }

  // 没有动态注入能力的老宿主：直接试一次，拿不到就静默返回。
  if (slots) {
    disposeMount = mount(slots)
    return () => disposeMount?.()
  }
  return () => {}
}

/** 渲染页脚按钮。刻意简单：这里是改 UI 的起点。 */
function renderButton(): any {
  if (state.ready && state.greeting) {
    return { tag: 'span', props: { title: state.greeting }, children: [state.greeting] }
  }
  return null
}

export default apply
export { fetchState }
export type ClientState = typeof state
export const isSettingsLoaded = () => settingsLoaded