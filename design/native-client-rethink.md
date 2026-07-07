# クライアントのネイティブアプリ化 — 要件の再定義 (検討、2026-07-07)

**ステータス: 検討ドラフト v0.2** — 運用者の方針転換提案を受けた要件の練り直し。
複数の AI (Claude / GPT 等) と運用者で議論するための土台。合意後に requirements.md と roadmap.md を改訂する。
次の判断ゲートは [desktop-window-spike.md](../spikes/desktop-window-spike.md)。
この文書は**単体で読める** — リポジトリや過去の経緯を参照できない読者でも、ここから検討に参加できることを意図している。

## 1. 前提知識 (このプロジェクトを知らない読者向け)

- **SelfMatrix** は Matrix プロトコル上に Discord 代替のチャット + 通話 (音声 + 画面配信特化、カメラなし)
  体験を作る個人プロジェクト。参加者は運用者の友人サークル (~10 人規模)
- **サーバー側**: 自宅サーバーの Synapse (Matrix ホームサーバー) + PostgreSQL にデータを自己保有し、
  VPS に通話用 SFU (LiveKit) を置く。**サーバーを持つ本来の目的は「データの所有」**
  (プラットフォームの BAN でチャット履歴・メディア・在籍記録が消えない構造) と連合上のアカウント所有
- **クライアント側 (現状)**: 2 つのフォークの組み合わせを **web アプリとして自前ホスト**している
  - **cinny フォーク** = シェル (Discord 風のサーバー/チャンネル UI、チャット、通話コントロール)。
    React 製。日本語化 (~1,500 キー)、Discord 風テーマ、通話ポップアウト、初回セットアップ等を実装済み
  - **Element Call (EC) フォーク** = 通話画面本体。cinny のページ内に iframe (Matrix widget) として埋め込み。
    4K60 配信、画質/FPS ピッカー、視聴オプトイン、強調選択、RNNoise ノイズ抑制等を実装済み
  - 参加者全員がこの改修版クライアントを使う前提 (他クライアントとの互換性は考慮しない、が既存要件)
- **web 版ゆえの制約に繰り返し当たっている**:
  1. 通話 (widget iframe) を別ウィンドウへ移すとブラウザ仕様で必ずリロード → ポップアウトに ~1.4 秒の再接続
  2. ウィンドウの最前面固定 (ピン留め) の API が web に無い
  3. グローバルホットキー (プッシュトゥトーク等) が作れない
  4. Discord (Electron 製ネイティブアプリ) はこれらを全部やってのける — 参考録画で確認済み

## 2. 方針転換の提案 (運用者、2026-07-07)

> サーバーを持つのは**データのため**であって、クライアントを配信・管理するためではない。
> クライアントはネイティブアプリにした方がアクセス制御も楽になる。
> web 版は「他の Matrix web クライアントを使えばいい」で終わる話。

これに伴う個別判断 (運用者確定):

| 論点 | 判断 |
| --- | --- |
| 配布・更新 | **GitHub Releases + 自動更新** (electron-updater 等)。これで困ることはないだろう |
| コード署名 | **やらない**。ただし自動更新する以上、利用者が毎回ソース確認する前提には置かない。GitHub Actions / Releases / artifact checksum / release 保護を信用境界として設計する。Windows SmartScreen の警告は初回インストール時の案内で対応 |
| 最前面ピン留め | 対応できたら嬉しいが**必須ではない** |
| プッシュトゥトーク | **必須ではない**。それよりも**外部アプリからのミュート制御** (Stream Deck 対応のような外部連携) が欲しい |
| web 版の自前ホスト | 廃止方向。web で使いたい人は既存の Matrix web クライアントをどうぞ、という整理 |

### 「アクセス制御が楽になる」の中身 (整理)

- 自前ホストの web クライアントは**誰でもログイン画面まで到達できる公開面**であり、守る対象が 1 つ増えている。
  ネイティブ配布ならこの公開面が消え、サーバーの公開面は Matrix API (連合 + client-server API) だけになる
- クライアントのバージョン管理が「サーバーのデプロイ + ブラウザキャッシュ」から「配布物の自動更新」に
  一本化される (全員が改修版クライアント前提の本プロジェクトでは、むしろ配布制の方が前提に合う)
- 注意: GitHub Releases が public な限り**バイナリ自体は誰でも取得できる**。アクセス制御の実体は今までどおり
  ホームサーバーの認証 (招待トークン制の登録 + パスワード) であり、配布制限ではない — ここは誤解しないこと
