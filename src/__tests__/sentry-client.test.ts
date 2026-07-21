// jest.resetModules() は '@sentry/node' の mock factory も再実行するため、
// factory 内で毎回 jest.fn() を new すると、require し直した sentry-client が
// 実際に呼ぶインスタンスとテスト側で参照するインスタンスが食い違ってしまう。
// factory の外側で定義した mock 関数を共有することで同一性を保つ
// (babel-plugin-jest-hoist の制約上、ファクトリ内で参照する変数名は "mock" 始まりにする必要がある)
const mockSentryInit = jest.fn()

jest.mock('@sentry/node', () => ({
  init: mockSentryInit,
}))

jest.mock('../sentry/sentry-release', () => ({
  detectAppRelease: jest.fn().mockReturnValue('detected-app@1.0.0'),
}))

describe('sentry-client', () => {
  const originalEnvironment = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
    process.env = { ...originalEnvironment }
    delete process.env.NODE_ENV
    delete process.env.SENTRY_RELEASE
  })

  afterEach(() => {
    process.env = originalEnvironment
  })

  describe('ensureSentryInitialized', () => {
    it('should call Sentry.init with the given dsn and environment', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../sentry/sentry-client')

      fresh.ensureSentryInitialized({
        dsn: 'https://example.com/1',
        environment: 'staging',
      })

      expect(mockSentryInit).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://example.com/1',
          environment: 'staging',
        })
      )
    })

    it('should call Sentry.init only once across multiple invocations', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../sentry/sentry-client')

      fresh.ensureSentryInitialized({ dsn: 'https://example.com/1' })
      fresh.ensureSentryInitialized({ dsn: 'https://example.com/2' })

      expect(mockSentryInit).toHaveBeenCalledTimes(1)
    })

    it('should filter out OnUncaughtException and OnUnhandledRejection integrations', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../sentry/sentry-client')

      fresh.ensureSentryInitialized({ dsn: 'https://example.com/1' })

      const initOptions = (mockSentryInit as jest.Mock).mock.calls[0][0]
      const filtered = initOptions.integrations([
        { name: 'OnUncaughtException' },
        { name: 'OnUnhandledRejection' },
        { name: 'Http' },
      ])

      expect(filtered).toEqual([{ name: 'Http' }])
    })

    it('should prefer SENTRY_RELEASE env var over detectAppRelease', () => {
      process.env.SENTRY_RELEASE = 'env-app@2.0.0'
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../sentry/sentry-client')

      fresh.ensureSentryInitialized({ dsn: 'https://example.com/1' })

      expect(mockSentryInit).toHaveBeenCalledWith(
        expect.objectContaining({ release: 'env-app@2.0.0' })
      )
    })

    it('should fall back to detectAppRelease when SENTRY_RELEASE is unset', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../sentry/sentry-client')

      fresh.ensureSentryInitialized({ dsn: 'https://example.com/1' })

      expect(mockSentryInit).toHaveBeenCalledWith(
        expect.objectContaining({ release: 'detected-app@1.0.0' })
      )
    })

    it('should default environment to NODE_ENV when not provided', () => {
      process.env.NODE_ENV = 'test-environment'
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../sentry/sentry-client')

      fresh.ensureSentryInitialized({ dsn: 'https://example.com/1' })

      expect(mockSentryInit).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'test-environment' })
      )
    })

    it('should default environment to production when NODE_ENV is unset', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../sentry/sentry-client')

      fresh.ensureSentryInitialized({ dsn: 'https://example.com/1' })

      expect(mockSentryInit).toHaveBeenCalledWith(
        expect.objectContaining({ environment: 'production' })
      )
    })
  })

  describe('isSentryInitialized', () => {
    it('should return false before ensureSentryInitialized is called', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../sentry/sentry-client')

      expect(fresh.isSentryInitialized()).toBe(false)
    })

    it('should return true after ensureSentryInitialized is called', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../sentry/sentry-client')

      fresh.ensureSentryInitialized({ dsn: 'https://example.com/1' })

      expect(fresh.isSentryInitialized()).toBe(true)
    })
  })

  describe('toSeverityLevel', () => {
    it('should map "warn" to "warning"', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../sentry/sentry-client')

      expect(fresh.toSeverityLevel('warn')).toBe('warning')
    })

    it.each(['fatal', 'error', 'log', 'info', 'debug'])(
      'should pass "%s" through unchanged',
      (level) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fresh = require('../sentry/sentry-client')

        expect(fresh.toSeverityLevel(level)).toBe(level)
      }
    )
  })
})
