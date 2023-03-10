import fs from 'node:fs'
import { parse } from 'jsonc-parser'

/**
 * 設定ファイルを管理するフレームワーククラス
 *
 * 設定ファイルは JSONC 形式でパースされる。
 *
 * @template IConfig 設定ファイルの型
 */
export abstract class ConfigFramework<IConfig> {
  /** 設定ファイルのパス */
  private path: string
  private config: IConfig | undefined
  private validateFailures: string[] = []

  /**
   * コンストラクタ
   *
   * ファイルの読み込みは行わない。{@link load} を呼び出すことで読み込む。
   *
   * 原則、以下の環境変数を利用する。値の場所にファイルがあればそれを利用する。
   * - CONFIG_PATH
   * - CONFIG_FILE
   * 環境変数に値が設定されておらず、設定ファイルのパスが path に指定されていてそのファイルがある場合はそのファイルを設定ファイルとして使用する
   * いずれの方法でもパスを取得できない場合はエラーを投げる
   *
   * @param path 設定ファイルのパス
   * @returns インスタンス
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
   * 設定ファイルの検証ルールを定義する
   *
   * key には検証ルールの名前を指定する。
   * value には検証ルールを定義する関数を指定する。
   *
   * @returns 検証ルール
   */
  protected abstract validates(): {
    [key: string]: (config: IConfig) => boolean
  }

  /**
   * 設定ファイルを読み込む
   *
   * 設定ファイルのパスはコンストラクタで指定されたものが利用される。
   * この関数内ではバリデーションは行わないので、{@link validate} を呼び出す必要がある。
   */
  public load(): void {
    const data = fs.readFileSync(this.path, 'utf8')
    const json = parse(data) as IConfig
    this.config = json
  }

  /**
   * 設定ファイルのバリデーションを行う
   *
   * この関数を呼び出す前に、{@link load} を呼び出して設定ファイルを読み込んでおく必要がある。
   * バリデーションに失敗した場合は、{@link getValidateFailures} で失敗した項目を取得できる。
   *
   * @returns バリデーションに成功した場合は true、失敗した場合は false
   */
  public validate(): boolean {
    if (!this.config) throw new Error('Config not loaded')

    this.validateFailures = []
    const validates = this.validates()
    for (const key in validates) {
      if (!validates[key](this.config)) {
        this.validateFailures.push(key)
      }
    }
    return this.validateFailures.length === 0
  }

  /**
   * バリデーションに失敗した項目を取得する
   *
   * @returns バリデーションに失敗した項目の配列
   */
  public getValidateFailures(): string[] {
    return this.validateFailures
  }

  /**
   * 設定の値を取得する
   *
   * @param key 設定のキー
   * @returns 設定の値
   */
  public get<T extends keyof IConfig>(key: T): IConfig[T] {
    if (!this.config) throw new Error('Config not loaded')
    return this.config[key]
  }
}
