/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable unicorn/prefer-module */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { Logger } from '../logger'

import winston from 'winston'
import WinstonDailyRotateFile from 'winston-daily-rotate-file'
import moment from 'moment-timezone'
import * as Sentry from '@sentry/node'
import { SentryTransport } from '../sentry-transport'

// Mock winston
jest.mock('winston', () => {
  const mockFormat = {
    combine: jest.fn().mockReturnValue('combined-format'),
    timestamp: jest.fn().mockReturnValue('timestamp-format'),
    printf: jest.fn().mockReturnValue('printf-format'),
    colorize: jest.fn().mockReturnValue('colorize-format'),
    uncolorize: jest.fn().mockReturnValue('uncolorize-format'),
    errors: jest.fn().mockReturnValue('errors-format'),
    json: jest.fn().mockReturnValue('json-format'),
  }

  const formatFunction = jest.fn().mockReturnValue('format')
  // format returns a custom formatter function
  formatFunction.mockImplementation(() =>
    jest.fn().mockReturnValue('custom-format')
  )

  Object.assign(formatFunction, mockFormat)

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    close: jest.fn(),
  }

  return {
    createLogger: jest.fn(() => mockLogger),
    format: formatFunction,
    transports: {
      Console: jest.fn(),
    },
  }
})

// Mock winston-daily-rotate-file
jest.mock('winston-daily-rotate-file')

// Mock SentryTransport (to avoid running the real Sentry.init())
jest.mock('../sentry-transport', () => ({
  toSentryMetaArg: (meta: unknown) => ({ sentryMeta: meta }),
  SentryTransport: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
  })),
}))

// Mock @sentry/node (to verify the Sentry.close() call in closeAll())
jest.mock('@sentry/node', () => ({
  close: jest.fn().mockResolvedValue(true),
}))

// Mock cycle
jest.mock('cycle', () => ({
  decycle: jest.fn((object) => object),
}))

interface MockMomentObject {
  format: jest.Mock<string>
  tz: jest.Mock<MockMomentObject>
}

// Mock moment-timezone
jest.mock('moment-timezone', () => {
  const mockMomentObject: MockMomentObject = {
    format: jest.fn(() => '2025-05-05 12:00:00.000'),
    tz: jest.fn(() => mockMomentObject),
  }

  const mockMomentFunction = jest.fn(() => mockMomentObject)

  ;(mockMomentFunction as any).tz = {
    zone: jest.fn((timezone: string) =>
      timezone === 'Invalid/Timezone' ? null : true
    ),
  }

  return mockMomentFunction
})

// For mocking process event handlers
const originalProcessOn = process.on

