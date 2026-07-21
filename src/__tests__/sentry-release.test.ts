import fs from 'node:fs'
import path from 'node:path'
import { detectAppRelease } from '../sentry/sentry-release'

jest.mock('node:fs')

describe('detectAppRelease', () => {
  const originalCwd = process.cwd

  beforeEach(() => {
    jest.clearAllMocks()
    process.cwd = jest.fn().mockReturnValue('/app')
  })

  afterEach(() => {
    process.cwd = originalCwd
  })

  it('should return undefined when package.json does not exist', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false)

    const result = detectAppRelease()

    expect(result).toBeUndefined()
    expect(fs.existsSync).toHaveBeenCalledWith(
      path.join('/app', 'package.json')
    )
  })

  it('should return undefined when version field is missing', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true)
    ;(fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ name: 'my-app' })
    )

    const result = detectAppRelease()

    expect(result).toBeUndefined()
  })

  it('should return undefined when package.json parsing fails', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true)
    ;(fs.readFileSync as jest.Mock).mockReturnValue('{ invalid json')

    const result = detectAppRelease()

    expect(result).toBeUndefined()
  })

  it('should return "<name>@<version>" when both fields are present', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true)
    ;(fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ name: 'my-app', version: '1.2.3' })
    )

    const result = detectAppRelease()

    expect(result).toBe('my-app@1.2.3')
  })

  it('should return only the version when name field is missing', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true)
    ;(fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ version: '1.2.3' })
    )

    const result = detectAppRelease()

    expect(result).toBe('1.2.3')
  })
})