- 注意: コード署名なしで自動更新を行う場合、「確認は各自で」は初回導入時の透明性であって、
  更新ごとの安全性を保証しない。更新経路の信頼は GitHub organization / protected branch / protected release /
  CI workflow / checksum・provenance の管理に寄せる

## 3. 論点 1: Cinny (fork) はまだ必要か?

**結論の提案: 必要。ただし役割が「ホストされる web アプリ」から「ネイティブアプリの UI 資産」に変わる。**

ネイティブ化の現実解は Electron (または Tauri) であり、**中身は web 技術のまま**。つまり:

- cinny フォークに積んできた資産 (Discord 風シェル、日本語化 ~1,500 キー、通話コントロール、
  ポップアウト、初回セットアップ、EC との連携機構) は**そのまま新アプリの中身になる**。捨てるものがない
- 逆に cinny を捨ててゼロから作る場合、チャット UI・E2EE (デバイス検証・鍵バックアップ)・sync・
  ルーム/スペース管理・設定画面を全部再実装することになる。過去の検討 (2026-07-06「ホントに Cinny いる?」)
  で「fork 全体 ~77 万行に対し自作部分 ~5%、再実装は数ヶ月規模」として fork 継続を決めた判断が、
  ネイティブ化後も同じ構図で当てはまる
- 先行例: **Element Desktop = element-web を包む薄い Electron シェル**。同じ型で
  「selfmatrix-desktop = cinny フォークを包むシェル」が作れる (実績ある構成)

つまり「Cinny 必要?」の答えは「**web 版のホスティングが不要になるだけで、Cinny フォーク自体は
新アプリの本体として続投**」。EC フォーク (通話画面) も同様に続投。

## 4. 論点 2: アーキテクチャの選択肢

| 案 | 内容 | 得られるもの | コスト | 評価 |
| --- | --- | --- | --- | --- |
| **A. Electron シェル + 現行 cinny をローカル同梱** | Element Desktop 型。cinny のビルド成果物をアプリに同梱し、Electron で表示 | 配布制・自動更新・公開面の縮小。窓操作はまず web 版と同等 | 小 (新規リポジトリ 1 つ + ビルド CI) | **第一歩として推奨** |
| **B. A + 通話を WebContentsView 分離** | 通話 widget を Electron の WebContentsView (旧 BrowserView) でホストし、**ウィンドウ間で再親子付け** | **ポップアウト/戻すが真の無再接続に** (web では原理的に不可能だったもの)。最前面ピンも `setAlwaysOnTop` で自明 | 中 (cinny の widget ホスト部の改修 + シェル側の窓管理) | A の次の段階として本命 |
| C. Tauri + 現行 cinny | 軽量 (システム WebView 利用、Chromium 同梱不要) | 配布物が小さい、OS が WebView を更新してくれる | 中 | **WebContentsView 相当の再親子付けが無い**ため、無再接続移動を要件にするなら不採用。B を捨てるなら候補 |
| D. ゼロから native (matrix-rust-sdk 等) | フルスクラッチ | 完全な自由 | 特大 (数ヶ月〜) | 過去の「Cinny いる?」判断と同じ理由で否 |

**推奨: A → B の二段階。** A で配布・更新・公開面縮小をまず成立させ (cinny/EC はほぼ無改修)、
B で「無再接続の窓移動」というネイティブ最大の果実を取る。

### 2026-07-07 初回スパイクで決まった実装前提

[desktop-window-spike.md](../spikes/desktop-window-spike.md) の初回実測では、案 B は **小型 prototype へ進めてよい** と判断した。
ただし production 実装可ではなく、次の前提を守った prototype 着手 GO とする。

1. **Cinny shell と EC bundle は同一 app origin で配信する。**
   EC の `WidgetApi` は `parentUrl` の origin を `postMessage` の `targetOrigin` に使う。
   WebContentsView では `window.parent === window` になるため、call view 自身の origin と `parentUrl` origin が違うと message event が発火せず timeout する。
   ローカル HTTP (`http://127.0.0.1:<port>`) または app custom protocol 等で shell/EC を同一 origin に揃える。
