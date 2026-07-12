import { Logger } from '@/logger'
import { Config, exampleConfig } from './example-config'
import { exampleLogger } from './example-logger'
import { exampleDiscord } from './example-discord'
import fs from 'node:fs'
import os from 'node:os'

async function main() {
  const logger = Logger.configure('main')
  logger.info('Running main()')

  logger.info('Calling exampleLogger()')
  exampleLogger()

  logger.info('Create dummy configuration file')
  const config: Config = {
    foo: 'foo',
    bar: 123,
  }
  const temporaryConfigPath = `${os.tmpdir()}/config.json`
  fs.writeFileSync(temporaryConfigPath, JSON.stringify(config))

  logger.info('Set environment variable')
  process.env.CONFIG_PATH = temporaryConfigPath

  logger.info('Calling exampleConfig()')
  exampleConfig()

  logger.info('Remove dummy configuration file')
  fs.unlinkSync(temporaryConfigPath)

  logger.info('Calling exampleDiscord()')
  await exampleDiscord()
}

;(async () => {
  await main()
})()
