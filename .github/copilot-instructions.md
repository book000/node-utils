# GitHub Copilot Instructions

`@book000/node-utils` は TypeScript 製のユーティリティライブラリ (npm 公開)。Logger (Winston ラッパー)、ConfigFramework (JSONC 設定管理)、Discord (Bot / Webhook 送信) を提供する。コードレビュー時は以下を基準とする。

## レビュー言語

- レビューコメントは日本語で記載する。日本語と英数字の間には半角スペースを入れる。

## フォーマット / Lint (自動強制済み)

Prettier と ESLint (`@book000/eslint-config`) で強制される規約は CI が検出するため、**Copilot 側で重複指摘しない**:

- セミコロンなし、シングルクォート、インデント 2 スペース、行幅 80、末尾カンマ ES5、改行 LF。

## 重点的に確認する点

- **TypeScript strict**: `skipLibCheck` の有効化や `any` による型回避が入っていないか。
- **命名規則**: クラス / 型は PascalCase、関数・変数は camelCase、グローバル定数は UPPER_SNAKE_CASE。
- **JSDoc**: 追加・変更された関数・インターフェースに日本語 JSDoc があるか。
- **エラーメッセージ**: 英語で記載されているか。既存メッセージ先頭に絵文字がある箇所は統一されているか。
- **環境変数**: 設定値は環境変数で上書き可能な設計になっているか (Logger / ConfigFramework の既存実装と整合するか)。
- **テスト**: 新規・変更機能に対応するテスト (`src/__tests__/*.test.ts`) があるか。外部依存 (Winston, axios, moment-timezone など) がモック化されているか。
- **セキュリティ**: API キー・認証情報のハードコードやログ出力がないか。
- **自動生成物**: `src/index.ts` は ctix の自動生成物。手動編集された変更は指摘する。

## 誤検知しやすい・指摘不要なパターン

- `src/index.ts` の内容 (ctix が生成するため人手で直す対象ではない)。
- `src/examples/**` はライブラリ本体ではなくサンプルコード。本番同等の堅牢性を求めない。
- Prettier / ESLint が自動修正するスタイル差分。
