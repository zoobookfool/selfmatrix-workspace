# ネイティブ版マイルストーン (M0〜M4)

**状態: 正本** (2026-07-07 制定)。ネイティブアプリ化 ([native-client-rethink.md](../design/native-client-rethink.md)) の
実装を AI (GPT/Claude) に依頼するための大枠。**依頼は原則 1 マイルストーン単位**で、
各マイルストーン開始時に依頼書 (GPT-TASKS 形式、運用者ローカル) を切り出す。
完了の判定はレビュアー (Claude) のレビュー + テストを通過し、この文書の受け入れ条件を満たすこと。

進行の型 (確立済み): **GPT が実装 → Claude がレビュー + 独立再現テスト → 差し戻し or 反映 → 記録**。

## M0: プロトタイプ堅牢化 (レビュー must-fix の消化) — 着手可能

[reviews/claude-review-native-prototype-20260707.md](../reviews/claude-review-native-prototype-20260707.md) の指摘対応。

- widget-protocol CLI を「実装コード (main.cjs / preload) を実際に起動・検証する」形に作り直す (トートロジー禁止)
- bridge に origin / widgetId 検証を実装。同一オリジン前提を起動時 assert 化
- callView の sandbox:true 化 (不可なら理由をコードコメントに)
- 証跡運用の是正: evidence JSON をコミットする (下記「実行可能コードの運用ルール」参照)。
  Electron 既知バグ #47247/#44652 の再現有無を明示クローズ。メモリ 3 点実測 (シェルのみ/通話中/配信視聴中×2)
- design/test-harness.md の stale な「未実施」リスト更新

**受け入れ**: must-fix 5 件全消化。`npm test` が実装の回帰を実際に検知できることをレビュアーが確認。

## M1: 通話コアの成立 (スパイク完了 → 正式 GO/NO-GO)

- **NativeWidgetTransport / NativeCallHost アダプタ**: cinny の ClientWidgetApi/CallWidgetDriver
  (iframe.contentWindow 前提) を WebContentsView に接続する層。ここが最大の未検証リスク
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

## M2: 案 A の製品化 (selfmatrix-desktop リポジトリ新設 — 要運用者承認)

- リポジトリ作成 + native-prototype からの卒業 (workspace 側はアーカイブ)
- cinny 同梱 (hashRouter=true 切替、homeserver 設定の焼き込み)、EC 同梱
- 画面共有のソース選択 UI (Discord 風サムネイル) + system audio トグル
- デスクトップ作法: 通知、**トレイ常駐 (閉じる = 最小化、終了はトレイメニュー — 確定済み)**、自動起動
- About 画面 (AGPL: ソース入手先・fork 元・変更概要・ライセンス全文)、アプリ名・アイコン
- リリース CI: electron-builder + GitHub Actions → Releases、electron-updater
  (allowDowngrade 無効、Artifact Attestation)、SmartScreen 突破手順書
- 通話中は更新を保留する等の自動更新の実運用ルール

**受け入れ**: インストーラから dev/本番へ接続して通話一式が動く + 自動更新の実機確認 +
Electron セキュリティ MUST (contextIsolation / preload 最小 / sandbox) の監査 PASS。

### M2 の前提決定 (2026-07-07 運用者確定)

1. **対応 OS: Windows のみ**で開始 (mac/Linux はビルドすら当面用意しない)
2. **閉じるボタン = トレイ常駐** (Discord 風。終了はトレイメニューから)
3. **音声付き配信**: システム音声 (全体ミックス) は要件化 — web の画面全体共有で可能だった水準を
   どのソースでも使えるように。**アプリ単位の音声は M1 スパイクの結果を見て判断** (上記)
4. **配布: public GitHub Releases で確定**。付帯する検討事項は下記

### public 配布に伴う検討事項 (M2 で対応)

- **実ドメインの焼き込み問題**: homeserver 固定のクライアントは接続先ドメインを内包する。
  「public リポジトリに実ドメインを書かない」ルールとの折り合いとして、**ソースには載せず
  CI ビルド時に注入** (リポジトリ secrets → ビルド引数) を推奨。バイナリ内に文字列として
  残ることは許容 (連合で公開されているサーバーであり、文書で宣伝しないというルールの精神は保てる)
- **改造バイナリの再配布リスク**: 無署名なので真正性の機械的検証はできない。友達には
  「公式 Releases 以外から取らない」を案内し、リリースノートに SHA256 を掲載 (信頼の根は
  GitHub アカウント — 2FA / protected tag / Artifact Attestation は M2 チェックリスト記載済み)
- **SmartScreen / AV 誤検知**: 無署名 Electron は誤検知されやすい。手順書での案内 +
  誤検知時の Microsoft への申告を運用に含める
- **第三者の DL**: バイナリは誰でも取れるが、アカウントが無ければ実質使えない (招待トークン制)。
  ログイン試行はレート制限が既存。公開 Issue にサポート境界を明記 (友達サークル向けである旨)

## M3: 案 B の統合 (無再接続の窓体験を製品に)

- WebContentsView 分離を selfmatrix-desktop の製品コードへ
- [call-window-mode.md](../design/call-window-mode.md) v1.4 の UI 合意を実装
  (既定 = 別ウィンドウ、二層設定、閉じる = 退出、別窓では EC フッター表示、窓サイズ/位置記憶)
- 途中ポップアウト/戻すも無再接続化 (web 版の ~1.4 秒再接続の撤廃)

**受け入れ**: 通話中の窓出し入れ 10 往復で切断ゼロの E2E + UI 合意との突き合わせレビュー。

## M4: 移行と web 版の撤収

- 友達向け移行ガイド (新デバイスの E2EE 検証、recovery key 事前確認、インストール手順)
- バージョン強制/警告の方針実装、外部ミュート制御 (Stream Deck) の設計着手
- web 版並走 → 廃止 (chat.* vhost / cinny コンテナの畳み方、廃止基準)
- requirements §7 全面改訂・roadmap 新フェーズ化・関連文書の整理

**受け入れ**: 友達 1 人以上が手順書だけでインストール・通話できる。web 版停止後も運用が回る。

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