2. **Matrix Widget API は preload/IPC bridge を正式な境界として設計する。**
   DOM iframe の親子関係は消えるため、`window.parent.postMessage` が cinny へ素で届くことはない。
   初回スパイクでは `matrix-widget-api` 1.16.1 の `supported_api_versions` / `content_loaded` と EC 実 bundle の `io.element.device_mute` まで bridge できた。
3. **画面共有 picker は Electron 側で実装する。**
   `session.setDisplayMediaRequestHandler` + `desktopCapturer` で screen source を返し、`1280x720/30fps` から `1920x1080/60fps` への constraints 反映は確認済み。
   Windows loopback audio、共有中 view 移動、LiveKit 送信 track 維持は次 prototype の合格条件に残す。
4. **次の合格条件は実 EC + dev MatrixRTC join。**
   built EC bundle の boot は通ったが、実通話参加・共有中移動・Cinny 実 shell の `ClientWidgetApi` 接続は未確認。

### テスト戦略の追加

ネイティブ版はテストが重くなるため、production app だけで全回帰を確認しない。
[test-harness.md](test-harness.md) に沿って、次の 3 層を先に用意する。

- Web UI harness: 通話 UI、右クリックメニュー、画質/FPS、話者 overlay を Playwright で確認する
- Widget protocol CLI: Matrix Widget API / bridge の action transcript を高速に確認する
- Electron smoke harness: WebContentsView 再親子付け、displayMedia、system audio など OS 境界だけを見る

この harness 整備を、`selfmatrix-desktop` 本実装前の P0 とする。

### 実装 prototype の現在地

`native-prototype/` に Electron 版の小型 prototype を追加した。
これは product repo ではなく、将来の `selfmatrix-desktop` へ切り出す前の検証用実装。

現在できること:

- Cinny build artifact と Element Call build artifact を同一 local origin で配信する
- Shell window で Cinny を iframe 表示する
- EC を iframe ではなく `WebContentsView` として起動する
- preload/IPC bridge で `supported_api_versions` / `content_loaded` / `io.element.device_mute` を受け、ack を返す
- EC view を main window と call window の間で再親子付けする
- shell から `io.element.join` を `toWidget` action として送る
- `session.setDisplayMediaRequestHandler` を登録する

2026-07-07 の smoke では、実 Cinny/EC の local dist を使い、EC boot、Widget API bridge、別窓移動/戻し、`io.element.join` 送信まで PASS。
未確認は Cinny 本体の widget host との直接接続、実 MatrixRTC join、共有中移動、system audio。

### 実装済み設計との関係

- 「別ウィンドウ通話開始モード」(call-window-mode.md v1.4、web 前提で設計済み・実装待ち) は
  **本検討の結論待ちで実装保留を推奨**。案 B が成立すると「最初から別窓で開く」だけでなく
  「いつでも無再接続で出し入れ」になり、設計の前提 (再接続を避けるには最初から別窓しかない) が変わる。
  ただし v1.4 の決定事項 (既定 = 別ウィンドウ、設定の二層保存、閉じる = 退出、EC フッターを窓内表示、
  窓サイズ/位置の記憶) は**ネイティブ版でもそのまま有効な UI 合意**として引き継ぐ

### 補足: ネイティブ化で「Cinny 以外の候補」は増えるか (2026-07-07 調査)

運用者の問い「ネイティブアプリなら fork 参照候補が増えたりしない? Cinny 以外でもっといいのがあるのでは」への調査。

**結論: 実質的には増えない。** 本プロジェクトの通話は MatrixRTC (次世代 Matrix 通話) + Element Call widget +
E2EE という新しいスタックで、**これをサポートするクライアントが世の中にほぼ存在しない**ため。

| 候補 | 種別 | MatrixRTC/EC 通話 | 評価 |
| --- | --- | --- | --- |
| **Element Web / Desktop** | web + 公式 Electron シェル | ○ (EC 統合済み) | 唯一の real な代替。デスクトップ化の型も既製。ただしコードベースが cinny より大きく Discord 風への改造距離が遠い。Phase 2a スパイクで cinny を選んだ理由 (Discord 的な UI への近さ・改造しやすさ) は不変。**乗り換えではなく「cinny 上流が死んだ場合の避難先」として記録** |
| **cinny-desktop (上流)** | cinny 公式の Tauri ラッパー | ○ (中身は cinny) | 「cinny をネイティブ化する」こと自体に上流の前例がある、という材料。ただし Tauri なので案 B (WebContentsView 再親子付け) ができない。参考実装として利用価値あり |
| Element X | モバイル (rust-sdk) | ○ | デスクトップ版が存在しない。モバイル非常口の候補ではある |
| Nheko (Qt/C++) | ネイティブ | × (旧式 1:1 通話のみ) | 通話スタック非対応で不可 |
| Fractal (GTK/Rust) | ネイティブ | × | 同上 + Linux 中心 |
| FluffyChat / Commet (Flutter) | ネイティブ | × 〜 △ | MatrixRTC 未対応/実験的。Discord 風改造の投資も引き継げない |
| フルスクラッチ (matrix-rust-sdk 等) | — | 自作 | 案 D と同じ理由で否 |

