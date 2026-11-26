/**
 * new.mjs — `dpd new <name>`：把一个插件铺出来。
 *
 * 设计原则：
 *   1. **生成的产物必须直接通过 `dpd check` 全部检查** —— 否则脚手架自己
 *      就在教坏习惯。这条由 test/run.mjs 守着：生成一个插件、当场检查。
 *   2. 零依赖：不引任何模板引擎、不跑 npm install。用户 clone 完就能用。
 *   3. 每个生成文件都能被手改，而不是"生成的别动"。
 *
 * 工作方式：从 templates/plugin 逐个文件读出来，对 `{{var}}` 做替换后写出。
 * 二进制的（icon.svg 之类）按原样复制。
 */
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEMPLATE_ROOT, normalizePluginName, render, resolveTargetDir, isDirEmptyish, report } from './util.mjs'
import { checkIds } from './checks/index.mjs'

/** 不需要变量替换、原样复制的后缀。 */
const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.ico', '.woff', '.woff2'])

/** 递归列出模板里的所有文件（相对路径）。 */
function listTemplateFiles(dir = TEMPLATE_ROOT, base = TEMPLATE_ROOT) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...listTemplateFiles(full, base))
    } else {
      out.push(relative(base, full))
    }
  }
  return out
}

function ensureOut(file) {
  const dir = dirname(file)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function scaffold(rawName, options = {}) {
  const name = normalizePluginName(rawName)
  if (!name) {
    console.error('\x1b[31m插件名不能为空\x1b[0m')
    process.exitCode = 1
    return null
  }

  const targetDir = resolveTargetDir(options.cwd ?? process.cwd(), options.dir ?? name)

  if (existsSync(targetDir) && !isDirEmptyish(targetDir) && !options.force) {
    console.error(`\x1b[31m${targetDir} 不是空目录。\x1b[0m`)
    console.error('用 --force 强制铺进去（会覆盖同名文件），或换一个目录。')
    process.exitCode = 1
    return null
  }

  const packageName = `dsh-${name.replace(/^dsh-/, '')}`
  const vars = {
    name,
    nameUpper: name.replace(/(^|-)([a-z])/g, (_m, sep0, ch) => (sep0 ? '' : '') + ch.toUpperCase()).replace(/-([a-z])/g, (_m, c) => c.toUpperCase()),
    description: options.description ?? `一个 DSH 插件。`,
    descriptionEn: options.descriptionEn ?? `A DSH plugin.`,
    author: options.author ?? process.env.GITHUB_USER ?? 'your-name',
    githubUser: options.githubUser ?? process.env.GITHUB_USER ?? 'your-name',
    packageName,
    pkgName: packageName,
    pkgNameFinal: packageName,
    year: new Date().getFullYear(),
    date: new Date().toISOString().slice(0, 10),
  }

  const files = listTemplateFiles()
  const written = []

  for (const rel of files) {
    const src = join(TEMPLATE_ROOT, rel)
    const outRel = render(rel, { name: vars.name, pkgName: vars.pkgNameFinal }).text
    const outPath = join(targetDir, outRel)
    if (BINARY_EXTS.has(rel.slice(rel.lastIndexOf('.')))) {
      ensureOut(outPath)
      writeFileSync(outPath, readFileSync(src))
      written.push(outRel)
      continue
    }
    const text = readFileSync(src, 'utf8')
    const { text: rendered, missing } = render(text, vars)
    if (missing.length > 0) {
      // 模板里的变量没给全，属于开发期问题，运行时大声报出来。
      console.error(`\x1b[31m模板 ${rel} 有未定义变量：${missing.join(', ')}\x1b[0m`)
      process.exitCode = 1
      return null
    }
    ensureOut(outPath)
    writeFileSync(outPath, rendered, 'utf8')
    written.push(outRel)
  }

  return { name, packageName: vars.pkgNameFinal, dir: targetDir, files: written }
}

/** 打印生成结果，附上"下一步做什么"。 */
export function reportScaffold(result) {
  if (result === null) return
  const rel = relative(process.cwd(), result.dir) || '.'
  console.log(`\n\x1b[32m插件 ${result.packageName} 已生成：${rel}\x1b[0m`)
  console.log(`\n包含 ${result.files.length} 个文件。接下来：\n`)
  console.log(`  \x1b[1mcd ${rel}\x1b[0m`)
  console.log(`  \x1b[1mdpd check\x1b[0m          # ${checkIds.length} 项检查，现在应该全绿`)
  console.log(`  \x1b[1mnpm test\x1b[0m           # 脚手架自带的测试`)
  console.log(`  \x1b[1mnpm run preflight\x1b[0m  # 用一次性 profile 真启动一次 DSH，确认没把它弄死`)
  console.log(`\n然后开始改 \x1b[1msrc/host/index.js\x1b[0m 和 \x1b[1msrc/client/index.ts\x1b[0m。`)
  console.log(`\x1b[2m契约已经就位：cordis.patch.yml 的 insert 行、package.json 的 dsh.bundle.patch、\x1b[0m`)
  console.log(`\x1b[2mdocs 的 README 双语对、CI、CHANGELOG、LICENSE。这些不属于"以后再说"。\x1b[0m`)
}