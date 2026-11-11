# @book000/node-utils

Self-Utility library for [Tomachi (book000)](https://github.com/book000)

## 🚀 Install

If you are using npm:

```shell
npm install @book000/node-utils
```

or if you are using yarn:

```shell
yarn add @book000/node-utils
```

## ✨ Features

Also see [src/examples/](src/examples/) directory.

### Logger with winston

A winston logger wrapper. It logs to the console and to daily-rotated files, and timestamps are formatted as `YYYY-MM-DD HH:mm:ss.SSS` in the timezone given by `TZ` (default `Asia/Tokyo`).

```typescript
import { Logger } from '@book000/node-utils'

function main() {
  const logger = Logger.configure('main')
  logger.info('Hello world!')
}

main()
```

`Logger.configure(category)` returns the same instance for the same category, so settings are read only on the first call for each category. Use a fixed, low-cardinality value (a module or class name) as the category. Call `Logger.closeAll()` to close every cached logger, for example on shutdown.

| Environment variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | Console log level |
| `LOG_FILE_LEVEL` | `info` | File log level |
| `LOG_DIR` | `logs` | Log directory (`/tmp/logs` when `VERCEL` is set, regardless of `LOG_DIR`) |
| `LOG_FILE_MAX_AGE` | `30d` | Maximum retention of log files |
| `LOG_FILE_FORMAT` | `text` | `text` (`.log` files) or `ndjson` (`.ndjson` files) |
| `TZ` | `Asia/Tokyo` | Timezone of the timestamps (unknown values fall back to `Asia/Tokyo`) |

Importing `Logger` also registers `unhandledRejection` and `uncaughtException` handlers that log through `Logger.configure('main')`.

### JSONC Configuration framework

Framework class to manage a configuration file in JSONC format (comments and trailing commas are allowed).

The constructor takes an optional fallback `path`. The first existing file among the `CONFIG_PATH` environment variable, the `CONFIG_FILE` environment variable and `path` is used, and an `Error` is thrown if none exists. In the example below, set `CONFIG_PATH` or `CONFIG_FILE` to the configuration file path. `load()` reads the file, `validate()` runs the rules from `validates()`, and `getValidateFailures()` returns the names of the failed rules.

```typescript
import { ConfigFramework } from '@book000/node-utils'

interface Config {
  foo: string
  bar: number
}

class ExampleConfiguration extends ConfigFramework<Config> {
  protected validates(): { [key: string]: (config: Config) => boolean } {
    return {
      'foo is required': (config) => config.foo !== undefined,
      'foo is string': (config) => typeof config.foo === 'string',
      'foo is 3 or more characters': (config) => config.foo.length >= 3,
      'bar is required': (config) => config.bar !== undefined,
      'bar is number': (config) => typeof config.bar === 'number',
    }
  }
}

function main() {
  const config = new ExampleConfiguration()
  config.load()
  if (!config.validate()) {
    console.error('Configuration validation failed')
    console.error(config.getValidateFailures())
    return
  }

  console.log('foo:', config.get('foo'))
  console.log('bar:', config.get('bar'))
}

main()
```

### Sentry (GlitchTip) integration for error reporting

`Logger` automatically forwards `error`/`warn` logs (and the existing `unhandledRejection` / `uncaughtException` process hooks) to a Sentry-compatible endpoint (e.g. self-hosted [GlitchTip](https://glitchtip.com/)) when the `SENTRY_DSN` environment variable is set. No code changes are required on the consuming side beyond upgrading `@book000/node-utils` and setting the environment variable.

```typescript
import { Logger } from '@book000/node-utils'

// When SENTRY_DSN is set, the error() call below is forwarded to GlitchTip automatically
const logger = Logger.configure('main')
logger.error('Something went wrong', new Error('boom'))
```

The forwarded issue keeps the original error's name and message as its title, and the log message (`'Something went wrong'`) is attached as the `log.message` tag. Issues are grouped by a fingerprint of the level, error name, and first application stack frame (function and file name), or by the message for logs without an `Error`.

An `Error` instance that was already reported at a given level is not reported again (regardless of the logger category), so `logger.error('failed', err)` followed by a rethrow caught by the built-in `unhandledRejection` / `uncaughtException` hooks sends one event. Distinct `Error` instances are never deduplicated, and the same instance logged first as `warn` and later as `error` is still reported twice (once per level).

`Logger.warn` / `Logger.error` accept an optional third argument `SentryMeta` to control what is sent to Sentry for that log:

```typescript
logger.error('Payment failed', error, {
  fingerprint: ['payment-failed', '{{ default }}'], // replaces the automatic fingerprint
  tags: { feature: 'checkout' }, // string values only
  extra: { orderId: 42 }, // do not put secrets here
})
logger.warn('Expected, noisy condition', undefined, { sentry: false }) // never sent to Sentry
```

Invalid values (a non-string-array `fingerprint`, non-string tag values) are ignored. The `log.message` tag cannot be overridden. `SentryMeta` is not written to the console or log files, and only the argument built by `Logger` is honored (a `sentryMeta` property on an error object is ignored). Forwarding logs below `warn` (`sentry: true`) is not supported yet.

| Environment variable | Required | Default | Description |
|---|---|---|---|
| `SENTRY_DSN` | No (opt-in) | none | When unset, `SentryTransport` / `ErrorReporter` are fully no-op |
| `SENTRY_ENVIRONMENT` | No | `process.env.NODE_ENV ?? 'production'` | Sentry `environment` tag |
| `SENTRY_LOG_LEVEL` | No | `warn` | Minimum Winston log level forwarded by `SentryTransport` |
| `SENTRY_RELEASE` | No | auto-detected `<name>@<version>` from the consuming app's `package.json` | Overrides the auto-detected `release` tag |

For explicit, opt-in error reporting outside of `Logger` (e.g. attaching extra context), use `ErrorReporter`. It does nothing unless `SENTRY_DSN` is set and Sentry has been initialised, either by `ErrorReporter.configure()` or by a `Logger` created with `SENTRY_DSN` set. The second argument of `captureException()` is attached to the event as `extra`:

```typescript
import { ErrorReporter } from '@book000/node-utils'

ErrorReporter.configure()
ErrorReporter.captureException(new Error('boom'), { userId: '123' })
```

### Send message to Discord

You can send messages to Discord using a Discord Bot (`token` and `channelId`) or a Discord Webhook (`webhookUrl`). Messages can contain `content`, `embeds`, link buttons (`components`) or a `file`. `sendMessage()` returns the ID of the sent message (`undefined` when a webhook responds with 204), and `editMessage(messageId, message)` edits a message sent through the same bot channel or webhook.

```typescript
import { Discord, DiscordMessageFlag } from '@book000/node-utils'

export async function main() {
  const discord = new Discord({
    webhookUrl: 'https://discord.com/api/webhooks/...'
  })
  /*
  // ... or using Discord Bot
  const discord = new Discord({
    token: '...',
    channelId: '1234567890',
  })
  */

  await discord.sendMessage('Hello world!')

  await discord.sendMessage({
    embeds: [
      {
        title: 'Hello world!',
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
        color: 0x00_ff_00,
      },
    ],
  })

  // Suppress embeds and notifications using flags
  await discord.sendMessage({
    content: 'https://example.com',
    flags:
      DiscordMessageFlag.SuppressEmbeds |
      DiscordMessageFlag.SuppressNotifications,
  })
}

main()
```

`flags` can be combined with `content`, `embeds`, `components` and `file`.
`sendMessage()` accepts `SuppressEmbeds` and `SuppressNotifications`.
When editing, only `SuppressEmbeds` can be set or unset (Discord API restriction), but `editMessage()` also accepts `SuppressNotifications` so that you can pass all of the message's existing flags, as Discord requires (e.g. `SuppressEmbeds | SuppressNotifications` to add `SuppressEmbeds` to a message sent with `SuppressNotifications`). Other flags throw an error.

## 📑 License

This project is licensed under the [MIT License](LICENSE).
