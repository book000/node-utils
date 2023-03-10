import { Logger } from '@/logger'

export function exampleLogger() {
  const logger = Logger.configure('exampleLogger')
  logger.info('Hello world!')
}
