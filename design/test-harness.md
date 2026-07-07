# SelfMatrix Test Harness 設計 (検討、2026-07-07)

**ステータス: ドラフト v0.3、M0 must-fix 対応済み。** ネイティブ版に進む前に、重い Electron 実機テストへ全部を押し込まないための検証入口を整理する。
この文書は [native-client-rethink.md](native-client-rethink.md) と [desktop-window-spike.md](../spikes/desktop-window-spike.md) の次段として読む。

実装入口:

- [test-harness/README.md](../test-harness/README.md)
- `npm test`: Widget protocol CLI + Web static contract。Widget protocol CLI は native-prototype の `main.cjs` 実装関数と preload 実ファイルを使う。2026-07-07 に PASS
- Electron smoke: 2026-07-07 に Electron 43 runtime で `reparent` / `displayMedia` ともに PASS。evidence JSON はコミット対象
- `npm run test:web`: Playwright UI test。2026-07-07 に PASS
- `npm run smoke:electron:reparent` / `npm run smoke:electron:display-media`: Electron smoke。依存 install 後に実行

## 目的

ネイティブ版では、OS 権限、画面共有、別窓、WebContentsView、auto update などが絡み、すべてを Electron 上で確認するとテストが遅く不安定になる。
そこで Workspace に test harness 群を置き、**ネイティブ固有ではない不具合を安い層で先に落とす**。

狙い:

- Discord 風通話 UI の regressions を、Electron 起動なしで Playwright から検出する
- Matrix Widget API / bridge の message contract を CLI で高速に確認する
- Electron では OS 境界に関わる smoke test だけを実行する
- ClaudeCode / GPT / 人間が同じ前提で確認できる再現手順を残す

## 基本方針

- production client は `selfmatrix-desktop`、test harness は検証用入口として分ける
- できるだけ production と同じ Cinny / Element Call build artifact を読み込む
- ただし Matrix homeserver / LiveKit / OS picker が不要な範囲は fake driver / mock stream で済ませる
- CI で回す軽量テストと、手元でだけ回す実機テストを分ける
- 実アカウント、実アクセストークン、実 homeserver URL は harness の既定値に入れない

## レイヤー構成

| レイヤー | 入口 | 主な対象 | CI 適性 | ネイティブ固有度 |
| --- | --- | --- | --- | --- |
| Web UI harness | ブラウザ + Playwright | 通話 UI、右クリックメニュー、画質/FPS、話者 overlay、表示状態 | 高 | 低 |
| Widget protocol CLI | Node CLI | Matrix Widget API message、bridge 変換、action transcript | 高 | 低 |
| Electron smoke harness | 最小 Electron app | WebContentsView 再親子付け、displayMedia、system audio、窓制御 | 中〜低 | 高 |
| Real stack scenario | 手元/専用環境 | dev MatrixRTC join、LiveKit track、複数人・高負荷 | 低 | 高 |

## 1. Web UI harness

### 役割

ブラウザ上で、Cinny shell 相当の fake widget host と Element Call UI を起動する。
Electron の窓管理を使わず、UI と状態遷移の大半をここで確認する。

### 確認したいこと

- Discord 風通話画面の配信タイル、下部バー、話者 overlay、右クリックメニューが崩れない
- 配信タイル右クリックから配信音量、ミュート、ポップアウト導線へ到達できる
- 話者 overlay 右クリックからユーザー単位音量・ミュートへ到達できる
- 画質/FPS picker が `720p / 1080p / source` と `15 / 30 / 60fps` を扱う
- カメラ機能を UI だけでなく capture 経路ごと無効にできている
- リアクション機能を消した状態で UI と keyboard focus が破綻しない
- 配信がない時に「ライブ配信中」と誤表示しない
- 配信開始後は話者ミニタイルを出さず、話者 overlay で音量調整できる

### 実装イメージ

- `test-harness/web/` に Vite か静的 HTML の harness を置く
- `matrix-widget-api` の `ClientWidgetApi` 相当を fake driver で実装する
- remote participant / screen share は canvas stream または fake `MediaStream` で注入する
- Playwright screenshots を `test-harness/artifacts/` に出す
- UI spec の正本は [ui-design-notes.md](ui-design-notes.md)、視覚基準は [mocks/ui-mock.html](mocks/ui-mock.html) v2.2 とする

### 非対象

- WebContentsView の再親子付け
- OS の画面共有 picker
- LiveKit 実接続
- auto update / installer

