/**
 * manifest.mjs — 坑③：包是个 inert dependency，装了但什么都不干。
 *
 * 真实情况：DSH 启动时比对 `dsh.profile.bundles` 和已安装包，只有 manifest
 * 声明了 `dsh.bundle.patch` 的包才会进图层栈、才会被 cordis.patch.yml 的
 * insert 行挂载。少了这一步，包"装上了、没有任何反应"，只给一句
 * `declares no dsh.bundle` 的 warning。
 *
 * 检查一组固定的不变量，这些都是"装上没反应"的成因：
 *   1. cordis.patch.yml 存在，且 `- insert:` 下有一行 `id:` 与包名一致
 *   2. package.json 声明 `dsh.bundle.patch` 指向那个文件
 *   3. `files` 数组包含 cordis.patch.yml（否则发布包里没有它）
 *   4. `exports` 暴露 `./package.json`（DSH 要读 manifest）
 *   5. `"type": "module"`（源码大量是 ESM）
 *   6. `engines.node` 存在
 */
import { readIfExists, report } from '../util.mjs'

export const id = 'manifest'
export const title = 'packaging 不变量（patch / manifest / files / exports）'
export const why = '少任何一项，插件就装上但不起作用，而且往往不报错'

function parsePatch(text) {
  // 只做行级解析：这个 YAML 形状固定，引一个 YAML 解析器只会把检查变脆。
  const ids = []
  let inInsert = false
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*-\s*insert:/.test(raw)) {
      inInsert = true
      continue
    }
    if (inInsert && /^\s*-\s*id:\s*(\S+)/.test(raw)) {
      const m = raw.match(/^\s*-\s*id:\s*([^\s#]+)/)
      ids.push(m[1])
      inInsert = false
      continue
    }
    if (inInsert && /^\s*id:\s*([^\s#]+)/.test(raw)) {
      const m = raw.match(/^\s*id:\s*([^\s#]+)/)
      ids.push(m[1])
    }
  }
  return ids
}

export function run(root) {
  const pkgText = readIfExists(`${root}/package.json`)
  if (pkgText === null) {
    report('skip', title, '没有 package.json（不是可安装的插件目录）')
    return { severity: 'skip' }
  }
  let pkg
  try {
    pkg = JSON.parse(pkgText)
  } catch (e) {
    report('fail', title, `package.json 不是合法 JSON：${e.message}`)
    return { severity: 'fail', detail: 'invalid package.json' }
  }

  const problems = []
  const patchPath = `${root}/cordis.patch.yml`
  const patchText = readIfExists(patchPath)
  const name = pkg.name ?? '<unnamed>'

  // 1. patch 文件本身
  if (patchText === null) {
    problems.push('缺 cordis.patch.yml —— 包不会进 bundle 图层，装上什么也不发生')
  } else {
    const ids = parsePatch(patchText)
    if (ids.length === 0) {
      problems.push('cordis.patch.yml 里找不到 insert 行的 id')
    } else if (name !== '<unnamed>' && !ids.includes(name)) {
      problems.push(`insert 行的 id 是 ${ids.join(', ')}，与包名 ${name} 不一致`)
    }
  }

  // 2. manifest 指向 patch
  if (!pkg.dsh?.bundle?.patch) {
    problems.push('package.json 缺 dsh.bundle.patch 字段')
  } else if (!String(pkg.dsh.bundle.patch).includes('cordis.patch.yml')) {
    problems.push(`dsh.bundle.patch 指向 ${pkg.dsh.bundle.patch}，看着不像 bundle patch`)
  }

  // 3. files 覆盖 patch
  if (!Array.isArray(pkg.files)) {
    problems.push('package.json 没有 files 数组 —— 发布包会带上 node_modules')
  } else if (!pkg.files.includes('cordis.patch.yml')) {
    problems.push('files 数组里没有 cordis.patch.yml —— 发布包里没有挂载声明')
  }

  // 4. exports 暴露 package.json
  if (!pkg.exports || typeof pkg.exports !== 'object' || !('./package.json' in pkg.exports)) {
    problems.push('exports 里没有 ./package.json —— DSH 读不到 manifest')
  }

  // 5. ESM
  if (pkg.type !== 'module') {
    problems.push('没声明 "type": "module"')
  }

  // 6. engines
  if (!pkg.engines?.node) {
    problems.push('没声明 engines.node')
  }

  if (problems.length > 0) {
    report('fail', title, `${problems.length} 处`)
    for (const p of problems) console.log(`\x1b[2m      - ${p}\x1b[0m`)
    return { severity: 'fail', detail: problems.join('; ') }
  }
  report('ok', title, `${name} → ${pkg.dsh.bundle.patch}`)
  return { severity: 'ok', detail: name }
}