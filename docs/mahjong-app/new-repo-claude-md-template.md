# 新リポジトリ CLAUDE.md テンプレート
# （このファイルの内容を新リポジトリの CLAUDE.md にコピーして使う）

---

# AI解説コーチ麻雀アプリ 開発リポジトリ

## プロダクト概要
手牌14枚を入力するとAIが「なぜこの牌を切るか」を根拠付きで解説するWebアプリ。
ターゲット: 麻雀中級者（雀歴1〜3年、段位戦で伸び悩んでいる層）
副業目標: 月額980円 × 課金者73人 = 月5万円

**仕様の単一の真実の源**: `docs/product-spec.md`

---

## 技術スタック
- フロントエンド: Next.js 14（App Router）+ shadcn/ui / Vercel
- バックエンド: FastAPI (Python 3.12) / AWS Lambda + API Gateway (SAM)
- AI: Anthropic Claude API（claude-3-5-sonnet）
- 課金: Stripe
- DB: Phase1なし / Phase2以降 DynamoDB

---

## 開発フロー（TDD）
1. `docs/product-spec.md` の受け入れ基準を確認
2. 受け入れ基準に対応する失敗するテストを先に書く
3. 最小実装 → リファクタ → QAレビュー

## ディレクトリ構成（推奨）
```
/
├── frontend/          # Next.js アプリ
│   ├── app/
│   ├── components/
│   └── ...
├── backend/           # FastAPI アプリ
│   ├── main.py
│   ├── routers/
│   ├── services/
│   │   └── claude_service.py
│   └── tests/
├── infra/             # AWS SAM テンプレート
│   └── template.yaml
└── docs/
    └── product-spec.md  # プロダクト仕様書（仕様の真実の源）
```

---

## 現在のフェーズ
Week 1: コア実装（手牌入力 → Claude API → 解説表示）
詳細スケジュール: `docs/product-spec.md` Section 7 参照

---

## 重要な行動原則
- 対局エンジンは絶対に作らない（スコープ外）
- AI解説の質が最重要。プロンプト品質に最も時間を投資する
- Phase1はユーザー認証・DBなし・シンプルに
- 撤退基準（`docs/product-spec.md` Section 8）を常に意識する
