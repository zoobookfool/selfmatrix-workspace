# M1 step 3c-2/3c-3 受け入れレビュー: 2 ユーザー通話 + 配信 + 窓移動無再接続 E2E

レビュアー: Claude。方式: レビュアー本人による **E2E 独立再実行 (2 回)** + 2 視点並列レビュー
(E2E 判定健全性 / cinny 差分+セキュリティ) + 変異による回帰ガード実証。2026-07-08。

## 判定: **受け入れ** (major 3 件を含む H1〜H6 を即日修正の上)

## 実証されたこと — **M1 受け入れ条件の成立**

実 dev バックエンドで、以下すべてが 1 本の E2E (`npm run e2e:callflow`) として PASS
(実装者 3 回 + レビュアー独立 2 回、修正後も再実測):

- **2 ユーザー実通話**: alice (ネイティブシェル、cinny トップフレーム) + bob (第 2 インスタンス)。
  参加者タイル 2 + inbound audio bytes 増加
- **7 語彙の実 in-call DOM 検証** (3c-3): screenshare/spotlight/emphasis/settings/setSoundOn/Off
  が実セレクタで ok:true + `aria-pressed`/実プロパティの state push 反転まで確認。
  reactions のみ EC 本体 (v0.20.1 ビルド) に送信ボタン未配線という **EC 側の既知ギャップ**
  (native 固有ではない) — 語彙認識のみ検証し evidence に明記
- **配信 (screenshare) + bob の視聴 opt-in** (SelfMatrix の視聴オプトイン仕様どおり)
- **配信中の窓移動 3 往復・無再接続** (3c-2、M1 の核心): noReload (navigation 0) /
  pcStable (既存 PC の connected 維持・新規生成ゼロ) / mediaContinues (RTP bytes 実増加) /
  bobUnaffected / **allRoundTripsActuallyMoved** (実 contentView 階層で main→window→main の
  遷移を毎回確認)
- **localStorage 契約 (M1 チェックリスト項目)**: session partition 分離により web 版の契約が
  **実際に壊れていることを実測で確認** → join 時スナップショット + **共有開始時の live 再同期**
  (cinny b97da94) で解決。通話中の画質/FPS 変更 (720/30→1080/15、cinny 実 UI 経由) が
  call view に反映されることを実測 (midCallSettingsSync)

## must-fix と対応 (H1〜H6、全対応済み)

1. **[major] 窓移動判定に「実際に移動した」積極的証拠が無い** — 4 条件は全て「壊れていない」
   ことしか見ておらず、detach/attach が no-op 化しても自明に true になる構造だった。
   → **H1**: 実 contentView 階層から計算する `callViewAttachedTo` の遷移を pass に AND。
   **「state だけ書き換えて実際は動かさない」変異で FAIL することを実装者・独立に実証**
2. **[major] E2E 用の own-window 優先ソース選択が通常モードにも常時適用** — 実利用の画面共有が
   事実上アプリ自身のウィンドウ固定になる退行。→ **H2**: `isE2ERealJoin` ガード配下へ
   (通常モードは M2 のソース選択 UI までの暫定フォールバックに戻す)
3. **[major] localStorage ブリッジが join 時 1 回きり** — web 版の実契約は「共有開始のたびに
   getStoredValue() で再読込」であり、通話中の設定変更が反映されない非等価だった。
   → **H3**: `updateCallLocalStorage` を契約に追加し toggleScreenshare が RPC 前に再同期
4. **[minor] toggleReactions の緩和判定が exception でも pass** → 除外条件を追加
5. **[minor] toggleSettings のダイアログ開閉実測が pass 未反映** → AND に組み込み
6. **[minor] スナップショットの読み出し面** → 実 URL のロードで読まれた後にクリア
   (Electron の registerPreloadScript が blank document で 1 回余計に発火する quirk を
   実測で特定し、`sender.getURL()` 非空時のみクリアで対処)

その他レビュアー直接修正: main 中継点への matrix-setting- prefix allow-list (多重防御。
cinny 側フィルタが唯一の防壁という状態を解消)。

## 記録事項

- 実装過程の実バグ修正: `setDisplayMediaRequestHandler` の partition 不一致 /
  `data-testid="tile_pin"` (videoTile ではない) / LiveKit の未使用 PC (`signalingState:closed`)
  を判定基準から除外 / 静止画面でエンコーダがフレーム送出を止める問題 (E2E 限定の
  keep-alive オーバーレイで対処 — 計測自体は本物の RTP 統計)
- 既知ギャップ (EC 本体側、web 版と共通): reactions ボタン未配線 / settings ダイアログは
  同一ボタンでのトグル閉じ不可 (Escape で閉じる)

## M1 受け入れ条件との対応

「dev スタックで 2 ユーザー通話 + 配信 + 無再接続の窓往復が E2E で PASS」— **成立**。
残タスクは 3c-4 (system audio 実機確認 + アプリ単位音声キャプチャのスパイク) のみ。
3c-4 は要件化の判断材料であり、案 B の技術成立性 (GO/NO-GO) には影響しない。
