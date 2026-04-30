# 開発サイクル × CI/CD 設計リファレンス

本リポジトリの開発ライフサイクル（コード作成 → テスト → バグ修正 → デプロイ）における
**「どのチェックをローカルで実行し、どれを GitHub Actions に任せるか」** の設計思想をまとめたもの。
CoS・開発部門エージェント（PM/Backend/QA/Infra）・人間の開発者のいずれもが、迷ったときにこのファイルを参照する。

---

## 設計原則

> **速いフィードバックは著者の手元で、安全ゲートは共有状態の境界で。**

- **仕様が先、テストが次、実装は最後**
- **速い & 決定論的 → ローカル（Claude Code hooks / skills）**
- **外部依存あり & 遅い → GitHub Actions CI**
- **共有状態を変える（main ブランチ・本番 Azure） → CI gate 必須**
- **失敗時の自動修復 → CI（auto-fix job）のみ。ローカルは手動発火**

ローカルと CI は排他ではなく **補完関係**。同じテストを 3 段（編集時 / pre-push / CI）で全量走らせるのは無駄。
各層は守備範囲を絞り、前段の取りこぼしを次段で拾う設計にする。

---

## L0 + 5 Layer + QA Gate 開発サイクル

| # | 実行場所 | トリガー | チェック内容 | 目標時間 | 外部依存 |
|---|---|---|---|---|---|
| **L0** | PM / CoS の計画フェーズ | 実装着手前 | プロジェクト仕様ファイルの確認、feature slice の切り出し、**受け入れ基準 / 非ゴール / 既知リスク / 先に書くテスト** の確定 | **< 15分** | なし |
| **L1** | Claude PostToolUse hook | `Edit/Write` on `**/*.py` | 編集ファイルの `ruff check` + **関連 unit test のみ** | **< 3秒** | なし |
| **L2** | Claude Stop hook | Claude 応答終了直前 | `ruff check src tests` + `pytest tests/unit -q` 全量 | **< 30秒** | なし |
| **L2.5** | Agent Teams QA review | 実装完了直後 | 変更ファイル、受け入れ基準、チェック結果、既知リスクをもとに **QA がテスト漏れ・受け入れ基準逸脱・リスク見落としをレビュー** | **< 5分** | なし |
| **L3** | `/precheck` skill | 手動 or `/commit` 前 | L2 + `pytest tests/integration` + coverage サマリ | **< 2分** | **Docker**（Cosmos Emulator/Azurite） |
| **L4** | `.githooks/pre-push` | `git push` | unit + integration | 1-3分 | Docker |
| **L5** | GitHub Actions `ci.yml` | PR / push main | lint + unit（**並列**）→ integration → e2e → 各種 guard → 失敗時 `auto-fix` | 5-15分 | Emulator (CI services) |
| **Deploy** | `deploy.yml` | merge to main | Bicep 差分 → zip+remote build → smoke → listener check → rollback | 3-5分 | Azure |

### 層ごとの守備範囲

- **L0（仕様ゲート）は「書き始める前の品質担保」**
  実装はプロジェクト固有の仕様ファイルから始める。feature slice を小さく切り、`Given / When / Then` などの形で受け入れ基準を確定してからテストを書く。
  仕様が曖昧なまま実装に入らないことが、AI エージェント時代の最初の品質ゲートになる。

- **L1（PostToolUse hook）は「狭く速く」**
  影響範囲を予測せず、編集ファイルに直接対応する test のみ実行。全量は L2 で取る。
  `.md` / `.yml` など非 Python ファイル編集時は no-op で即終了する。

- **L2（Stop hook）が最重要の新規要素**
  Claude が「完了しました」と言う直前に必ず `ruff + pytest tests/unit` を通す。
  これが **エージェントの実装完了宣言 = 最低限の green 保証** の担保となる。
  blocking で動作し、失敗時は Claude が再修正を迫られる。

- **L2.5（自動 QA レビュー）は「完了報告前の品質ゲート」**
  Backend / Infra の実装が終わったら、CoS / PM が QA に自動でバトンを渡す。
  QA は changed files、受け入れ基準、実行済みチェック結果、既知リスク、未解決事項をもとにレビューし、問題があれば差し戻す。
  blocking 指摘が 1 件でも残る限り完了報告せず、修正 -> 再 QA は最大 3 回までとする。
  **受け入れ基準に紐づかないテスト成功** は完了条件にならず、観点漏れがあれば差し戻す。

- **L3（/precheck skill）は「CI 予行演習」**
  Docker Cosmos Emulator / Azurite 前提で integration まで走らせる。
  Emulator 未起動時は親切にエラーメッセージで誘導。
  push 前に L5 の失敗リスクを最小化する。

