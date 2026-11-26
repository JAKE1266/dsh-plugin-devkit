/**
 * util.mjs — 脚手架用到的基础件。
 *
 * 刻意只依赖 Node 内建模块：这个工具要在刚装完 Node 的机器上、在别人
 * 还没跑 `npm install` 的插件目录里直接跑起来。任何第三方依赖都会让
 * `dpd check` 在最需要它的那一刻（刚 clone 下来、什么都没装）跑不动。
 */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { join, dirname, relative, isAbsolute, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEVKIT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
export const TEMPLATE_ROOT = join(DEVKIT_ROOT, 'templates', 'plugin')

/** 读文件，不存在返回 null 而不是抛。 */
export function readIfExists(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

export function isDir(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

/** 写文件，自动建父目录。 */
export function writeFileEnsured(path, content) {
  ensureDir(dirname(path))
  writeFileSync(path, content, 'utf8')
}

/** 复制模板文件（内容原样，不做变量替换——变量替换只对文本模板做）。 */
export function copyTemplateFile(from, to) {
  ensureDir(dirname(to))
  copyFileSync(from, to)
}

/**
 * 递归列出一个目录下所有文件的相对路径（相对 root，用 / 分隔）。
 * 跳过 node_modules / .git —— 检查别人的仓库时会遇到，不能把它拖死。
 */
export function walk(root, { skip = ['node_modules', '.git', 'dist', 'build', 'lib'] } = {}) {
  const out = []
  const walkDir = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (skip.includes(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walkDir(full)
      } else if (entry.isFile()) {
        out.push(relative(root, full).split(sep).join('/'))
      }
    }
  }
  if (isDir(root)) walkDir(root)
  return out
}

/**
 * 极简模板渲染：`{{var}}` 替换。
 *
 * 不用 ejs/handlebars —— 每个模板文件都要能被手改、被 diff、被 IDE 高亮，
 * 引一个模板引擎就多一条会坏的链。这里只需要替换变量，20 行够了。
 * 未提供的变量渲染成空字符串并记在 missing 里，调用方可以决定是否报错。
 */
export function render(text, vars = {}) {
  const missing = []
  const out = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name) => {
    if (!(name in vars)) missing.push(name)
    const value = vars[name]
    return value === undefined || value === null ? '' : String(value)
  })
  return { text: out, missing }
}

/** 把用户给的插件名规范化：小写、连字符、去掉 dsh- 前缀的重复添加由调用方决定。 */
export function normalizePluginName(raw) {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

/** 解析目标目录：相对路径基于 cwd。 */
export function resolveTargetDir(cwd, maybeRelative) {
  return isAbsolute(maybeRelative) ? maybeRelative : resolve(cwd, maybeRelative)
}

/** 目录为空或只含隐藏文件 → 可以安全地在里面铺脚手架。 */
export function isDirEmptyish(dir) {
  if (!isDir(dir)) return true
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return true
  }
  return entries.filter((name) => !name.startsWith('.')).length === 0
}

/** 删目录，失败不抛。 */
export function removeForced(path) {
  try {
    rmSync(path, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

/** 取一个 .js/.mjs/.ts 文件的所有行，供行级检查用。 */
export function linesOf(path) {
  const text = readIfExists(path)
  if (text === null) return null
  return text.split(/\r?\n/)
}

/** 打印一行检查结果。severity: ok | warn | fail | skip */
export function report(severity, label, detail = '') {
  const tag = {
    ok: '\x1b[32mok  \x1b[0m',
    warn: '\x1b[33mwarn\x1b[0m',
    fail: '\x1b[31mFAIL\x1b[0m',
    skip: '\x1b[36mskip\x1b[0m',
    info: '\x1b[36minfo\x1b[0m',
  }[severity]
  const suffix = detail ? `  \x1b[2m${detail}\x1b[0m` : ''
  console.log(`  ${tag} ${label}${suffix}`)
}

export function heading(text) {
  console.log(`\n\x1b[1m${text}\x1b[0m`)
}

export { writeFileEnsured as writeOut }