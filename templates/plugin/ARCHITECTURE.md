# ARCHITECTURE

_为什么是这个形状，而不是别个。_ 设计文档只回答"为什么"；代码本身回答"怎么
做的"。

## 两半，一条契约

这个插件和所有 DSH 插件一样分成两半：

```
┌─────────────────────────┐        ┌─────────────────────────┐
│  src/host/index.js      │        │  src/client/index.ts     │
│  服务端侧 · cordis 插件  │        │  浏览器侧 · GUI 挂载     │
└───────────┬─────────────┘        └───────────┬─────────────┘
            │ cordis 挂载                      │ 客户端注入
            ▼                                  ▼
     宿主 service：webServer             宿主 service：slots / uiSession
```

两半通过**一致的规则**通信，而不是通过 import 对方：host 侧把读到的状态发布到
自己的路由，客户端 fetch 自己的路由。host 侧从不 import 客户端代码，反之亦然。

## 为什么不静态注入

客户端 bundle **不导出静态 `inject`**，这是本仓库最重要的一条设计决定。

客户端加载器把任何不是 `active` 的条目都当致命错误：`web boot: N entry did not
activate`，于是整个 GUI 打不开。静态 `inject` 就是在宿主给不出某个 service 时
把 fiber 按在 `pending` 的那只手。所以插件只用动态注入：

- 宿主给得出 service → 回调执行 → 界面挂上
- 宿主给不出 → 回调不执行 → 条目停在**闲置**而不是 pending

对一个装饰性插件，"什么都不显示"是正确的失败方式；"整个 GUI 打不开"不是。

## 失败方式汇总

| 场景 | 本插件的表现 |
|---|---|
| 运行环境给不出 `webServer` | 没有路由，插件静默 |
| 运行环境给不出 `slots` / `uiSession` | 没有按钮，插件静默 |
| host 侧状态端点取不到 | 客户端保持默认值，不抛 |
| 卸载 | `dispose()` 撤销挂载过的每一条 |

## 为什么没有构建产物

仓库交付源码。`npm run check` 中依赖 `lib/client.js` 的检查项在产物不存在时
**跳过**而不是失败 —— 检查器要对"还没建过"和"建坏了"作出区分。

## 契约由谁守着

| 不变量 | 守门人 |
|---|---|
| `cordis.patch.yml` 的 insert id 与包名一致 | `dsh check` 的 manifest 项 / `npm test` |
| `package.json` 声明 `dsh.bundle.patch` | 同上 |
| `files` 数组包含 `cordis.patch.yml` | 同上 |
| 没有静态 `inject` | `scripts/verify-client-boot.mjs` / `npm test` |
| CSS 模板字符串里没有游离反引号 | `scripts/check-css-template.mjs` |
| 能在干净环境里挂上而不弄死 DSH | `npm run preflight` |