- **L4（.githooks/pre-push）は最後のローカル砦**
  既存実装を維持。`/precheck` を通した前提でも push 前に再確認する保険。

- **L5（GitHub Actions）は共有ブランチ保護の本丸**
  環境再現性（Cosmos Emulator/Azurite services）、e2e、tamper guard、schema guard、auto-fix ループを担う。

- **auto-fix 自動ループは CI のみ**
  ローカルでは `test-fix-loop` skill を **手動発火のみ** とする（無限リトライ回避）。

---

## ファイル別の責務マップ

### Claude Code 側

| ファイル | 責務 | 関連レイヤ |
|---|---|---|
| `AGENTS.md` | 自動 QA レビューを含む共通運用契約 | L2.5 |
| `CLAUDE.md` | Claude Code 側の自動 QA レビュー指示 | L2.5 |
| `.github/copilot-instructions.md` | Copilot CLI 側の自動 QA レビュー指示 | L2.5 |
| `.github/instructions/automatic-qa-review.instructions.md` | 実装系変更で QA レビューを必須化 | L2.5 |
| `.claude/settings.json` PostToolUse | 編集ファイル限定の lint + 関連 unit test | L1 |
| `.claude/settings.json` Stop | 応答終了前の全 unit blocking 実行 | L2 |
| `.claude/skills/precheck.md` | CI 等価ローカル検証（integration 含む） | L3 |
| `.claude/skills/test-fix-loop.md` | 失敗時 3 回までの自動修復 | L5 auto-fix から呼ばれる |
| `.claude/commands/test.md` | `/test [unit\|integration\|e2e\|all]` | L3 補助 |
| `.claude/commands/coverage.md` | カバレッジレポート生成 | L3 補助 |
| `.claude/commands/deploy.md` | `deploy.yml` 主導の正式フロー案内 | Deploy |
| `.claude/commands/add-signal.md` | シグナルモジュール雛形生成 | 実装補助 |

### Git / GitHub 側

| ファイル | 責務 | 関連レイヤ |
|---|---|---|
| `.githooks/pre-push` | push 前の unit + integration | L4 |
| `.github/workflows/ci.yml` | lint + unit（並列）→ integration → e2e → guard → auto-fix | L5 |
| `.github/workflows/deploy.yml` | Bicep → zip+remote build → smoke → listener → rollback | Deploy |
| `scripts/check_test_tampering.py` | assert 削除・skip 追加・mock 書き換えの検知 | L5 guard |
| `scripts/check_cosmos_schema.py` | Cosmos DB の破壊的スキーマ変更検知 | L5 guard |
| `scripts/check_listeners.py` | タイマー関数リスナーの有効性確認 | Deploy smoke |
| `scripts/test-loop.sh` | watchexec 派のための最小ローカルループ | L1/L2 補助 |

---

## ローカル vs CI の意思決定フレームワーク

「このチェックをどこで走らせるべきか」で迷ったら以下の表を参照する：

| テスト種別 | Claude hook | /precheck skill | CI | 本番 Deploy 時 |
|---|---|---|---|---|
| ruff format | L1 on save | L3 full | L5 required | — |
| ruff check | L1 file 単位 | L3 full | L5 required | — |
| unit（pure） | L1 関連のみ / L2 全量 | L3 full | L5 required | — |
| integration（Emulator） | ❌ | L3（Docker 前提） | L5 required | — |
| e2e（外部 API） | ❌ | ❌（flaky） | L5 required | — |
| test tampering guard | ❌ | ❌ | L5 PR only | — |
| cosmos schema guard | ❌ | ❌ | L5 PR only | — |
| smoke test | ❌ | ❌ | ❌ | Deploy |
| listener check | ❌ | ❌ | ❌ | Deploy |

---

## 既存資産の扱い方

### そのまま維持するもの

- `deploy.yml` の Bicep → zip → smoke → rollback 一式（完成度が高い）
- `test-tampering-guard` / `cosmos-schema-guard`（ガード価値が高い）
- `.githooks/pre-push`（L4 の最後の砦）
- `check_cosmos_schema.py` / `check_listeners.py`
- `/coverage` `/add-signal`

### 改善余地があるもの

- **`.claude/settings.json` PostToolUse**
  修正方針：
  - 絶対パスを削除し `git rev-parse --show-toplevel` で動的取得
  - matcher は `Edit|Write` のまま、コマンド側で `.py` 以外をスキップ
  - `$CLAUDE_FILE_PATHS` で編集ファイル特定 → `tests/unit/test_<basename>.py` が存在すればそれのみ実行
  - POSIX 互換スクリプトで Windows Git Bash / Linux / macOS 全対応

- **`.claude/settings.json` Stop hook が未設定**
  `ruff check src tests && python -m pytest tests/unit -q --tb=line -x` を blocking 追加すべき。