## 2. Widget protocol CLI

### 役割

UI を起動せず、Matrix Widget API と bridge の message contract を Node CLI で検証する。
`native-prototype/src/main.cjs` の bridge 実装関数と `native-prototype/src/widget-bridge-preload.cjs`
の実ファイルを使い、preload が IPC へ forwarding した message を main 側 validation / response policy で確認する。

### 確認したいこと

- `supported_api_versions`
- `content_loaded`
- `io.element.device_mute`
- `io.element.join`
- `im.vector.hangup`
- `get_openid`
- `send_event` / `send_to_device`
- `watch_turn_servers` / `update_turn_servers`
- error response / timeout / unknown action
- `parentUrl` origin と call view origin の不一致時に fail fast できること

### 実装イメージ

- `test-harness/cli/` に Node CLI を置く
- 入出力は JSON transcript として保存する
- 実行例:

```powershell
npm run harness:widget -- --scenario preload-voice-join
npm run harness:widget -- --scenario bridge-origin-mismatch
```

### 成果物

- transcript JSON
- action ごとの期待 response snapshot
- bridge 実装へ渡す契約テスト

## 3. Electron smoke harness

### 役割

Electron 固有のものだけを最小 app で確認する。
production app 全体を起動する前に、OS や Electron API の揺れをここで見る。

### 確認したいこと

- `WebContentsView` を main window / call window 間で再親子付けしても reload しない
- WebRTC loopback / 実 LiveKit track が切れない
- `session.setDisplayMediaRequestHandler` で screen / window source を返せる
- 720p/1080p/source と 15/30/60fps constraints が反映される
- Windows system audio / loopback の audio track を取得できる
- 実 LiveKit publish で system audio track が安定するか
- `alwaysOnTop`、閉じる挙動、複数 monitor、DPI scaling が破綻しない
- custom protocol / local HTTP の同一 app origin 設計で Widget API が通る

### 実装イメージ

- 既存の [desktop-window-spike.md](../spikes/desktop-window-spike.md) の一時 probe を、整理して `test-harness/electron-smoke/` に移す
- CI では headless で可能なものだけ実行し、画面共有・system audio は手元検証に分ける
- Electron version を固定し、更新時に smoke を再実行する

## 4. Real stack scenario

### 役割

最後に dev homeserver / dev MatrixRTC / LiveKit へ実接続して、実運用に近い条件を確認する。
ここは遅くてよい。数を絞り、release 前 gate として扱う。

### 確認したいこと

- 2 ユーザーで通話 join / leave / hangup が成立する
- 別窓移動を 10 回行っても leave/join が増えない
- 画面共有中に 3 回以上 view 移動しても送信 track が維持される
- 視聴側の配信タイルが消えない
- 4K60 x 3 本 + 10 人相当の負荷で、CPU / memory / bandwidth を記録する
- SFU 切断時の自動再参加または明確な復帰導線を確認する

## 推奨ディレクトリ

実装に入る場合は、Workspace に次の形で置く。

```text
test-harness/
  README.md
  package.json
  web/
    src/
    tests/
  cli/
    scenarios/
    transcripts/
  electron-smoke/
    src/
    evidence/
  artifacts/
```

初期実装は次の範囲まで進んだ。

1. Widget protocol CLI の `supported_api_versions` / `content_loaded` / `device_mute` / `join` / unknown action / origin mismatch / widgetId mismatch
2. Web UI harness の配信タイル右クリックメニューと話者 overlay 右クリックメニュー
3. Electron smoke の `displayMedia` + Windows loopback audio + `WebContentsView` 再親子付け

未実施:

- dev MatrixRTC / LiveKit への実接続
- 実 LiveKit track を使う system audio / 共有中移動の確認
- GitHub Actions 上での smoke 自動化範囲の確定

## Backlog への反映方針

- `test-harness` 整備は P0 として扱う。ネイティブ prototype の前段に置く
- UI regression は P1/P2 の個別実装とセットで web harness に追加する
- Electron smoke は Electron version 更新時の必須確認にする
- Real stack scenario は production 実装 GO の gate にする

## 未決事項

- harness を `selfmatrix-workspace` にコードとして置くか、将来の `selfmatrix-desktop` repo に移すか
- Playwright の baseline screenshots をどこまで commit するか
- CI を GitHub Actions で回す場合、Windows runner の画面共有検証をどこまで自動化できるか
- dev MatrixRTC / LiveKit の test account と secret 管理をどうするか
