# GitHub Copilot Instructions

## プロジェクト概要

- 目的: TypeScript による個人向けユーティリティライブラリの開発
- 主な機能:
  - Logger: Winston ベースのロガーラッパークラス (日本のタイムゾーン対応)
  - ConfigFramework: JSONC 形式の設定ファイル管理フレームワーク (バリデーション機能付き)
  - Discord: Discord Bot / Webhook を使用したメッセージ送信ユーティリティ
- 対象ユーザー: 開発者 (npm パッケージとして公開)

## 共通ルール

- 会話は日本語で行う。
- コミットメッセージは [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う。`<description>` は日本語で記載する。
- ブランチ命名は [Conventional Branch](https://conventional-branch.github.io) に従う。`<type>` は短縮形 (feat, fix, docs など) を使用する。
- 日本語と英数字の間には半角スペースを挿入する。

## 技術スタック

- 言語: TypeScript 5.9.3
- ランタイム: Node.js v24.13.0
- パッケージマネージャー: pnpm 10.28.1 (必須)
- ビルドターゲット: ES2020 (CommonJS モジュール形式)
- テストフレームワーク: Jest 30.2.0 + ts-jest 29.4.6
- リント: ESLint 9.39.2 + @book000/eslint-config 1.12.40
- フォーマッター: Prettier 3.8.1

## コーディング規約

### フォーマットルール

- セミコロン: 非使用 (`semi: false`)
- クォート: シングルクォート (`singleQuote: true`)
- インデント: スペース 2 文字
- 行幅: 80 文字
- 末尾カンマ: ES5 互換 (`trailingComma: 'es5'`)
- 改行コード: LF

### TypeScript ルール

- 厳密モード有効 (`strict: true`)
- `skipLibCheck` での回避は禁止
- 未使用変数・パラメータの検出を有効化
- パス別名: `@/*` → `src/*`

### コメント・ドキュメントルール

- 関数・インターフェースには JSDoc コメントを日本語で記載する。
- エラーメッセージは英語で記載する。
- 日本語と英数字の間には半角スペースを挿入する。

### 命名規則

- クラス名: PascalCase
- 関数・変数名: camelCase
- 定数: UPPER_SNAKE_CASE (グローバル定数の場合)
- インターフェース・型: PascalCase

## 開発コマンド

```bash
# 依存関係のインストール (必須: pnpm を使用)
pnpm install

# TypeScript ファイルを実行
pnpm start

# ファイル変更監視モードで実行
pnpm dev

# Examples を実行
pnpm example

# ビルド (ctix 生成 + TypeScript コンパイル)
pnpm build

# クリーン (dist と output ディレクトリを削除)
pnpm clean

# テスト実行 (カバレッジ報告付き)
pnpm test

# リント実行 (Prettier + TypeScript + ESLint)
pnpm lint

# 自動修正 (Prettier + ESLint)
pnpm fix
```

## テスト方針

- テストフレームワーク: Jest + ts-jest
- テストファイル配置: `src/__tests__/*.test.ts`
- テストコマンド: `pnpm test`
- カバレッジ対象: `src/**/*.ts` (examples, index.ts, 型定義ファイルを除く)
- 新規機能追加時は必ず対応するテストを追加する。
- モック化が必要な外部依存: Winston, axios, moment-timezone など

## セキュリティ / 機密情報

- API キーや認証情報を Git にコミットしない。
- 環境変数を使用して機密情報を管理する。
- ログに個人情報や認証情報を出力しない。

## ドキュメント更新

コード変更時に以下のドキュメントを適宜更新する:

- `README.md`: 主な機能や使用方法の変更時
- JSDoc コメント: 関数・インターフェースの変更時

## リポジトリ固有

- ctix により `src/index.ts` が自動生成される。手動編集は禁止。
- `src/examples/**` は Index ファイル生成対象外 (`.ctiignore` で除外)。
- `tsconfig.build.json` で examples と tests を除外してビルドする。
- Renovate による自動依存更新が有効。Renovate が作成した既存の PR に対して追加コミットや更新を行わない。
- 発行前に `npm run lint` が自動実行される (`prepublishOnly` スクリプト)。
- npm install 後に `npm run build` が自動実行される (`prepare` スクリプト)。
