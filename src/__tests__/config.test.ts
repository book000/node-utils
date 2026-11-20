import fs from 'node:fs'
import path from 'node:path'
import { ConfigFramework } from '../config'
import os from 'node:os'

interface TestConfig {
  name: string
  value: number
  flag: boolean
  nested?: {
    key: string
  }
}

class TestConfigFramework extends ConfigFramework<TestConfig> {
  protected validates(): Record<string, (config: TestConfig) => boolean> {
    return {
      'name is string': (config) => typeof config.name === 'string',
      'value is number': (config) => typeof config.value === 'number',
      'flag is boolean': (config) => typeof config.flag === 'boolean',
      'nested.key is string': (config) => {
        return !config.nested || typeof config.nested.key === 'string'
      },
      'value is greater than zero': (config) => config.value > 0,
    }
  }
}

describe('ConfigFramework', () => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'config-test-')
  )
  const validConfigPath = path.join(temporaryDirectory, 'valid-config.json')
  const invalidConfigPath = path.join(temporaryDirectory, 'invalid-config.json')
  const invalidJsonConfigPath = path.join(
    temporaryDirectory,
    'invalid-json-config.json'
  )

  beforeAll(() => {
    fs.writeFileSync(
      validConfigPath,
      JSON.stringify({
        name: 'test',
        value: 10,
        flag: true,
        nested: {
          key: 'nested-value',
        },
      })
    )

    // Create a config file that fails validation
    fs.writeFileSync(
      invalidConfigPath,
      JSON.stringify({
        name: 'test',
        value: -5, // fails validation: value must be > 0
        flag: 'invalid', // fails validation: flag must be a boolean
      })
    )

    // Create a file that is not valid JSON
    fs.writeFileSync(invalidJsonConfigPath, '{ invalid json')
  })

  afterAll(() => {
    // Remove the temporary files after the tests
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  describe('constructor', () => {
    it('should use the path provided as an argument when it exists', () => {
      const config = new TestConfigFramework(validConfigPath)
      expect(config).toBeDefined()
    })

    it('should use CONFIG_PATH environment variable when it exists', () => {
      const originalConfigPath = process.env.CONFIG_PATH
      process.env.CONFIG_PATH = validConfigPath
      try {
        const config = new TestConfigFramework()
        expect(config).toBeDefined()
      } finally {
        process.env.CONFIG_PATH = originalConfigPath
      }
    })

    it('should use CONFIG_FILE environment variable when it exists and CONFIG_PATH is not defined', () => {
      const originalConfigPath = process.env.CONFIG_PATH
      const originalConfigFile = process.env.CONFIG_FILE
      delete process.env.CONFIG_PATH
      process.env.CONFIG_FILE = validConfigPath
      try {
        const config = new TestConfigFramework()
        expect(config).toBeDefined()
      } finally {
        process.env.CONFIG_PATH = originalConfigPath
        process.env.CONFIG_FILE = originalConfigFile
      }
    })

    it('should throw an error when no valid path is provided', () => {
      const originalConfigPath = process.env.CONFIG_PATH
      const originalConfigFile = process.env.CONFIG_FILE
      delete process.env.CONFIG_PATH
      delete process.env.CONFIG_FILE
      try {
        expect(() => new TestConfigFramework('non-existent-file.json')).toThrow(
          'Config path not found'
        )
      } finally {
        process.env.CONFIG_PATH = originalConfigPath
        process.env.CONFIG_FILE = originalConfigFile
      }
    })
  })

  describe('load', () => {
    it('should load a valid config file', () => {
      const config = new TestConfigFramework(validConfigPath)
      expect(() => {
        config.load()
      }).not.toThrow()
    })

    it('should reject invalid JSONC', () => {
      const config = new TestConfigFramework(invalidJsonConfigPath)
      expect(() => {
        config.load()
      }).toThrow('Invalid JSONC')
      expect(() => config.validate()).toThrow('Config not loaded')
    })

    it('should reject truncated JSONC even when all required fields precede the error', () => {
      const filePath = path.join(temporaryDirectory, 'truncated.jsonc')
      fs.writeFileSync(
        filePath,
        '{"name":"accepted","value":10,"flag":true,"unfinished":'
      )
      const config = new TestConfigFramework(filePath)
      expect(() => {
        config.load()
      }).toThrow('Invalid JSONC')
      expect(() => config.validate()).toThrow('Config not loaded')
    })

    it('should accept JSONC comments and trailing commas', () => {
      const filePath = path.join(temporaryDirectory, 'valid.jsonc')
      fs.writeFileSync(
        filePath,
        '{ // comment\n "name": "test", "value": 10, "flag": true, }'
      )
      const config = new TestConfigFramework(filePath)
      config.load()
      expect(config.validate()).toBe(true)
      expect(config.get('name')).toBe('test')
    })
  })

  describe('validate', () => {
    it('should validate a valid config successfully', () => {
      const config = new TestConfigFramework(validConfigPath)
      config.load()
      const isResult = config.validate()
      expect(isResult).toBeTruthy()
      expect(config.getValidateFailures()).toHaveLength(0)
    })

    it('should fail validation for an invalid config', () => {
      const config = new TestConfigFramework(invalidConfigPath)
      config.load()
      const isResult = config.validate()
      expect(isResult).toBeFalsy()

      const failures = config.getValidateFailures()
      expect(failures).toContain('flag is boolean')
      expect(failures).toContain('value is greater than zero')
    })

    it('should throw an error when config is not loaded', () => {
      const config = new TestConfigFramework(validConfigPath)
      expect(() => config.validate()).toThrow('Config not loaded')
    })
  })

  describe('get', () => {
    it('should get a config value by key', () => {
      const config = new TestConfigFramework(validConfigPath)
      config.load()
      expect(config.get('name')).toBe('test')
      expect(config.get('value')).toBe(10)
      expect(config.get('flag')).toBe(true)
      expect(config.get('nested')).toEqual({ key: 'nested-value' })
    })

    it('should throw an error when config is not loaded', () => {
      const config = new TestConfigFramework(validConfigPath)
      expect(() => config.get('name')).toThrow('Config not loaded')
    })
  })

  describe('getValidateFailures', () => {
    it('should return an empty array if no validation has been run', () => {
      const config = new TestConfigFramework(validConfigPath)
      config.load()
      expect(config.getValidateFailures()).toHaveLength(0)
    })

    it('should return failed validation rules', () => {
      const config = new TestConfigFramework(invalidConfigPath)
      config.load()
      config.validate()
      const failures = config.getValidateFailures()
      expect(failures).toContain('flag is boolean')
      expect(failures).toContain('value is greater than zero')
    })
  })
})
