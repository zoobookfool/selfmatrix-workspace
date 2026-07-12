# M3 設計: Discord 準拠の無再接続ポップアウト窓体験

**状態: 正本 (M3 設計)** — 2026-07-09 制定。[native-milestones.md](../planning/native-milestones.md) M3 の
実装設計。現状調査 (desktop main.cjs / cinny native / EC フッター / E2E) に基づく。前提は
step 0 スパイクで実証してから確定する。

## 0. 結論サマリ

**再親子付け機構 (無再接続の窓移動) は M1 で実証済み** (windowMoveReparenting E2E、3 往復)。
M3 はその上に UX を載せる: ⧉ ポップアウト導線 / 別窓 close = メイン復帰 (通話継続) /
別窓に EC フッター表示 / 窓サイズ・位置記憶。

**最大の未検証リスクだった項目 → step 0 で GO 確定 (2026-07-09、desktop 1356638)**:
別窓を実際に閉じた時、子 WebContentsView (生きた RTCPeerConnection) が無再接続でメイン復帰できるかを
自己ループバック PC で実測。**採用 = `close-preserve` 方式** (`"close"` で preventDefault →
attachCallView 退避 → win.destroy)。webContents.id 不変 / connected 維持 / loadCount 不変 /
callViewState≠"none" を確認。※実測で判明: Electron 43 は親 BrowserWindow 破棄で子 WebContentsView を
巻き込み破棄しない (legacy "closed" 方式でも生存) が、未文書化挙動に依存しない close-preserve を採用。

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

| # | サブステップ | 触る範囲 | 状態 |
| --- | --- | --- | --- |
| **0** | スパイク: callWindow 実 close 時の無再接続実証 | desktop main.cjs + probe | ✅ GO (desktop 1356638、close-preserve 採用) |
| **1** | 契約拡張 (popout/popin/placement、claim-once 内) | cinny nativeBridge.ts + desktop | ✅ cinny ed0174a4 / desktop bd21123 |
| **2** | desktop: close=復帰 + 窓サイズ/位置記憶 | desktop main.cjs | ✅ bd21123 (m3-window-probe で契約経路の無再接続往復 + 実 close 復帰 + サイズ復元) |
| **3** | EC フッター出し分け | desktop call-control-preload.cjs + main.cjs | ✅ 6718bbf (E2E footerVisibilityToggle PASS) |
| **4** | cinny popout 導線 (⧉ ボタン) | cinny useCallEmbed.ts + CallControls.tsx | ✅ cinny 7bbb17d1 |
| **5** | E2E 10 往復 + 実 ⧉ クリック + close→復帰 | desktop e2e | ✅ desktop 5e34e86 (2 回連続 PASS + 変異でガード実証) |

**step 1〜3 のデバッグで見つかった 2 バグ (6718bbf で修正)**:
- **userData 2 インスタンス衝突**: step 2 の窓サイズ記憶のテスト隔離 (`app.setPath("userData", 固定)`)
  がハーネスの per-instance `--user-data-dir` を上書きし、alice/bob が同じ userData を共有 →
  2 個目の rust-crypto IndexedDB がロックされ「起動中です」で無限ストール。E2E 全体を塞いでいた。
  `--user-data-dir` 指定時は setPath しないよう修正
- **戻り時 bounds 未復帰** (design §3-5 の既知項目が顕在化): 別窓から戻ると cinny のレイアウト変化が
  無く setCallViewBounds 再 push が走らず、callView が detached 全面 bounds のまま。attachCallView で
  最後の cinny bounds を再適用して修正

順序: 0 → 1 → (2,3) → 4 → 5。

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
  - **(2026-07-12 運用者判断で格下げ)**: 突き合わせは受け入れ条件ではなく**参考程度**。
    基本は Discord を正とするが、UI 等は作者の好みで変更するため厳密一致は求めない

## 4b. M3 完了 (2026-07-12)

受け入れ条件「10 往復切断ゼロ + 別窓 close でメイン復帰 (通話継続)」を実 E2E で成立
(クリーン環境で 2 回連続 PASS、desktop 5e34e86):
- window-move 10 往復で RTCPeerConnection id 不変・connected 維持
- 実 ⧉ ボタンクリックでの popout/popin (production 配線、両方向 noReconnect)。cinny popout 切断の変異で実クリック判定のみ FAIL
- **別窓 close → attachedTo=main 復帰 / callViewState=attached (dispose 誤発火なし) / callDidNotEnd / bob 無影響**。ガード `!== "detached"` を反転する変異で closeWindowMainRevert が FAIL (attachedAfterClose=none) = 本物の回帰ガード
- **残タスク**: ~~最前面ピン留めは LATER~~ → **実装済み (2026-07-12、desktop af603ee)**: 運用者 GO
  (「やらない理由がなければ載せる」) により実装。トレイ「通話の別窓を最前面に固定」(既定 OFF、
  永続化、probe 3 段 + 変異ゲートで検証)。Discord 実機録画との突き合わせは参考程度に格下げ (§4)

**検証環境の知見 (2026-07-12)**: 2 ユーザー E2E で (a) 中断ランが leftover Electron/node を残すと通話メンバーシップを更新し続け Voice Lounge に幽霊メンバーが溜まる、(b) E2E teardown で electron が閉じきらず npm がハングして完了通知が出ない (テスト自体は成功済み)、という脆さを観測。中断時は electron プロセスの一掃 + 幽霊 call member の掃除が必要。

## 5. 作らないもの (native-milestones M3 明記)

開き方の設定 (このウィンドウ/別ウィンドウ・毎回選ぶ・二層保存) / ポップアップブロッカー対策。
(最前面ピン留めは当初 LATER だったが 2026-07-12 に実装済み — §4b 参照。)
