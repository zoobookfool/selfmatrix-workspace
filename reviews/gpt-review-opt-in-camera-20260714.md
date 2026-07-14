# GPT Review: カメラ opt-in (2026-07-14)

## 対象

- Cinny `62e8e1d` (設定・通話状態・widget capability) と追補 `41970348` (iframe Permissions Policy)
- Element Call `3dd4d29` (video設定の無効化、audio/videoデバイス権限要求の分離)
- Desktop `d30b36a` (上記 Cinny/EC の完全SHA lock)

## 合意した安全契約

1. カメラ機能は新規・既存ユーザーとも既定 OFF。
2. 設定 ON は操作を表示するだけで、capture/publish の同意にはしない。
3. 参加前または通話中にカメラボタンを明示 ON にした通話だけ送信する。
4. 保存済み `video: true` は起動時に OFF へ正規化し、参加前の ON 選択も参加後に破棄する。
5. 機能 OFF 時は Cinny/EC のカメラ UI、EC video capability、ビデオ設定、web iframe の camera permission を閉じる。
6. 音声設定・音声デバイスメニューを開いただけではカメラ権限を要求しない。
7. 通話中は feature 設定を変更不可にし、その通話の widget capability を固定する。

## レビュー結果

初回実装のロジックには blocking finding は無かったが、web iframe の `allow` に機能 OFF 時も `camera` が
残る defense-in-depth 漏れを検出した。Cinny `41970348` で widget URL の `disableVideo=false` を明示した
通話だけ `camera` を許可し、未指定・不正・OFF は fail-closed で省くよう修正した。修正後、静的レビュー上の
未対応 P1/P2 finding は無い。

## 検証

- Cinny: unit 8 files / 41 tests、typecheck、変更箇所 lint (error 0)、Prettier、web build、native build、
  web native-symbol guard を通過。
- Element Call: unit 88 files / 690 passed + 11 skipped、ESLint warning 0、typecheck、i18n check、
  embedded build を通過。
- Desktop: product input SHA検証と全 probe を2回通過。最終 lock は Cinny `41970348` / EC `3dd4d29`。
- GitHub Actions: Element Call product、Cinny image/tree-shake、Desktop Product CI が最終SHAで全て green。

## 残余リスク / 受け入れ

自動テストは物理カメラ、OS/ブラウザの実権限ダイアログ、相手側への実映像到達までは検証できない。これは
実装不備扱いではなく privacy-sensitive な P1 運用ゲートとして backlog に残す。web/native の両方で次を確認する。

- 初期状態にカメラボタン・ビデオ設定・カメラ権限要求が無い。
- feature 設定 ON だけではカメラが起動しない。
- 明示 ON でだけ権限要求が出て相手へ映像が届く。
- 通話終了後の次回参加とアプリ再起動後はカメラ OFF に戻る。
- 音声設定だけを開いてもカメラ権限を要求しない。
