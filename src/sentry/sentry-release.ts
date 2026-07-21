import fs from 'node:fs'
import path from 'node:path'

/**
 * 利用側アプリの package.json から `<name>@<version>` 形式の release 文字列を検出する
 *
 * package.json が見つからない、version フィールドが無い、または JSON パースに失敗した場合は
 * undefined を返す (エラーにはしない)
 *
 * @returns 検出できた release 文字列。検出できない場合は undefined
 */
export function detectAppRelease(): string | undefined {
  const packageJsonPath = path.join(process.cwd(), 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    return undefined
  }
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8')
    ) as { name?: string; version?: string }
    if (!packageJson.version) {
      return undefined
    }
    return packageJson.name
      ? `${packageJson.name}@${packageJson.version}`
      : packageJson.version
  } catch {
    return undefined
  }
}
