export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string
    message?: string
  }
  if (!res.ok) {
    const msg = data.message || data.error || `Error HTTP ${res.status}`
    throw new Error(msg)
  }
  return data
}
