import * as Sentry from '@sentry/node'
import winston from 'winston'
import TransportStream from 'winston-transport'
import { SentryTransport, toSentryMetaArg } from '../sentry-transport'
import { ensureSentryInitialized } from '../sentry/sentry-client'

const scope = {
  setLevel: jest.fn(),
  setTag: jest.fn(),
  setFingerprint: jest.fn(),
  setExtra: jest.fn(),
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

/**
 * Creates an Error with the given stack string.
 *
 * @param message Error message
 * @param stack Stack string to substitute
 * @returns An Error with the substituted stack
 */
function withStack(message: string, stack: string): Error {
  const error = new Error(message)
  Object.defineProperty(error, 'stack', { value: stack })
  return error
}

/** winston holds the next log until the error-level callback (flush wait) returns, so wait before the next log */
const settle = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve))

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

    it.each([
      ['    at run (/srv/app/dist/main.js:10:5)', 'at run main.js'],
      ['    at /srv/app/dist/main.js:10:5', 'at main.js'],
      [
        String.raw`    at async run (C:\srv\app\dist\main.js:10:5)`,
        'at async run main.js',
      ],
      ['    at new Foo (<anonymous>)', 'at new Foo <anonymous>'],
    ])(
      'should reduce the stack frame %j to %j in the fingerprint',
      (frame, expected) => {
        const error = withStack('frame', `Error: frame\n${frame}`)
        createLogger().error('failed', error)

        expect(scope.setFingerprint).toHaveBeenCalledWith([
          'error',
          'Error',
          expected,
        ])
      }
    )

    it('should not take quadratic time on a very long frame', () => {
      const error = withStack(
        'long',
        `Error: long\n    at run (${'('.repeat(50_000)}main.js:1:1)`
      )
      const start = Date.now()
      createLogger().error('failed', error)

      expect(Date.now() - start).toBeLessThan(1000)
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

    describe('SentryMeta', () => {
      // Loosen the type because this test passes invalid values
      const meta = (m: Record<string, unknown>): Record<string, unknown> =>
        toSentryMetaArg(m)

      it('should pass an explicit fingerprint verbatim (Error and message-only)', async () => {
        const logger = createLogger()
        logger.error(
          'a',
          new Error('e'),
          meta({ fingerprint: ['k', '{{ default }}'] })
        )
        await settle()
        logger.warn('b', undefined, meta({ fingerprint: ['k2'] }))

        expect(scope.setFingerprint).toHaveBeenNthCalledWith(1, [
          'k',
          '{{ default }}',
        ])
        expect(scope.setFingerprint).toHaveBeenNthCalledWith(2, ['k2'])
      })

      it('should set tags and extra, and keep log.message authoritative', () => {
        createLogger().warn(
          'careful',
          undefined,
          meta({
            tags: { feature: 'x', 'log.message': 'spoof', bad: 1 },
            extra: { id: 7 },
          })
        )

        expect(scope.setTag).toHaveBeenCalledWith('feature', 'x')
        expect(scope.setTag).not.toHaveBeenCalledWith('bad', expect.anything())
        expect(scope.setTag).toHaveBeenLastCalledWith('log.message', 'careful')
        expect(scope.setExtra).toHaveBeenCalledWith('id', 7)
      })

      it('should ignore a malformed fingerprint and fall back to the default', () => {
        createLogger().warn(
          'careful',
          undefined,
          meta({ fingerprint: ['ok', 1] })
        )

        expect(scope.setFingerprint).toHaveBeenCalledWith(['warn', 'careful'])
      })

      it.each(['warn', 'error'] as const)(
        'should not capture or flush when sentry is false (%s)',
        async (level) => {
          const logger = createLogger()
          logger[level]('quiet', new Error('e'), meta({ sentry: false }))
          await new Promise((resolve) => setImmediate(resolve))

          expect(Sentry.captureException).not.toHaveBeenCalled()
          expect(Sentry.captureEvent).not.toHaveBeenCalled()
          expect(Sentry.flush).not.toHaveBeenCalled()
        }
      )

      it('should not expand the reserved key into top-level info fields', () => {
        const seen: Record<string, unknown>[] = []
        const spy = new (class extends TransportStream {
          log(info: Record<string, unknown>, callback: () => void): void {
            seen.push(info)
            callback()
          }
        })()
        const logger = winston.createLogger({
          format: winston.format.errors({ stack: true }),
          transports: [spy],
        })
        logger.error('m', new Error('e'), meta({ extra: { a: 1 } }))
        logger.error('m', undefined, meta({ extra: { a: 1 } }))

        for (const info of seen) {
          expect(Object.keys(info)).not.toContain('sentryMeta')
          expect(Object.keys(info)).not.toContain('extra')
        }
      })
    })

    describe('SentryMeta spoofing and robustness', () => {
      it('should ignore a sentryMeta property carried by user data', () => {
        const spoofed = Object.assign(new Error('e'), {
          sentryMeta: { sentry: false, fingerprint: ['evil'] },
        })
        createLogger().error('failed', spoofed)

        expect(Sentry.captureException).toHaveBeenCalledTimes(1)
        expect(scope.setFingerprint).not.toHaveBeenCalledWith(['evil'])
      })

      it('should still invoke the callback when capture throws', () => {
        const callback = jest.fn()
        const onError = jest.fn()
        transport.on('error', onError)
        const extra = {
          get boom(): never {
            throw new Error('getter')
          },
        }
        transport.log(
          {
            level: 'warn',
            message: 'x',
            [Symbol.for('splat')]: [undefined, toSentryMetaArg({ extra })],
          },
          callback
        )

        expect(onError).toHaveBeenCalledWith(expect.any(Error))
        expect(callback).toHaveBeenCalledTimes(1)
      })

      it.each([
        ['sentry:false', { sentry: false }],
        ['already reported', undefined],
      ])('should invoke the callback once when skipped (%s)', (_, m) => {
        const error = new Error('dup')
        const info = (): Record<string, unknown> => ({
          level: 'error',
          message: 'x',
          [Symbol.for('splat')]: m ? [error, toSentryMetaArg(m)] : [error],
        })
        if (!m) transport.log(info(), jest.fn())
        const callback = jest.fn()
        transport.log(info(), callback)

        expect(callback).toHaveBeenCalledTimes(1)
      })
    })

    describe('same-instance dedup', () => {
      it('should report one event for log then rethrow then unhandledRejection', async () => {
        const error = new Error('rethrown')
        const logger = createLogger()
        logger.error('failed', error)
        await settle()
        // Equivalent to the unhandledRejection hook
        logger.error('unhandledRejection', error)
        await settle()

        expect(Sentry.captureException).toHaveBeenCalledTimes(1)
        expect(Sentry.flush).toHaveBeenCalledTimes(1)
      })

      it('should dedup across transports (category loggers vs the main hook)', () => {
        const other = new SentryTransport({
          dsn: 'https://example.com/1',
          level: 'warn',
        })
        const error = new Error('cross')
        const info = {
          level: 'warn',
          message: 'x',
          [Symbol.for('splat')]: [error],
        }
        transport.log(info, jest.fn())
        other.log(info, jest.fn())

        expect(Sentry.captureException).toHaveBeenCalledTimes(1)
      })

      it('should still report distinct instances separately', async () => {
        const logger = createLogger()
        logger.error('failed', new Error('same message'))
        await settle()
        logger.error('failed', new Error('same message'))
        await settle()

        expect(Sentry.captureException).toHaveBeenCalledTimes(2)
      })

      it('should not mark an Error reported when sentry is false', async () => {
        const error = new Error('quiet then loud')
        const logger = createLogger()
        logger.error('a', error, toSentryMetaArg({ sentry: false }))
        await settle()
        logger.error('b', error)
        await settle()

        expect(Sentry.captureException).toHaveBeenCalledTimes(1)
      })
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
