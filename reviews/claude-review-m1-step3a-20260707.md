# M1 step 3a 受け入れレビュー: cinny native/ モジュール実装 (Claude 実装分)

レビュアー: Claude。方式: 2 視点並列レビュー (API 互換性 / 契約・セキュリティ・設計適合) +
レビュアー本人の独立検証 (ブランチ状態・typecheck)。対象は cinny fork の `spike/native-shell`
ブランチ (未コミット時点の diff)。cinny にはテストスイートが無いため、実挙動の変異ゲートは
step 3c の E2E で実施する。2026-07-07。

## 判定: **条件付き差し戻し → 即日修正 (A〜E) → 受け入れ**

## 対象

- 新規: `src/app/plugins/call/native/` — nativeBridge.ts / NativeIframeShim.ts /
  NativeCallEmbed.ts / NativeCallControl.ts
- 変更: `src/app/hooks/useCallEmbed.ts` (native 検出分岐)

## レビューで確認できたこと (再作業不要)

- **公開 API 互換**: CallEmbed/CallControl の全消費者 (hooks / CallEmbedProvider /
  features/call / call-status / room-nav / room / pages) を grep で洗い出し、実使用メンバー
  全てが同名・同シグネチャ・同セマンティクスで提供されていることを突き合わせ確認。
  `instanceof CallEmbed/CallControl` 依存は存在しない (instanceof CallPopout のみで、
  NativeCallEmbed には正しく false)
- **feed 系配線のコピーは原本と一致** (行単位突き合わせ)。さらに原本 CallEmbed.ts の
  `.bind(this)` リスナー解除漏れ (leak) を native 側では bind キャッシュで修正済み
  (web 側の修正は別タスクチップに切り出し)
- **シムの妥当性**: matrix-widget-api 実物の ClientWidgetApi/PostmessageTransport ソースと
  突き合わせ、iframe 使用 4 行に対して 3 プロパティのシムで充足することを再確認
- **web 経路不変**: native 未検出時のコードパスは変更前とバイト同一
- typecheck 0 エラー (レビュアー独立実行でも確認) / 対象ファイルへの eslint 直接実行 0 エラー /
  build 成功

## must-fix と対応 (A〜E、全対応済み)

1. **[major] popout/popin が native 検出を素通り** — native 通話中に popout を押すと web iframe
   の CallPopout を新規構築し、通話が**無警告で web 経路へ降格**する (戻る手段なし)。
   → **A**: useCallPopout/useCallPopin に native ガード + CallControls の popout ボタンを
   native では非描画 (M3 の再親子付けで置き換えるまで popout 非提供)
2. **[major] `openCallView(completeWidgetUrl)` の URL 検証責務が契約に未記載** — URL は低信頼側
   (cinny レンダラ) が組み立てるのに、特権側 (main) が無検証で loadURL する契約になっていた。
   → **C**: 契約コメントに「シェルは EC dist の既知 base への assertSameOrigin/prefix 検証必須」
   を明記 + design doc の step 3b 実装要件に採録
3. **[minor] useCallSpeakers の `callEmbed.iframe.contentWindow?...` が `.iframe` 無ガード** —
   現状は到達不能だが将来の変更で TypeError が再発し得る。→ **B**: `.iframe?.` に修正
4. **[minor] リスナー登録順序の暗黙不変条件が未文書化** (ClientWidgetApi 同期構築が
   openCallView より先行することで host-ready 合図を不要にしている) → **D**: 契約コメント化
5. **[minor] NativeCallControlAction 7 語彙が prototype 現行 (`toggleTarget` のみ) と不一致で
   ある旨の注記漏れ → **E**: 注記追加 + design doc step 3b 要件に採録

## 記録事項 (差し戻し対象外、3b/3c へ引き継ぎ)

- **カテゴリ B の optimistic 状態は実 DOM とズレても補正されない** (3a の暫定仕様)。
  call view preload からの state push 再同期を 3b で実装し、受け入れ条件に含める
- **sound もカテゴリ B 相当と判明** (web 版は `<audio>.muted` 直接書き込み)。payload 無し
  invoke のため setSoundOn/setSoundOff に action 分離
- 話者ハイライト (useCallSpeakers) は native では不活性に degrade (安全)。代替は M3 以降
- web 版 CallEmbed.ts の `.bind(this)` リスナー leak は既存バグとして別タスク化済み
