/**
 * secrets.mjs — 坑⑤：把 key 提交进仓库。
 *
 * 免费 LLM 类插件最常见的灾难：作者手快把 `config.json` 或
 * `.credentials.yaml` 提交了，里面是真 key。这类仓库一旦公开，key
 * 几分钟内就会被扫号脚本拎走，而 GitHub 自己的 secret scanning 也只是
 * 事后提醒。
 *
 * 检查方式：扫文本文件里像 secret 的字符串，外加一批"本来就不该出现"的
 * 文件名。刻意宁可多报：误报让人删一行注释，漏报让人换 key。
 */
import { walk, readIfExists, report } from '../util.mjs'

export const id = 'secrets'
export const title = '仓库里没有疑似密钥'
export const why = '真 key 进公开仓库等于送出去；这类包被扫号脚本光顾只需要几分钟'

const BANNED_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  'credentials.yaml',
  '.credentials.yaml',
  'config.json', // 免费 LLM 类插件的 config.json 常常装着真 key
  'api_keys.json',
  'accounts.json',
  'data/keys.json',
  'data/accounts.json',
]

const KEY_PATTERNS = [
  { re: /\bsk-[A-Za-z0-9_-]{16,}\b/g, label: 'OpenAI 风格 sk- key' },
  { re: /\bnvapi-[A-Za-z0-9_-]{16,}\b/g, label: 'NVIDIA NIM key' },
  { re: /\bms-[A-Za-z0-9]{20,}\b/g, label: 'ModelScope key' },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, label: 'AWS Access Key' },
  { re: /\bghp_[A-Za-z0-9]{20,}\b/g, label: 'GitHub Personal Access Token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, label: 'GitHub fine-grained PAT' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, label: 'Slack token' },
  { re: /\bglpat-[A-Za-z0-9_-]{16,}\b/g, label: 'GitLab token' },
  // 长 base64  Overshoot 容易误报，只抓带账号前缀的强信号。
  { re: /\bapi[_-]?key\s*[:=]\s*["'][A-Za-z0-9/+_=-]{24,}["']/gi, label: 'apiKey 硬编码赋值' },
  { re: /\btoken\s*[:=]\s*["'][A-Za-z0-9/+_=-]{32,}["']/gi, label: 'token 硬编码赋值' },
]

/** 会被误判的：示例值、占位符、脱敏串。 */
function looksLikePlaceholder(value) {
  if (/^[*x]+$/i.test(value)) return true
  if (/xxxx|YOUR|CHANGE|REPLACE|PLACEHOLDER|EXAMPLE|SAMPLE|<.*>/i.test(value)) return true
  return false
}

function scanText(text) {
  const hits = []
  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') && /example|demo|sample|xxx/i.test(trimmed)) return
    for (const { re, label } of KEY_PATTERNS) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(line)) !== null) {
        if (looksLikePlaceholder(m[0])) continue
        hits.push({ line: i + 1, label, excerpt: redact(trimmed) })
      }
    }
  })
  return hits
}

function redact(line) {
  return line.replace(/([A-Za-z0-9_-]{4})[A-Za-z0-9_-]{8,}([A-Za-z0-9_-]{2})/g, '$1…$2').slice(0, 90)
}

export function run(root) {
  const files = walk(root)
  const found = []
  const skipped = []
  for (const rel of files) {
    const norm = rel.replace(/\\/g, '/')
    if (BANNED_FILES.includes(norm)) found.push({ file: norm, label: '这个文件不该进仓库（可能装着真凭据）' })
    if (/\.(?:png|jpg|jpeg|gif|webp|mp4|webm|mov|zip|tgz|gz|woff2?|ttf|otf|ico)$/i.test(norm)) continue
    if (/pnpm-lock\.yaml$/.test(norm)) {
      skipped.push(norm)
      continue
    }
    if (/package-lock\.json$/.test(norm)) {
      skipped.push(norm)
      continue
    }
    const text = readIfExists(`${root}/${rel}`)
    if (text === null || text.length > 2_000_000) continue
    if (/pnpm-lock|integrity|sha512-/i.test(text.slice(0, 4000))) continue
    for (const h of scanText(text)) found.push({ file: norm, ...h })
  }

  if (found.length > 0) {
    report('fail', title, `${found.length} 处`)
    for (const f of found) {
      const where = f.line ? `${f.file}:${f.line}` : f.file
      console.log(`\x1b[2m      ${where}  ${f.label}\x1b[0m`)
      if (f.excerpt) console.log(`\x1b[2m        ${f.excerpt}\x1b[0m`)
    }
    return { severity: 'fail', detail: `${found.length} suspicious site(s)` }
  }
  const note = skipped.length > 0 ? `${files.length} 个文件（跳过 ${skipped.length} 个 lock 文件）` : `${files.length} 个文件`
  report('ok', title, note)
  return { severity: 'ok', detail: note }
}