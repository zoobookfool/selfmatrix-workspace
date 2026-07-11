# M3 設計: Discord 準拠の無再接続ポップアウト窓体験

**状態: 正本 (M3 設計)** — 2026-07-09 制定。[native-milestones.md](../planning/native-milestones.md) M3 の
実装設計。現状調査 (desktop main.cjs / cinny native / EC フッター / E2E) に基づく。前提は
step 0 スパイクで実証してから確定する。

## 0. 結論サマリ

**再親子付け機構 (無再接続の窓移動) は M1 で実証済み** (windowMoveReparenting E2E、3 往復)。
M3 はその上に UX を載せる: ⧉ ポップアウト導線 / 別窓 close = メイン復帰 (通話継続) /
別窓に EC フッター表示 / 窓サイズ・位置記憶。

**最大の未検証リスク (step 0 で先に潰す)**: 別窓 (callWindow) を**ユーザーが直接閉じた**とき、
Electron が子の WebContentsView (= 生きた RTCPeerConnection) まで巻き込んで破棄するか。
破棄されると「閉じる=無再接続でメイン復帰」が原理的に成立しない。現行の `createCallWindow()` は
`"closed"` (破棄後・キャンセル不可) で `attachCallView()` を呼ぶが、これは実 close 操作で
一度も検証されていない (E2E は `__selfmatrixE2E.detachCallView/attachCallView` を直接呼ぶだけ)。

## 1. 現状 (流用できるもの / ギャップ)

| 要素 | 現状 | M3 での扱い |
| --- | --- | --- |
| `detachCallView()`/`attachCallView()` (main.cjs) | removeChildView/addChildView で再親子付け。production 導線なし (harness/E2E デモ) | **本体は流用**。production 導線 (契約 + cinny UI) を新設 |
| `computeCallViewAttachedTo()` | contentView の実体から "main"/"window"/"none" を逆算 (H1) | E2E 検証にそのまま流用 |
| `createCallWindow()` の close 挙動 | `"closed"` で callView 残存なら attachCallView | **`"close"` (破棄前) に変更**して removeChildView 退避 → win.destroy (step 0/2) |
| bounds 同期 (`applyCallViewBoundsFromCinny`) | attached 中のみ適用、detached は無視 (M3 引き継ぎ済み) | 別窓 bounds は callWindow 側で全面表示 + resize 追従を新設 |
| cinny `useCallPopout`/`useCallPopin` | native では `hasSelfmatrixNativeBridge()` ガードで no-op、⧉ ボタン非描画 | native 分岐を新 transport メソッド呼び出しに。⧉ ボタンを native でも描画 |
| EC フッター (メイン埋め込みで非表示) | **web 版は CallControl.ts の onBodyMutation が DOM で visibility:hidden。native 側は未移植 = 現状フッターが隠れている根拠が無い (要実機確認)** | step 3 で出し分けを実装 (別窓=表示 / メイン=非表示) |
| 窓サイズ/位置の永続化 | **機構が一切無い** | userData の JSON に最小実装 (依存追加なし) |
| `onCallControlState` push 配線 | screenshare/spotlight 等専用 | 新規 placement push チャンネルのテンプレートに流用 |

**最重要制約 — `contractSurfaceGate`**: 本番 topology の `window.selfmatrixNative` のキー集合は
**厳密に `["claimWidgetTransport"]` のみ**を cinny-shell-smoke が恒久ゲートしている。新 API
(popout/popin/placement) は `selfmatrixNative` 直下に生やしてはならず、**必ず
`claimWidgetTransport()` が返す claim-once オブジェクト内**に足す。

## 2. サブステップ分解