つまり「候補が増える」のではなく「**Electron に載せるなら中身は web クライアントであり、
EC 通話が動く web クライアントは実質 element-web と cinny の 2 つだけ**」という構図。
cinny には ~1,500 キーの日本語化・Discord シェル・通話まわりの独自実装を既に積んでおり、
乗り換えはこの投資の再実装を意味する。**cinny fork 続投 + 自前 Electron シェル (案 A→B) が引き続き最適**。

## 5. 新しい要件案 (合意後に requirements.md §7 を書き換えるための素案)

- クライアントは**配布制のネイティブアプリ** (selfmatrix-desktop)。参加者はこれをインストールする `MUST`
  - 対応 OS: Windows を必須、macOS/Linux はビルドは用意するが動作保証は後回し (要議論)
- 配布と更新: **GitHub Releases + アプリ内自動更新** `MUST`。コード署名はしない。
  リポジトリはオープンソースで、検証したい人はソースとビルドを各自確認できる状態を保つ `MUST`。
  ただし自動更新は利用者が毎回確認しない前提のため、次の更新信頼モデルを初期実装から必須にする:
  protected branch/tag、release 作成権限の最小化、CI の権限最小化、artifact の SHA256 checksum、
  provenance / build log の保存、更新メタデータの downgrade 防止、失敗時の安全なロールバック手順。
- **web 版の自前ホストは廃止** (アプリ安定後)。Matrix の連合・API 公開は従来どおり。
  web で使いたい人には既存の汎用 Matrix web クライアントを案内 (ただし本プロジェクト独自機能 —
  配信特化 UI・画質ピッカー等 — は使えない旨を明記) `SHOULD`
- 通話ウィンドウ: 無再接続の出し入れ (案 B、WebContentsView) を目標 `SHOULD`。
  最前面ピン留めは nice-to-have `LATER`
- プッシュトゥトーク `OUT` (不要と判断)。代わりに**外部制御サーフェス**: Stream Deck 等の外部アプリから
  ミュート等を操作できるローカル連携 `SHOULD` — 実現方式は要検討 (候補: ローカル WebSocket/HTTP API、
  OS のカスタム URL スキーム、Stream Deck プラグイン SDK。OBS の obs-websocket が先行例)
- セキュリティ運用: Electron/Chromium のセキュリティ更新に自動更新パイプラインで追従する体制を
  リリース前に整える `MUST` (Renovate + electron-updater。同梱 Chromium の脆弱性対応が自責になるため)
- Electron のセキュリティ設計: contextIsolation 有効・renderer への Node 非公開・preload の橋は最小、
  を初期実装から守る `MUST`

## 6. 未確定・議論したい点 (GPT など他の検討者への問い)

1. **案 B の技術検証**: [desktop-window-spike.md](../spikes/desktop-window-spike.md) に沿って、
   WebContentsView の再親子付けで、動作中の EC widget (WebRTC 接続保持) が本当に
   リロードなしでウィンドウ間を移動できるか。Electron のバージョン・既知の落とし穴は?
   (これが成立しないなら web 版設計 (最初から別窓) をネイティブでもそのまま使う)
2. **同梱 vs リモート読み込み**: cinny の成果物をアプリに同梱するか、サーバーから読み込むか。
   同梱 = 公開面縮小の趣旨に合い、オフライン起動も可能 (推奨)。リモート = 更新が楽だが web 版ホスト継続と同義
3. **署名なし自動更新の保護策**: コード署名はしない方針だが、どの GitHub 権限・CI 権限・release 手順を
   信用境界にするか。checksum / provenance / rollback / downgrade 防止をどこまで自動化するか
4. **外部ミュート制御の方式**: ローカル API の待ち受けはセキュリティ面の設計が要る
   (localhost バインド + トークン? Named Pipe? Stream Deck プラグインから何を叩く?)
