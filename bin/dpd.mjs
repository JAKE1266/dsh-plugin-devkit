#!/usr/bin/env node
/**
 * bin/dpd.mjs — 命令行入口。
 *
 * 薄到只剩"跑 main"：所有逻辑在 lib/ 里，测试才能直接调 main() 而不起子进程。
 * 顶层错误也在这里兜住，打一行人话而不是丢一个 stack trace 给用户。
 */
import { main } from '../lib/cli.mjs'

// 终端不带色/用户显式关掉时，把 ANSI 颜色码剥掉再输出。用一个受控的包装，
// 而不是散在各处的三目判断 —— 输出路径统一，行为才统一。
function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, '')
}
if (process.env.NO_COLOR === '1' || process.env.TERM === 'dumb') {
  for (const name of ['log', 'warn', 'info', 'error']) {
    const original = console[name].bind(console)
    console[name] = (...args) => original(...args.map((a) => (typeof a === 'string' ? stripAnsi(a) : a)))
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`dpd 内部错误：${String(error?.stack ?? error?.message ?? error)}`)
  process.exitCode = 1
})