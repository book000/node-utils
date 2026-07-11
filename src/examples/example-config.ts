import { ConfigFramework, Logger } from '..'

export interface Config {
  foo: string
  bar: number
}

class ExampleConfig extends ConfigFramework<Config> {
  protected validates(): Record<string, (config: Config) => boolean> {
    return {
      // ...Discord.validations, // When using a message transmission to Discord
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      'foo is required': (config) => config.foo !== undefined,
      'foo is string': (config) => typeof config.foo === 'string',
      'foo is 3 or more characters': (config) => config.foo.length >= 3,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      'bar is required': (config) => config.bar !== undefined,
      'bar is number': (config) => typeof config.bar === 'number',
    }
  }
}

export function exampleConfig() {
  const logger = Logger.configure('exampleConfig')
  const config = new ExampleConfig()
  config.load()
  if (!config.validate()) {
    logger.error('Configuration validation failed')
    logger.error(config.getValidateFailures().join(', '))
    return
  }

  logger.info(`foo: ${config.get('foo')}`)
  logger.info(`bar: ${config.get('bar')}`)
}