5. **モバイル**: 既存要件で当面対象外だが、web 版廃止でモバイルからの緊急アクセス手段が減る。
   汎用 Matrix クライアント (Element X 等) を「チャットだけの非常口」として案内する整理でよいか
6. **移行手順**: デスクトップ版安定までは web 版ホストを並走させる想定。廃止の判断基準をどこに置くか
7. **既存バックログとの整合**: 進行中の web 版 UI 改修 (グリッド 🗗 追加、レビュー差し戻し修正) は
   ネイティブ化後もそのまま生きる (中身は同じ web アプリのため) — 止める理由はない、で合っているか

### 補足: メモリ使用量について (2026-07-07 の問いへの整理)

**Electron は重いのか**: 重い。Chromium を丸ごと同梱するため、シェルだけで数百 MB、
通話 + 配信デコード中は Discord 同等 (数百 MB〜1GB 超) を見込むべき。ウィンドウ/WebContentsView を
増やすほどレンダラープロセスが増えてさらに乗る。

**ただし比較対象を間違えないこと**: 現在の web 版も「ブラウザのタブ + EC iframe」として
同じ Chromium 上で同規模のメモリを使っている。ネイティブ化の追加コストは
「ブラウザと共有できていたプロセス基盤を自前で持つ分」(目安 +100〜300MB) であり、
支配項は React アプリ + WebRTC + 映像デコードそのもの — **これはエンジンを替えても消えない**。

**軽い代替の選択肢と、うちでの評価**:

| 代替 | メモリ | 評価 |
| --- | --- | --- |
| Tauri (WebView2 = OS 管理の Chromium) | 実行時は同オーダー (エンジンが同じ)。**ディスクは激減** (数 MB vs ~150MB)、エンジン更新は OS 任せ | メモリ目的では決め手にならず、案 B (無再接続の窓移動) を失う。**メモリを最優先し、窓移動の再接続を許容するなら**有力な次点 (上流 cinny-desktop の前例あり) |
| Neutralino / Wails 等 | Tauri と同系 (システム WebView) | 同上 + エコシステムが小さい |
| ネイティブ再実装 (Qt/Flutter/rust-sdk) | 本当に軽くなる唯一の道 | 案 D と同じ理由で否 (数ヶ月規模の再実装) |
| PWA (ブラウザの「アプリとしてインストール」) | **最軽量** (常駐ブラウザとプロセス共有) | ネイティブ API が一切使えず、ネイティブ化の目的 (窓・配布・外部制御) と両立しない。参考値 |

**方針**: Electron 継続。メモリは「エンジン選定」ではなく**設計で抑える**:
通話終了時に通話用 WebContentsView を破棄する / ポップアウト窓の数に上限 /
トレイ常駐時のバックグラウンド抑制 (backgroundThrottling) / x64 のみ配布。
実測はスパイク段階で「シェルのみ / 通話中 / 配信視聴中×2」の 3 点を記録し、
Discord 同条件と比較して要件化する (「Discord より軽い」が現実的な合格ライン)。

## 6.5 着手前ギャップ監査 (2026-07-07、Claude による 2 視点探索の結果)

実装着手前に潰す/決めるべき不足。**blocker = スパイクや設計で先に答えを出すもの**。

### blocker (技術)

1. **widget の postMessage は `window.parent` 固定** (matrix-widget-api の実装確認済み) —
   案 B で EC を WebContentsView 化すると、DOM 上の親子関係が消えて cinny へのメッセージ経路が
   成立しない可能性がある。**案 B の当落を決める論点**。スパイクでは「動いたように見えて実は
   iframe のまま」の誤検証に注意し、ブリッジの成立経路 (preload/IPC 中継の要否) まで確認する
