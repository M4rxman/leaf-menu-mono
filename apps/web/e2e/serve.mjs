// Starts the BUILT web worker (run `nuxt build` first) on a throw-away local D1, so e2e never touches the
// developer's .wrangler/state: fresh state dir -> migrations -> demo seed -> extra RTL venue -> wrangler dev.
import { spawn, spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const PORT = process.env.E2E_PORT ?? '8799'
const state = '.wrangler/e2e-state'
const wrangler = join(dirname(createRequire(import.meta.url).resolve('wrangler/package.json')), 'bin', 'wrangler.js')
const run = (args, opts) => spawn(process.execPath, [wrangler, ...args], { stdio: 'inherit', ...opts })
const runSync = args => {
  const r = spawnSync(process.execPath, [wrangler, ...args], { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

rmSync(state, { recursive: true, force: true })
const local = ['--local', '--persist-to', state]
runSync(['d1', 'migrations', 'apply', 'DB', ...local])
runSync(['d1', 'execute', 'DB', ...local, '--file', '../../packages/shared/seed.sql'])
runSync(['d1', 'execute', 'DB', ...local, '--file', 'e2e/rtl-venue.sql'])

const server = run(['dev', '--port', PORT, '--persist-to', state, '--var', 'DEVICE_SECRET:e2e-device-secret'])
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill(sig))
server.on('exit', code => process.exit(code ?? 0))
