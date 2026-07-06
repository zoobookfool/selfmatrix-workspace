# EC タイル UI 実装計画 (Phase 2b、2026-07-03)

**進捗 (2026-07-04): 全スライス完了。** selfmatrix-element-call の product ブランチに実装・
統合検証済み (Slice 1: c3038861 / 2: 9d73dfd2 / 3: 04cc3a75 / 4: 8ac61b97 / 5: 64b1de6e /
6a: 627a4aa7 / 6b: 5e25914f)。各スライスは cinny 統合環境 + 実画面共有の Playwright 検証付き。

実装時の設計適応 (計画からの変更点):
- **複数注視 (Slice 6a)**: モック C 案の「グリッドから 2 枚選ぶ」は EC の実モデル (配信は
  グリッドではなくスポットライトのカルーセルに入る) と合わないため、**スポットライトの
  2 面分割**として実装。分割ペインごとに視聴オプトイン (Slice 4) が独立に機能する
- **注視の解除 (Slice 3)**: ピンすると対象がストリップから消える (EC はスポットライト対象を
  重複表示しない) ため、「再クリックで解除」ではなくスポットライトタイル上の解除ボタンにした
- **ミニタイル位置 (Slice 6b)**: arrangeTiles のバリアント新設は不要だった (該当レイアウトは
  CSS grid + flex-wrap のみで構成)。データ属性 + CSS 変種で対応、既定を Discord 風の「下」に変更
- 発話検出の実発火はヘッドレス検証環境では確認不可 (フェイク音声では LiveKit の判定が
  発火しない。upstream の既存 speaking 表示も同様) — 実マイクでの目視確認は実使用時に

ui-design-notes.md (v1.2) の通話画面要件を selfmatrix-element-call (v0.20.1 ベース) に実装するための
計画。実装箇所の調査結果 (2026-07-03、4 方向のコードマッピング) に基づく。

## 調査で確定した構造上の事実

- **レイアウト機構は追加に開かれている**: レイアウトは判別共用体 (`src/state/layout-types.ts`) +
  純粋関数 (`src/state/*Layout.ts`) + `InCallView.tsx` の `layouts` マップで構成され、
  新レイアウトは「union に 1 メンバー + 新規ファイル + マップ 1 行」で描画経路に乗る。
  既存 7 レイアウトは無改修で温存できる。
- **注視の手動選択 (ピン) は存在しない**: スポットライト対象は発話検出ベースの完全自動選定
  (`spotlightSpeaker$`)。「タイルをクリックして注視」は状態・UI とも新規実装。
- **「ミニタイルを隠す」は `spotlight-expanded` が既にある**: スポットライトを edge-to-edge に
  する既存トグル (`toggleSpotlightExpanded$`) をそのまま「ミニタイルを隠す」ボタンに使える。
- **ミニタイルの低解像度購読は自動**: adaptiveStream が video 要素サイズを ResizeObserver で
  監視し、SFU が simulcast 層 (h180/h360/h720) を自動選択する。明示的な品質 API は不要。
  ただし要素が「DOM にあるが不可視」だと配信停止されうる (IntersectionObserver 判定) 点に注意。
- **全トラック常時購読が現状**: `autoSubscribe: true` のまま、`setSubscribed` は未使用。
  オプトイン視聴は `RemoteTrackPublication.setSubscribed(true/false)` の制御層を新設する。
  画面共有の映像と音声は別トラックなので両方制御が必要。
- **設定の永続化は EC 内 `Setting<T>` (localStorage)** で足りる (既定モード、ミニタイル位置)。
  widget 経由の account data 書き込み API は存在しない (将来の同期要件時に新設)。
- **cinny の CallControl は EC の DOM に依存**: `data-testid` 依存 (screenshare/leave/settings) と
  構造依存 (`input[value="spotlight"]`、`leaveButton.previousElementSibling`) がある。
  **既存の footer/Switch/testid は温存し、新 UI は新規 testid の別コンポーネントで追加**する。
  cinny 側から新モードを操作する場合は cinny の CallControl も合わせて改修 (両方自 fork なので可)。
- **ポップアウトと adaptiveStream**: livekit-client の可視性判定は同一 document 前提のため、
  別ウィンドウの video 要素だけに attach すると購読が落ちうる。**メインウィンドウ側のタイルを
  表示したまま (購読アンカー)、ポップアウト窓は追加の attach 先とする**(2026-07-02 の
  実測検証と同じ構成)。E2EE の復号は RTCRtpReceiver 層 (Encoded Transform / Insertable
  Streams worker) で完結するため、別窓の video でも復号済みフレームが出る (静的解析による結論)。

