/** Ukrainian has three plural forms: 1, 21 | 2-4, 22-24 | 0, 5-20, 25-30... (message: "one | few | many"). */
export function ukPlural(n: number): number {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 0
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 1
  return 2
}
