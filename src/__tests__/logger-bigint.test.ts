import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Logger } from '../logger'

// Deliberately does not mock winston: the failure only shows up in the real formatting chain.
describe('Logger with BigInt metadata (real winston)', () => {
  const originalEnvironment = { ...process.env }
  let logDirectory: string
  let consoleLines: string[]
  let writeSpy: jest.SpyInstance

  beforeEach(() => {
    logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'node-utils-bigint-'))
    process.env.LOG_DIR = logDirectory
    process.env.LOG_FILE_FORMAT = 'text'
    consoleLines = []
    // winston's Console transport writes to the stdout stream behind the global console
    const stream = (console as unknown as { _stdout?: NodeJS.WriteStream })
      ._stdout
    writeSpy = jest
      .spyOn(stream ?? process.stdout, 'write')
      .mockImplementation((chunk: unknown) => {
        consoleLines.push(String(chunk))
        return true
      })
  })

  // The rotating file stream opens its file asynchronously, so it must drain before the directory is removed
  const flushLoggers = async (): Promise<void> => {
    await (
      Logger as unknown as { flushAll(timeoutMs: number): Promise<void> }
    ).flushAll(5000)
    Logger.closeAll()
  }

  afterEach(async () => {
    writeSpy.mockRestore()
    await flushLoggers()
    fs.rmSync(logDirectory, { recursive: true, force: true })
    process.env = { ...originalEnvironment }
  })

  it('does not throw and renders BigInt values as decimal strings in text output', () => {
    const logger = Logger.configure('bigint-text')

    expect(() => {
      logger.info('value', { value: 1n, nested: { n: 2n }, list: [3n] })
    }).not.toThrow()

    const line = consoleLines.find((l) => l.includes('value'))
    expect(line).toBeDefined()
    expect(line).toContain('{"value":"1","nested":{"n":"2"},"list":["3"]}')
  })

  it('renders BigInt inside a non-string stack as a decimal string', () => {
    const logger = Logger.configure('bigint-stack')

    expect(() => {
      logger.info('with-stack', { stack: { n: 1n } })
    }).not.toThrow()

    const line = consoleLines.find((l) => l.includes('with-stack'))
    expect(line).toBeDefined()
    expect(line).toContain('{"n":"1"}')
  })

  it('keeps the rendering of metadata without BigInt unchanged', () => {
    Logger.configure('bigint-plain').info('plain', { a: 1, b: 'x' })

    const line = consoleLines.find((l) => l.includes('plain'))
    expect(line).toBeDefined()
    expect(line).toContain('{"a":1,"b":"x"}')
  })

  it('does not throw and writes BigInt as a decimal string in ndjson files', async () => {
    process.env.LOG_FILE_FORMAT = 'ndjson'
    const logger = Logger.configure('bigint-ndjson')

    expect(() => {
      logger.info('value', { value: 1n })
    }).not.toThrow()
    await flushLoggers()

    const files = fs
      .readdirSync(logDirectory)
      .filter((f) => f.endsWith('.ndjson'))
    expect(files).toHaveLength(1)
    const content = fs.readFileSync(path.join(logDirectory, files[0]), 'utf8')
    expect(content).toContain('"value":"1"')
  })
})