## 実装スライス (順序案)

### Slice 1: カメラ UI 非表示 (小)
- EC: `UrlParams.ts` に `hideVideoButton` フラグを追加 (`hideScreensharing` と同じ 3 点パターン)、
  `CallFooterViewModel.tsx` → `CallFooter.tsx` の video ボタン生成を条件化。
  **機能 (toggleVideo/DeviceMute 同期) には触れない** — 描画だけ止める。
- cinny: widget URL に `hideVideoButton: 'true'` (1 行) + cinny 自身のコントロールバーの
  VideoButton / prescreen のカメラトグルも非表示。

### Slice 2: 配信ストリーム・ポップアウト (中、方式検証済み)
- `SpotlightTile.tsx` の `bottomRightButtons` (最大化ボタンの隣) に screen share 限定の
  ポップアウトボタンを 1 個追加。ロジックは新規フック `src/tile/popout/usePopoutScreenShare.ts` に
  分離: `vm.video$` → `TrackReference.publication.track` → `window.open()` した窓の video に
  `track.attach()`。
- クリーンアップ: `video$` が undefined 化 (配信停止) / React アンマウント (通話終了) /
  `window.closed` ポーリングで `track.detach()` + 窓クローズ。
- メイン側タイルは表示継続 (購読アンカー)。

### Slice 3: 注視の手動選択 + ミニタイル隠す (中)
- 新規状態モジュール (例 `src/state/CallViewModel/PinnedSpotlight.ts`): ピン対象の Subject を持ち、
  `spotlightSpeaker$` の自動選定より優先。対象退出/配信停止で自動クリア。
- タイルクリックで注視選択: `GridTile` は直接改修せず、`InCallView.tsx` の `Tile` ローカル定義で
  ラップコンポーネントに差し替え。
- 「ミニタイルを隠す」ボタン = 既存 `toggleSpotlightExpanded$` を新 UI から叩く。
- 新モード切替 UI は新規コンポーネント + 新規 testid (既存 Switch は温存)。cinny の
  CallControl に新 testid のセレクタを追加。

### Slice 4: 配信オプトイン視聴 (中〜大)
- 新規 `ScreenShareSubscriptionController`: 「注視中 or 視聴選択済み」集合に入らない
  screen share の映像+音声トラックを `setSubscribed(false)`。未視聴タイルは
  「クリックで視聴」プレースホルダ表示。
- `setSubscribed` の `isDesired` ガードとの競合 (publish 直後のタイミング) は実機検証が必要。

### Slice 5: StreamKit 風話者オーバーレイ (中)
- 新規コンポーネント: 既存 Behavior (`speaking$`, `audioEnabled$`, `displayName$`,
  `mxcAvatarUrl$`) を読むだけのオーバーレイ。緑リングは生の `speaking$` (即時)。
  ドラッグ移動は既存 Alignment 機構 (4 隅) を流用。
- 音量レベル数値が必要なら `ParticipantEvent.AudioLevelChanged` の新規購読を追加。

### Slice 6: 複数注視 (2 面) + ミニタイル位置の上下左右 (大)
- `SpotlightTileViewModel.media$` が元々配列である点を利用し、TileStore 無改修で
  「2 メディアを 1 スポットライトに入れて横並び描画する」案を最初に検証
  (`TileStore.registerSpotlight` は 1 枠制約があるため)。ダメなら TileStore 拡張。
- ミニタイル列の位置 (上下左右) は新レイアウト関数のパラメータとして実装、
  `Setting<T>` で永続化。

## 検証方法

- 開発イテレーション: EC スタンドアロン (`pnpm dev`, port 3000) + dev backend で高速に回し、
  統合確認は `pnpm build:embedded` → cinny の node_modules 上書き → Playwright
  (dev backend + alice/bob、TLS は ignoreHTTPSErrors) で自動化。
- cinny 連携の破壊チェック: CallControl の各 testid/セレクタが生きているかをスモークに含める。

## リスク

- `CallViewModel.ts` / `CallFooter.tsx` / `src/tile/` は upstream で活発に変わる領域。
  変更は新規ファイルへの分離を徹底し、既存ファイルへの diff は「分岐 1 行 + マップ 1 行」級に保つ。
- v0.20.1 固定なので upstream の新しいタイル UI リファクタとは意図的に分岐する
  (embedded 依存を上げるまで rebase しない方針は fork-strategy.md 参照)。