2. **Electron 既知バグ**: WebContentsView の再親子付けでクラッシュ/表示残留の報告 (#47247, #44652)。
   スパイクは Electron バージョンを固定し、これら issue の状況を事前確認してから始める
3. **localStorage 契約は同一 session partition が前提** — 画質/FPS・ミニタイル位置の cinny⇔EC 連携は
   同一オリジン localStorage 依存。WebContentsView 分離時に partition が違うと**静かに既定値へ落ちる**。
   分離時の session 設計 + 回帰確認を必須に
4. **画面共有は案 A の時点で自前対応が必須** — Electron では getDisplayMedia が素では動かず、
   `setDisplayMediaRequestHandler` + **ソース選択 UI (サムネイル一覧) の自前実装**が要る。
   EC が渡す解像度/FPS constraints との相互作用も未検証。※副産物として **システム音声付き配信
   (loopback) が Windows で可能になる** — Discord パリティの大物なので要件化を検討 (下記確認 3)
5. **無署名 electron-updater の信頼設計** — SHA512 検証は「GitHub Releases を信頼する」設計で、
   アカウント乗っ取りには無力。`allowDowngrade` 無効化・GitHub Actions Artifact Attestation
   (provenance) の組み込み・fail-open にしない設計を明示的に行う

### blocker (製品・運用)

6. **リリース工程の再設計が丸ごと未定義** — 3 リポジトリ (desktop/cinny/EC) のバージョン同期、
   リリースのトリガー (タグ push? 手動?)、リリースノートの集約、差分更新、ロールバック運用
7. **バージョン強制** — 「全員同じ改修クライアント」前提が配布制で崩れる (自動更新を切った友達)。
   最低バージョン未満の警告/ブロックの要否を決める
8. **web→ネイティブ移行手順** — 新デバイス = E2EE デバイス検証が必ず発生。recovery key の事前確認を
   含む移行ガイド、web 版並走の終了基準、サーバー側 cinny コンテナと chat.* vhost の畳み方

### important (設計時に対応)

9. 同梱 (file://) 時は cinny の `hashRouter.enabled: true` 切替が必要 (history ルーティングが壊れる)
10. safeStorage は DPAPI = **ユーザー境界であってアプリ境界ではない** (同一 Windows ユーザーの
    他プロセスから読める)。「何からの保護か」を文書に明記して過信しない
11. dev TLS CA: Electron は NODE_EXTRA_CA_CERTS が効かない既知問題 → `setCertificateVerifyProc`
    等の dev 専用処置が必要 (開発イテレーションの前提)
12. Playwright の Electron 対応は experimental — E2E は IPC 経由のデバッグフックを併設する前提で設計
13. macOS 無署名は画面収録権限 (TCC) が実質壊れる既知問題 → 「Windows 必須・mac 後回し」の
    根拠として明記 (mac の友達が居る場合は期待値調整)
14. 配布/サポート: SmartScreen 突破手順書 (スクショ付き)、OS 要件 (Win10/11 x64)、
    トラブル時のログ収集導線 (Electron ログの場所 or in-app レポート。10 人規模なら「ログを Discord で送って」も可)
15. ブランディング + AGPL 具体化: アプリ名/アイコン/About 画面 (ソース入手先・fork 元・変更概要・
    ライセンス全文の同梱は AGPL 第 5/6 条の義務)
16. デスクトップ作法の UI 決め: タイトルバー (frameless か OS 標準か)、トレイ常駐と閉じるボタンの挙動、
    ネイティブ通知、自動起動 — ui-design-notes への影響あり (下記確認 2)
17. リポジトリ体制: selfmatrix-desktop の位置づけ (upstream の無い自作リポジトリ)、cinny 成果物の
    取り込み方式 (npm 依存? サブモジュール? CI アーティファクト?)、fork-strategy/README への追随
18. 自動更新の実運用: 通話中は更新を保留 (Discord 同様)、チェック頻度、更新放置ユーザーの扱い

### 運用者に確認したいこと (未決 4 点)

1. **対応 OS の初期範囲**: Windows のみで開始でよいか (mac の友達の有無)
2. **閉じるボタンの挙動**: Discord 風にトレイ常駐 (閉じる = 最小化) か、素直に終了か
3. **システム音声付き画面共有** (ゲーム音を配信に載せる) を要件に足すか — Electron 化で可能になる
   Discord パリティの大物。足すなら 4 の画面共有自前実装とセットで設計
4. **配布リポジトリの公開範囲**: public Releases (誰でも DL 可、§2 の注意) で確定でよいか

## 7. この検討が確定したら変わる文書

- requirements.md §7 (クライアント) の全面改訂 + §6 (公開面) の一部 + §9 決定記録への追記
- roadmap.md に新フェーズ (desktop 化スパイク → 案 A → 案 B) を追加
- call-window-mode.md v1.4 は「UI 合意として有効、実装形態はネイティブ検討の結論に従う」の注記を追加
- backlog.md の P0 を完了または次フェーズへ更新
