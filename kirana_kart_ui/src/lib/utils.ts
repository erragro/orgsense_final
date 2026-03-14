export function truncate(str: string, maxLen = 60): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '…'
}

export function maskToken(token: string): string {
  if (token.length <= 8) return '••••••••'
  return '••••••••' + token.slice(-6)
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-IN')
}

export function formatCurrency(amount: number | null | undefined, currency = '₹'): string {
  if (amount == null) return '—'
  return `${currency}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

export function capitalise(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}
