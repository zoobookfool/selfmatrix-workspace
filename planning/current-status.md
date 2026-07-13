# Current Status (2026-07-14)

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

## 2026-07-14 native 通話 UI 修正

- native の通話操作面を、メイン埋め込み/別窓とも Element Call の共通フッターへ統一した。Cinny 側の
  重複通話バーは native だけ非表示にし、WebContentsView より下へメニューが隠れる構造を解消した。
- 共通フッターへ受信音声、画面共有設定、ポップアウト/メインへ戻す、最前面固定、全画面を集約した。
  明示的な popout/popin は同じ WebContentsView を再親子付けし、通話を再接続しない。
- Discord に合わせ、通話参加/終了イベントはタイムラインへ一切表示しない。折りたたみではなく非表示を採用。
- 自動追従するアプリ内 PiP/ミニプレイヤーは作らない。ユーザーが明示的に開始する配信単体ポップアウトは
  別機能として扱う。webの手動ポップアウトは維持し、nativeは`window.open`を拒否するため死んだボタンを
  非表示化。secureなnative host連携は保留を維持する。
- desktop の認証不要 RTC probe で、共通フッター用 bridge の `main -> window -> main`、同一
  WebContents ID、接続維持、明示 popin 後の空窓破棄を確認した。実アカウント2名の画面共有再確認は残る。

## 現在の製品入力

- Cinny: `ffefe11c3ec466d33212e0ad113bb16d9983c033` (`product/discord-style-shell`)
- Element Call: `e662d2868dacffa48270345b3d9fa49e8300edf4` (`product/discord-style-shell`)
- Desktop: `095bbe9` (`main`)。上記2 SHAを`product-lock.json`で固定する。
- Web deploy: selfmatrix `d55ff4a556acb9c69b343692ebc8f2b2f8b6eaa3` (`main`) は、旧Cinny入力の
  `ghcr.io/zoobookfool/selfmatrix-cinny:sha-ec64b63`を現在の既定にする。
- 新Cinny入力のimmutable image `ghcr.io/zoobookfool/selfmatrix-cinny:sha-ffefe11`はCIで生成済み。
  本番既定への昇格は未実施。

## UIと配布の正本

- UI仕様: [ui-design-notes.md](../design/ui-design-notes.md) v1.6。
- 視覚基準: [mocks/ui-mock.html](../design/mocks/ui-mock.html) v2.2。衝突時はUI仕様を優先。
- web/native差分: [feature-matrix.md](feature-matrix.md)。
- native milestone: [native-milestones.md](native-milestones.md)。
- リリース信頼モデル: [release-pipeline.md](../design/release-pipeline.md)。
- 実リリース操作: desktopの`RELEASING.md`。

## 次にやること

1. desktop `main` / `v*`のGitHub保護方針を設定する。ruleset/branch protectionは現在未設定。
2. Cinny `ffefe11`のimmutable imageをselfmatrix本番へdeployし、ブラウザから版表示と通話を確認する。
3. desktop `v0.1.0`初回tag workflowを実走し、実minisign binaryで署名をクロスチェックする。
4. `.minisig`をdraftへ添付してpublishし、旧版からの実自動更新を確認する。
5. 友達1人のnative導入 + 別ユーザーのweb合流でM4受け入れを実測する。

2026-07-14 修正は Cinny typecheck/unit/build、Element Call unit/lint/type/i18n/build、desktop 全 probe を
ローカルで green 確認済み。push 後も Cinny image/tree-shake、Element Call product、desktop Product CIが
すべてgreen。実アカウント2名の画面共有だけ別途確認する。

## 直近の未完了

- native配信タイル単体ポップアウト (web版は実装済み、native host連携待ち)。
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
