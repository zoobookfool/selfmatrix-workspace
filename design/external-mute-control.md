# 外部ミュート制御 (Stream Deck 等) — 設計確定 (実装着手)

**ステータス: 設計確定 v1.0** (2026-07-12 起票、同日運用者回答により確定)。native-milestones.md M4 の
「外部ミュート制御 (Stream Deck) の設計着手 (native 側)」に対応。

## §8 への運用者回答 (2026-07-12) — 確定事項

1. **A と B の両方を実装する** (A で止めない)。C (公式 Stream Deck プラグイン) は引き続き LATER。
2. **トレイのミュートトグル項目は追加する** (§7「すぐ着手可」を承認)。
3. **ホットキーの発見性要件 (新規)**: ホットキーは忘れられるため、トレイ右クリックメニューに
   「ホットキー」項目 (サブメニュー) を設け、その中に「ミュート: <キーバインド>」のように
   割り当てを常時表示し、その項目を選択するとホットキーの有効化 ON/OFF がトグルされること。
   **既定は OFF** (初回はトレイから ON にする。他アプリのキーを無断で奪わない)。
4. **既定キーバインドとプリセット切替 (2026-07-12 追加回答)**: 運用者の例示は「右Shift+M」だが、
   Electron の accelerator は左右の修飾キーを区別できず (globalShortcut の仕様)、素の `Shift+M` は
   全アプリの大文字 M 入力を乗っ取るため採用不可。既定は `Ctrl+Alt+M`、表示形式は
   「ミュート: Ctrl+Alt+M」。加えて**プリセット切替**をトレイの「ホットキー」サブメニューに置く
   (radio 4 択: `Ctrl+Alt+M` 既定 / `Ctrl+Shift+M` / `F13` / `F14`。F13/F14 は物理キーボードに
   ほぼ存在せず衝突しない、Stream Deck の標準 Hotkey アクションが送出できるキー — Discord
   ユーザーの慣習と同じ)。自由入力のバインド変更 UI は引き続き LATER。
5. 公開する操作は当面**マイクミュートのみ** (デフンの追加は未決、必要になったら §4.2 の
   基準で判断)。

以下は起票時の検討本文 (§0〜§9)。上記回答で上書きされる箇所は回答が正。

## 実装記録 (2026-07-12、A+B とも同日実装)

| 段階 | 実装 | 検証 |
| --- | --- | --- |
| トレイのミュートトグル項目 + **A. グローバルホットキー** | desktop 902d1d02 + cinny 29c7e08d (transport 契約に `onExternalMuteToggle` を追加、契約メソッド 10→11。FORBIDDEN リストにも追加し web tree-shake ガード維持)。トレイ「ホットキー」サブメニュー: 「ミュート: <バインド>」checkbox (checked=実登録状態) + プリセット radio 4 択 (`Ctrl+Alt+M` 既定 / `Ctrl+Shift+M` / `F13` / `F14`)。**既定 OFF**。引き金は `triggerExternalMuteToggle()` に集約 (§4.4 の共有構造どおり) | `--external-mute-probe`: 既定 OFF / ON・OFF 永続化 / 配達実測 / プリセット切替 (新登録・旧解除) / will-quit 解除 / 変異ゲート (配線切断で FAIL→復元 PASS)。`npm test` 全体 green |
| **B. localhost 制御 API** | desktop 5fc3909。Node 組み込み `http`、**`127.0.0.1` のみ bind**、固定ポート **58471** (IANA dynamic 範囲、obs-websocket 4455 や dev 常用ポートを回避)。`POST /v1/mute-toggle` + `GET /v1/ping` のみ、Bearer トークン (SHA-256 ハッシュ + `timingSafeEqual`、長さ差の早期 return なし)、**Origin ヘッダ存在で無条件 403**、認証失敗 5 連続で 60 秒ロックアウト (429)。トレイ「外部制御 API」サブメニュー: 有効化 (既定 OFF、checked=実 listen 状態) / トークンをコピー / トークンを再生成。cinny 変更なし (A の引き金関数と IPC を共有) | `--external-api-probe`: 既定 OFF / bind 先 127.0.0.1 / 誤トークン 401 / 正トークン配達 / Origin 403 / レート制限と回復 / 再生成で旧失効 / 再起動復元 / 変異ゲート (照合を常時 true 化で FAIL→復元 PASS)。`npm test` 全体 green。状態フィードバック (現在ミュート状態の取得/push) は v1 スコープ外 — C 検討時に再訪 |
| **C. 公式 Stream Deck プラグイン** | LATER (未着手) | — |
**この文書は単体で読める** — リポジトリを見られない読者 (他 AI を含む) でも、ここから検討に参加できる
ことを意図している (design/native-client-rethink.md の構成を踏襲)。

---

## 0. 結論サマリ

- 運用者の要件は明確: **プッシュトゥトーク (PTT、押している間だけ発話) は不要**。欲しいのは
  **別アプリ (Stream Deck 等) から SelfMatrix のミュートを「トグル」で叩ける**こと
  ([native-client-rethink.md](native-client-rethink.md) §2 の運用者確定事項参照)。
