# M1 全体再レビュー (Fable、モデルフォールバック混入を疑った再点検)

レビュアー: Claude (Fable 5)。方式: **4 視点並列レビュー (アーキテクチャ整合 / セキュリティ総点検 /
テスト健全性総点検 / 文書照合) + major 以上の敵対的検証**。過去のステップレビュー結論を鵜呑みにせず、
コードと evidence を一次資料として再点検 (作業の一部が能力の低いモデルへのフォールバック中に
行われた疑いがあったため)。同日に GPT の独立全体レビュー
([gpt-review-native-m1-20260708.md](gpt-review-native-m1-20260708.md)) も実施し、相補的だった。
2026-07-08。

## 判定: M1 の技術成立性は維持。ただし完成度主張を 2 点下方修正 + 確定指摘を仕分け対応

案 B (WebContentsView 再親子付け) の技術成立という M1 の結論は揺るがない。しかし増分開発
(step 1→3c-4) を「合成された全体」として見ると、個別ステップレビューが見逃した穴が出た。

## 確定した指摘 (すべて敵対的検証を通過、1 件のみ PARTIALLY)

| # | 重大度 | 内容 | 対応 |
| --- | --- | --- | --- |
| sec-1 | critical | web ビルドにも native 分岐 (`window.selfmatrixNative` 存在チェックのみ) が乗る。グローバルを植えれば通話 embed を乗っ取り room/state/to-device を攻撃者へ渡せる | **M2 MUST** (ビルド時 tree-shake)。[web-native-parallel.md](../planning/web-native-parallel.md) R2 |
| sec-2 | critical | mainWindow (cinny ホスト、bridge 保持) にナビゲーション封じ込めが無い (call view は G7 済み)。トップレベル遷移で bridge 再露出 | **今すぐ prototype 対処** (C3) + M2 監査 |
| test-3 | critical | 7 語彙のうち cinny 実 UI クリックから駆動して検証したのは screenshare のみ。残り 6 は E2E 専用窓口で DOM 層のみ検証、button→RPC の production 配線が未検証 | **E2E 補強** (実クリック経路追加) |
| arch-4 | major | bounds 同期チャンネルが契約に無い。cinny の実レイアウト座標を WebContentsView へ伝える手段が無く、`updateCallViewBounds` はハーネス専用固定式。**実 UI でビデオが正しい位置/サイズに出るかは未検証** | **M2 MUST** (実装 + 検証) |
| test-5 | major | step3c-1 で足した `widget_id_not_allowed` allow-list の拒否パスがゼロカバレッジ | **今すぐ** (C2 でテスト追加) |
| docs-6 | major | 「正本」設計文書 + current-status/backlog 等が step 3a 以降未更新、実態とズレ | **今すぐ** (本コミットで一括更新) |
| test (PARTIAL) | major | `contentLoadedAcked` が算出されるだけで smoke の pass 判定に未使用 (F1 spoofRejected と同型) | **今すぐ** (C4 で pass に組込) |
| arch-minor | minor | shell が `getStatus/ensureCallView/detachCallView/attachCallView` を claim-once の外で常時公開 | M2 監査 (契約整理) |

## GPT レビューとの相補 (GPT が独占検出、2 件とも本物・裏取り済み)

- **GPT P1b [本物のバグ]**: `createCallViewIfNeeded()` の `registerPreloadScript` が session パーティション
  単位で累積するのに `closeCallView()` が解除しない → 2 通話目で `call-control-preload.cjs` 二重注入、
  1 RPC に複数リスナー (screenshare が「開始→即停止」等)。**今すぐ** (C1、1 回登録に修正)
- **GPT P1a**: `validateCallViewUrl` が widgetId/parentUrl を必須にしていない (欠落で fail-open →
  `|| WIDGET_ID` フォールバック)。**今すぐ** (C2、必須化 + フォールバック削除)
- GPT P2 (CallControl の `subtree:false` 監視が React 深い再マウントを取りこぼす) → **M2 SHOULD**
- GPT P1c (正本文書の追従漏れ) → docs-6 と同一、本コミットで対応
- GPT「次にやるなら #3」(shell sandbox:false / 常時公開 API / 更新署名) → sec-2 / arch-minor と一致、M2 監査

## 仕分け

- **今すぐ修正 (コミット)**: C1 (preload 重複) / C2 (URL 必須化 + テスト、test-5 込み) / C3 (mainWindow
  ナビ封じ込め、sec-2) / C4 (contentLoadedAcked) / docs-6 (本文書と併せ一括) / test-3 (E2E 実クリック補強)
- **M2 の必須項目に格上げ** ([native-milestones.md](../planning/native-milestones.md) M2 に記録済み):
  sec-1 (web tree-shake) / arch-4 (bounds 同期) / sec-2 監査 / arch-minor / GPT P2
- **運用ルール確定**: web/native 併走の正本 [web-native-parallel.md](../planning/web-native-parallel.md) を制定

## 教訓

個別ステップのレビュー + 変異ゲートは各ステップ内では機能したが、「増分同士の合成」「web ビルドとの
併存」「実 UI との接続」という**ステップをまたぐ視点**は個別レビューの死角だった。マイルストーン
完了時の全体再レビュー (今回のような多視点 + 敵対的検証) を M2 以降も締めに入れる。
