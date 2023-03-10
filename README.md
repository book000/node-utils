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

## 📑 License

This project is licensed under the [MIT License](https://github.com/book000/node-utils/blob/master/LICENSE).
