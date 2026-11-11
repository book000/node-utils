import fs from 'node:fs'
import { parse } from 'jsonc-parser'

/**
 * Base class for managing a configuration file.
 *
 * The file is parsed as JSONC (comments and trailing commas are allowed).
 * Subclasses define the validation rules in {@link validates}.
 *
 * @template IConfig Type of the configuration file
 */
export abstract class ConfigFramework<IConfig> {
  /** Path of the configuration file */
  private path: string
  private config: IConfig | undefined
  private validateFailures: string[] = []

  /**
   * Resolves the configuration file path. The file is not read here; call {@link load} for that.
   *
   * The first existing file among the following candidates is used, in this order:
   * 1. the `CONFIG_PATH` environment variable
   * 2. the `CONFIG_FILE` environment variable
   * 3. the `path` argument
   *
   * @param path Fallback path of the configuration file
   * @throws If none of the candidates points to an existing file
   */
  constructor(path?: string) {
    const paths = [
      process.env.CONFIG_PATH,
      process.env.CONFIG_FILE,
      path,
    ].filter((p) => p !== undefined && fs.existsSync(p)) as string[]
    if (paths.length === 0) {
      throw new Error('Config path not found')
    }
    this.path = paths[0]
  }

  /**
   * Defines the validation rules for the configuration file.
   *
   * Each key is the name of a rule, and each value is a function that returns true when the configuration passes the rule.
   * A rule that throws is treated as failed.
   *
   * @returns Validation rules
   */
  protected abstract validates(): Record<string, (config: IConfig) => boolean>

  /**
   * Reads and parses the configuration file resolved by the constructor.
   *
   * No validation is done here; call {@link validate} afterwards.
   */
  public load(): void {
    const data = fs.readFileSync(this.path, 'utf8')
    const json = parse(data) as IConfig
    this.config = json
  }

  /**
   * Validates the loaded configuration against the rules from {@link validates}.
   *
   * {@link load} must be called first. The names of the failed rules are available from {@link getValidateFailures}.
   *
   * @returns true if every rule passed, false otherwise
   * @throws If the configuration has not been loaded
   */
  public validate(): boolean {
    if (!this.config) throw new Error('Config not loaded')

    this.validateFailures = []
    const validates = this.validates()
    for (const key in validates) {
      try {
        if (!validates[key](this.config)) {
          this.validateFailures.push(key)
        }
      } catch {
        this.validateFailures.push(key)
      }
    }
    return this.validateFailures.length === 0
  }

  /**
   * Gets the names of the rules that failed in the last {@link validate} call.
   *
   * @returns Names of the failed rules
   */
  public getValidateFailures(): string[] {
    return this.validateFailures
  }

  /**
   * Gets a top-level value of the configuration.
   *
   * @param key Key of the configuration
   * @returns Value of the configuration
   * @throws If the configuration has not been loaded
   */
  public get<T extends keyof IConfig>(key: T): IConfig[T] {
    if (!this.config) throw new Error('Config not loaded')
    return this.config[key]
  }
}
