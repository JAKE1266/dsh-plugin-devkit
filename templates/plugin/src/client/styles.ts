/**
 * src/client/styles.ts — 客户端样式表。
 *
 * ⚠️ 这里有个坑，本文件故意待在原地当示范：
 *
 *   样式住在模板字符串里。注释中写一个**反引号**就会把它提前结束，而报错
 *   不在当时报的地方：打包器报的是 TypeScript 的 parse error，指向某一行
 *   CSS；同时 `lib/client.js` 保持旧内容不变 —— 于是"改坏了也不发货"，
 *   线上跑的还是上一版。这类事发生过两次，其中一次进了 commit。
 *
 *   所以不要在这里写反引号。`scripts/check-css-template.mjs` 守着这条，
 *   `npm run check` 会先跑它。
 */

export const CSS = `
.{{name}}-footer-button {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.25rem;
  color: var(--dsh-text-secondary, #6b7280);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 120ms ease, background-color 120ms ease;
}

.{{name}}-footer-button:hover {
  color: var(--dsh-text-primary, #111827);
  background: var(--dsh-bg-hover, rgba(0, 0, 0, 0.04));
}

.{{name}}-footer-button:focus-visible {
  outline: 2px solid var(--dsh-accent, #4f46e5);
  outline-offset: 1px;
}

/* 宿主还没准备好时不显示任何东西，而不是显示一个坏掉的状态。 */
.{{name}}-footer-button[data-ready="false"] {
  display: none;
}
`

/** 把样式注入页面。重复调用是幂等的。 */
export function injectStyles(doc: any): void {
  if (!doc) return
  const styleId = '{{name}}-styles'
  if (doc.getElementById?.(styleId)) return
  const style = doc.createElement?.('style')
  if (!style) return
  style.id = styleId
  style.textContent = CSS
  doc.head?.appendChild?.(style)
}