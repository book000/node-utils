/* eslint-disable unicorn/prefer-module */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectRoot = path.resolve(__dirname, '..', '..')
const loggerPath = path.join(projectRoot, 'src', 'logger')
const tsxCli = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')

const SPAWN_TIMEOUT_MS = 15_000
const SURVIVAL_MARKER = 'SURVIVED'

interface ChildResult {
  status: number | null
  stdout: string
  elapsedMs: number
  logContent: string
}

describe('process handlers (real child process)', () => {
  let workDirectory: string

  beforeAll(() => {
    workDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'node-utils-fatal-'))
  })

  afterAll(() => {
    fs.rmSync(workDirectory, { recursive: true, force: true })
  })

  /**
   * Runs a script that only imports the logger (no Logger API call), arms a
   * long timer that must never fire, and then triggers a fatal error.
   */
  const runChild = (name: string, trigger: string): ChildResult => {
    const logDirectory = path.join(workDirectory, `${name}-logs`)
    const scriptPath = path.join(workDirectory, `${name}.ts`)
    fs.writeFileSync(
      scriptPath,
      [
        `import ${JSON.stringify(loggerPath)}`,
        `setTimeout(() => console.log(${JSON.stringify(SURVIVAL_MARKER)}), 30000)`,
        trigger,
        '',
      ].join('\n')
    )

    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      LOG_DIR: logDirectory,
    }
    delete environment.SENTRY_DSN
    const startedAt = Date.now()
    const result = spawnSync(process.execPath, [tsxCli, scriptPath], {
      env: environment,
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MS,
    })
    const elapsedMs = Date.now() - startedAt

    const logContent = fs.existsSync(logDirectory)
      ? fs
          .readdirSync(logDirectory)
          .filter((file) => file.endsWith('.log'))
          .map((file) => fs.readFileSync(path.join(logDirectory, file), 'utf8'))
          .join('\n')
      : ''
    return {
      status: result.status,
      stdout: result.stdout,
      elapsedMs,
      logContent,
    }
  }

  it('should exit with status 1 and log the error after an uncaught exception', () => {
    const result = runChild(
      'uncaught',
      `setTimeout(() => { throw new Error('boom-uncaught') }, 10)`
    )

    expect(result.status).toBe(1)
    expect(result.stdout).not.toContain(SURVIVAL_MARKER)
    expect(result.elapsedMs).toBeLessThan(SPAWN_TIMEOUT_MS)
    expect(result.logContent).toContain('uncaughtException')
    expect(result.logContent).toContain('boom-uncaught')
  }, 30_000)

  it('should exit with status 1 and log the error after an unhandled rejection', () => {
    const result = runChild(
      'rejection',
      `void Promise.reject(new Error('boom-rejection'))`
    )

    expect(result.status).toBe(1)
    expect(result.stdout).not.toContain(SURVIVAL_MARKER)
    expect(result.elapsedMs).toBeLessThan(SPAWN_TIMEOUT_MS)
    expect(result.logContent).toContain('unhandledRejection')
    expect(result.logContent).toContain('boom-rejection')
  }, 30_000)
})
