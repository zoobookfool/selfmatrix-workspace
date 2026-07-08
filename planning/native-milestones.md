# ネイティブ版マイルストーン (M0〜M4)

**状態: 正本** (2026-07-07 制定)。ネイティブアプリ化 ([native-client-rethink.md](../design/native-client-rethink.md)) の
実装を AI (GPT/Claude) に依頼するための大枠。**依頼は原則 1 マイルストーン単位**で、
各マイルストーン開始時に依頼書 (GPT-TASKS 形式、運用者ローカル) を切り出す。
完了の判定はレビュアー (Claude) のレビュー + テストを通過し、この文書の受け入れ条件を満たすこと。

進行の型 (確立済み): **GPT が実装 → Claude がレビュー + 独立再現テスト → 差し戻し or 反映 → 記録**。

## M0: プロトタイプ堅牢化 (レビュー must-fix の消化) — **完了 (2026-07-07、コミット 4c82206)**

[reviews/claude-review-native-prototype-20260707.md](../reviews/claude-review-native-prototype-20260707.md) の指摘対応。

- widget-protocol CLI を「実装コード (main.cjs / preload) を実際に起動・検証する」形に作り直す (トートロジー禁止)
- bridge に origin / widgetId 検証を実装。同一オリジン前提を起動時 assert 化
- callView の sandbox:true 化 (不可なら理由をコードコメントに)
- 証跡運用の是正: evidence JSON をコミットする (下記「実行可能コードの運用ルール」参照)。
  Electron 既知バグ #47247/#44652 の再現有無を明示クローズ。メモリ 3 点実測 (シェルのみ/通話中/配信視聴中×2)
- design/test-harness.md の stale な「未実施」リスト更新

**受け入れ**: must-fix 5 件全消化。`npm test` が実装の回帰を実際に検知できることをレビュアーが確認。

**完了 (2026-07-07、Claude 実装 4c82206)**: GPT の 1 次対応 (9b45b6b) を受け入れレビューで
差し戻し ([reviews/claude-review-m0-20260707.md](../reviews/claude-review-m0-20260707.md)) 後、
Claude が残りを実装。純関数を widget-bridge-protocol.cjs へ分離し main.cjs は委譲、CLI が応答内容を
検証、assert の実呼び出し経路をテスト、sourceIsSelf 必須化、拒否メッセージを pass 判定から除外
(acceptedWidgetMessages)、npm test 追加、記載場所是正、Playwright 証跡保存。
**受け入れ条件クリア: 変異バッテリー a〜f 全て npm test で検知されることを実測。**
次は M1 (実 LiveKit join + NativeWidgetTransport アダプタ + アプリ単位音声スパイク)。

## M1: 通話コアの成立 (スパイク完了 → 正式 GO/NO-GO)

設計は [design/native-widget-transport.md](../design/native-widget-transport.md) が正本 (2026-07-07 制定)。

