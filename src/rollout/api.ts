export async function api<T>(
  path: string,
  method = 'GET',
  data?: unknown,
): Promise<T> {
  const response = await fetch('/api/rollcall/' + path, {
    method,
    cache: 'no-store',
    headers: data === undefined ? {} : { 'content-type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  const result = (await response.json().catch(() => null)) as {
    error?: string
  } | null
  if (!response.ok || !result)
    throw new Error(
      result?.error || 'The release service is unavailable. Try again.',
    )
  return result as T
}