- **`.github/workflows/ci.yml` が直列**
  `lint → unit → integration → e2e` の `needs:` 依存。
  lint と unit は並列化可能。unit は `pytest-xdist` で `-n auto` 並列化可能。

- **`auto-fix` job の可視性不足**
  `claude-code-action@v1` 呼び出し時の prompt を拡張し、「何を試したか」「判定結果」「修正差分サマリ」を **PR コメントに必ず投稿** するよう指示する。既存の `auto-fix-attempt-N` ラベル機構（最大3回）は維持し、3回失敗時は `human-review` ラベル + Discord 通知（CoS 停止基準 H-05 と整合）。

- **`/test` `/deploy` コマンドが古い**
  - `/test` は unit 限定 → `/test [unit|integration|e2e|all]` へ拡張
  - `/deploy` は `func azure functionapp publish` 案内 → `deploy.yml` 主導の正式フローに統一、緊急時ローカルデプロイは「参考・非推奨」として末尾に残す

- **`scripts/test-loop.sh`**
  `/precheck` skill と役割が重複するため、watchexec 派のために最小化（ruff + unit のみ）する。integration まで含めた検証は `/precheck` に一本化。

---

## よくある質問（FAQ）

### Q1. ローカルで Cosmos Emulator / Azurite を動かすのが面倒。省略できる？
A. `/precheck`（L3）以降は Docker 前提。Emulator 無しで開発する場合は L1/L2 の unit テストまでを手元で回し、integration/e2e は CI（L5）に任せる。ただし push 前に L5 失敗のリスクが上がるので `/precheck` 推奨。

### Q2. hook で毎回テストが走ると遅いのでは？
A. L1 は「編集ファイルの関連 unit test のみ」に限定する設計。全量は L2（Stop hook）で Claude 応答終了直前に 1 回だけ取る。3〜30 秒のフィードバックループを保証する。

### Q3. CI 失敗時の auto-fix は信頼できる？
A. `test-fix-loop` skill に「assert 削除 / skip 追加 / mock 書き換え禁止」のルールがあり、`check_test_tampering.py` で機械検知される。3 回失敗で人間エスカレーション（H-05 停止基準）。

### Q4. エージェント（Backend/QA）はどの層を意識すべき？
A. Backend/QA エージェントは L1（編集中の速いフィードバック）、L2（完了宣言時の green 保証）、L2.5（自動 QA レビューゲート）を意識する。CI（L5）は CoS または PM エージェントが発火・監視する。

### Q5. 本番デプロイの承認フローは？
A. `main` への merge が `deploy.yml` を自動発火する。本番 Azure リソースの変更は CLAUDE.md 禁止事項に該当するため **社長の明示的な承認が必要**。エージェント単独でのデプロイは不可。

---

## 実装フェーズに進む際の順序

本リファレンスを元に改善を実施する場合の推奨順序（各ステップは独立しているため別 PR に分けてレビュー可能）：

1. `.claude/settings.json` の PostToolUse 修正 + Stop hook 追加（**最小破壊的、最大インパクト**）
2. `.claude/skills/precheck.md` 新設
3. `.claude/commands/test.md` / `deploy.md` 更新
4. `.github/workflows/ci.yml` 並列化 + auto-fix 強化
5. `scripts/test-loop.sh` 整理

### 受け入れ基準

1. **L1 hook**:
   - `src/monitoring/signals/sell01.py` を軽微編集 → `tests/unit/test_sell01.py` のみ実行される
   - `README.md` を編集 → フックが no-op で即終了
   - Windows Git Bash / Linux / macOS それぞれで動作確認
2. **L2 Stop hook**:
   - 意図的に `assert False` を追加して応答終了 → Stop hook が Claude を止める
3. **`/precheck` skill**:
   - Docker 未起動 → 親切なエラーメッセージで誘導
   - Docker 起動後 → integration まで緑で完走し coverage 表示
4. **CI 並列化**:
   - PR を立てて Actions UI で `lint` と `unit` が並列に走ることを確認
   - `pytest-xdist` で wall-clock time 短縮を測定
5. **auto-fix 強化**:
   - わざと失敗を入れた PR で `auto-fix-attempt-1` ラベル + PR コメント投稿を確認
   - 3 回失敗で `human-review` ラベル + Discord 通知を確認

---

## 関連ドキュメント

- `CLAUDE.md` — CoS オーケストレーター定義、H-05 停止基準
- `.claude/rules/agent-communication.md` — エージェント間連携規約
- `.claude/rules/context-management.md` — トークン節約ルール
- `.claude/knowledge/claude-code-agent-teams-best-practices.md` — Agent Teams ベストプラクティス
- `.claude/skills/test-fix-loop.md` — 失敗時の自動修復スキル