describe('Logger', () => {
  const originalEnvironment = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    Logger.closeAll()
    process.env = { ...originalEnvironment }
    // Reset environment variables
    delete process.env.LOG_LEVEL
    delete process.env.LOG_FILE_LEVEL
    delete process.env.LOG_DIR
    delete process.env.VERCEL
    delete process.env.LOG_FILE_MAX_AGE
    delete process.env.LOG_FILE_FORMAT
    delete process.env.TZ
    delete process.env.SENTRY_DSN
    delete process.env.SENTRY_LOG_LEVEL
  })

  afterEach(() => {
    process.env = originalEnvironment
  })

  describe('configure', () => {
    it('should create a logger with default settings', () => {
      const logger = Logger.configure('test')

      expect(winston.createLogger).toHaveBeenCalled()
      expect(winston.transports.Console).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
        })
      )
      expect(WinstonDailyRotateFile).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          dirname: 'logs',
          maxFiles: '30d',
        })
      )
      expect(logger).toBeInstanceOf(Logger)
    })

    it('should return the cached instance for the same category on second call', () => {
      const first = Logger.configure('cache-test')
      const second = Logger.configure('cache-test')

      expect(second).toBe(first)
      expect(winston.createLogger).toHaveBeenCalledTimes(1)
    })

    it('should create separate instances for different categories', () => {
      const first = Logger.configure('cache-test-a')
      const second = Logger.configure('cache-test-b')

      expect(second).not.toBe(first)
      expect(winston.createLogger).toHaveBeenCalledTimes(2)
    })

    it('should not reflect environment variable changes on a cached category', () => {
      Logger.configure('cache-test-env')

      process.env.LOG_LEVEL = 'debug'
      Logger.configure('cache-test-env')

      // WinstonDailyRotateFile / createLogger are not called again on the second call
      expect(winston.createLogger).toHaveBeenCalledTimes(1)
      expect(WinstonDailyRotateFile).toHaveBeenCalledTimes(1)
      // LOG_LEVEL was unset at the first call, so the default value is kept
      expect(winston.transports.Console).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
        })
      )
    })

    it('should create a new instance after closeAll is called', () => {
      const first = Logger.configure('cache-test-reset')
      Logger.closeAll()
      const second = Logger.configure('cache-test-reset')

      expect(second).not.toBe(first)
      expect(winston.createLogger).toHaveBeenCalledTimes(2)
    })

    it('should close cached winston loggers when closeAll is called', () => {
      const instance = Logger.configure('cache-test-close')
      const mockLogger = winston.createLogger({ transports: [] })

      Logger.closeAll()

      expect(mockLogger.close).toHaveBeenCalled()
      expect(instance).toBeInstanceOf(Logger)
    })

    it('should use LOG_LEVEL environment variable when provided', () => {
      process.env.LOG_LEVEL = 'debug'

      Logger.configure('test')

      expect(winston.transports.Console).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
        })
      )
    })

    it('should use LOG_FILE_LEVEL environment variable when provided', () => {
      process.env.LOG_FILE_LEVEL = 'warn'

      Logger.configure('test')

      expect(WinstonDailyRotateFile).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
        })
      )
    })

    it('should use VERCEL environment variable for log directory when provided', () => {
      process.env.VERCEL = 'true'

      Logger.configure('test')

      expect(WinstonDailyRotateFile).toHaveBeenCalledWith(
        expect.objectContaining({
          dirname: '/tmp/logs',
        })
      )
    })

    it('should use LOG_DIR environment variable when provided', () => {
      process.env.LOG_DIR = 'custom-logs'

      Logger.configure('test')

      expect(WinstonDailyRotateFile).toHaveBeenCalledWith(
        expect.objectContaining({
          dirname: 'custom-logs',
        })
      )
    })

    it('should use LOG_FILE_MAX_AGE environment variable when provided', () => {
      process.env.LOG_FILE_MAX_AGE = '7d'

      Logger.configure('test')

      expect(WinstonDailyRotateFile).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFiles: '7d',
        })
      )
    })

    it('should use ndjson format when LOG_FILE_FORMAT is set to ndjson', () => {
      process.env.LOG_FILE_FORMAT = 'ndjson'

      Logger.configure('test')

      // The behavior of format is complex, so only check that it was called
      expect(winston.format.json).toHaveBeenCalled()
      expect(WinstonDailyRotateFile).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: '%DATE%.ndjson',
        })
      )
    })

    it('should use text format when LOG_FILE_FORMAT is not set to ndjson', () => {
      Logger.configure('test')

      expect(winston.format.json).not.toHaveBeenCalled()
      expect(WinstonDailyRotateFile).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: '%DATE%.log',
        })
      )
    })

    it('should create text format correctly', () => {
      // This test depends on the internals of format; it is here to improve coverage
      const formatPrintf = require('winston').format.printf

      Logger.configure('test')

      expect(formatPrintf).toHaveBeenCalled()
      const printfCallback = formatPrintf.mock.calls[0][0]

      // Simple case
      const simpleInfo = {
        timestamp: '2025-05-05 12:00:00',
        level: 'info',
        message: 'Test message',
      }
      const simpleResult = printfCallback(simpleInfo)
      expect(simpleResult).toContain('[2025-05-05 12:00:00]')
      expect(simpleResult).toContain('[test/INFO]')
      expect(simpleResult).toContain('Test message')

      // With metadata
      const metadataInfo = {
        timestamp: '2025-05-05 12:00:00',
        level: 'info',
        message: 'Test message',
        extra: 'data',
      }
      const metadataResult = printfCallback(metadataInfo)
      expect(metadataResult).toContain('"extra":"data"')

      // Stack trace is a string
      const stackInfo = {
        timestamp: '2025-05-05 12:00:00',
        level: 'error',
        message: 'Error message',
        stack: 'Error\n  at line1\n  at line2',
      }
      const stackResult = printfCallback(stackInfo)
      expect(stackResult).toContain('  at line1')

      // Stack trace is an object
      const objectStackInfo = {
        timestamp: '2025-05-05 12:00:00',
        level: 'error',
        message: 'Error message',
        stack: { trace: 'stack trace' },
      }
      const objectStackResult = printfCallback(objectStackInfo)
      expect(objectStackResult).toContain('{"trace":"stack trace"}')
    })

    it('should not add SentryTransport when SENTRY_DSN is unset', () => {
      delete process.env.SENTRY_DSN

      Logger.configure('test')

      expect(SentryTransport).not.toHaveBeenCalled()
    })

    it('should add SentryTransport when SENTRY_DSN is set', () => {
      process.env.SENTRY_DSN = 'https://example.com/1'

      Logger.configure('test')

      expect(SentryTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://example.com/1',
          level: 'warn',
        })
      )
    })

    it('should use SENTRY_LOG_LEVEL for the SentryTransport level when provided', () => {
      process.env.SENTRY_DSN = 'https://example.com/1'
      process.env.SENTRY_LOG_LEVEL = 'error'

      Logger.configure('test')

      expect(SentryTransport).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error' })
      )
    })
  })

  describe('getTimestamp', () => {
    it('should use TZ environment variable when provided and valid', () => {
      process.env.TZ = 'America/New_York'

      const timestampFunction = Logger.getTimestamp()
      timestampFunction()

      expect(moment.tz.zone).toHaveBeenCalledWith('America/New_York')
    })

    it('should use default timezone (Asia/Tokyo) when TZ is not provided', () => {
      delete process.env.TZ

      const timestampFunction = Logger.getTimestamp()
      const result = timestampFunction()

      expect(result).toBe('2025-05-05 12:00:00.000')
    })

    it('should use default timezone (Asia/Tokyo) when TZ is invalid', () => {
      process.env.TZ = 'Invalid/Timezone'

      const timestampFunction = Logger.getTimestamp()
      const result = timestampFunction()

      expect(result).toBe('2025-05-05 12:00:00.000')
    })
  })

  describe('logging methods', () => {
    let loggerInstance: Logger
    let mockWinstonLogger: any

    beforeEach(() => {
      // Get the mocked winston logger
      mockWinstonLogger = winston.createLogger()
      loggerInstance = Logger.configure('test')
    })

    it('should call debug method with message', () => {
      loggerInstance.debug('Debug message')

      expect(mockWinstonLogger.debug).toHaveBeenCalledWith('Debug message', {})
    })

    it('should call debug method with message and metadata', () => {
      const metadata = { key: 'value' }
      loggerInstance.debug('Debug message', metadata)

      expect(mockWinstonLogger.debug).toHaveBeenCalledWith(
        'Debug message',
        metadata
      )
    })

    it.each(['warn', 'error'] as const)(
      'should pass only the reserved sentryMeta key as a third argument to %s',
      (level) => {
        const error = new Error('boom')
        const meta = { fingerprint: ['x'], sentry: false }
        loggerInstance[level]('msg', error, meta)

        expect(mockWinstonLogger[level]).toHaveBeenCalledWith('msg', error, {
          sentryMeta: meta,
        })
      }
    )

    it.each(['warn', 'error'] as const)(
      'should keep the two-argument call to %s when meta is omitted',
      (level) => {
        loggerInstance[level]('msg')

        expect(mockWinstonLogger[level]).toHaveBeenCalledWith('msg', undefined)
        expect(mockWinstonLogger[level].mock.calls.at(-1)).toHaveLength(2)
      }
    )

    it('should call info method with message', () => {
      loggerInstance.info('Info message')

      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Info message', {})
    })

    it('should call info method with message and metadata', () => {
      const metadata = { key: 'value' }
      loggerInstance.info('Info message', metadata)

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Info message',
        metadata
      )
    })

    it('should call warn method with message', () => {
      loggerInstance.warn('Warning message')

      expect(mockWinstonLogger.warn).toHaveBeenCalledWith(
        'Warning message',
        undefined
      )
    })

    it('should call warn method with message and error', () => {
      const error = new Error('Test error')
      loggerInstance.warn('Warning message', error)

      expect(mockWinstonLogger.warn).toHaveBeenCalledWith(
        'Warning message',
        error
      )
    })

    it('should call error method with message', () => {
      loggerInstance.error('Error message')

      expect(mockWinstonLogger.error).toHaveBeenCalledWith(
        'Error message',
        undefined
      )
    })

    it('should call error method with message and error', () => {
      const error = new Error('Test error')
      loggerInstance.error('Error message', error)

      expect(mockWinstonLogger.error).toHaveBeenCalledWith(
        'Error message',
        error
      )
    })
  })

  describe('closeAll with Sentry', () => {
    beforeEach(() => {
      delete process.env.SENTRY_DSN
    })

    it('should not call Sentry.close when SENTRY_DSN is unset', () => {
      Logger.configure('sentry-close-test')

      Logger.closeAll()

      expect(Sentry.close).not.toHaveBeenCalled()
    })

    it('should call Sentry.close(2000) when SENTRY_DSN is set', () => {
      process.env.SENTRY_DSN = 'https://example.com/1'
      Logger.configure('sentry-close-test')

      Logger.closeAll()

      expect(Sentry.close).toHaveBeenCalledWith(2000)
    })
  })

  // Process event handler tests
  describe('process event handlers', () => {
    it('should register events for unhandledRejection and uncaughtException', () => {
      // Keep the original process.on
      try {
        const eventHandlers: Record<string, Function> = {}

        // Mock process.on
        process.on = jest
          .fn()
          .mockImplementation((event: string, handler: Function) => {
            eventHandlers[event] = handler
            return process
          })

        // Import the logger so that it registers the process event handlers
        jest.isolateModules(() => {
          require('../logger')
        })

        // Verify that the events were registered
        expect(process.on).toHaveBeenCalledWith(
          'unhandledRejection',
          expect.any(Function)
        )
        expect(process.on).toHaveBeenCalledWith(
          'uncaughtException',
          expect.any(Function)
        )
        expect(eventHandlers).toHaveProperty('unhandledRejection')
        expect(eventHandlers).toHaveProperty('uncaughtException')

        // Run the event handlers
        const mockError = new Error('Test error')

        // unhandledRejection handler
        eventHandlers.unhandledRejection(mockError)
        expect(winston.createLogger().error).toHaveBeenCalledWith(
          'unhandledRejection',
          mockError
        )

        // uncaughtException handler
        eventHandlers.uncaughtException(mockError)
        expect(winston.createLogger().error).toHaveBeenCalledWith(
          'uncaughtException',
          mockError
        )
      } finally {
        // Restore
        process.on = originalProcessOn
      }
    })
  })
})
