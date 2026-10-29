// Runs Lighthouse (mobile, performance only) N times against a URL and fails if the MEDIAN CLS > 0.1 or LCP > 2500 ms.
// Usage: node e2e/lighthouse-gate.mjs [url] [runs]   (needs Chrome; uses `npx lighthouse`, no dependency)
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2] ?? 'http://localhost:8799/r/big/en'
const runs = Number(process.argv[3] ?? 5)
const dir = mkdtempSync(join(tmpdir(), 'lh-'))
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
const cls = []
const lcp = []
for (let i = 0; i < runs; i++) {
  const out = join(dir, `${i}.json`)
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['-y', 'lighthouse@13.6.0', url, '--only-categories=performance', '--output=json', `--output-path=${out}`,
    '--chrome-flags=--headless=new --no-sandbox', '--quiet'], { stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) throw new Error(`lighthouse run ${i} failed`)
  const a = JSON.parse(readFileSync(out, 'utf8')).audits
  cls.push(a['cumulative-layout-shift'].numericValue)
  lcp.push(a['largest-contentful-paint'].numericValue)
}
rmSync(dir, { recursive: true, force: true })
const m = { cls: median(cls), lcp: median(lcp) }
console.log(`${url}\n  CLS ${cls.map(x => x.toFixed(3))} -> median ${m.cls.toFixed(3)} (max 0.1)\n  LCP ${lcp.map(Math.round)} ms -> median ${Math.round(m.lcp)} ms (max 2500)`)
if (m.cls > 0.1 || m.lcp > 2500) { console.error('Lighthouse gate FAILED'); process.exit(1) }
