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

Easily initialise winston logger wrapper.

```typescript
import { Logger } from '@book000/node-utils'

function main() {
  const logger = Logger.configure('main')
  logger.info('Hello world!')
}

main()
```

### JSONC Configuration framework

Framework class to manage JSONC format configuration file.

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

// SENTRY_DSN が設定されていれば、以下の error() 呼び出しは自動的に GlitchTip へ転送される
const logger = Logger.configure('main')
logger.error('Something went wrong', new Error('boom'))
```

| Environment variable | Required | Default | Description |
|---|---|---|---|
| `SENTRY_DSN` | No (opt-in) | none | When unset, `SentryTransport` / `ErrorReporter` are fully no-op |
| `SENTRY_ENVIRONMENT` | No | `process.env.NODE_ENV ?? 'production'` | Sentry `environment` tag |
| `SENTRY_LOG_LEVEL` | No | `warn` | Minimum Winston log level forwarded by `SentryTransport` |
| `SENTRY_RELEASE` | No | auto-detected `<name>@<version>` from the consuming app's `package.json` | Overrides the auto-detected `release` tag |

For explicit, opt-in error reporting outside of `Logger` (e.g. attaching custom tags), use `ErrorReporter`:

```typescript
import { ErrorReporter } from '@book000/node-utils'

ErrorReporter.configure()
ErrorReporter.captureException(new Error('boom'), { userId: '123' })
```

### Send message to Discord

You can send messages to the Discord using the Discord Bot or the Discord Webhook.

```typescript
import { Discord } from '@book000/node-utils'

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
}

main()
```

## 📑 License

This project is licensed under the [MIT License](LICENSE).