**進捗**: 検証 step 1 (A 単体 = 実 ClientWidgetApi + 実 EC dist のハンドシェイク実証) は
**2026-07-07 完了** — matrix-widget-api@1.16.1 無改造の iframe シム + 素通しルータで
supported_api_versions 14 件 / capabilities 53 承認 / content_loaded ack を証跡化
(native-prototype/evidence/handshake-result.json)。受け入れは変異バッテリー 6 種全検知
([reviews/claude-review-m1-step1-20260707.md](../reviews/claude-review-m1-step1-20260707.md))。
step 2 (B 単体 = CallControl の DOM 移設。RPC + MutationObserver + registerPreloadScript) も
**2026-07-07 完了** — マイク/ビデオは widget action と判明し DOM 対象が縮小、(B) リスク高→中
([reviews/claude-review-m1-step2-20260707.md](../reviews/claude-review-m1-step2-20260707.md))。
step 3a (cinny 側 native/ 4 ファイル + ファクトリ分岐) も **2026-07-07 完了** — cinny fork の
`spike/native-shell` ブランチ (6777ec0)、typecheck/build green、popout は native ではガード
([reviews/claude-review-m1-step3a-20260707.md](../reviews/claude-review-m1-step3a-20260707.md))。
step 3b (シェル側の契約適合: URL 検証ゲート / EC 配信エイリアス / cinny トップフレームモード /
7 語彙 preload 実装 / state push 再同期) も **2026-07-07 完了** — cinny c97532f + workspace
本コミット、変異 4 種全検知
([reviews/claude-review-m1-step3b-20260707.md](../reviews/claude-review-m1-step3b-20260707.md))。
step 3c-1 (実ログイン → 実 LiveKit join E2E) も **2026-07-08 完了** — cinny-shell モードで
cinny 実 UI ログイン → NativeCallEmbed → EC が WebContentsView 内で実 LiveKit 接続確立、
4 条件 PASS をレビュアー独立再実行でも確認。実バックエンドでしか見えないシェル実バグ 4 件
(.wasm MIME / router basename / アセット 404 / widgetId 固定) も修正
([reviews/claude-review-m1-step3c1-20260708.md](../reviews/claude-review-m1-step3c1-20260708.md))。
step 3c-2/3c-3 (2 ユーザー通話 + 配信 + **窓移動 3 往復無再接続** + 7 語彙実 DOM + localStorage
契約の live 化) も **2026-07-08 完了** — cinny b97da94 + workspace 本コミット。
**M1 受け入れ条件「dev スタックで 2 ユーザー通話 + 配信 + 無再接続の窓往復が E2E で PASS」成立**
(レビュアー独立再実行込み、[reviews/claude-review-m1-step3c23-20260708.md](../reviews/claude-review-m1-step3c23-20260708.md))。
step 3c-4 (system audio + アプリ単位音声スパイク) も **2026-07-08 完了** —
system audio (loopback) は実測 PASS (audio track "System audio" が live、
native-prototype/evidence/system-audio-result.json。EC は配信時に常に audio を要求する形状
であることもソースで確認)。アプリ単位音声は Electron 43 に per-process の口が無いことを
API リフレクション実測 + 文書で確認し、WASAPI プロセスループバックの自作は工数中〜大 →
**推奨 LATER** ([spikes/app-audio-capture-spike.md](../spikes/app-audio-capture-spike.md)、
運用者判断待ち)。

### M1 完了 (2026-07-08) — 案 B 正式 GO (2026-07-08 運用者承認)

受け入れ条件「dev スタックで 2 ユーザー通話 + 配信 + 無再接続の窓往復が E2E で PASS」は
**成立** (レビュアー独立再実行込み)。技術面の裏付け: matrix-widget-api 無改造の iframe シム /
CallWidgetDriver 無改造 / cinny 差分は native/ 4 ファイル + 最小接続 / 配信中の窓移動 3 往復
無再接続 (実 contentView 遷移の積極的証拠つき) / localStorage 契約の live 化 / system audio 実測。
**案 B は 2026-07-08 に運用者が正式 GO を承認**。アプリ単位音声は
**OBS (Application Audio Capture = WASAPI プロセスループバック) を参考にした再調査を実施済み**
(2026-07-08、spikes/app-audio-capture-spike.md 更新済み。工数中・M3 以降推奨)。
次は M2 (selfmatrix-desktop の製品化) — **2026-07-08 に運用者承認・リポジトリ新設・開始済み**。

- **NativeWidgetTransport / NativeCallHost アダプタ**: cinny の ClientWidgetApi/CallWidgetDriver
  (iframe.contentWindow 前提) を WebContentsView に接続する層。設計分析の結果、
  (A) widget-api transport (低リスク: iframe シムで matrix-widget-api 無改造) と
  (B) CallControl の DOM スクレイピング移設 (高リスク: WebContentsView は DOM 非公開のため
  call view preload への移植 + RPC 化が必須。Phase 2b の Discord 風コントロールバー全部が対象)
  の 2 系統に分解された。**(B) を M1 スコープに明示的に含める**