| # | サブステップ | 触る範囲 | 内容 |
| --- | --- | --- | --- |
| **0** | スパイク: callWindow 実 close 時の無再接続実証 | desktop main.cjs + probe/E2E | `"close"` で破棄前 removeChildView → win.destroy。実 close で RTCPeerConnection が生き残り再親子付けできることを実証。**NO-GO なら M3 設計を作り直し** |
| **1** | 契約拡張 | cinny nativeBridge.ts + desktop shell-preload.cjs + main.cjs | `popoutCallView()`/`popinCallView()` (claim-once 内)、attach/detach 状態 push (`onCallViewPlacement` 等)。cinny 型 + desktop 実装を両輪 |
| **2** | desktop: close=復帰 + 窓サイズ/位置記憶 | desktop main.cjs | close ハンドラ本実装 (detached の時だけ復帰、closeCallView と競合させない状態機械保護)。userData JSON に bounds 永続化。別窓 resize 追従 |
| **3** | EC フッター出し分け | desktop main.cjs + call-control-preload.cjs | main→call view push で detached 時にフッター表示。web 版セレクタ (`leaveButton().parentElement.parentElement`) を移植。dom-ready 起点で初期化 (遅延 invoke 依存を外す) |
| **4** | cinny popout 導線 | cinny useCallEmbed.ts + CallControls.tsx | native 分岐を新 transport 呼び出しに。⧉ ボタンの `!nativeShell` ガードを外し native 用ハンドラへ。placement push で「別窓表示中」を UI に反映 |
| **5** | E2E 拡張 | desktop e2e | 往復 3→10。`__selfmatrixE2E` に closeCallWindow 窓口 → close→復帰を検証。判定: attachedTo="main" 復帰 / PC id セット不変 / **callViewState !== "none" (dispose 誤発火検知)** / bob 無影響 |

順序: 0 → 1 → (2,3 並行可) → 4 → 5。1 はインターフェース確定を先に。

## 3. 主要な設計論点

1. **(最重要・step 0) 別窓破棄時の子ビュー生存性**: `"close"` イベント (キャンセル可) で
   `event.preventDefault()` → `attachCallView()` (メインへ退避) → `win.destroy()` の順。
   mainWindow の close-to-tray (preventDefault + hide) と同型。実 close で無再接続を実証してから 2 へ。
2. **close=復帰で dispose を誤発火させない**: `closeCallView()` (hangup 経由・callView 完全破棄) と
   callWindow close 時の復帰は別関数。callWindow close ハンドラは **`callViewState === "detached"` の
   時だけ**発火。退出ボタン押下と窓 close がほぼ同時のレースは「hangup が先なら callViewState は
   既に "none" → close ハンドラは何もしない」で保護。この状態機械を E2E で守る。
3. **EC フッター出し分けは実機確認が先**: native (メイン埋め込み) でフッターが今どう見えているか、
   コード上は隠す処理が未移植で不明。step 3 の頭で実機/スクショ確認してから実装方式を確定。
4. **bounds と detached の相互作用**: `isCinnyShell` ガードで本番 topology の resize 追従が無効。
   別窓では callView を全面 (`{x:0,y:0,width,height}`) にし、callWindow の resize 追従を detached
   限定で新設 (attached の cinny push 経路とは分離)。
5. **placement 状態の逆方向 push**: 「別窓を閉じたら main 側で勝手に attach が起きる」経路がある
   以上、cinny UI (⧉ ボタンの状態・「別窓表示中」表示) を実状態に同期させるため、attach/detach を
   cinny へ push するチャンネルが要る (onCallControlState とは別)。

## 4. 受け入れ (native-milestones M3)

- 通話中の窓出し入れ **10 往復で切断ゼロ** (RTCPeerConnection id セット不変 + connected 維持)
- **別窓 close でメイン復帰・通話継続** (callViewState が "none" にならない = dispose 誤発火なし)
- bob (別ユーザー) 無影響
- Discord 実機録画 (2026-07-07 取得、運用者ローカル) との挙動突き合わせ 4 点: 映像/音声継続 /
  別窓での操作がフッターだけで完結 / 閉じてメイン側状態が正しく復元 / 窓切り替えの体感

## 5. 作らないもの (native-milestones M3 明記)

開き方の設定 (このウィンドウ/別ウィンドウ・毎回選ぶ・二層保存) / ポップアップブロッカー対策。
最前面ピン留めは LATER (実機ドッグフーディングで要否判断)。
