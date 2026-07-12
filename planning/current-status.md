# Current Status (2026-07-12)

**状態: 現在地の正本。** 未完了は[backlog.md](backlog.md)、長い履歴は[roadmap.md](roadmap.md)を正とする。

## 最新

- **M1 完了**: 実Matrix/LiveKitで2ユーザー通話、配信、system audio、無再接続の窓移動、localStorage契約をE2E確認。
- **M2 実装完了**: Windows desktop、homeserver選択、自前画面共有ピッカー、トレイ、自動起動、通知、
  NSIS packaging、minisign更新、Product CI、release draft workflowを実装。
- **M3 完了**: 生きた`WebContentsView`を再親子付けする通話全体ポップアウト。10往復切断ゼロ、
  別窓close=メイン復帰、位置/サイズ記憶、最前面固定を検証済み。
- **M4 実装側の準備完了**: Cinny product統合、web/native build guard、外部ミュートA+B、友達向けガイド、
  feature matrix、web/native同期ルールを整備。受け入れは初回公開とドッグフーディング待ち。

## 2026-07-12 全体レビュー対応

- desktopはstock updaterのhook代入を廃止し、sidecar `.minisig`を必ず取得する
  `MinisignNsisUpdater`へ変更。生成済みunpacked製品から実download taskを駆動し、正常だけ受理、
  署名欠落/改ざんは`ERR_UPDATER_INVALID_SIGNATURE`で拒否することを確認した。
- desktopにsingle-instance lockと実2プロセスprobeを追加。2個目はwindow/tray/APIを作らず、既存画面を前面化する。
- 通話窓の保存boundsを現行display work areaへclampし、モニター着脱/DPI変更後の画面外復元を防止した。
- desktopの`product-lock.json`でCinny/Element Callを完全SHA固定。tag-version一致、EC lock一致、実checkout一致をCIで強制。
- desktop push/PR CIとrelease gate、Element Call product CIを追加。Actionsはcommit SHA固定。
- Cinnyのproduction auditを18件から0件へ解消。Aboutは`Client`/`Desktop`版と同梱commitを区別する。
- web imageは自動`latest`を廃止し、pushはimmutable SHA tagのみ。`stable`/versionへの昇格は手動操作に限定。

## 現在の製品入力

- Cinny: `ec64b637438dd79bc96f0c0c4dae95aeee8cdc9f` (`product/discord-style-shell`)
- Element Call: `e31f335f93a16b20fa1767ee8605c3eec2e2e398` (`product/discord-style-shell`)
- Desktop: `75c5f23e3c6150e9d3912978299fb792b59a82f1` (`main`)。上記2 SHAを`product-lock.json`で固定する。
- Web deploy: selfmatrix `d55ff4a556acb9c69b343692ebc8f2b2f8b6eaa3` (`main`) が、同じCinny commitから
  生成された`ghcr.io/zoobookfool/selfmatrix-cinny:sha-ec64b63`を既定にする。

## UIと配布の正本

- UI仕様: [ui-design-notes.md](../design/ui-design-notes.md) v1.5。
- 視覚基準: [mocks/ui-mock.html](../design/mocks/ui-mock.html) v2.2。衝突時はUI仕様を優先。
- web/native差分: [feature-matrix.md](feature-matrix.md)。
- native milestone: [native-milestones.md](native-milestones.md)。
- リリース信頼モデル: [release-pipeline.md](../design/release-pipeline.md)。
- 実リリース操作: desktopの`RELEASING.md`。

## 次にやること

1. desktop `main` / `v*`のGitHub保護方針を設定する。ruleset/branch protectionは現在未設定。
2. selfmatrix本番へ`sha-ec64b63`をpull/deployし、ブラウザから版表示と通話を確認する。
3. desktop `v0.1.0`初回tag workflowを実走し、実minisign binaryで署名をクロスチェックする。
4. `.minisig`をdraftへ添付してpublishし、旧版からの実自動更新を確認する。
5. 友達1人のnative導入 + 別ユーザーのweb合流でM4受け入れを実測する。

Element Call product CI、Cinny tree-shake/image CI、selfmatrix CI、desktop Product CIは上記入力で
すべてgreen確認済み。

## 直近の未完了

- 話者オーバーレイ右クリックからのユーザー単位音量調整。
- 配信タイル単体ポップアウト。
- SFU切断時の自動再参加。
- 4K60 x 3本 + 10人相当の負荷・品質検証。
- RNNoise既定ONの聴感評価。
- 外部ミュートA+Bの実通話目視確認。公式Stream Deck pluginは需要確認後。
- アプリ単位音声キャプチャ、ユーザーカスタム機構。

## 読み順

1. [README.md](../README.md)
2. [requirements.md](requirements.md)
3. この文書
4. [backlog.md](backlog.md)
5. [native-milestones.md](native-milestones.md)
6. [ui-design-notes.md](../design/ui-design-notes.md)
7. [reviews/README.md](../reviews/README.md)
