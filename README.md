# dsh-plugin-devkit

> DSH 插件脚手架与体检仪 —— 一条命令生成带测试和 CI 的插件骨架，再用静态检查拦住那些只能靠踩坑才知道的雷。
> Scaffold a DSH plugin in one command, then run static checks that catch the traps you only learn by getting burned.

零运行时依赖，Node ≥ 18。命令名 `dpd`。

## 为什么

写 DSH 插件时，编译/打包通过 **不等于** 能装进 profile 里跑起来。很多事故是反复踩出来的：CSS 模板字符串里一个游离反引号让整个 bundle 语法错误、`peerDependencies` 把整包推进兼容闸门、路由 `prefix` 多个尾斜杠导致 404、README 少一版语言被审核打回……这些坑靠 `npm build` 看不出来。

`dpd` 把每一次真实事故固化成一条检查：生成时一次铺全契约，发布前一条命令体检。

## 安装

```bash
npm install -g dsh-plugin-devkit
# 或克隆后直接跑
node bin/dpd.mjs --help
```

## 四个命令

```
dpd new <name> [--dir PATH] [--description TEXT] [--force]
    生成一个"直接能过检查"的插件骨架（含 test / CI / 中英 README），
    生成后当场自查一遍。

dpd check [dir] [--only ID,...] [--skip ID,...] [--json] [--list] [--why]
    对插件目录跑 8 项静态检查。--why 讲每条检查背后的坑。

dpd doctor [dir]
    check + 本机环境诊断（Node 版本、npm、DSH 启动器、DSH_HOME）。

dpd preflight [dir]
    调用插件自带的 test/preflight-boot.mjs：用一次性 profile 真启动一次 DSH。
    在把插件指向任何真实 profile 之前先跑它。
```

## 8 项检查

| id | 拦住的坑 |
|---|---|
| `css-template` | CSS 模板字符串里没有游离的反引号 |
| `static-inject` | 客户端 bundle 不导出静态 `inject` |
| `manifest` | packaging 不变量（patch / manifest / files / exports） |
| `prefix-slash` | 路由 `prefix` 不带尾部斜杠 |
| `secrets` | 仓库里没有疑似密钥 |
| `bilingual` | README 中英成对，且带版本支持表 |
| `peer-gate` | `peerDependencies` 不会把整包推进兼容闸门 |
| `lazy-import` | 顶层没有导入运行时不存在的包 |

`dpd check --why` 会打印每条检查背后的真实事故。加新检查 = 在 `lib/checks/` 加一个文件并在 `index.mjs` 注册，不用改 CLI。

## 自测

```bash
node test/run.mjs
```

两条核心保证：
1. `dpd new` 生成的插件，`dpd check` 必须全绿——脚手架自己不能教坏习惯；
2. 每个检查必须能抓到自己那个坑——只会说 ok 的检查比没有更危险。

## License

MIT
