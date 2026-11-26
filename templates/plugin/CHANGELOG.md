# CHANGELOG

本项目的变更都记在这里。版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。
**中文条目带一句英文摘要**，两边都能读懂"这次改了什么、为什么"。

All releases are logged here. Versions follow SemVer. **Every Chinese entry
carries a one-line English summary**, so both audiences can read what changed
and why.

<!-- 往下追加新版本，永远不要把旧条目改掉。 -->

## 0.1.0 — {{date}}

首个可用版本 / First usable release.

- **宿主半边**：挂上只读的 `/{{name}}/state` 与 `/{{name}}/status` 端点
  (Host side: mounts read-only `/{{name}}/state` and `/{{name}}/status`)
- **客户端半边**：侧边栏页脚按钮，用动态注入挂载，拿不到 service 时静默闲置
  (Client side: a sidebar-footer button mounted through dynamic injection, idle
  when services are unavailable)
- **契约**：`cordis.patch.yml` 的 insert 行与 `package.json` 的 `dsh.bundle.patch`
  就位，`README.md` / `README.en.md` 双语成对
  (Contract: the patch insert row and `dsh.bundle.patch` are in place, and the
  README pair exists)
- **刻意不声明任何 `@deepseek-ai/*` peerDependencies**：避开 0.2.0+ 兼容闸门整包跳过
  (No `@deepseek-ai/*` peerDependencies on purpose, to dodge the wholesale skip
  in the 0.2.0+ compatibility gate)