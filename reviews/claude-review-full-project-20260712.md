# Claude 全体レビュー (2026-07-12) — GPT 修正パスの独立検証

**対象**: [gpt-review-full-project-20260712.md](gpt-review-full-project-20260712.md) の「対応結果 (2026-07-12)」で GPT が対応済みと主張した修正一式。
cinny `9ea79b8b..ec64b637` / desktop `5fc3909..75c5f23` / element-call `db6693f7..e31f335f` /
workspace `1c17184..9bf8426` / 親 selfmatrix の compose 固定 (`d55ff4a5`)。

**手法**: 5 領域 (desktop / cinny / element-call / updater 敵対的 / 文書整合) の独立レビューを並列実行し、
各領域でゲート (テスト・ビルド・監査・ガード) を実測。P0〜P2 判定の指摘はすべて別エージェントによる
敵対的反証を通してから採用した。レビューは読み取り専用で行い、作業ツリーを汚していないことを確認済み。

## 結論

GPT の修正は**実体を伴っている**。特に P0 (実 NSIS 経路で minisign 検証が呼ばれない) の修正は、
packaged 済みの実 `SelfMatrix.exe` + 実 HTTP サーバー + 実 Ed25519 鍵での 3 ケース再実行
(正常=update-downloaded / 欠落=ERR_UPDATER_INVALID_SIGNATURE / 改ざん=拒否) で裏を取った。
product-lock.json の SHA 固定・Actions の SHA ピン・mutable `latest` 廃止・audit 0・各 CI green も
すべて実測で確認。反証を通過した実指摘は下記 3 件 + P3 数件のみで、**リリースを止めるのは
① (ダウングレード) だけ**だった (→ 同日中に対応、下記「対応」参照)。

## 実測ゲート (要点)

- desktop: `npm test` 全 17 スクリプト exit 0 (m3-window / external-mute / external-api / tray /
  single-instance / window-bounds の各 probe green)。packaged updater 3 ケース再実行 PASS。
  product-lock.json の 2 SHA が GitHub 実在 + cinny 側 element-call-ref と一致。Actions 4 種の
  SHA ピンがタグと一致。
- cinny: typecheck / check:eslint (0 errors, 139 warnings) / `npm audit --omit=dev` 0 件 /
  web ガード OK / native ガード (--expect-fail、15 種検知) OK。cryptE2ERoomKeys.js の +2 行と
  NativeCallControl.ts の 4 行変更は無害と確認 (外部ミュート A と非干渉)。FORBIDDEN リスト無傷。
- element-call: install / test:unit / i18n:check / lint (tsc+eslint+knip) / build:embedded /
  audit --prod すべて exit 0。speakerOverlayAlignment の未使用 export 削除は参照残りなし。
- 文書整合: 全参照 SHA 実在。2026-07-12 に Claude が記録した内容 (feature-matrix 昇格 2 行、
  external-mute-control §8+実装記録、m3-window-ux 格下げ注記、native-milestones M4 追記) は
  GPT 編集後も非破壊。公開文書への秘匿情報混入なし。
- CI: 全リポジトリの最新コミットで green (cinny 途中コミット 08958070 と desktop b078e92 の
  fail は後続コミットで修復済み)。

## 反証を通過した指摘と対応

### ① [P1 → 対応済み] 自動更新がダウングレード攻撃を防げない

minisign 署名は installer のバイト列にのみ束縛され、latest.yml の宣言バージョンに束縛されない。
GitHub アカウント完全侵害時、過去の正規署名済み installer + その正規 `.minisig` を高いバージョン
番号の latest.yml で配るだけで、署名検証を通過したままサイレントダウングレードを強制できる
(`allowDowngrade=false` は latest.yml の自己申告比較なので無力)。「GitHub 乗っ取り時も防ぐ」という
信頼モデル (release-pipeline.md) の穴。

**対応 (2026-07-12、desktop)**: trusted comment (グローバル署名で改ざん検出される領域) に
`selfmatrix-desktop <version> <installer名>` を埋め、検証側で updateInfo.version / ファイル名との
一致を fail-closed で強制。詳細・コミット SHA は本文書末尾の「①の実装結果」を参照。

### ② [P2 → 文書化で対応] ダウンロード後〜quitAndInstall 間の TOCTOU

検証はダウンロード完了時の 1 回のみで、`quitAndInstall()` はキャッシュ内 installer を再検証せず
起動する。反証の結論: electron-updater の構造上、実行時再検証は事実上組み込めず、ローカル書き込み
権限を持つ攻撃者はより深刻な手段を他に持つため、実害は informational 寄り。**未修正の脆弱性では
なく設計上の既知制約として文書化**が妥当 → release-pipeline.md に明記済み (本対応)。