- 実 dev MatrixRTC/LiveKit への join (テスト用スタブではなく本物の通話)
- **共有中・通話中の view 移動** (メイン⇔別窓) で無再接続を実証
- session partition / localStorage 契約 (画質ピッカー等) が分離後も生きることの実機確認
- system audio (loopback) 付き配信の実機確認 — ※loopback は「システム全体ミックス」。
  web 版でも画面全体共有なら可能だった点に注意 (Electron の利得は「どのソースでも載る」こと)
- **アプリ単位の音声キャプチャのスパイク** (Discord の本命機能。2026-07-07 運用者指示):
  (a) Chromium のウィンドウ音声キャプチャ (Windows) を Electron 43 が継承しているか、
  (b) 不可なら WASAPI プロセスループバック (Windows 10 2004+) のネイティブモジュール自作の実現性。
  結果を要件化の判断材料にする

**受け入れ**: dev スタックで 2 ユーザー通話 + 配信 + 無再接続の窓往復が E2E で PASS。
ここで**案 B の正式 GO/NO-GO を判断** (NO-GO なら fallback = web 版 call-window-mode 実装に戻す)。

> **用語注意**: ここでの「案 B」は **native の WebContentsView 再親子付けで無再接続の窓移動を
> 実現する技術方式** ([native-client-rethink.md](../design/native-client-rethink.md))。
> web 版 [call-window-mode.md](../design/call-window-mode.md) の「案 A/B/C」(参加導線の UX 検討) とは
> **別物**。M3 の Discord 準拠ポップアウトはこの技術方式の案 B に依存する (廃止されるのは web 版の
> UX 案の方)。

**M1 受け入れ時の全体レビュー指摘 (2026-07-08 Fable + GPT。当時の記録。★は解消済み)**: 受け入れ条件
(通話コアの技術成立) は満たした上で、完成度に関する 2 点が指摘され、いずれも**その後解消済み**:
- ★**解決済み**: 実 cinny UI 上でのビデオ位置/サイズ追従 (bounds 同期) は M1 受け入れ時点で未検証
  だったが、**bounds 同期を実装し E2E boundsSync で ≤1px 追従を実測** (cinny 761b2e0b)。下記 M2 節参照。
- ★**解決済み**: 7 語彙のうち production 配線 (button→RPC) を実 UI クリックで検証したのは当初 screenshare
  のみだったが、**realClickVocabulary で残り (spotlight/emphasis/settings/sound) も実クリック駆動を検証**
  (cinny 9ba251ca)。変異でも production 配線の検証になっていることを実証済み。

## M2: selfmatrix-desktop の製品化 (開始済み、2026-07-08 運用者承認)

**web/native 併走が前提** ([web-native-parallel.md](web-native-parallel.md))。M2 は native ビルド
パイプラインの新設であり、web ビルドは既存のまま継続する。

