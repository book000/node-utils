import * as Sentry from '@sentry/node'
import winston from 'winston'
import { SentryTransport } from '../sentry-transport'
import { ensureSentryInitialized } from '../sentry/sentry-client'

const scope = {
  setLevel: jest.fn(),
  setTag: jest.fn(),
  setFingerprint: jest.fn(),
}

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  captureEvent: jest.fn(),
  withScope: jest.fn((callback: (scope: unknown) => void) => {
    callback(scope)
  }),
  flush: jest.fn().mockResolvedValue(true),
}))

jest.mock('../sentry/sentry-client', () => ({
  ensureSentryInitialized: jest.fn(),
  toSeverityLevel: jest.fn((level: string) =>
    level === 'warn' ? 'warning' : level
  ),
}))

describe('SentryTransport', () => {
  let transport: SentryTransport

  beforeEach(() => {
    jest.clearAllMocks()
    transport = new SentryTransport({
      dsn: 'https://example.com/1',
      level: 'warn',
    })
  })

  it('should call ensureSentryInitialized with the given options on construction', () => {
    expect(ensureSentryInitialized).toHaveBeenCalledWith({
      dsn: 'https://example.com/1',
      level: 'warn',
    })
  })

  describe('with the real winston Logger', () => {
    const createLogger = (): winston.Logger =>
      winston.createLogger({
        format: winston.format.errors({ stack: true }),
        transports: [transport],
      })

    it('should capture the original Error and keep the log message out of the title', () => {
      const error = new TypeError('inner')
      createLogger().error('[Auth] failed:', error)

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TypeError', message: 'inner' })
      )
      expect(scope.setTag).toHaveBeenCalledWith(
        'log.message',
        '[Auth] failed: inner'
      )
      expect(scope.setFingerprint).toHaveBeenCalledWith([
        'error',
        'TypeError',
        expect.stringMatching(/sentry-transport\.test\.ts$/),
      ])
      expect(Sentry.captureEvent).not.toHaveBeenCalled()
    })

    it('should capture the same Error instance every time it is logged', () => {
      const error = new Error('again')
      const logger = createLogger()
      logger.warn('retry', error)
      logger.error('gave up', error)

      const calls = (Sentry.captureException as jest.Mock).mock.calls
      expect(calls).toHaveLength(2)
      expect(calls[0]).not.toBe(error)
    })

    it('should rebuild the Error from stack when only logger.error(err) is used', () => {
      createLogger().error(new RangeError('bad'))

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'RangeError', message: 'bad' })
      )
    })

    it('should send a plain string error via captureEvent with a message fingerprint', () => {
      createLogger().error('boom')

      expect(Sentry.captureException).not.toHaveBeenCalled()
      expect(Sentry.captureEvent).toHaveBeenCalledWith({
        message: 'boom',
        level: 'error',
      })
      expect(scope.setFingerprint).toHaveBeenCalledWith(['error', 'boom'])
    })

    it('should send a warn string via captureEvent with warning level', () => {
      createLogger().warn('careful')

      expect(Sentry.captureEvent).toHaveBeenCalledWith({
        message: 'careful',
        level: 'warning',
      })
      expect(scope.setFingerprint).toHaveBeenCalledWith(['warn', 'careful'])
    })

    it('should not capture levels below the transport level', () => {
      createLogger().info('hello')

      expect(Sentry.captureException).not.toHaveBeenCalled()
      expect(Sentry.captureEvent).not.toHaveBeenCalled()
    })
  })

  it('should emit an "error" event when Sentry.flush rejects', async () => {
    ;(Sentry.flush as jest.Mock).mockRejectedValueOnce(new Error('network'))
    const onError = jest.fn()
    transport.on('error', onError)
    const callback = jest.fn()

    transport.log({ level: 'error', message: 'boom' }, callback)
    await Promise.resolve()
    await Promise.resolve()

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(callback).toHaveBeenCalled()
  })

  it('should await Sentry.flush before invoking callback for error level', async () => {
    const callback = jest.fn()

    transport.log({ level: 'error', message: 'boom' }, callback)

    expect(callback).not.toHaveBeenCalled()
    expect(Sentry.flush).toHaveBeenCalledWith(2000)

    await Promise.resolve()
    await Promise.resolve()

    expect(callback).toHaveBeenCalled()
  })

  it('should invoke callback synchronously without flush for non-error levels', () => {
    const callback = jest.fn()

    transport.log({ level: 'info', message: 'hello' }, callback)

    expect(Sentry.flush).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalled()
  })

  it('should not call captureException or captureEvent for info level', () => {
    transport.log({ level: 'info', message: 'hello' }, jest.fn())

    expect(Sentry.captureException).not.toHaveBeenCalled()
  })
})
