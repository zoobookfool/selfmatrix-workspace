# M1 step 3b 受け入れレビュー: シェル側の nativeBridge 契約適合 (Claude 実装分)

レビュアー: Claude。方式: 2 視点並列レビュー (契約整合+テスト健全性 / セキュリティ・URL 検証) +
**変異バッテリー 3 種の逐次実測** (実装者の自己検証とは別の変異点を選択) + レビュアー本人の
独立再実測。対象: native-prototype (シェル) + cinny spike/native-shell (契約拡張)。2026-07-07。

## 判定: **条件付き差し戻し → 即日修正 (G1〜G7) → 受け入れ**

## 変異バッテリー結果 (全検知)

| 変異 | 内容 | 結果 |
| --- | --- | --- |
| k | main の openCallView 呼び出し側で URL 検証結果を無視 (関数は無傷のまま配線を殺す — step 1 変異 d と同型) | 検知 (exit 1) |
| l | shell-preload の state 中継受信を no-op 化 | 検知 (exit 1) |
| m | /public/element-call/ エイリアス route を 404 化 | 検知 (exit 1、content_loaded 不達) |
| (G3 検証) | 7 語彙の switch case 削除 (実装者: toggleScreenshare / レビュアー独立: setSoundOn) | 検知 (unknown_action → vocabulary ゲートで exit 1) |

## must-fix と対応 (G1〜G7、全対応済み)

1. **[critical] `fireAndForgetInvoke()` が RPC 結果の ok を見ずに楽観更新を確定** —
   preload は対象未検出を `{ok:false, reason:"target_not_found"}` の **resolve** で返す契約
   なので、`.then()` 到達 = 成功ではない。特に toggleSound は失敗時も「成功した」前提で
   `toggleMicrophone()` を連鎖発火し**実際にマイクを誤ミュートする実害**があった。しかも
   ok:false 経路では補正 push も来ないため恒久的にズレる。→ **G1**: duck-type で
   `ok === true` のときのみ状態更新・連鎖実行
2. **[major] claim-once (プロセス寿命 1 回) と cinny の通話ごと claim が矛盾 → 2 通話目で
   NativeCallEmbed コンストラクタが必ず throw** → **G2**: cinny 側に
   `getOrClaimWidgetTransport` (モジュールキャッシュ) を新設して吸収。シェルの claim-once
   セキュリティ特性は不変。transport はステートレス中継なので通話をまたいだ再利用は安全
3. **[major] 新設 7 語彙をどの自動テストも invoke していない** (「テストは実装を呼ぶ」違反) —
   → **G3**: cinny-shell smoke が 7 action 全てを実 invoke し、`target_not_found` (正) /
   `unknown_action` (分岐欠落 = FAIL) を判別して pass 条件に AND。switch case 削除の変異で
   FAIL することを実装者・レビュアー双方が別 action で実測。※セレクタと実 in-call DOM の
   一致検証は step 3c スコープ (evidence に明記)
4. **[minor] sound だけ push 再同期の対象外で非対称** → **G4**: push 形状と cinny 側マージに
   sound を追加 (実測 muted 状態、audio 0 件時はフィールド省略)
5. **[minor] runSmoke の call-control 待機が実測 9.95s / 既定 10s でフレークの温床** →
   **G5**: 20s に明示拡張
6. **[minor] preloadErrors が evidence サニタイズ対象外** (preload 例外時に絶対パスが
   コミットされ得る) → **G6**: 捕捉時点で basename + message のみに
7. **[minor] call view に初回ロード後のナビゲーション制限が無い** (URL 検証は最初の loadURL
   にしか効かない) → **G7**: will-navigate / will-redirect を validateCallViewUrl で検証
   (不合格は preventDefault + 記録)、window.open は常に deny

## 確認できたこと (再作業不要)

- 契約 (openCallView / closeCallView / callControlInvoke / onCallControlState) の
  cinny⇔シェル間の形状・チャンネル一致。widgetHostReady ゲート撤廃は ClientWidgetApi
  同期構築 → openCallView の順序で安全 (両側の実コードで確認)
- 悪性 URL 拒否判定は「記録の有無」ではなく callView / navigationEvents の実態を見ている
- validateCallViewUrl は `new URL` パース + origin 厳密比較 + pathname prefix で、
  ドットセグメント等の机上バイパス検討でも抜けを発見できず
- レビュアー独立実行: 3 ゲート (native-prototype npm test = smoke+memory+cinny-shell-smoke /
  test-harness / cinny typecheck) 全 exit 0、vocabulary 7/7 pass、秘匿情報スイープクリーン

## step 3c への引き継ぎ

- 7 語彙のセレクタが実 in-call DOM (dev バックエンド + 実通話) で機能すること
- NativeCallControl の push 再同期が実通話で働くこと (受け入れ条件)
- cinny-shell モードでの実ログイン → 通話開始 → NativeCallEmbed 経由の実ハンドシェイク
