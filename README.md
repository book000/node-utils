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

### Logger with winston

Easily initialise winston logger.

```typescript
import { Logger } from '@book000/node-utils'

function main() {
  const logger = Logger.configure('main')
  logger.info('Hello world!')
}

main()
```

## 📑 License

This project is licensed under the [MIT License](https://github.com/book000/node-utils/blob/master/LICENSE).
