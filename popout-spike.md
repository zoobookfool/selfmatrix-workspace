# ポップアウト技術検証 記録 (Phase 2b 早期スパイク、2026-07-02)

ui-design-notes.md の「ポップアウトは技術検証が必要 — Phase 2b の早い段階で小さく検証すること」に基づく検証。
作業環境: ローカルの改修用ワークスペース(cinny dev ブランチ + element-call v0.20.1 の clone)。

## 調査結果(4方向の並列調査、2026-07-02)

### 「リロードなしで iframe を別ウィンドウへ移す」は不成立

- iframe を別 document へ DOM 移動すると必ずリロードされる(Chrome/Safari 現行仕様。
  Paul Kinlan 検証記事、whatwg/html#6465)。回避策なし。
- Document Picture-in-Picture API も iframe 移動のリロード回避は仕様上保証されず、
  PiP ウィンドウはナビゲーションで自動クローズ・タブごと1つ・Chrome 系限定。
- Element Web の「PiP」は同一タブ内のフローティング表示(PersistedElement のポータル移動)であり
  別 OS ウィンドウ化ではない。upstream の popout 要望 (element-web#23466) は 2022 年から未着手。
- matrix-widget-api に transport の対象 window を張り替える API はない(`ITransport.stop()` は
  「再起動不可」と明記)。widget 側 `WidgetApi` は `window.parent` 固定で `window.opener` 非対応。

### ただし「ポップアップ内の新規 iframe + 短時間再接続」は cinny fork 側だけで成立する

- cinny 側 `ClientWidgetApi` は型上 `HTMLIFrameElement` を要求するが、実行時依存は
  `.contentWindow` と `addEventListener('load')` のみ。**ポップアップの document で作った本物の
  iframe を渡せばそのまま動く**(cinny は `waitForIframeLoad: false` なので load イベント経路も不使用)。
- widget → parent 方向のメッセージはポップアップ window に届くので、**メインウィンドウへ再 post する
  relay を1本張れば通信が成立**(PostmessageTransport は origin/source を検証しない。
  strictOriginCheck 既定 false、`ev.source` 不使用 — matrix-widget-api v1.16.1/v1.17.0 実装確認済み)。
- メイン → widget 方向は `iframe.contentWindow` へ直接届くため中継不要。
- EC は `skipLobby=true`(cinny は常に付与)かつ `preload` なしなら**マウント直後に自動 join**
  (`GroupCallView.tsx` の分岐)。
- LiveKit は同一 identity の二重参加で旧セッションを切断(DUPLICATE_IDENTITY)。
  element-call#1060(別タブで開くと元の通話が切れる)と同根 → **「離脱完了 → ポップアップで再 join」の
  順序制御が必要**。
- E2EE メディア鍵は widget 再作成でメモリから消えるが、再 join で再配布される(数百ms〜数秒の
  復号断の可能性)。Olm セッション自体はホスト側 matrix-js-sdk が保持し続けるので無事。

## 実装(スパイク、cinny 側のみ・matrix-widget-api 無改造)

変更ファイル(すべて `SPIKE(ポップアウト)` コメント付き):

| ファイル | 内容 |
|---|---|
| `src/app/plugins/call/CallPopout.ts` | **新規**。`CallPopout extends CallEmbed`。ポップアップ document 準備、message relay(widget→popup→メイン)、popup クローズ監視(合成 Close で既存 hangup フローに乗せる)、メインウィンドウ pagehide で popup 道連れ |
| `src/app/plugins/call/CallEmbed.ts` | `getIframe()` が `container.ownerDocument` から iframe を生成するよう 2 行変更(既存動作は不変) |
| `src/app/hooks/useCallEmbed.ts` | `useCallPopout()` 追加: クリック同期スタック内で `window.open` → hangup して Close を待つ(5s タイムアウト)→ 新 widget で `CallPopout` を生成し `callEmbedAtom` へ |
| `src/app/features/call/CallControls.tsx` | ポップアウトボタン(`Icons.External`)追加 |
| `src/app/components/CallEmbedProvider.tsx` | ポップアウト中は常設固定 div を非表示(空 div がクリックを奪うのを防止) |
| `src/app/plugins/call/index.ts` | export 追加 |

設計のポイント: `CallPopout` を `callEmbedAtom` に載せることで、既存のイベント供給
(to-device/state/timeline feed)、テーマ同期、hangup フロー、メインウィンドウの CallControls
(ミュート等は iframe.contentDocument への同一オリジン越しアクセスで動く想定)を全て再利用する。

## 検証結果 — 合格 (2026-07-02)

Playwright (headless Chromium, fake mic, ignoreHTTPSErrors) による自動検証。
環境: dev backend (WSL docker) + cinny dev サーバー + 非暗号化 call room (org.matrix.msc3417.call)、
alice 単独参加。スクリプトと証拠スクリーンショットは `popout-spike-evidence/` に保存
(スクリプトは element-call/ 直下に置いて `node popout_verify.mjs` で実行する —
@playwright の解決が必要なため。pnpm レイアウト破損のため playwright-core を .pnpm から直接 import)。

- [x] ビルド・起動・ログイン(コンソールエラーなし)、eslint エラー 0
- [x] 通話参加 → ポップアウト遷移: ポップアップは click 後 59ms で出現
- [x] **再 join: click から 1355ms でメインウィンドウの通話コントロール復帰**(3 回実行して 1355-1357ms で安定)
- [x] relay 経由の widget 通信成立: capability negotiation、JoinCall アクション受信、
      **ミュート操作の DeviceMute 往復**(メイン → popup iframe 直接送信 → relay 経由応答)すべて動作
- [x] ポップアップ内に EC の参加者タイル描画(スクショ 06)。EC 内部コントロールは
      CallControl により非表示(仕様どおり) → 操作系はメインウィンドウ側に集約
- [x] ポップアップクローズ → 500ms ポーリング検出 → 合成 Close → atom 破棄 → prescreen 復帰(~800ms)
- [x] コンソールエラーの新規発生なし: `io.element.join` / `set_always_on_screen` への
      「Unknown action」応答はポップアウト前の通常 embed でも出る upstream 既存挙動(同一セット)

### 未検証(fork 本実装時に確認)

- E2EE ルーム (perParticipantE2EE=true) での鍵再配布 — 参加者 2 人以上が必要
- 複数人通話(相手側から見た「一瞬離脱 → 再入室」の見え方、membership イベントの遷移)
- 画面共有中のポップアウト(再 join で共有は切れるはず → 再共有導線が必要)
- 実ブラウザのポップアップブロッカー(クリック同期スタック内で open しているので原理上は許可されるはず)
- 検証は Chromium のみ(Firefox 未確認)

### 判定

**ポップアウトは「離脱 → ポップアップ内再 join」方式で実現可能。** 再接続ギャップは実測 ~1.4 秒で、
ui-design-notes.md の「許容できる短時間の再接続」要件を満たす。matrix-widget-api・element-call とも
無改造で成立するため、fork 差分は cinny 側のみに収まる。

## 追加検証: 配信ストリーム・ポップアウト(Discord 方式、再接続ゼロ) — 実現可能 (2026-07-02)

上記の「通話全体ポップアウト」報告後、「必要なのは配信を見ながら他サーバーを確認できること。
Discord は配信を再接続なしで別ウィンドウにできる」との要件明確化を受けて追加検証。
Discord のポップアウトは通話全体ではなく**個別ストリームのビューア窓**であり、これは
再接続なしで実現できる: RTC 接続はメインウィンドウの EC が持ち続け、ポップアウト側は
同じ MediaStream を映すだけ。

検証 (`popout-spike-evidence/stream_popout_probe.mjs`、alice+bob の 2 ユーザー、bob がカメラ映像を発行):

- [x] **cross-realm MediaStream 共有が動く**: EC iframe(cinny と同一オリジン)内の
      `video.srcObject` を `window.open()` した別ウィンドウの video に代入 → 1280x720 で再生。
      メインウィンドウとフレーム精度で同期(fake 映像のタイマーで差 50ms を確認)
- [x] **メインウィンドウで別ページへ移動しても再生継続**: alice が `/direct` へ遷移し
      通話コンテナが `visibility: hidden` になった状態で、ポップアウト映像は等速再生を維持。
      EC の `adaptiveStream: true` は購読を止めなかった(IntersectionObserver は CSS visibility
      ではなくジオメトリで判定するため。**将来 shell 側で display:none に変えると止まる**ので注意)
- 音声はメインウィンドウの EC から鳴り続ける(Discord と同じ挙動)

### fork 本実装への示唆

- 実装先は **EC fork のタイル UI**(ui-design-notes の表示モード作業と同じ箇所)。タイルに
  「ポップアウト」ボタンを付け、EC 内部から `window.open` + LiveKit の `track.attach()` で
  ビューア窓に接続するのが堅い(attach なら adaptiveStream の管理下に正しく入り、
  DOM ミラーの visibility 依存も消える)。EC iframe の sandbox は `allow-popups` 済み
- 話者オーバーレイ(StreamKit 風)はビューア窓側に描画する設計になる
- 「通話全体ポップアウト」(再join ~1.4s、cinny 側実装済み) は別機能として保持可能。
  マルチモニタで通話 UI ごと移したい場合に有用だが、主要件は配信ポップアウトで満たせる

### 検証環境の補足

- Synapse のログイン rate limit に当たるため `element-call/backend/dev_homeserver.yaml` に
  `rc_login` 緩和を追記(SPIKE コメント付き、未コミット)。Playwright での再検証時に必要
- bob (@bob:synapse.m.localhost) を Voice Lounge に参加させ済み

- 注: `npm run typecheck` はこの clone で全域 792 エラー(matrix-js-sdk の型解決が壊れている
  既存問題。今回の変更とは無関係、要別途調査)

## 既知の制限・fork 本実装への注意(スパイク段階の割り切り)

- ポップアウト中、メインの通話ビューは空領域 + コントロールバーのみ(「ポップアウト中」表示は未実装)
- 再 join 時の intent 再計算で、DM かつ参加者 0 になった場合に再度 ring が飛ぶ可能性(voice channel
  運用では isCallRoom のため通知は飛ばない)
- popup は about:blank(opener のオリジンを継承)。本実装では専用の popout.html を持たせる方が堅い
- popup クローズ検出は 500ms ポーリング(pagehide はポップアップ側で拾えないケースがあるため)
