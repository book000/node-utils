# CLAUDE.md

このファイルは Claude Code がこのリポジトリで作業する際の方針を定義します。

## プロジェクト概要

`@book000/node-utils` は TypeScript 製の個人向けユーティリティライブラリで、npm パッケージとして公開されます。主な機能:

- **Logger** (`src/logger.ts`): Winston ベースのロガーラッパー。日本タイムゾーン対応、日次ローテーション、NDJSON 対応。
- **ConfigFramework** (`src/config.ts`): JSONC 形式の設定ファイル管理フレームワーク。バリデーション・環境変数対応。
- **Discord** (`src/discord.ts`): Discord Bot / Webhook でのメッセージ送信ユーティリティ。埋め込み・ファイル送信・リンクボタン対応。

## 開発コマンド

パッケージマネージャーは **pnpm 必須** (npm / yarn は使わない)。バージョンは `package.json` の `packageManager`、Node.js は `.node-version` を参照。

```bash
pnpm install    # 依存関係のインストール
pnpm build      # ビルド (clean → ctix で index.ts 生成 → tsc コンパイル)
pnpm test       # Jest でテスト (カバレッジ付き)
pnpm lint       # Prettier + ESLint + tsc による検査 (CI と同等)
pnpm fix        # Prettier + ESLint の自動修正
pnpm example    # src/examples/main.ts を実行
```

## アーキテクチャ

- 単一パッケージ (モノレポではない)。`dist/` のみを npm に発行する (`package.json` の `files`)。
- `src/index.ts` は **ctix (`ctix build --mode bundle`) により自動生成される。手動編集禁止**。
- `src/examples/**` はライブラリ本体に含めない。ビルドは `tsconfig.build.json` を使い examples / tests を除外する。
- CI は `book000/templates` の再利用可能ワークフロー (`reusable-nodejs-ci-pnpm.yml`) を利用。Node.js バージョンは `.node-version` に従う。

### 主要ディレクトリ

- `src/`: ソースコード (`logger.ts` / `config.ts` / `discord.ts` / 自動生成の `index.ts`)
- `src/__tests__/`: テスト (`*.test.ts`)
- `src/examples/`: 使用例 (ビルド対象外)

## コーディング規約

- **会話・コメント**: 日本語。関数・インターフェースには日本語の JSDoc を付ける。
- **エラーメッセージ**: 英語。
- **日本語と英数字の間**: 半角スペースを入れる。
- **フォーマット**: Prettier (`.prettierrc.yml`)。セミコロンなし、シングルクォート、インデント 2 スペース、行幅 80。
- **TypeScript**: strict モード。`skipLibCheck` による回避は禁止。パス別名 `@/*` → `src/*`。
- **命名**: クラス / 型は PascalCase、関数・変数は camelCase。
- **設計パターン**: 主要な設定値は環境変数で上書き可能にする (Logger / ConfigFramework を参照)。ジェネリクスで型安全な API を提供する。`any` の多用を避ける。

## テスト

- Jest + ts-jest。テストは `src/__tests__/*.test.ts` に配置。
- カバレッジ対象は `src/**/*.ts` (examples, `index.ts`, `*.d.ts` を除く)。
- 新規機能には対応するテストを追加する。外部依存 (Winston, axios, moment-timezone など) はモック化する。

## ドキュメント更新ルール

- 機能・使用方法の変更時は `README.md` を更新する。
- 関数・インターフェースの変更時は JSDoc を更新する。
- 開発コマンド・ディレクトリ構成・ビルド方式に変更が生じたら、この `CLAUDE.md` も更新する。

## セキュリティ / 機密情報

- API キーや認証情報を Git にコミットしない。環境変数で管理する。
- ログに個人情報や認証情報を出力しない。

## 判断記録のルール

重要な判断を行う際は、判断内容・検討した代替案・不採用の理由・前提/仮定/不確実性を記録する。前提・仮定・不確実性を明示し、仮定を事実として扱わない。

## リポジトリ固有の注意

- `src/index.ts` は ctix による自動生成物。手動編集禁止。
- Renovate による依存自動更新が有効。**Renovate が作成した PR に追加コミット・更新をしない**。
- `prepublishOnly` で発行前に `lint` が、`prepare` で `install` 後に `build` が自動実行される。
- ブランチ命名は [Conventional Branch](https://conventional-branch.github.io) の短縮形 (feat, fix, docs など)。コミットは [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従い、`<description>` は日本語で記載する。
