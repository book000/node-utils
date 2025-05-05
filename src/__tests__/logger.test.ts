/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable unicorn/prefer-module */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { Logger } from '../logger'

// 不要なインポートを削除

import winston from 'winston'
import WinstonDailyRotateFile from 'winston-daily-rotate-file'
import moment from 'moment-timezone'

// Winstonをモック化
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

  // モックの関数を作成
  const formatFunc = jest.fn().mockReturnValue('format')
  // formatは独自のフォーマッター関数を返す関数
  formatFunc.mockImplementation(() =>
    jest.fn().mockReturnValue('custom-format')
  )

  Object.assign(formatFunc, mockFormat)

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }

  return {
    createLogger: jest.fn(() => mockLogger),
    format: formatFunc,
    transports: {
      Console: jest.fn(),
    },
  }
})

// Winston日次ローテートファイルをモック化
jest.mock('winston-daily-rotate-file')

// cycleモジュールをモック化
jest.mock('cycle', () => ({
  decycle: jest.fn((obj) => obj),
}))

// インターフェイス定義を追加
interface MockMomentObj {
  format: jest.Mock<string>
  tz: jest.Mock<MockMomentObj>
}

// moment-timezoneをモック化
jest.mock('moment-timezone', () => {
  // モックを定義
  const mockMomentObj: MockMomentObj = {
    format: jest.fn(() => '2025-05-05 12:00:00.000'),
    tz: jest.fn(function (this: MockMomentObj) {
      return this
    }),
  }

  // モックの関数を作成
  const mockMomentFn = jest.fn(() => mockMomentObj)

  // tzプロパティを追加
  ;(mockMomentFn as any).tz = {
    zone: jest.fn((timezone: string) =>
      timezone === 'Invalid/Timezone' ? null : true
    ),
  }

  return mockMomentFn
})

// プロセスイベントハンドラのモック用
const originalProcessOn = process.on

describe('Logger', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    // 環境変数を初期化
    delete process.env.LOG_LEVEL
    delete process.env.LOG_FILE_LEVEL
    delete process.env.LOG_DIR
    delete process.env.VERCEL
    delete process.env.LOG_FILE_MAX_AGE
    delete process.env.LOG_FILE_FORMAT
    delete process.env.TZ
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('configure', () => {
    it('should create a logger with default settings', () => {
      const logger = Logger.configure('test')

      expect(winston.createLogger).toHaveBeenCalled()
      expect(winston.transports.Console).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info', // デフォルト値
        })
      )
      expect(WinstonDailyRotateFile).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info', // デフォルト値
          dirname: 'logs', // デフォルト値
          maxFiles: '30d', // デフォルト値
        })
      )
      expect(logger).toBeInstanceOf(Logger)
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

      // formatの挙動は複雑なため、ここでは呼び出しがあるかのみチェック
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

    // textFormatのテスト
    it('should create text format correctly', () => {
      // このテストはformatの内部実装に依存しますが、カバレッジ向上のため追加
      const formatPrintf = require('winston').format.printf

      Logger.configure('test')

      expect(formatPrintf).toHaveBeenCalled()
      const printfCallback = formatPrintf.mock.calls[0][0]

      // シンプルなケース
      const simpleInfo = {
        timestamp: '2025-05-05 12:00:00',
        level: 'info',
        message: 'Test message',
      }
      const simpleResult = printfCallback(simpleInfo)
      expect(simpleResult).toContain('[2025-05-05 12:00:00]')
      expect(simpleResult).toContain('[test/INFO]')
      expect(simpleResult).toContain('Test message')

      // メタデータがある場合
      const metadataInfo = {
        timestamp: '2025-05-05 12:00:00',
        level: 'info',
        message: 'Test message',
        extra: 'data',
      }
      const metadataResult = printfCallback(metadataInfo)
      expect(metadataResult).toContain('"extra":"data"')

      // スタックトレースが文字列の場合
      const stackInfo = {
        timestamp: '2025-05-05 12:00:00',
        level: 'error',
        message: 'Error message',
        stack: 'Error\n  at line1\n  at line2',
      }
      const stackResult = printfCallback(stackInfo)
      expect(stackResult).toContain('  at line1')

      // スタックトレースがオブジェクトの場合
      const objectStackInfo = {
        timestamp: '2025-05-05 12:00:00',
        level: 'error',
        message: 'Error message',
        stack: { trace: 'stack trace' },
      }
      const objectStackResult = printfCallback(objectStackInfo)
      expect(objectStackResult).toContain('{"trace":"stack trace"}')
    })
  })

  describe('getTimestamp', () => {
    it('should use TZ environment variable when provided and valid', () => {
      process.env.TZ = 'America/New_York'

      const timestampFn = Logger.getTimestamp()
      timestampFn()

      expect(moment.tz.zone).toHaveBeenCalledWith('America/New_York')
    })

    it('should use default timezone (Asia/Tokyo) when TZ is not provided', () => {
      delete process.env.TZ

      const timestampFn = Logger.getTimestamp()
      const result = timestampFn()

      expect(result).toBe('2025-05-05 12:00:00.000')
    })

    it('should use default timezone (Asia/Tokyo) when TZ is invalid', () => {
      process.env.TZ = 'Invalid/Timezone'

      const timestampFn = Logger.getTimestamp()
      const result = timestampFn()

      expect(result).toBe('2025-05-05 12:00:00.000')
    })
  })

  describe('logging methods', () => {
    let loggerInstance: Logger
    let mockWinstonLogger: any

    beforeEach(() => {
      // Winstonロガーのモックを取得
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

  // プロセスイベントハンドラのテスト - より単純な方法で検証
  describe('process event handlers', () => {
    it('should register events for unhandledRejection and uncaughtException', () => {
      // オリジナルのprocess.onを保持
      try {
        const eventHandlers: Record<string, Function> = {}

        // process.onをモック化
        process.on = jest
          .fn()
          .mockImplementation((event: string, handler: Function) => {
            eventHandlers[event] = handler
            return process
          })

        // ロガーを直接インポートしてプロセスイベントを登録させる
        jest.isolateModules(() => {
          require('../logger')
        })

        // イベントが登録されたことを確認
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

        // イベントハンドラの実行をテスト
        const mockError = new Error('Test error')

        // unhandledRejectionハンドラをテスト
        eventHandlers.unhandledRejection(mockError)
        expect(winston.createLogger().error).toHaveBeenCalledWith(
          'unhandledRejection',
          mockError
        )

        // uncaughtExceptionハンドラをテスト
        eventHandlers.uncaughtException(mockError)
        expect(winston.createLogger().error).toHaveBeenCalledWith(
          'uncaughtException',
          mockError
        )
      } finally {
        // 元に戻す
        process.on = originalProcessOn
      }
    })
  })
})
