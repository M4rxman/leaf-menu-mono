import type { Db } from '../domain/ports.ts'

// The slice of D1Database we call; avoids pulling in the Workers types package.
interface D1Like {
  prepare(sql: string): {
    bind(...params: unknown[]): {
      all(): Promise<{ results: unknown[] }>
      first(): Promise<unknown>
    }
  }
}

export function d1Db(d1: D1Like): Db {
  return {
    async all<T>(sql: string, ...params: unknown[]) {
      return (await d1.prepare(sql).bind(...params).all()).results as T[]
    },
    async first<T>(sql: string, ...params: unknown[]) {
      return (await d1.prepare(sql).bind(...params).first()) as T | null
    }
  }
}
