# {{pkgName}}

{{description}}

> English: [README.en.md](README.en.md)

---

## 它能做什么

_Sell the first sentence honestly._ 一句话说清它替你解决什么问题，然后是一张
功能表。别写"这是一个插件"这种废话 —— 用户要的是"我为什么要装它"。

| 功能 | 说明 |
|---|---|
| 一个页脚按钮 | 点一下能看到插件自己的状态 |
| 一个只读状态端点 | `GET /{{name}}/state`，给客户端和调试用 |

## 支持的 DSH 版本

| DSH 版本线 | 状态 |
|---|---|
| `0.1.5-rc.x` | ✅ |
| `0.2.0-rc.x` | ✅ |

> 本插件**刻意不声明任何 `@deepseek-ai/*` 的 peerDependencies**。宿主侧只从
> `ctx` 上取 service，客户端侧只用动态注入。这样它永远不会被 DSH 0.2.0 起的
> 版本兼容闸门**整包跳过** —— 那道闸门会把 peerDependencies 对不上的插件静默
> 丢掉，现象是"装上了、但重启后什么也没发生"，而且不报错。

## 安装

```sh
dsh plugin --profile web add <npm spec 或本目录路径>
```

本地开发（不经过网络）：

```sh
dsh plugin --profile web add link:<你克隆下来的目录>
```

**装完必须重启一次 DSH 服务**才生效（bundle 层是在启动时装配的）：

```sh
# 停掉当前的 dsh web，然后
dsh web
```

### 装完看不到效果？

客户端 bundle 的响应带 `cache-control: max-age=31536000, immutable`，而 URL 上的
`rev` 是**进程 nonce**、不随内容变化。浏览器会一直用第一次抓到的副本。装好或升级后
请在新窗口里按 **Ctrl+Shift+R（硬刷新）**，普通 F5 不够。

## 用法

装好后，侧边栏页脚会出现 `{{name}}` 的按钮。鼠标悬停显示 host 侧读到的问候语。

想改问候语，编辑 `cordis.patch.yml` 里 `config.greeting`，然后重启 DSH。

## 开发

```sh
npm test            # 契约测试（挂载声明、双语 README、静态 inject 不变量…）
npm run check       # CSS 反引号 + 客户端 boot 不变量
npm run preflight   # 用一次性 profile 真启动一次 DSH，确认没把它弄死
```

**在把插件指向任何真实 profile 之前，先跑 `npm run preflight`。** 理由：
一个从不安置 fiber 的插件会让 DSH 完全启动不了。用一个一次性 profile 验证
只需要几十秒，拿生产 profile 冒险则是另一回事。

## 已知限制

_M不写就是不负责任。_ 一条就够，但要有。

- 没有构建产物 `lib/`：仓库交付的是源码，`npm run check` 会跳过产物类检查

## 接下来可能做什么

- _把 Roadmap 写在这里。愿意帮忙的人需要知道从哪下手。_

## License

MIT — 见 [LICENSE](LICENSE)。