- リポジトリ作成 + native-prototype からの卒業 — **ローカル完了 (2026-07-08)**:
  `DiscordSub/selfmatrix-desktop` に scaffold + 移植 + sibling パス化の 3 コミット。
  npm test (3 smoke) + e2e:join + e2e:callflow を新位置から全 green で検証済み。
  GitHub リポジトリは **2026-07-08 に運用者が作成し push 済み**
  ([zoobookfool/selfmatrix-desktop](https://github.com/zoobookfool/selfmatrix-desktop))。
  workspace 側 native-prototype はアーカイブ化済み (コード凍結、M0〜M1 の検証履歴として保存)。
  `spike/native-shell` を製品ブランチへ統合し、native コードは**ビルドフラグ配下**に置く (R2/R4)
- cinny 同梱 (hashRouter=true 切替、**homeserver は選択制** — 下記参照)、EC 同梱
- 画面共有のソース選択 UI (Discord 風サムネイル) + system audio トグル

### M2 セキュリティ / 実装の必須項目 (2026-07-08 の 2 レビューで確定)

M1 の全体レビュー (Fable) + GPT レビューで、prototype→製品化の際に必ず塞ぐ項目が確定した:

- **[MUST→完了 2026-07-08] web ビルドの native 分岐無効化** (Fable sec-critical #1 /
  [web-native-parallel.md](web-native-parallel.md) R2): `VITE_SELFMATRIX_NATIVE` (vite --mode native)
  でゲートし、web ビルドでは native 識別子が dist から完全に消えることを grep 実測 (cinny 0439af23)。
  native ビルドは `npm run build:native` (desktop の配信前提もこれに更新)。
  **注意: web 本番が実際に守られるのは spike/native-shell を product ブランチへ統合して
  デプロイした時** (統合は M2 の既存項目)
- **[MUST→完了 2026-07-08] bounds 同期チャンネル** (Fable arch-major #4): `setCallViewBounds`
  契約を追加し実装済み (cinny 761b2e0b + workspace)。E2E boundsSync で初期一致/リサイズ追従/
  チャット開閉追従/detach 中無視/復帰再一致を全て ≤1px で実測 (許容 ±3px)。
  M3 引き継ぎ: 別窓 (detached) 中のレイアウトは callWindow 側の責務 (attach/detach は cinny の
  DOM に見えないため、復帰時の再 push はレイアウト変化起点で行う)
- **mainWindow のナビゲーション封じ込め** (Fable sec-critical #2): **暫定対応済み**
  (desktop 0db93ed、GPT M2 readiness B)。同一オリジンでも `/ec/` `/public/element-call/`
  `/vendor/` への document 遷移を block、cinny-shell-smoke に `/ec/` 遷移 block の回帰検証あり。
  **残る M2 監査項目**: shell window の `sandbox:false`、常時公開の
  `getStatus/ensureCallView/detach/attach` の API 露出面整理 (claim-once / 契約整理。
  Fable arch-minor / GPT「次にやるなら #3」)
- **[SHOULD] CallControl DOM 監視の再マウント耐性** (GPT P2): `ensureBodyObserver()` は
  `document.body` を `subtree:false` で監視しており、EC の React 深い再マウント (設定モーダル・
  レイアウト切替・配信開始停止・ロビー⇔通話遷移) で古い要素を監視し続ける恐れ。`subtree:true` 化 or
  invoke 前の対象取り直し + 状態 push の回帰テスト
- **[SHOULD] 通話跨ぎの回帰テスト**: 同一プロセスで join → close/hangup → 再 join の経路
  (preload 重複登録・claim キャッシュ・localStorage 再プライム等が壊れない)
- デスクトップ作法: 通知、**トレイ常駐 (閉じる = 最小化、終了はトレイメニュー — 確定済み)**、自動起動
- About 画面 (AGPL: ソース入手先・fork 元・変更概要・ライセンス全文)、アプリ名・アイコン
- リリース CI: electron-builder + GitHub Actions → Releases、electron-updater
  (allowDowngrade 無効、Artifact Attestation)、SmartScreen 突破手順書
- **自前署名による更新検証** (下記「配布物の完全性 — 多層対策」の第 4 層): minisign (Ed25519) の
  オフライン鍵ペアを運用者が生成し、リリース毎に手元で署名 → アプリは埋め込み公開鍵で更新物を
  検証してから適用 (electron-updater の公式フック `verifyUpdateCodeSignature` を差し替え。
  参考実装: Doyensec ElectronSafeUpdater 2026-02)
- 通話中は更新を保留する等の自動更新の実運用ルール

**受け入れ**: インストーラから dev/本番へ接続して通話一式が動く + 自動更新の実機確認 +
Electron セキュリティ MUST (contextIsolation / preload 最小 / sandbox) の監査 PASS。

### M2 の前提決定 (2026-07-07 運用者確定)

1. **対応 OS: Windows のみ**で開始 (mac/Linux はビルドすら当面用意しない)
2. **閉じるボタン = トレイ常駐** (Discord 風。終了はトレイメニューから)
3. **音声付き配信**: システム音声 (全体ミックス) は要件化 — web の画面全体共有で可能だった水準を
   どのソースでも使えるように。**アプリ単位の音声は M1 スパイクの結果を見て判断** (上記)
4. **配布: public GitHub Releases で確定**。付帯する検討事項は下記
5. **homeserver は選択制** (2026-07-07 運用者確定): アプリに自サーバーを焼き込まず、
   **接続先はユーザーが手入力**する。候補として提示するのは matrix.org (Matrix 公式) のみ。
   → 自サーバーのドメインは**リポジトリにもバイナリにも一切残らない**。友達には招待トークンと
   同様にサーバー URL を別途手渡す。cinny の既存のホームサーバー選択 UI を使う (固定と hideExplore を外す)。
   要件 §7「全員同じ改修クライアント」は「クライアントは配布物・接続先は各自が入力」に分離して維持

### public 配布に伴う検討事項 (M2 で対応)

- **実ドメインの焼き込み問題 → 解決済み** (決定 5): homeserver を選択制にしたので、自サーバーの
  ドメインはソースにもバイナリにも入らない。焼き込み案 (CI 注入) は不要になった
- **配布物の完全性 — 多層対策** (2026-07-07 拡充。「GitHub から取る」以上の対策として):
  1. 基本衛生: GitHub アカウント 2FA、protected tag、CI 権限最小化 (記載済み)
  2. **GitHub Artifact Attestation** (public リポジトリは無料): CI がビルド由来証明を発行し、
     `gh attestation verify <file> --repo <owner>/<repo>` で「この公開ソースからこのワークフローが
     ビルドした」ことを暗号学的に検証できる。注意: 検証には gh CLI のログインが必要 (匿名不可)
  3. **SHA256SUMS の二系統掲載**: リリースノートに加え、Matrix の運用ルームにも掲示 (out-of-band)。
     GitHub 単独の改ざんでは両方を揃えられない
  4. **minisign (Ed25519) 自前署名 + アプリ内更新検証 — 本命**: 秘密鍵は運用者の手元のみ
     (GitHub には置かない)。リリース = CI ビルド → 運用者が手元署名 → .minisig を添付。
     アプリは公開鍵埋め込みで更新物を検証してから適用する。
     **これにより GitHub アカウントが完全に乗っ取られても自動更新経由で改造バイナリを配れない**
     (無署名運用で欠けていた「GitHub 非依存の信頼の根」を無料で作れる)。
     初回インストールのみ trust-on-first-use — 手順書で 2/3 の確認を案内
  5. LATER: winget 登録 (無署名可・SHA256 ピン留めが第三者リポジトリで審査される + `winget install`
     の導入容易化)、reproducible build 手順の文書化 (誰でも再ビルドしてハッシュ照合できる状態)
  - **検討済み・不可**: Azure Trusted Signing (現 Artifact Signing) は個人開発者は米国・カナダ限定
    (2026-06-22 更新の公式 FAQ で確認)。日本の個人は利用不可のため選択肢から除外
- **SmartScreen / AV 誤検知**: 無署名 Electron は誤検知されやすい。手順書での案内 +
  誤検知時の Microsoft への申告を運用に含める
- **第三者の DL**: バイナリは誰でも取れるが、アカウントが無ければ実質使えない (招待トークン制)。
  ログイン試行はレート制限が既存。公開 Issue にサポート境界を明記 (友達サークル向けである旨)

## M3: Discord 準拠の窓体験 (無再接続ポップアウト) — 2026-07-07 方針変更で再定義

web 版で検討した「既定 = 別ウィンドウで参加」(call-window-mode v1.4) は**再接続回避のための
回避策**だったため、無再接続が成立するネイティブでは廃止し **Discord 準拠に戻す** (運用者決定)。
requirements に予定していたパリティ例外の記録も不要になった。

- 通話は**メインウィンドウで参加** (Discord と同じ)
- **⧉ ポップアウト**: WebContentsView 再親子付けで通話 view を別窓へ**無再接続**で移動。
  「メインに戻す」も無再接続。**別窓を閉じる = メインに戻る (通話継続)** — 退出は明示操作のみ
  (web 版の「閉じる = 退出」は再接続制約由来だったため、これも Discord 準拠へ)
- 別窓には EC フッターを表示 (窓内で操作が完結)、窓サイズ/位置は端末ローカルに記憶
  (call-window-mode v1.4 からの引き継ぎ合意)
- 最前面ピン留めは LATER (`setAlwaysOnTop` で容易になったが、要否は実機ドッグフーディングで判断)
- **作らないもの**: 開き方の設定 (このウィンドウ/別ウィンドウ・毎回選ぶ・二層保存) — 回避策のための
  設定だったので不要。ポップアップブロッカー対策も不要 (ネイティブ窓にブロッカーは存在しない)

**受け入れ**: 通話中の窓出し入れ 10 往復で切断ゼロ + 別窓クローズでメイン復帰 (通話継続) の E2E +
Discord 実機録画 (2026-07-07 取得済み) との挙動突き合わせ。

## M4: web/native 2 系統の定常運用の確立 (2026-07-08 方針変更で「web 撤収」を撤回)

**web は撤収しない** — モバイル/Mac への広い受け皿として現役継続する
([web-native-parallel.md](web-native-parallel.md))。M4 は「撤収」から「2 系統の定常運用の確立」へ:

- 友達向けインストールガイド (native: 新デバイスの E2EE 検証、recovery key 事前確認、インストール手順。
  web: 従来どおり URL アクセス)
- 外部ミュート制御 (Stream Deck) の設計着手 (native 側)
- **フィーチャーマトリクスの維持** (web-native-parallel.md R3) と、リリース同期ルールの定常化
- R2 (web ビルドの native 分岐無効化) の恒久化を CI に組み込む
- requirements §7 は「配布物 2 系統・機能パリティは capability ベース」へ改訂済み (下記) を維持

**受け入れ**: 友達 1 人以上が手順書だけで native をインストール・通話でき、かつ別の友達が web で
同じ会話・通話に参加できる (2 系統併走が実運用で回る)。

---

## 実行可能コードの workspace 運用ルール (2026-07-07 運用者承認)

発端: 運用者「ネイティブ版だとテスト大変そうだし、workspace にテスト用の web 版/CLI 版が欲しい」。
docs 専用だった workspace に、**製品リポジトリへ切り出す前段の prototype / test-harness に限り**
実行可能コードを置くことを正式に認める。条件:

1. **置けるのは検証入口だけ**: prototype / test harness / probe。製品コードは fork または
   専用リポジトリへ (M2 で selfmatrix-desktop へ卒業し、workspace 側はアーカイブ)
2. **秘匿情報禁止** (public リポジトリ)。実ドメイン・IP・認証情報・個人環境固有パスの
   ハードコードは既定値でなく環境変数で
3. **証跡 (evidence JSON 等) はコミットする** — 「実測済み」の主張は repo 単体で追試・検証
   できること。実測を生成したプローブコードも必ず残す
4. **テストは実装を呼ぶ** — 実装コードを経由しない自己完結アサーション (トートロジー) を
   合否判断の根拠にしない
5. **依存は固定** (Electron 等のバージョン + lockfile コミット)。Electron セキュリティ MUST
   (contextIsolation / preload 最小 / sandbox) は prototype 段階から適用
6. CI もブランチ保護も無い場所なので、push 前の手元ゲート (npm test + smoke) は実装者の責務
