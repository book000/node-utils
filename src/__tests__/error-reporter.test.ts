import * as Sentry from '@sentry/node'
import { ErrorReporter } from '../error-reporter'
import {
  ensureSentryInitialized,
  isSentryInitialized,
} from '../sentry/sentry-client'

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
}))

jest.mock('../sentry/sentry-client', () => ({
  ensureSentryInitialized: jest.fn(),
  isSentryInitialized: jest.fn().mockReturnValue(false),
}))

describe('ErrorReporter', () => {
  const originalEnvironment = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnvironment }
    delete process.env.SENTRY_DSN
    delete process.env.SENTRY_ENVIRONMENT
  })

  afterEach(() => {
    process.env = originalEnvironment
  })

  describe('configure', () => {
    it('should not call ensureSentryInitialized when SENTRY_DSN is unset', () => {
      ErrorReporter.configure()

      expect(ensureSentryInitialized).not.toHaveBeenCalled()
    })

    it('should call ensureSentryInitialized with SENTRY_DSN/SENTRY_ENVIRONMENT when set', () => {
      process.env.SENTRY_DSN = 'https://example.com/1'
      process.env.SENTRY_ENVIRONMENT = 'staging'

      ErrorReporter.configure()

      expect(ensureSentryInitialized).toHaveBeenCalledWith({
        dsn: 'https://example.com/1',
        environment: 'staging',
      })
    })
  })

  describe('captureException', () => {
    it('should not call Sentry.captureException when not initialized', () => {
      ;(isSentryInitialized as jest.Mock).mockReturnValue(false)

      ErrorReporter.captureException(new Error('boom'))

      expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('should call Sentry.captureException with context when initialized', () => {
      ;(isSentryInitialized as jest.Mock).mockReturnValue(true)
      const error = new Error('boom')
      const context = { userId: '123' }

      ErrorReporter.captureException(error, context)

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        extra: context,
      })
    })
  })
})
