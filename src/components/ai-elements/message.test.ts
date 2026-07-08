import { describe, expect, it } from 'vitest'
import { renderableImageMarkdown } from './message'

describe('renderableImageMarkdown', () => {
  it('turns inline data image urls into markdown image previews', () => {
    const result = renderableImageMarkdown(
      '截图：data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    )

    expect(result).toBe('截图：![图片预览](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB)')
  })

  it('turns bare image base64 payloads into markdown image previews', () => {
    const payload = `iVBORw0KGgo${'A'.repeat(140)}`
    const result = renderableImageMarkdown(`截图：${payload}`)

    expect(result).toBe(`截图：![图片预览](data:image/png;base64,${payload})`)
  })
})
