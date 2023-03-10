import { ConfigFramework, Logger } from '..'

export interface Configuration {
  foo: string
  bar: number
}

class ExampleConfiguration extends ConfigFramework<Configuration> {
  protected validates(): { [key: string]: (config: Configuration) => boolean } {
    return {
      'foo is required': (config) => config.foo !== undefined,
      'foo is string': (config) => typeof config.foo === 'string',
      'foo is 3 or more characters': (config) => config.foo.length >= 3,
      'bar is required': (config) => config.bar !== undefined,
      'bar is number': (config) => typeof config.bar === 'number',
    }
  }
}

export function exampleConfiguration() {
  const logger = Logger.configure('exampleConfiguration')
  const config = new ExampleConfiguration()
  config.load()
  if (!config.validate()) {
    logger.error('Configuration validation failed')
    logger.error(config.getValidateFailures().join(', '))
    return
  }

  logger.info(`foo: ${config.get('foo')}`)
  logger.info(`bar: ${config.get('bar')}`)
}
