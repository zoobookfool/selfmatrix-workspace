# GPT review: native M1 全体レビュー (2026-07-08)

対象: `selfmatrix-workspace` `c25bdb9` (`M1 step 3c-4 完了 -> M1 全項目完了・案 B 正式 GO を推奨`)

## 判定

M1 の技術成立性そのものはかなり強い。`native-callflow-result.json` では 2 ユーザー通話、配信、3 往復の
WebContentsView 再親子付け、RTP bytes 継続、bob 側無影響まで PASS しており、案 B を M2 へ進める根拠はある。

一方で、M2 へ持ち込む前に直した方がよい実装上の穴が 2 件、正本ドキュメントの古さが 2 件ある。
以下は ClaudeCode / Fable にそのまま渡せる指摘として整理する。

## 指摘事項

### [P1] `openCallView()` の URL 検証が `parentUrl` と `widgetId` の必須性まで見ていない

`native-prototype/src/widget-bridge-protocol.cjs` の `validateCallViewUrl()` は origin/path と
「存在する場合の widgetId allow-list」だけを検証している。`widgetId` が無い URL は通り、
`native-prototype/src/main.cjs` の `openCallView()` で固定 `WIDGET_ID` にフォールバックする。
さらに `parentUrl` の origin 検証は `buildWidgetUrl()` 側にしかなく、低信頼側が渡す完成 URL では保証されていない。

影響:

- `state.activeWidgetId` の期待値が「低信頼側の URL 由来」になっている設計を緩めてしまう。
- `parentUrl` が欠落/別 origin でも、EC 側の postMessage 経路が壊れるまで検出できない可能性がある。
- M1 レビューで潰した「低信頼側が書いた値を照合期待値にする」トートロジーが、一部戻っている。

対応案:

- `validateCallViewUrl()` で `widgetId` を必須にする。
- `validateCallViewUrl()` で `parentUrl` を必須にし、`new URL(parentUrl).origin === expectedOrigin` を検証する。
- `widgetId` 欠落、`parentUrl` 欠落、`parentUrl` origin mismatch の CLI/smoke ケースを追加する。
- `openCallView()` の `|| WIDGET_ID` フォールバックは、検証後は不要なので削除する。

### [P1] call view 再作成時に `registerPreloadScript()` が重複登録される可能性がある

`native-prototype/src/main.cjs` の `createCallViewIfNeeded()` は、呼ばれるたびに
`session.fromPartition(CALL_VIEW_PARTITION).registerPreloadScript(...)` を実行する。
一方で `closeCallView()` は `WebContentsView` を閉じるだけで preload 登録を解除しない。

通話 1 回目では問題化しにくいが、2 回目以降の通話で `call-control-preload.cjs` が複数回注入されると、
1 回の `toggleScreenshare` RPC に複数 listener が反応し、二重クリックで「開始して即停止」のような事故になり得る。

対応案:

- preload 登録 ID を module state に保持して一度だけ登録する。
- あるいは `closeCallView()` で `session.unregisterPreloadScript(id)` を呼ぶ。
- E2E に「同一プロセスで通話参加 -> close/hangup -> 再参加 -> screenshare が 1 回だけ反転」を追加する。

### [P1] 正本ドキュメントが M1 完了後の状態に追従していない

`planning/native-milestones.md` は M1 完了・案 B 正式 GO 推奨まで進んでいるが、以下はまだ
M0〜M1 前の「次に検証する」表現が残っている。

- `planning/current-status.md`: NativeWidgetTransport / 実 LiveKit join / 共有中移動が次ゲートのまま。
- `planning/backlog.md`: P0 が「adapter が次」「最終 LiveKit join 待ち」のまま。
- `design/native-client-decision.md`: production release GO ではない理由として、実 join / 共有中移動 /
  localStorage 契約が未確認扱いのまま。
- `README.md`: `native-client-rethink.md` と `desktop-window-spike.md` の読み方が「最終 LiveKit join 待ち」のまま。
- `reviews/README.md`: `claude-review-native-prototype-20260707.md` が「対応待ち」のまま。

影響:

- 次の AI / 人が、既に M1 で完了した検証を再調査する。
- M2 着手前の本当の未決事項が埋もれる。

対応案:

- `current-status` / `backlog` / `native-client-decision` / `README` / `reviews/README` を
  M1 完了、M2 リポジトリ新設判断待ち、アプリ単位音声 LATER 判断待ちに更新する。
- `native-client-decision.md` は「2026-07-07 の条件付き GO」履歴として残すか、
  「M1 結果による更新」節を追加して、未確認リストを完了/未完了へ分け直す。

### [P2] ネイティブ版の通話ウィンドウ仕様が文書間で矛盾している

`design/native-client-rethink.md` は web 版 `call-window-mode.md` v1.4 の決定事項
「既定 = 別ウィンドウ」「閉じる = 退出」までネイティブに引き継ぐように読める。

一方、`design/call-window-mode.md` 冒頭と `planning/native-milestones.md` M3 は、ネイティブでは
Discord 準拠に戻すと書いている。つまり、メインウィンドウで参加、ポップアウトは無再接続移動、
別窓クローズはメインへ戻して通話継続、が現行方針。

対応案:

- `native-client-rethink.md` の該当箇所を「窓サイズ/位置記憶、別窓での EC フッター表示だけ引き継ぐ」に修正する。
- web 版固有の「既定 = 別ウィンドウ」「閉じる = 退出」「毎回選ぶ設定」は M1 NO-GO fallback 専用と明記する。

### [P2] CallControl の DOM 監視が React の深い再マウントを拾えない可能性がある

`native-prototype/src/call-control-preload.cjs` の `ensureBodyObserver()` は `document.body` の
`childList` を `subtree:false` で監視している。EC の実 DOM は body 直下ではなく root 配下で
React が再マウントするため、コントロールバー差し替え時に古い要素を監視し続ける恐れがある。

現在の E2E は代表操作を通しているが、M2 で実利用に入るなら、設定モーダル開閉、レイアウト切替、
配信開始/停止、ロビー/通話 UI 遷移などで再マウントが増える。

対応案:

- `document.body` 監視を `subtree:true` にする、または EC の root 要素を監視する。
- 各 invoke 前に `observeCallControls()` を再実行して、対象要素を取り直す。
- EC 内部クリックで状態が変わった後に `NativeCallControl` 側へ state push が返る回帰テストを追加する。

## 確認できたこと

- `native-prototype/evidence/native-callflow-result.json` は `pass:true`。
- 2 ユーザー通話、配信、bob の視聴 opt-in、3 往復の無再接続移動、RTP bytes 継続は証跡上成立している。
- system audio は `system-audio-result.json` で Windows loopback audio track の存在と live 状態を確認済み。
- アプリ単位音声は Electron 43 の API リフレクションでは入口なし。M2 では LATER 推奨で妥当。
- `toggleReactions` と `toggleSettings` の既知ギャップは native 固有ではなく、EC 側の UI/コンポーネント挙動として扱うのが妥当。

## 次にやるなら

1. P1 の URL 検証と preload 重複登録を先に修正する。
2. 正本ドキュメントを M1 完了後へ更新する。
3. M2 に進む前に、M2 のセキュリティ監査項目として `shell window sandbox:false`、常時公開の
   `ensureCallView/detach/attach`、自動更新の minisign/provenance まわりを別レビューする。

## 実行メモ

このレビューではコード修正・テスト実行はしていない。ローカル確認のみ。
