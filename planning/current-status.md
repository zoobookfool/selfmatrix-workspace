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

## 2026-07-14 カメラ opt-in

- カメラを「非対応」から**既定 OFF の opt-in 機能**へ改訂した。`設定 > 全般 > 通話` で機能を ON にした
  場合だけ参加前/通話中の操作とビデオ設定を表示する。設定 ON だけでは送信せず、各通話で明示 ON が必要。
- 起動時に古い `video: true` を OFF へ正規化し、参加前の ON 選択もその参加だけで破棄する。通話中は
  feature 設定を変更不可にして、widget URL の video capability を通話中に変えない。
- 機能 OFF 時は `hideVideoButton` と `disableVideo` を同時に有効化し、web iframe の `allow` からも
  `camera` を外す。Element Call の音声設定/音声デバイスメニューは camera label を取得せず、ビデオ設定を
  明示的に開いた時だけカメラ権限を要求する。
- web/native 共通実装。物理カメラを使った権限・publish の実機受け入れは backlog P1 に残す。

## 現在の製品入力

- Cinny: `41970348be2e8e8694ddd30f624ce97089be6dc3` (`product/discord-style-shell`)
- Element Call: `3dd4d2915f74a0f23ff6f096468f84a4443ffc96` (`product/discord-style-shell`)
- Desktop: `d30b36a` (`main`)。上記2 SHAを`product-lock.json`で固定する。
- Web deploy: selfmatrix `0c7eb67b33ff1a68794afdfefa73bc42cae30d0d` (`main`) と実働テスト環境は、
  `ghcr.io/zoobookfool/selfmatrix-cinny:sha-4197034`を現在の既定にする。2026-07-14に反映済み。
- Webの稼働先は一般公開の本番環境ではなく、運用者が実動作を確認する実働テスト環境として扱う。
  製品ブランチの自動ゲートがgreenで、反映対象のimmutable SHAを確認できた変更は承認待ちにせず即時反映する。

## UIと配布の正本

- UI仕様: [ui-design-notes.md](../design/ui-design-notes.md) v1.7。
- 視覚基準: [mocks/ui-mock.html](../design/mocks/ui-mock.html) v2.2。衝突時はUI仕様を優先。
- web/native差分: [feature-matrix.md](feature-matrix.md)。
- native milestone: [native-milestones.md](native-milestones.md)。
- リリース信頼モデル: [release-pipeline.md](../design/release-pipeline.md)。
- 実リリース操作: desktopの`RELEASING.md`。

## 次にやること

1. desktop `main` / `v*`のGitHub保護方針を設定する。ruleset/branch protectionは現在未設定。
2. 実働テスト環境でweb版の物理カメラ受け入れを行い、既定OFF、明示ON時だけの権限要求/publish、
   次回参加時のOFF復帰を確認する。
3. desktop `v0.1.0`初回tag workflowを実走し、実minisign binaryで署名をクロスチェックする。
4. `.minisig`をdraftへ添付してpublishし、旧版からの実自動更新を確認する。
5. 友達1人のnative導入 + 別ユーザーのweb合流でM4受け入れを実測する。

2026-07-14 カメラ修正は Cinny typecheck/unit/web+native build、Element Call unit/lint/type/i18n/embedded build、
desktop 全 probe をローカルで green 確認済み。push 後は Cinny image/tree-shake と Element Call product CIが
green。desktop Product CI も最終 product lock で green。webは `sha-4197034` を実働テスト環境へ反映し、
公開入口、Element Call、日本語locale、メインJSのHTTP 200とカメラ制御マーカーを確認済み。実アカウント2名の
画面共有と物理カメラの安全契約は別途確認する。

## 直近の未完了

- native配信タイル単体ポップアウト (web版は実装済み、native host連携待ち)。
- カメラ opt-in の物理デバイス実機受け入れ (既定OFF、権限要求、明示publish、状態持ち越しなし)。
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
