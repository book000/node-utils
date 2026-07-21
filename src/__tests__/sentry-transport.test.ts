import * as Sentry from '@sentry/node'
import { SentryTransport } from '../sentry-transport'
import { ensureSentryInitialized } from '../sentry/sentry-client'

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
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
    transport = new SentryTransport({ dsn: 'https://example.com/1' })
  })

  it('should call ensureSentryInitialized with the given options on construction', () => {
    expect(ensureSentryInitialized).toHaveBeenCalledWith({
      dsn: 'https://example.com/1',
    })
  })

  it('should call captureException when level is error and stack is present', (done) => {
    transport.log(
      { level: 'error', message: 'boom', stack: 'Error: boom\n  at x' },
      () => {
        expect(Sentry.captureException).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'boom',
            stack: 'Error: boom\n  at x',
          })
        )
        done()
      }
    )
  })

  it('should preserve the original error name parsed from the stack', (done) => {
    transport.log(
      {
        level: 'error',
        message: 'boom',
        stack: 'TypeError: boom\n  at x',
      },
      () => {
        expect(Sentry.captureException).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'TypeError' })
        )
        done()
      }
    )
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

  it('should call captureMessage with "error" severity when level is error and no stack', (done) => {
    transport.log({ level: 'error', message: 'boom' }, () => {
      expect(Sentry.captureMessage).toHaveBeenCalledWith('boom', 'error')
      done()
    })
  })

  it('should call captureMessage with "warning" severity when level is warn', () => {
    const callback = jest.fn()
    transport.log({ level: 'warn', message: 'careful' }, callback)

    expect(Sentry.captureMessage).toHaveBeenCalledWith('careful', 'warning')
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

  it('should not call captureException or captureMessage for info level', () => {
    transport.log({ level: 'info', message: 'hello' }, jest.fn())

    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })
})