### ③ [P2 → 訂正済み] GPT 自己レビューの検証数値の誤り

GPT レビュー文書の検証表は「Cinny check:eslint PASS (既存 warning 3 件)」と記すが、`eslint src/*`
→ `eslint src` への変更で lint 実効範囲が広がり、HEAD での実測は **139 warnings (0 errors)**
(no-explicit-any 72 / no-non-null-assertion 37 / no-console 28 / no-constant-condition 2)。ゲートは
0 errors で green のため実害なしだが、将来のベースライン比較を誤らせるため原文書に訂正注記を追加。

## P3 (軽微) と処置

| 指摘 | 処置 |
| --- | --- |
| .eslintrc.cjs のコメントが旧 `eslint src/*` 前提のまま | 修正済み (cinny 34d46f15) |
| cinny engines.node >=16 が vite 7.3.6 の実要求 (^20.19.0 \|\| >=22.12.0) より過小 | 修正済み (cinny 34d46f15) |
| EC product CI の Lint が prettier / i18n を含まない (反証で P3 相当に格下げ — lint.yaml が PR で並行実行されるため) | i18n:check を追加 (EC 198a8bc0)。prettier:check は formatter バージョン乖離で fork 全体 428 ファイル fail するため意図的に見送り (全面リフォーマットは v0.20.1 ベース固定の upstream merge を汚染)。workflow コメントに理由を明記 |
| EC の localStorage migration ヘルパが Setting の内部キー規約をハードコードし、旧キーを消さない | 実害なし・見送り (upstream 追従時に自然解消し得る)。要対応になったら backlog へ |
| EC コミットメッセージ「Fix speaker overlay migration」は実際には migration の新設 | 履歴のため修正不能。記録のみ |
| dev 依存の npm audit 17 件 (critical 1 含む) | 本番出荷物 (dist) に含まれない dev ツール群のため据え置き。backlog P2 の定期棚卸しの対象 |

## ①の実装結果 (2026-07-12、desktop c51fafc)

trusted comment によるバージョン束縛を実装 (minisign のグローバル署名 = Ed25519 over
(署名||trusted comment) が改ざん検出を担保する領域を利用):

- `src/update-trusted-comment.cjs` (新規): 正規フォーマット
  `selfmatrix-desktop <version> <installer名>` のパーサ/フォーマッタ (検証側とテスト署名側で共有)。
- `src/minisign-verify.cjs`: 検証済み trusted comment を結果に露出 (検証ロジックは不変)。
- `src/update-signature-verify.cjs`: `{expectedVersion, expectedFileName}` との一致を fail-closed で
  強制 — パース不能 (旧式署名)・version 不一致・filename 不一致・**期待値の渡し忘れ**もすべて拒否。
- `src/minisign-nsis-updater.cjs`: `doDownloadUpdate` で updateInfo.version と installer 名を検証へ配線。
- `RELEASING.md` / [release-pipeline.md](../design/release-pipeline.md) §4/§5: 署名手順を
  `-t "selfmatrix-desktop X.Y.Z <installer名>"` 必須へ更新。

**受け入れ**: unit probe 14 ケース (downgrade/filename/旧式/期待値欠落の拒否 6 ケース追加) PASS。
packaged probe を 4 ケース (正常/欠落/改ざん/**ダウングレード**) に拡張し、実 `SelfMatrix.exe` で
全 PASS — downgrade は「installer trusted comment declares version '1.0.0' but update metadata
declares '9.9.4' (possible downgrade attack)」で `ERR_UPDATER_INVALID_SIGNATURE`。変異ゲート
(version 比較の無効化) で unit / packaged の両 probe が FAIL することを実証 → 復元 → 再 PASS。
`npm test` 全 19 probe exit 0。レビュアー (Claude 本体) が unit probe と packaged 4 ケース probe を
独立再実行して PASS を確認済み。

**運用上の注意**: 初回リリースの署名時に `-t` を忘れると正規リリースでも自動更新が拒否される
(fail-closed の仕様どおり)。RELEASING.md の手順に従うこと。

## 同日対応した軽微修正のコミット

- cinny 34d46f15: .eslintrc.cjs コメント現行化 + engines.node 実態化 (CI green)
- element-call 198a8bc0: product CI に i18n:check 追加 (prettier は理由付き見送り、CI green)
- workspace (本コミット): release-pipeline §4 バージョン束縛 + 既知制約 (TOCTOU) 明文化、
  GPT レビュー文書の検証数値への訂正注記、本レビュー記録
