import { describe, it, expect, vi, beforeEach } from 'vitest'
import { downloadCSV } from './csvExport'

/** Captures the Blob passed to URL.createObjectURL and returns its text content */
async function captureCSV(fn) {
  let blob = null
  URL.createObjectURL = vi.fn((b) => { blob = b; return 'blob:test-url' })
  fn()
  return blob ? await blob.text() : ''
}

describe('downloadCSV', () => {
  let clickSpy
  let createdAnchor

  beforeEach(() => {
    clickSpy = vi.fn()
    createdAnchor = { click: clickSpy, href: '', download: '' }
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return createdAnchor
      return document.createElement.wrappedJSObject?.(tag) ?? document.createElementNS('http://www.w3.org/1999/xhtml', tag)
    })
  })

  it('calls click() on the anchor element', () => {
    downloadCSV('test', ['Col A', 'Col B'], [['val1', 'val2']])
    expect(clickSpy).toHaveBeenCalled()
  })

  it('sets the correct download filename', () => {
    downloadCSV('mon-export', ['A'], [['1']])
    expect(createdAnchor.download).toBe('mon-export.csv')
  })

  it('calls URL.createObjectURL', () => {
    downloadCSV('file', ['H'], [['v']])
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('calls URL.revokeObjectURL after click', () => {
    downloadCSV('file', ['H'], [['v']])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url')
  })

  it('creates blob with text/csv UTF-8 charset (for Excel BOM compatibility)', () => {
    let blobType = ''
    URL.createObjectURL = vi.fn((blob) => { blobType = blob.type; return 'blob:test-url' })
    downloadCSV('bom', ['H'], [['v']])
    expect(blobType).toContain('text/csv')
    expect(blobType).toContain('utf-8')
  })

  it('escapes double quotes in values', async () => {
    const csv = await captureCSV(() => downloadCSV('q', ['H'], [['val"with"quotes']]))
    expect(csv).toContain('val""with""quotes')
  })

  it('wraps all values in double quotes', async () => {
    const csv = await captureCSV(() => downloadCSV('q', ['Header'], [['Value']]))
    expect(csv).toContain('"Header"')
    expect(csv).toContain('"Value"')
  })

  it('handles null values as empty string', async () => {
    const csv = await captureCSV(() => downloadCSV('q', ['H'], [[null]]))
    expect(csv).toContain('""')
  })

  it('handles undefined values as empty string', async () => {
    const csv = await captureCSV(() => downloadCSV('q', ['H'], [[undefined]]))
    expect(csv).toContain('""')
  })

  it('produces correct CSV line structure', async () => {
    const csv = await captureCSV(() =>
      downloadCSV('struct', ['A', 'B'], [['1', '2'], ['3', '4']])
    )
    const lines = csv.replace('\ufeff', '').split('\n')
    expect(lines[0]).toBe('"A","B"')
    expect(lines[1]).toBe('"1","2"')
    expect(lines[2]).toBe('"3","4"')
  })

  it('works with empty rows (headers only)', async () => {
    const csv = await captureCSV(() => downloadCSV('empty', ['Col'], []))
    expect(csv).toContain('"Col"')
  })

  it('works with multiple columns and rows', async () => {
    const csv = await captureCSV(() =>
      downloadCSV(
        'multi',
        ['Nom', 'Email', 'Téléphone'],
        [
          ['Alice', 'alice@test.com', '0612345678'],
          ['Bob', 'bob@test.com', '0698765432'],
        ]
      )
    )
    expect(csv).toContain('"Nom","Email","Téléphone"')
    expect(csv).toContain('"Alice","alice@test.com","0612345678"')
    expect(csv).toContain('"Bob","bob@test.com","0698765432"')
  })

  it('handles values containing commas without breaking CSV', async () => {
    const csv = await captureCSV(() =>
      downloadCSV('comma', ['H'], [['value, with, commas']])
    )
    expect(csv).toContain('"value, with, commas"')
  })

  it('handles numeric values by converting to string', async () => {
    const csv = await captureCSV(() =>
      downloadCSV('nums', ['Amount'], [[49.99], [0], [-5]])
    )
    expect(csv).toContain('"49.99"')
    expect(csv).toContain('"0"')
    expect(csv).toContain('"-5"')
  })
})