- **PTT が不要なことは実装コストに直結する**。真の PTT (押下中だけ発話) を OS 全体で拾うには
  keydown/keyup を両方観測できる低レベルフックが要るが、Electron の `globalShortcut` は
  keydown/keyup を提供せず「押された」の単発イベントしか出せない
  ([electron/electron#26301](https://github.com/electron/electron/issues/26301))。
  **トグルなら `globalShortcut` の標準 API だけで足りる** — 今回のスコープでは低レベルキーフック
  (`uiohook-napi` 等の追加ネイティブ依存) が不要になる、という具体的な単純化がある。
- 先行事例調査 (§3) の結論: **Stream Deck の標準機能「Hotkey (システムアクション)」は OS のグローバル
  ホットキーを模擬キー送出するだけ**であり、SelfMatrix 側が用意すべきものは「グローバルホットキーで
  ミュートをトグルできる状態」で足りる。つまり**選択肢 A (Electron `globalShortcut`) だけで
  「Stream Deck 対応」を名乗れる**、カスタムプラグイン不要のケースがある。これは工数を大きく左右する
  発見のため、§8 の確認事項の筆頭に置く。
- 一方で、キー送出方式は「OS レベルのキー衝突」「フォーカスの無いウィンドウへの外部キー到達性の差」
  「Stream Deck 以外のツール (自作スクリプト、他社製マクロランチャー) からは使いにくい」という限界を
  持つ。汎用性を求めるなら OBS の `obs-websocket` に相当する**ローカル制御 API (選択肢 B)** が必要。
- 選択肢 A と B は**実装の後半 (Electron main → cinny renderer への配送経路) をほぼ共有する**。
  違うのは「引き金」(OS キーイベント vs ローカルネットワーク接続) だけ — 詳細は §4.4。**段階導入
  (A → B) が地続きの投資になる**ことがコード上でも裏付けられる。
- ミュート操作の実装は、通話画面内 DOM 操作 (screenshare 等と同じ経路) ではなく、**Matrix widget
  action (`ElementWidgetActions.DeviceMute`) 経由で完結する** ([cinny/src/app/plugins/call/native/
  NativeCallControl.ts](../../cinny/src/app/plugins/call/native/NativeCallControl.ts) の
  `toggleMicrophone()`)。これは既に web/native 両方で無改造動作している既存経路であり、
  外部制御が新設すべきなのは「この経路をどこから (誰の許可で) 起動できるか」という**引き金の設計**
  だけ — ミュート自体のロジックを新たに書く必要はない。
- セキュリティは [user-customization.md](user-customization.md) が積んだ脅威モデル整理・設計原則
  (narrow capability、`MatrixClient`/トークン/E2EE 鍵を絶対に露出しない、既定は安全側)
  とそのまま地続き。ただし本機能は**プラグイン機構より遥かに狭い** — 露出する操作を「ミュート等の
  無害な通話コントロールのみ」に絞れば、プラグインが背負う「全会話・全鍵への到達可能性」という
  最大級の脅威そのものを構造的に持たない (§5)。
- **native 限定機能**であることの技術的根拠は「原理的にできない」であって「web では面倒」ではない
  (§6)。既に [web-native-parallel.md](../planning/web-native-parallel.md) のフィーチャーマトリクス
  (R3) が「トレイ常駐 / 最前面ピン / 外部ミュート制御」を native 限定 (`✗ web / ✅ native`) と
  明記済みで、本ドラフトはその根拠を掘り下げる。
- 推奨: **A (グローバルホットキー) を先に成立させ、B (ローカル制御 API) へ汎用化、C (公式 Stream Deck
  プラグイン) は LATER**。詳細な段階案は §7。

---

## 1. 前提知識 (このプロジェクトを知らない読者向け)

- **SelfMatrix** は Matrix プロトコル上に Discord 代替のチャット + 通話 (音声 + 画面配信中心、
  カメラは既定 OFF の opt-in) 体験を作る個人プロジェクト。参加者は運用者の友人サークル (~10 人規模)。
- **クライアント側**: cinny (Discord 風シェル、React + TypeScript) フォークに Element Call (通話画面、
  Matrix widget として埋め込み) フォークを組み合わせている。2026-07 時点で **web 版 (ブラウザ配布) と
  native 版 (Electron デスクトップアプリ、`selfmatrix-desktop`) を併走**させる方針が確定している —
  ソースコードは cinny フォーク 1 本 (`product/discord-style-shell` ブランチ)、分岐するのはビルド
  (配布物) だけ。native 固有機能はビルド時フラグ (`VITE_SELFMATRIX_NATIVE`) でゲートし、web ビルドから
  は tree-shake で除去する ([web-native-parallel.md](../planning/web-native-parallel.md) R2、
  セキュリティ上の `MUST`)。
- **native 化の進捗 (2026-07 時点)**: M0〜M3 完了。M1 で「通話 widget を Electron の
  `WebContentsView` に分離し、ウィンドウ間で無再接続の再親子付けをする」という核心技術が成立、
  M3 で Discord 準拠の窓出し入れ (ポップアウト/ポップイン) が実 E2E で PASS 済み
  ([planning/native-milestones.md](../planning/native-milestones.md))。
  現在は **M4「web/native 2 系統の定常運用の確立」**の段階で、本ドラフトが扱う
  「外部ミュート制御 (Stream Deck) の設計着手」は M4 の項目そのもの。
- **要件上の位置づけ**: requirements.md §3 は「プッシュトゥトーク は必須ではない」ことを既に整理済み
  ([native-client-rethink.md](native-client-rethink.md) §2 の運用者確定表)。同文書に運用者の原発言が
  記録されている:

  > プッシュトゥトーク | **必須ではない**。それよりも**外部アプリからのミュート制御**
  > (Stream Deck 対応のような外部連携) が欲しい

  本ドラフトが扱う「外部ミュート制御」は、この発言をそのまま設計に落とし込む作業。
- **既存のフィーチャーマトリクス**: [web-native-parallel.md](../planning/web-native-parallel.md) R3 は
  「トレイ常駐 / 最前面ピン留め / 外部ミュート制御」を**既に native 限定 (`✗ web / ✅ native`)** として
  一覧表に記載済み。本ドラフトはこの分類の技術的根拠を詳述する (§6)。
- **通話ミュートの現行実装**: cinny の `CallControl`/`NativeCallControl` クラス
  ([cinny/src/app/plugins/call/CallControl.ts](../../cinny/src/app/plugins/call/CallControl.ts)、
  [cinny/src/app/plugins/call/native/NativeCallControl.ts](../../cinny/src/app/plugins/call/native/NativeCallControl.ts))
  が持つ `toggleMicrophone()` は、通話画面 (Element Call widget) 内の DOM を直接クリックする方式
  ではなく、**Matrix widget action** (`ElementWidgetActions.DeviceMute`、`ClientWidgetApi.transport.send()`
  経由) で完結する。これは screenshare/spotlight/emphasis 等 (DOM クリックでしか実現できない操作、
  native では `WebContentsView` 越しの RPC が要る「カテゴリ B」) とは異なる**「カテゴリ A」**の操作で、
  **native 版でも既に無改造で動いている**
  (根拠: `cinny/src/app/plugins/call/native/NativeCallControl.ts` の `toggleMicrophone()` は
  コメント「出典: CallControl.ts の toggleMicrophone()。カテゴリ A、無改造で成立。」付きで
  `setMediaState()` → `transport.send(ElementWidgetActions.DeviceMute, ...)` を呼ぶだけ。対照的に
  `selfmatrix-desktop/src/call-control-preload.cjs` が DOM クリックで移植しているのは
  toggleScreenshare/toggleSpotlight/toggleEmphasis/toggleReactions/toggleSettings/setSoundOn/setSoundOff
  の 7 アクションで、**`toggleMicrophone` はそこに含まれていない** — ミュートが DOM クリック経路を
  通らないカテゴリ A であることの裏返し)。**つまりミュート自体のロジックは既に web/native 両方に存在する。外部制御が
  新設すべきなのは「誰が/どこから `toggleMicrophone()` を呼べるか」という引き金だけ**であり、
  この事実は §4 のアーキテクチャ選択肢すべての実装コストを引き下げる。
- **cinny 側の呼び出し経路**: `toggleMicrophone()` を持つ `NativeCallControl` インスタンスは
  ルームごとの `CallEmbed`/`NativeCallEmbed` にぶら下がっており、現在アクティブな embed は
  jotai の `callEmbedAtom`
  ([cinny/src/app/state/callEmbed.ts](../../cinny/src/app/state/callEmbed.ts)) で管理されている
  (`cinny/src/app/hooks/useCallEmbed.ts` の `createCallEmbed()`/`CallEmbedContext` 参照)。
  この atom は通話 UI コンポーネントツリーの外からでも読めるため、外部制御用の購読コードは
  通話画面の内部に入り込まずに「現在の embed があれば `.control.toggleMicrophone()` を呼び、
  無ければ no-op」という形で書ける見込み — 詳細な結線は §4.1 で述べる (実装時に要確認の詳細は残る)。
- **native シェルの現状**: `selfmatrix-desktop/src/main.cjs` は Electron の Tray (常駐アイコン +
  右クリックメニュー) を既に実装済み ([planning/native-milestones.md](../planning/native-milestones.md)
  M2「デスクトップ作法」)。トレイメニュー定義 (`trayMenuTemplate()`) のコメントには
  「将来ミュート制御等を足せる構造にしておく」と明記されており、この機能がまさに想定されていた
  拡張点であることがコードからも確認できる。一方、`globalShortcut`・ローカル WebSocket/HTTP
  制御サーバーは**まだ一切実装されていない** (grep 確認済み、既存の `http.createServer` は
  cinny/EC のビルド成果物を配信する静的ファイルサーバーであり、外部制御用ではない)。

---

## 2. 要件の明確化

### 2.1 PTT とトグルの違い

| | プッシュトゥトーク (PTT) | トグル (今回の対象) |
| --- | --- | --- |
| 意味論 | キーを**押している間だけ**発話可能、離すとミュート | キーを**押すたびに**ミュート状態が反転する |
| 必要なイベント | keydown **と** keyup の両方を、OS レベルでほぼ遅延なく観測する必要がある | 「押された」という単発イベント 1 つで足りる |
| Electron 標準 API での実現性 | **不可**。`globalShortcut` は単発の「押された」コールバックのみで、keyup を提供しない ([electron/electron#26301](https://github.com/electron/electron/issues/26301))。実現するには `uiohook-napi` 等、OS のグローバル入力フックに直接アクセスする追加のネイティブモジュールが要る (Windows では通常、低レベルキーボードフック `WH_KEYBOARD_LL` 相当) | **可能**。`globalShortcut.register()` の「押されたら 1 回コールバックが呼ばれる」という契約そのままでトグルには十分 |
| 遅延・信頼性の要求水準 | 高い (発話の頭が欠けると体感が悪い、Discord PTT が長年ネイティブ実装にこだわってきた理由) | 低い (ミュート反転は多少の遅延があっても実害が小さい) |

**結論**: 運用者の「PTT は必須でない」という判断は、単なる優先度の話ではなく、**実装が要求する
技術スタックの層を 1 段軽くする**判断でもある。トグルのみのスコープなら、追加のネイティブ入力
フック依存 (ビルド・署名・OS 権限まわりの複雑性が増す) を持ち込まずに Electron 標準 API だけで
完結できる。

### 2.2 グローバルホットキー方式 vs 外部制御 API 方式

要件の「別アプリからミュートを叩く」は、引き金の置き場所によって性質が変わる 2 方式に分解できる。

| | グローバルホットキー方式 | 外部制御 API 方式 |
| --- | --- | --- |
| 引き金 | OS 全体で捕捉されるキー組み合わせ (例: `F17`, `Ctrl+Alt+M`) | ローカルのネットワーク接続 (WebSocket/HTTP) 経由のコマンド |
| Stream Deck 側の要件 | 標準搭載の「Hotkey」アクションを 1 個割り当てるだけ (§3.3)。**SelfMatrix 専用プラグイン不要** | SelfMatrix 用のプラグイン、または汎用の HTTP/WebSocket 送信プラグインが必要 |
| Stream Deck 以外のツールとの相性 | 相性良い (どんなマクロランチャーもキー送出はできる) が、「そのキーを他のどのアプリも使っていない」ことがユーザー側の責任になる | 相性良い (自作スクリプト・他社製ハードウェア・将来のモバイル制御アプリ等、キー送出を経由しない任意のクライアントから叩ける)。ただし SelfMatrix 側が新たに「ローカルサーバーを開く」という攻撃面を持つ |
| 状態のフィードバック (現在ミュート中かどうかを外部に伝える) | 基本的に不可 (キー送出は一方向) — Stream Deck のボタン側 LED/アイコンを現在のミュート状態に追従させることはできない | 可能 (WebSocket なら現在の状態を push できる。Stream Deck 公式プラグイン (§4.3/選択肢 C) を作るならこれが効いてくる) |
| 実装の中身 (SelfMatrix 側) | `globalShortcut.register()` + 既存の main→renderer IPC 経路 | ローカル WebSocket/HTTP サーバー + 認証 + 同じ IPC 経路 (§4.4 で共有部分を詳述) |

この 2 方式は「どちらか」ではなく「A→B の段階」として素直に積み上げられる (§4, §7)。

---

## 3. 参照モデル (先行事例調査、一次ソース優先)

### 3.1 OBS の `obs-websocket` — ローカル制御 API の参照実装

[obs-websocket](https://github.com/obsproject/obs-websocket) は OBS Studio 本体に同梱される
WebSocket サーバーで、外部プロセスから配信ソフトをリモート制御する事実上の業界標準。

- 既定ポート **4455**、`localhost` (ループバック) 待ち受け。パスワード認証が既定で有効
  ([protocol.md](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md))。
- 認証は素のパスワード送信ではなく、サーバーが送る `challenge` とパスワードを連結して SHA256 →
  base64 化した文字列で応答するチャレンジレスポンス方式 (`Hello` → `Identify` のハンドシェイク)。
- パスワードは OBS の Tools 設定画面で確認・再生成できる (ユーザーが握るシークレット、コード側に
  焼き込まれた固定値ではない)。
- Stream Deck 用の公式 OBS プラグインは、この `obs-websocket` を直接クライアントとして叩く実装
  (Stream Deck プラグインが「obs-websocket クライアントを内蔵している」形)。これは**選択肢 B の
  直接の先行事例** — 「配信/通話ソフト側がローカル WebSocket を開け、Stream Deck プラグインは
  そのプロトコルのクライアントを実装するだけでよい」という分業モデルがそのまま踏襲できる。

### 3.2 Discord のグローバルホットキーと Stream Deck 連携の変遷

- Discord のデスクトップアプリ (Electron 製) は「ミュート/デフン」を OS 全体のグローバルホットキー
  として登録できる。ブラウザ版 Discord にはこの機能が無い — **OS 全体のキー捕捉はネイティブアプリの
  特権であり、ブラウザ JS には原理的に到達できない**という、本ドラフト §6 の主張と同型の事実。
- Stream Deck からの Discord 制御は歴史的に 2 世代ある。
  - **旧来 (プラグイン以前)**: Discord のグローバルホットキー機能に、キー入力を割り当てにくい
    識別しやすいキー (`F17` 等、通常の作業では絶対に押さないキー) を割り当て、Stream Deck の標準
    「Hotkey」アクションでそのキーを送出する — という運用が一般的だった
    (YouTube チュートリアル多数、例:
    [Use Hotkeys in Stream Deck to Mute & Deafen Discord](https://www.youtube.com/watch?v=LxlcUaDoWnI))。
    **これは本ドラフトの選択肢 A と全く同じ形**であり、公式 API が無くても「グローバルホットキー +
    Stream Deck の標準 Hotkey アクション」だけで実用に足る外部ミュート制御が長年成立していた
    実例といえる。
  - **サードパーティプラグイン**: [fredemmott/StreamDeck-Discord](https://github.com/fredemmott/StreamDeck-Discord)
    はミュート/デフン専用の C++ 製プラグイン。Discord 公式の外部制御 API が無い時代に作られたもので、
    実装の詳細 (Discord 内部 RPC を使うのか UI 操作を模擬するのか) はリポジトリ側で要確認だが、
    「専用プラグインを書けば状態フィードバック付きの体験になる」という選択肢 C 相当の実例。
  - **公式プラグイン (現行)**: Elgato Marketplace の
    [Discord 公式プラグイン](https://www.elgato.com/us/en/explorer/products/marketplace/lead-your-community-with-the-discord-stream-deck-plugin/)
    は「ミュート状態を単押しでトグルし、ボタン側の見た目も状態に追従する」体験を提供する
    (キー送出の模擬ではなく直接 API 統合と説明されている)。**選択肢 C の完成形の実例だが、
    Discord 公式アプリという大きな開発体制があってこそ**の投資であり、10 人規模の個人プロジェクトが
    最初から目指す規模ではない (§7)。

### 3.3 Stream Deck SDK — プラグインが実際に叩ける対象

一次ソース: [Elgato Stream Deck SDK - Architecture](https://docs.elgato.com/sdk/plugins/architecture)、
[Plugin | Stream Deck SDK](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/)、
システムアクション一覧: [Elgato Stream Deck — System Actions](https://help.elgato.com/hc/en-us/articles/360028234471-Elgato-Stream-Deck-System-Actions-Hotkey-Open-Website-Multimedia)。

- **プラグインの実行環境**: 「Stream Deck プラグインのアーキテクチャは Web アプリに近い
  (フロントエンド + バックエンド) が、ユーザーのローカルマシン上で完全にホストされる」。
  バックエンドは Node.js ランタイム (Stream Deck 7.3 時点で Node.js 20.20.0/24.13.1)。
  **プラグインの側から見れば、サンドボックスの無い通常のローカルプロセス** —
  任意の HTTP/WebSocket クライアント接続、外部コマンド起動、キー送出ライブラリの利用等、OS 上で
  Node.js プロセスにできることは基本的に何でもできる (ドキュメントに明記された制約は見当たらない)。
- **プラグイン ↔ Stream Deck 本体の通信**: プラグインごとに Stream Deck アプリが割り当てる
  専用の WebSocket ポート経由 (登録手続き = Registration Procedure を踏んだ上で JSON メッセージを
  やり取りする)。**これは「プラグインが Stream Deck 本体を操作する」ための内部チャンネルであり、
  プラグインが SelfMatrix のような外部ローカルサービスに接続する経路とは別物** — プラグインは
  この内部チャンネルとは独立に、任意の追加のネットワーク接続 (obs-websocket へ、SelfMatrix の
  ローカル API へ、等) を自由に開ける。
- **標準搭載の「Hotkey」システムアクション**: カスタムプラグインを書かなくても、Stream Deck の
  ボタンに「指定したキーの組み合わせを OS へ送出する」という組み込み機能を割り当てられる
  ([System Actions ヘルプ記事](https://help.elgato.com/hc/en-us/articles/360028234471-Elgato-Stream-Deck-System-Actions-Hotkey-Open-Website-Multimedia))。
  これは**選択肢 A (グローバルホットキー) をそのまま実現する既製の入口**であり、
  SelfMatrix 側が Stream Deck 向けに何も書かなくても、運用者や友人が Stream Deck の設定画面だけで
  「このボタンに `Ctrl+Alt+M` を割り当てる」と設定すれば、SelfMatrix 側が同じキーで
  `globalShortcut` を登録している限り成立する。

### 3.4 VoiceMeeter Remote API — もう 1 つのパターン (ネイティブライブラリ直結)

VoiceMeeter (音声ミキサー) は WebSocket ではなく **`VoicemeeterRemote.dll` というネイティブ共有
ライブラリ**を配布し、Stream Deck プラグイン (
[BarRaider 製](https://docs.barraider.com/faqs/voicemeeter/actions/) 等) がこの DLL をリンクして
パラメータの get/set や「マクロボタン」を実行する
([VoicemeeterRemoteAPI.pdf](https://download.vb-audio.com/Download_CABLE/VoicemeeterRemoteAPI.pdf))。
Electron の Node.js プロセスからネイティブ DLL を直接呼ぶことは native addon (N-API 等) を書けば
不可能ではないが、**言語・プラットフォームをまたいだ第三者プラグインとの相性は WebSocket/HTTP に
劣る** (obs-websocket が広く再実装されている一方、独自 DLL 方式はその DLL の呼び出し規約を各言語で
再実装する必要がある)。SelfMatrix の選択肢としては優先度を下げてよい参考事例として記録する。

### 3.5 先行事例のまとめ

| 系統 | 対応する選択肢 | 要点 |
| --- | --- | --- |
| Discord のグローバルホットキー (+ Stream Deck 標準 Hotkey アクション) | **A** | プラグイン不要、長年の実運用実績あり |
| obs-websocket | **B** | ローカル WebSocket + チャレンジレスポンス認証、Stream Deck プラグインがクライアントを内蔵する分業モデルの手本 |
| StreamDeck-Discord (サードパーティ) / Discord 公式プラグイン | **C** | 状態フィードバック付きの完成体験だが専用開発が要る |
| VoiceMeeter Remote API | (参考、非推奨) | ネイティブ DLL 直結方式。言語をまたいだ相性で B に劣る |

---

## 4. アーキテクチャ選択肢

| 案 | 内容 | 実装コスト | セキュリティ | 汎用性 |
| --- | --- | --- | --- | --- |
| **A. Electron `globalShortcut`** | OS 全体のキー組み合わせで `toggleMicrophone()` を起動。Stream Deck は標準「Hotkey」アクションで叩ける (§3.3) | **小** — 追加の待受ポートなし、新規ネイティブ依存なし。主な作業は IPC 配線 (§4.1) | 攻撃面がほぼ増えない (OS のキーイベントを読むだけ、ネットワーク待受なし)。リスクは「キー衝突で無関係な操作が誤爆する」程度で外部からの不正操作経路にはならない | 中 — Stream Deck 以外でも「キーを送出できるツール」なら何でも使える。ただしキーバインドの衝突・非フォーカス時の到達性 (§4.1 で詳述) という UX 上の限界がある |
| **B. ローカル制御 API** (obs-websocket 相当、localhost WebSocket + token) | Stream Deck プラグインや自作スクリプトから直接コマンドを送る。状態の push も可能 | 中 — サーバー実装 + 認証 + トークン管理 UI が要る。ただし配送経路の後半 (main→renderer IPC) は A と共有 (§4.4) | **要設計** — ローカルとはいえ待受ポートを開く以上、悪意あるローカルプロセス/ブラウザページからの到達を塞ぐ設計が要る (§5) | 高 — キー送出を経由しないため、ヘッドレススクリプト・将来のモバイル制御アプリ・他社製マクロランチャー等、任意のクライアントから使える。状態フィードバックも可能 |
| **C. 公式 Stream Deck プラグイン** | Stream Deck SDK でボタンアイコンがミュート状態に追従する専用プラグインを作り、Elgato Marketplace 等で配布 | **大** — SDK 学習、Property Inspector UI、Stream Deck SDK のバージョン追従、(Marketplace 配布するなら) 審査対応の継続的コスト | B と同等 (プラグイン自体は B のクライアントとして実装するのが自然) | 最も高い UX (ボタンの見た目が状態に追従、設定 UI がグラフィカル) だが、対象デバイスが Stream Deck に限定される (Discord 公式プラグインと同格の投資、§3.2) |

### 推奨: 段階導入 (A → B、C は LATER)

- **A で最小対応**: 追加の攻撃面を持たずに「グローバルホットキーでミュートをトグルできる」を
  成立させる。Stream Deck の標準 Hotkey アクションと組み合わせれば、この時点で運用者の原発言
  (「Stream Deck 対応のような外部連携」) の相当部分を満たせる可能性が高い (要運用者確認、§8)。
- **B で汎用化**: A だけでは満たせない「状態フィードバック」「Stream Deck 以外のツールからの利用」
  「キー衝突の回避」が欲しくなった段階で、ローカル制御 API に拡張する。
- **C は LATER**: 公式プラグインは UX の頂点だが工数が最も重く、10 人規模の個人プロジェクトが
  最初に投資する優先度ではない。B が安定してから「専用プラグインが要るほどの需要があるか」を
  再評価する。

### 4.1 選択肢 A の設計スケッチ

- `selfmatrix-desktop/src/main.cjs` の `app.whenReady()` 以降で
  `globalShortcut.register(accelerator, callback)` を登録する
  ([Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut/))。
  - **登録失敗のハンドリングが必須**: 「アクセラレータが既に他アプリに取られている場合は
    サイレントに失敗する」という Electron の仕様上の挙動があるため、`register()` の戻り値
    (成功/失敗) を必ず確認し、失敗時は設定画面や通知で運用者に伝える設計にする
    (無言で「効かない」状態を作らない)。
  - アプリ終了時 (`will-quit`) に `globalShortcut.unregisterAll()` を確実に呼ぶ。
  - 既定のキーバインドは「他アプリと衝突しにくい」ものを選ぶ (Discord ユーザーが F13〜F24 等の
    余りキーを使う慣習があるのと同じ発想、§3.2)。設定画面でユーザーが変更できるようにするのが
    望ましい (LATER でも可)。
- main プロセスは「押されたことを検知する」役割に徹し、実際のミュート操作は**cinny (mainWindow の
  renderer)** 側に委譲する。既存の `selfmatrix-desktop/src/shell-preload.cjs` は
  `contextBridge.exposeInMainWorld("selfmatrixNative", {...})` の形で `window.selfmatrixNative` を
  cinny に公開しており、`onCallControlState`/`onCallViewPlacement` のような「main → renderer への
  push を購読する」パターンが既に確立している
  ([cinny/src/app/plugins/call/native/nativeBridge.ts](../../cinny/src/app/plugins/call/native/nativeBridge.ts)
  の `SelfmatrixNativeWidgetTransport`/`SelfmatrixNativeBridge` 型定義)。外部ミュート制御もこの
  idiom に素直に乗せられる:
  1. `globalShortcut` のコールバック内で `mainWindow.webContents.send("native:external-mute-toggle")`
     のような IPC を送る (新設のチャンネル)。
  2. `shell-preload.cjs` に、通話 claim (`claimWidgetTransport()`) とは**独立した**購読 API
     (例: `window.selfmatrixNative.onExternalMuteToggle(listener)`) を追加する。既存の
     `claimWidgetTransport()` は「通話 1 本につき 1 回」の claim-once 設計 (同一オリジン iframe
     からの到達を塞ぐためのセキュリティ対策、`nativeBridge.ts` の該当コメント参照) だが、外部
     ミュート制御は**通話の有無に関わらず (通話していないときに押されても no-op で構わない) 常時
     待ち受けたい**性質のものなので、claim-once の対象に混ぜずに独立させるのが自然。
  3. cinny 側は、通話 UI コンポーネントツリーの外 (アプリ全体で 1 度だけマウントされる場所)
     に小さなフック/コンポーネントを置き、`callEmbedAtom`
     ([cinny/src/app/state/callEmbed.ts](../../cinny/src/app/state/callEmbed.ts)) の現在値を
     読んで `.control.toggleMicrophone()` を呼ぶ。通話中でなければ atom は空なので自然に no-op
     になる (例外処理を書かなくても安全側に倒れる設計にできる見込み — 実装時に厳密な atom の
     形状を確認すること)。
- **カテゴリ B の DOM クリック RPC (`call-control-preload.cjs`) は経由しない**。これは
  screenshare/spotlight 等、widget action が存在しない操作のためのものであり、`toggleMicrophone()`
  は widget action (カテゴリ A) で完結するため、`WebContentsView` 内の DOM には一切触れずに実現
  できる。実装がシンプルになるだけでなく、**攻撃面 (call view 内の実 DOM 操作) を経由しない**という
  副次的なセキュリティ上の利点もある。
- **補助的な最小実装 (ほぼ無料)**: `selfmatrix-desktop/src/main.cjs` のトレイ右クリックメニュー
  (`trayMenuTemplate()`) は既に「将来ミュート制御等を足せる構造にしておく」という設計コメント付きで
  実装済み。ミュートのトグル項目をこの配列に 1 行追加するだけで、**Stream Deck を持たないユーザーにも
  有効な「外部トリガー無しの最速ミュート導線」**を提供できる。グローバルホットキーとは独立した経路
  (キー衝突の心配が無い) であり、A の前段、あるいは A と並行の「ほぼタダで作れる」施策として
  §7 に含める。

### 4.2 選択肢 B の設計スケッチ

- Electron main プロセスに、**`127.0.0.1` にのみバインドした** WebSocket (または HTTP) サーバーを
  常駐させる。`0.0.0.0`/LAN 待ち受けは行わない (obs-websocket も既定はループバックのみ、§3.1)。
- **認証**: obs-websocket 型のトークン/パスワード方式を採用する。
  - アプリ初回起動時にランダムなトークンを生成し、ローカルの設定ストア (Electron の
    `safeStorage`/設定 JSON) に保存する。設定画面でトークンの表示・再生成ができるようにする。
  - 単純な固定トークンの平文比較でも一定の防御にはなるが、**タイミング攻撃を避けるため
    `crypto.timingSafeEqual` 等の定数時間比較を使う**。スコープが「ミュート等の無害操作のみ」
    である限り obs-websocket ほど厳密なチャレンジレスポンスは過剰装備の可能性があるが、
    「トークンを平文でそのまま送らせない」程度は最低限のラインとして検討する。
  - Stream Deck プラグイン (または自作スクリプト) 側の設定画面に、SelfMatrix が発行したトークンを
    貼り付けてもらうペアリング UX を想定する。
- **公開する操作の範囲を「無害な通話コントロールのみ」に絞る**: マイクミュートのトグル/明示 on/off、
  (要望があれば) デフン (スピーカーミュート) 相当のトグルまでに限定し、**screenshare トグル・通話
  退出・privacy-sensitive なカメラ操作等は対象に含めない**。理由は 2 つ:
  1. セキュリティ上、「トークンが漏れた場合の最悪ケース」を「意図せずミュートされる/解除される」
     程度に抑えられる。screenshare や退出まで許すと被害の質が変わる。
  2. 実装上、screenshare 等はカテゴリ B (call view 内の DOM クリック RPC、通話が実際に接続中でないと
     対象要素が存在しない) を経由する操作であり、`toggleMicrophone()` (カテゴリ A、widget action)
     より前提条件が複雑 — 「無害な操作に絞る」という安全側の判断が、実装のシンプルさとも一致する。
- **配送経路は A と共有する** (§4.4): 認証済みリクエストを受けたら、main プロセスは
  `mainWindow.webContents.send("native:external-mute-toggle")` を呼ぶだけで、それ以降 (renderer
  側の `callEmbedAtom` 経由の `toggleMicrophone()` 呼び出し) は A と完全に同じコード。
- **ブラウザ経由の到達阻止 (重要な残存リスク)**: WebSocket 接続はブラウザの同一オリジンポリシー
  (CORS) の対象外であり、悪意あるウェブページの JS が `ws://127.0.0.1:<port>` へ接続を試みること自体
  は防げない。対策:
  - 接続時に送られる `Origin` ヘッダを検査し、ブラウザ由来と分かる `Origin` (`http(s)://` を持つ
    もの) の接続は拒否する。Stream Deck プラグイン (Node.js プロセス) や自作スクリプトは通常
    `Origin` ヘッダを送らないため、「`Origin` が存在する接続は一律拒否」という単純なルールで
    ブラウザ経由の drive-by 接続の大半を弾ける (完全な防御ではなく多層防御の 1 枚)。
  - 最終的な防御はあくまでトークン認証。`Origin` チェックは補助であり、それだけに頼らない。
  - 将来的な代替案として、TCP ではなく **Windows Named Pipe** を使う方式も比較検討に値する
    (ブラウザの JS からは原理的に到達できない)。ただし Stream Deck プラグインや自作スクリプトから
    見て「WebSocket の方が言語・環境を問わず書きやすい」という Stream Deck SDK 自体の設計方針
    (§3.3) との相性を優先し、v1 は WebSocket + token + Origin チェックを基本線とする。
- **user-customization.md との整合性チェック** (§5 で詳述): user-customization.md はプラグイン機構の
  脅威モデルとして「`MatrixClient`・アクセストークン・E2EE 鍵ストアへの参照を一切渡さない」ことを
  設計原則としている。外部ミュート制御 API はそもそも Matrix レイヤーに一切触れない
  (widget action 経由でメディア状態を変えるだけ) ため、この原則を最初から満たしている —
  **プラグイン機構より狭いスコープであることが、そのまま最大のセキュリティ上の利点**になっている。

### 4.3 選択肢 C の設計スケッチ (LATER)

- Stream Deck SDK ([docs.elgato.com/sdk](https://docs.elgato.com/sdk/)) で Node.js バックエンド +
  Property Inspector (設定 UI) を持つ公式プラグインを実装する。
- 選択肢 B のローカル制御 API をそのままクライアントとして叩く設計にすれば、B の投資をそのまま
  再利用できる (obs-websocket の Stream Deck プラグインが obs-websocket をクライアントとして
  内蔵しているのと同型、§3.1/3.5)。
- 状態 push (B が持つ「現在のミュート状態を通知する」機能) を使えば、Stream Deck のボタンアイコンを
  ミュート中/解除中で切り替えられる — Discord 公式プラグインと同格の UX (§3.2) に到達できる。
- Elgato Marketplace への掲載は任意 (10 人規模の友人サークルなら、掲載せず `.streamDeckPlugin`
  ファイルを直接配布する運用でも十分に成立する可能性がある — 掲載審査対応や継続的な SDK
  バージョン追従のコストを避けられる)。

### 4.4 A と B が共有する「配送経路の後半」

A・B のいずれも、引き金 (OS キーイベント or 認証済みローカル接続) が発火した**後**は、
main プロセスから見て全く同じ処理になる:

```
main プロセス: 何らかの方法で「ミュートトグル要求」を検知
      │
      ▼
mainWindow.webContents.send("native:external-mute-toggle")   ← 新設 IPC チャンネル 1 本
      │
      ▼
shell-preload.cjs: window.selfmatrixNative.onExternalMuteToggle(listener) 経由で cinny へ配達
      │
      ▼
cinny (renderer): callEmbedAtom の現在値があれば .control.toggleMicrophone() を呼ぶ (無ければ no-op)
      │
      ▼
NativeCallControl.toggleMicrophone() → ElementWidgetActions.DeviceMute (widget action、既存無改造)
```

**この共有構造が、§7 の「段階導入 (A → B)」が絵に描いた餅ではなく実際に地続きの投資であることの
裏付けになっている** — B を実装する際、変わるのは図の最上段 (引き金の生成元) だけで、それ以降の
IPC チャンネル・cinny 側の結線・実際のミュート処理は 1 行も変える必要がない設計にできる。

---

## 5. セキュリティ論点

### 5.1 脅威モデル (選択肢 B を前提)

1. **同一マシン上の悪意あるプロセス** — マルウェアや他の非信頼アプリが、ローカルの待受ポートを
   見つけてミュートを勝手に操作しようとする。
2. **悪意あるウェブページ** — ブラウザで開いた不審なページの JS が `ws://127.0.0.1:<port>` へ
   接続を試みる (drive-by)。
3. **トークンの漏洩** — 設定ファイルの誤共有、スクリーンショットへの写り込み等でトークンが漏れる。

### 5.2 対策と、許容できる被害の上限を小さく保つ設計

- §4.2 で述べた「公開する操作をミュート等の無害操作のみに絞る」が最大の防御になる。**この API
  経由で到達可能な最悪の結果を「意図せずミュートされる/解除される」に構造的に固定する**ことで、
  トークン漏洩や認証バイパスが起きた場合の被害上限を低く保つ。これは
  user-customization.md がプラグイン機構について「盗まれて困るものがプロセス内にほぼ無い」
  (OBS の脅威モデル、同文書 §2.2) を安全側の理想として引いているのと同じ発想を、
  外部ミュート制御では**最初から満たせる設計**にする、という話。
- `127.0.0.1` バインド、トークン認証 (定数時間比較)、`Origin` ヘッダによるブラウザ由来接続の排除
  (§4.2) の多層防御。
- 認証失敗の連続に対するレート制限/一時ロックアウトを設け、総当たりを遅くする。
- トークンは設定画面から**再生成可能**にする (漏洩が疑われた場合に運用者が自分で失効できる)。
- ログ/通知: 認証成功でミュート状態が変わった際、あるいは認証失敗が続いた際に、トレイ通知等で
  運用者が気づける経路を用意する (無音でずっと悪用され続ける状態を避ける)。

### 5.3 user-customization.md との整合性

[user-customization.md](user-customization.md) はアプリ内プラグイン機構の検討で、次を設計原則として
確定している (同文書 §6.2):

> プラグイン実行コンテキストには `MatrixClient` インスタンス・アクセストークン・E2EE 鍵ストアへの
> 参照を一切渡さない

および (同文書 §2.2 の対応表):

> websocket (obs-websocket) | (将来候補、本ドラフト対象外) | 外部ミュート制御 (Stream Deck 連携等)
> は requirements.md §9 で SHOULD 済みだが、プラグイン機構とは別系統として native-milestones.md
> 側で検討中。本文書では扱わない

つまり user-customization.md 自身が「外部ミュート制御はプラグイン機構と別系統」と明言しており、
本ドラフトはその別系統を埋める文書になる。**設計思想としては地続き** (narrow capability、
既定は安全側、露出する API 面を必要最小限に絞る) だが、**扱うデータ・到達範囲は全く別**:

| | プラグイン機構 (user-customization.md) | 外部ミュート制御 (本ドラフト) |
| --- | --- | --- |
| 到達し得る対象 | 潜在的に: アクセストークン、E2EE 鍵、全ルームのタイムライン (設計次第で防ぐ対象) | マイクのミュート状態のみ (widget action 1 種類に固定) |
| 実行されるコード | 第三者が書いた任意コード (プラグイン本体) | SelfMatrix 自身が書いた固定ロジック (`toggleMicrophone()` の呼び出しのみ、外部から渡されるのは「トグルしろ」という 1 種類の命令だけ) |
| Matrix セッションへの接触 | サンドボックス設計の主目的そのもの (§3.6 の同一オリジンの穴等) | **そもそも一切接触しない** — widget action は Element Call 側の状態を変えるだけで、cinny の `MatrixClient`/トークンには触れない |

この比較から、**外部ミュート制御はプラグイン機構が警戒する最大級の脅威 (アカウント全体の乗っ取り)
を最初から構造的に持たない**ことが分かる。将来 §4.3 (選択肢 C) やさらなる API 拡張 (screenshare
制御等) を検討する際は、その拡張が「widget action の範囲を超えて Matrix レイヤーに触れ始めるか」
を都度チェックし、触れ始めるならプラグイン機構と同じ厳格さ (capability 宣言、署名検証等) を
適用する、という判断基準を置いておく。

### 5.4 §3.6 の教訓との関係 (念のための確認)

user-customization.md §3.6 は「cinny の EC widget ホスティングが同一オリジン + `allow-same-origin`
になっており、これをそのままプラグインホスティングに流用すると穴になる」という自己コード精読の
発見を記録している。外部ミュート制御はこの穴とは**無関係** — ローカル API サーバーは iframe や
`allow-same-origin` を一切使わず、Electron main プロセスの生の TCP/WebSocket サーバーとして実装
されるため、同種の穴を持ち込む余地がない。念のため明記しておく。

---

## 6. native/web の別

### 6.1 これは native 限定機能か

**はい。** グローバルホットキー (選択肢 A) もローカル制御 API (選択肢 B) も、**web ビルド (ブラウザ)
では原理的に実現できない**:

- **グローバルホットキー**: ブラウザの JS はタブがフォーカスされていない限りキーイベントを一切
  受け取れない。ブラウザには「OS 全体のキー入力を、タブが背面にあっても、あるいはブラウザ自体が
  起動していなくても捕捉する」ための API が存在しない (Electron の `globalShortcut` は Chromium
  ではなく OS のネイティブ API を Electron が薄くラップしたもの)。ブラウザの `Keyboard Lock API`
  等はあくても、それはフォアグラウンドかつフルスクリーンのタブに対する限定的な機能であり、
  「バックグラウンドの別アプリからの外部キー入力を拾う」用途とは別物。Discord のブラウザ版が
  グローバルホットキーを持たない (デスクトップ版だけの機能) のと同じ制約 (§3.2)。
- **ローカル制御 API (常駐サーバー)**: ブラウザのタブは、アクティブでなくなったりバックグラウンドに
  回ると JS の実行が間引かれる/停止し得る (省電力のためのスロットリング)。「ブラウザを閉じていない
  限りポートを開き続ける」という native アプリのプロセスモデルの前提が web には無い。加えて、
  仮に web 版が localhost サーバーを開けたとしても、それは「ブラウザで SelfMatrix のタブを開いて
  いる限りだけ有効」という UX になり、Discord 風の「アプリを常駐させてトレイから使う」体験と
  相容れない。
- **Web Native (R1) の原則との整合**: [web-native-parallel.md](../planning/web-native-parallel.md)
  R1 は「web では**原理的に**できないものだけ native 限定にする」という基準を掲げている
  (「web では難しいから native だけ」ではなく)。外部ミュート制御はこの基準に**明確に該当する**
  — 「難しい」のではなく「ブラウザのサンドボックスモデル上、不可能」である。
- 既に [web-native-parallel.md](../planning/web-native-parallel.md) R3 のフィーチャーマトリクスに
  「トレイ常駐 / 最前面ピン留め / 外部ミュート制御」が `✗ web / ✅ native` として記載済みであり、
  本ドラフトはその分類を裏付ける根拠を提示した形になる。将来 `planning/feature-matrix.md`
  相当の文書が独立して整備される場合も、この分類 (native 限定・理由: OS 統合が必須) をそのまま
  引き継げる。

### 6.2 web ユーザーへの案内

web 版ユーザー (モバイル/Mac 等、[web-native-parallel.md](../planning/web-native-parallel.md) が
「広い受け皿」と位置づける層) は、本機能の対象外になる。これは機能パリティの意図的な差分であり、
運用ルール上は「native 版に切り替えれば使える」という案内で足りる (同文書 R3 の既存の方針に従う)。

---

## 7. 段階導入の推奨案

`planning/native-milestones.md` の M4 「web/native 2 系統の定常運用の確立」の一項目
(「外部ミュート制御 (Stream Deck) の設計着手」) として本ドラフトが起票された経緯を踏まえ、
以下は「M4 内でどこまでやるか / M4 以降に送るか」の目安として提示する。**実際のマイルストーン
番号・優先度は運用者確認 (§8) の後、native-milestones.md/requirements.md 改訂時に確定する。**

| 段階 | 内容 | 目安 | 備考 |
| --- | --- | --- | --- |
| **すぐ着手可 (ほぼ無料)** | トレイ右クリックメニューへのミュートトグル項目追加 (§4.1 末尾) | M4 内、最優先で先行実装候補 | `selfmatrix-desktop/src/main.cjs` の `trayMenuTemplate()` が既にこの拡張を想定した構造 (コメントに明記済み)。新規 IPC チャンネル (§4.4) を先に作る必要があるため、実質的に次段階 (A) の配線を前借りする形になる |
| **A. グローバルホットキー** | `globalShortcut` 登録 + 新設 IPC チャンネル (§4.1、§4.4) | M4 の中心タスク | Stream Deck の標準 Hotkey アクションと組み合わせれば「Stream Deck 対応」の相当部分をここで満たせる可能性がある (要運用者確認、§8 の筆頭) |
| **B. ローカル制御 API** | localhost WebSocket + token 認証 (§4.2) | M4 完了後の次エポック (「M5 相当」、正式番号は改訂時に確定) | A で「Stream Deck の標準機能だけでは足りない」と判明した場合、または他ツールからの汎用制御ニーズが出た場合に着手 |
| **C. 公式 Stream Deck プラグイン** | Stream Deck SDK でのプラグイン開発 (§4.3) | LATER | B が安定し、かつ需要が確認できてから再評価 |

---

## 8. 運用者への確認事項リスト

1. **A (グローバルホットキー) だけで「Stream Deck 対応」の要求は満たされるか。** §3.3 の調査どおり、
   Stream Deck の標準「Hotkey」アクションはキー送出専用であり、SelfMatrix 側が
   `globalShortcut` を実装するだけで Stream Deck から叩けるようになる。これで十分か、それとも
   最初から状態フィードバック (ボタンの見た目がミュート状態に追従する等) や Stream Deck 以外の
   ツールからの利用まで見据えて B まで一気に作るべきか。
2. **B (汎用 API) まで必要なら、想定する外部クライアントは何か。** Stream Deck プラグインだけを
   想定するか、自作スクリプト・将来のモバイル制御アプリ・他社製マクロランチャー (VoiceMeeter や
   AutoHotkey 等) からの利用も見据えるか。想定クライアントの幅によって認証 UX の作り込み度合いが
   変わる。
3. **公式 Stream Deck プラグイン (C) は要るか、それとも「Hotkey アクション + 自分でトークンを
   叩くだけの野良スクリプト」で十分か。** Elgato Marketplace への掲載まで見据えるか、10 人規模の
   友人サークル向けに配布ファイルを直接渡す運用で十分か。
4. **公開する操作の範囲は「マイクミュートのみ」で十分か、デフン (スピーカーミュート) 相当も
   含めたいか。** §4.2 の推奨は「無害な通話コントロールのみ」に絞る方針だが、具体的にどこまでを
   「無害」と見なすかは運用者の判断を仰ぎたい (例: デフンは含めるが screenshare トグルは含めない、
   等の線引き)。
5. **既定のグローバルホットキーのキーバインドに希望はあるか。** 他アプリと衝突しにくい既定値
   (Discord ユーザー文化に倣った F13〜F24 系等) を提案するが、運用者・友人の環境で既に使っている
   キーがあれば避けたい。
6. **トレイのミュートトグル項目 (§7 の「すぐ着手可」) を先行実装してよいか。** 工数がほぼゼロで
   即座に価値が出るため、A/B の設計確定を待たずに着手する価値があると考えている。

---

## 9. この検討が確定したら変わる文書

- `planning/requirements.md` §3 (通話要件)・§9 (決定記録) — 「外部制御サーフェス」の `SHOULD` を
  具体的な選択肢 (A/B のどこまで) の記述へ更新。
- `planning/native-milestones.md` M4 — 本ドラフトを参照する形で「設計着手」から「実装スコープ確定」
  へ進捗を更新。
- `planning/web-native-parallel.md` R3 のフィーチャーマトリクス — 「外部ミュート制御」の行に
  実装段階 (A のみ/A+B等) の注記を追加。
- `planning/backlog.md` の P2「ネイティブ化時の外部ミュート制御」— 状態を「検討待ち」から
  「設計確定・実装待ち」へ更新し、本ドラフトを参照先に追加。
- `design/user-customization.md` — プラグイン機構 (§5.3/§6) 側から本ドラフトへの相互参照を追記
  (「外部ミュート制御は別系統、設計は external-mute-control.md 参照」)。
- (将来) `planning/feature-matrix.md` 相当の文書が独立整備された場合、native 限定の根拠 (§6) を
  そちらにも反映する。
