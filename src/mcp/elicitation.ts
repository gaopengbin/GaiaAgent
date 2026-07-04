export function parseElicitationForm(input: string): Record<string, unknown> {
  if (new TextEncoder().encode(input).byteLength > 65_536) {
    throw new Error('响应内容不能超过 64 KiB。')
  }
  const parsed: unknown = JSON.parse(input)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('请输入一个 JSON 对象。')
  }
  return parsed as Record<string, unknown>
}
