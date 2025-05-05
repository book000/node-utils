import fs from 'node:fs'
import path from 'node:path'
import { ConfigFramework } from '../configuration'
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
        if (!config.nested) return true
        return typeof config.nested.key === 'string'
      },
      'value is greater than zero': (config) => config.value > 0,
    }
  }
}

describe('ConfigFramework', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'))
  const validConfigPath = path.join(tempDir, 'valid-config.json')
  const invalidConfigPath = path.join(tempDir, 'invalid-config.json')
  const invalidJsonConfigPath = path.join(tempDir, 'invalid-json-config.json')

  beforeAll(() => {
    // 有効な設定ファイルを作成
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

    // 無効な設定ファイル（検証エラー）を作成
    fs.writeFileSync(
      invalidConfigPath,
      JSON.stringify({
        name: 'test',
        value: -5, // バリデーションエラー: value > 0
        flag: 'invalid', // バリデーションエラー: flag は boolean であるべき
      })
    )

    // 無効なJSON形式のファイルを作成
    fs.writeFileSync(invalidJsonConfigPath, '{ invalid json')
  })

  afterAll(() => {
    // テスト終了後にテンポラリファイルを削除
    fs.rmSync(tempDir, { recursive: true, force: true })
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

    it('should load but resulting in incomplete parsing when JSON is invalid', () => {
      const config = new TestConfigFramework(invalidJsonConfigPath)
      // jsonc-parser はエラーを投げず、パース可能な部分だけをパースする
      expect(() => {
        config.load()
      }).not.toThrow()
    })
  })

  describe('validate', () => {
    it('should validate a valid config successfully', () => {
      const config = new TestConfigFramework(validConfigPath)
      config.load()
      const result = config.validate()
      expect(result).toBeTruthy()
      expect(config.getValidateFailures()).toHaveLength(0)
    })

    it('should fail validation for an invalid config', () => {
      const config = new TestConfigFramework(invalidConfigPath)
      config.load()
      const result = config.validate()
      expect(result).toBeFalsy()

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
