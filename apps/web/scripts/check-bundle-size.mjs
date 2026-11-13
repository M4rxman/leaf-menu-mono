// Plan §10: guest menu JS <= 5 KB gzipped. Usage: node scripts/check-bundle-size.mjs [file] [budgetBytes]
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

export const BUDGET_BYTES = 5 * 1024

export function checkSize(buf, budget = BUDGET_BYTES) {
    const size = gzipSync(buf, { level: 9 }).length
    return { size, budget, ok: size <= budget }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const file = process.argv[2] ?? '.output/public/menu.js'
    const { size, budget, ok } = checkSize(readFileSync(file), Number(process.argv[3] ?? BUDGET_BYTES))
    console.log(`${file}: ${size} B gzipped, budget ${budget} B`)
    if (!ok) {
        console.error('Over budget')
        process.exit(1)
    }
}
