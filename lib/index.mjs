/**
 * lib/index.mjs — 程序库入口。
 *
 * CLI（bin/dpd.mjs）之外，这些也能当库用：
 *
 *   import { runChecks, scaffold, checks } from 'dsh-plugin-devkit'
 *
 * 典型场景：把 `runChecks(dir)` 挂到自己仓库的 CI 或 `npm test` 里，
 * 不需要装一个 CLI 也能拿到那几条不变量检查。
 */
export { main, VERSION } from './cli.mjs'
export { runChecks, checks, checkIds, getCheck } from './checks/index.mjs'
export { scaffold, reportScaffold } from './new.mjs'
export { render, walk, normalizePluginName, readIfExists, isDir, isFile } from './util.mjs'