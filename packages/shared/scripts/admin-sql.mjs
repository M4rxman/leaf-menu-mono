// Prints the SQL that creates (or resets) the super-admin. There is no self-signup, so the first admin is bootstrapped here:
//   node --experimental-strip-types packages/shared/scripts/admin-sql.mjs you@example.com 'a long password' > admin.sql
//   npx wrangler d1 execute chilly-menu --local --persist-to .wrangler/state --file admin.sql   (--remote for production)
import { hashPassword } from '../src/domain/password.ts'

const [email, password] = process.argv.slice(2)
if (!email?.includes('@') || !password || password.length < 12) {
  console.error('usage: admin-sql.mjs <email> <password of 12+ characters>')
  process.exit(2)
}
const q = s => `'${s.replaceAll("'", "''")}'`
console.log(`INSERT INTO users (email, password_hash, role) VALUES (${q(email)}, ${q(await hashPassword(password))}, 'admin')
ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, must_change_password = 0;`)
