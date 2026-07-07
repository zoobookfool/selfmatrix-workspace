# システム音声実機確認 + アプリ単位音声キャプチャのスパイク (M1 step 3c-4)

**状態: 完了。M2 前提決定 3 (「アプリ単位の音声は M1 スパイクの結果を見て判断」) への回答として
LATER を推奨。** 対象: [native-milestones.md](../planning/native-milestones.md) M1 step 3c-4 の
残り 2 項目 (system audio 実機確認 / アプリ単位音声キャプチャのスパイク)。

このワークスペースの絶対条件により、検証は loopback (出力ミックスの読み取り) のみで行った。
マイクは一切使っていない (getUserMedia は呼んでいない)。実オーディオデバイスの入出力設定
(既定デバイス選択・音量等) は変更していない。

## 実測 vs 推定の凡例

この文書内の主張はすべて次のどちらかにタグ付けしてある。

- **[実測]**: このワークスペースのプローブコードを実際にこの開発機 (Windows, Electron 43.0.0 /
  Chromium 150.0.7871.46) で実行して得た結果。対応する evidence JSON とプローブコードを
  `native-prototype/` にコミットしてある。
- **[文書]**: Electron 公式ドキュメント / GitHub Issue / Microsoft Learn 等の一次情報からの
  読み取り・推定。実機で確認したものではない。

---

## タスク A: system audio (loopback) 付き配信の実機確認

### 実測結果

`native-prototype/src/system-audio-probe.cjs` (+ `system-audio-probe.html`) を新設し、
`npm run probe:system-audio` で実行できるようにした。`npm test` には含めていない
(音声デバイス依存のため、package.json 参照)。

やっていること: `session.defaultSession.setDisplayMediaRequestHandler()` に main.cjs の
`registerDisplayMediaHandler()` と全く同じ判定式
(`request.audioRequested && process.platform === "win32" ? "loopback" : false`) を登録した上で、
実ページの `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })` を実際に呼び、
返ってきた `MediaStream` を検査する。

**[実測] pass = true** (`native-prototype/evidence/system-audio-result.json`, 2 回の実行で再現):

| 項目 | 結果 |
|---|---|
| `audioTrackCount` | 1 |
| `audioTrackReadyStateInitial` | `"live"` |
| `audioTrackReadyStateAfterSampling` (3 秒後) | `"live"` |
| `audioTrackLabel` | `"System audio"` |
| AnalyserNode で 3 秒間サンプリング (200ms 間隔、15 回) | クラッシュせず完走 (`analyserSampledWithoutCrash: true`) |
| `displayMediaHandlerDiag.audioModeUsed` | `"loopback"` |

タスク A の pass 条件 (audioTrackCount>=1 / readyState live / AnalyserNode 数秒サンプリングで
クラッシュしない) を **全て満たした**。無音 (実スピーカー出力なし) の状態で実行しており、
可聴音の有無はこの判定に含めていない (依頼どおり)。

補足 **[実測]**: 初回実装では `webContents.sendInputEvent()` でボタンクリックを注入したところ
`setDisplayMediaRequestHandler` のハンドラ自体が一度も呼ばれず (`displayMediaDiag.called: false`)
タイムアウトした。この開発機のように自動化スクリプトが裏で起動したウィンドウは実際の OS
フォーカスを得られておらず、Windows のフォーカス奪取防止に阻まれたとみられる。素の DOM
`element.click()` (isTrusted:false の合成クリック) に切り替えたところ即座に成功した。これは
このリポジトリの既存 E2E (`call-control-preload.cjs` の `clickAndReport()` が `target.click()` で
実際に EC のスクリーンシェアを起動できている実績、`evidence/native-callflow-result.json` の
`videoBytesSent` 増加で確認済み) と整合する — この Electron 環境の
`setDisplayMediaRequestHandler` 経路は、ネイティブのソース選択ダイアログを経由しない
(アプリが代わりに source を決めて `callback()` するだけの) ため、getDisplayMedia が spec 上
要求する transient user activation の有無を Chromium 側が検査していない (少なくとも検査に
引っかからない) とみられる。

### EC の実配信での audio 付き getDisplayMedia 要求形状 (調査のみ、実装なし)

依頼どおり実装はせず、`element-call/src/state/CallViewModel/localMember/LocalMember.ts` (行
741-792 付近) と `livekit-client` (`node_modules/livekit-client/dist/livekit-client.esm.mjs`) の
ソースを読んで確認した。**[文書/ソースコード確認]** (実行はしていないが、ビルド済み dist の
実ソースを直接読んでいるため実測に近い確度):

- `toggleScreenSharing()` は `setScreenShareEnabled(true, { audio: { autoGainControl:false,
  noiseSuppression:false, voiceIsolation:false }, resolution, selfBrowserSurface:"include",
  surfaceSwitching:"include", systemAudio:"include" })` を呼ぶ (常に `audio` に truthy な
  object を渡す — screenshare を無効化する設定は無い)。
- livekit-client の `screenCaptureToDisplayMediaStreamOptions()` はこれを
  `getDisplayMedia({ audio: options.audio ?? false, video: ..., systemAudio: options.systemAudio,
  ... })` にそのまま変換する。
- 結論: **EC は screenshare 開始のたびに必ず audio 付きで `getDisplayMedia` を呼ぶ**
  (`request.audioRequested` は常に `true` になる経路)。M1 step 3c-2/3c-3 の実 E2E
  (`native-callflow.e2e.mjs`) で実際に `toggleScreenshare` を実行し成功しているので、この経路は
  タスク A の実測プローブと同じ `registerDisplayMediaHandler()` を実際に通っている
  (main.cjs 側は step 3c-3 で既に両方の session partition に登録済み)。

---

## タスク B: アプリ単位の音声キャプチャのスパイク

### 1. Electron 43 の API 面 **[文書 + 実測 (リフレクション)]**

`session.setDisplayMediaRequestHandler(handler)` の `callback()` に渡せる `audio` フィールドは
Electron 公式ドキュメント (`docs/api/session.md`) によれば次の 3 種類のみ:

- `"loopback"` — システム全体の出力ミックスをキャプチャ (Windows のみ対応、と明記)。
- `"loopbackWithMute"` — 同上 + ローカル再生をミュート。
- `WebFrameMain` インスタンス — **Electron 自身の別フレーム**の音声をキャプチャ (`enableLocalEcho`
  オプションあり)。これは「同じ Electron アプリ内の別ウィンドウ/iframe」限定であり、Discord や
  Spotify のような**外部の別プロセス**の音声には使えない。

`request` 引数には `audioRequested: boolean` と `videoRequested: boolean`、`userGesture: boolean`
はあるが、「どのプロセス/ウィンドウの音声を対象にするか」を選ばせる仕組みは無い。

**[実測]** これがドキュメントの見落としでないかを、このワークスペースの実 Electron 43.0.0 に対して
リフレクションで確認した (`native-prototype/src/app-audio-capture-probe.cjs`、
`npm run probe:app-audio-capture`、evidence:
`native-prototype/evidence/app-audio-capture-api-surface-result.json`):

- `session.defaultSession` のプロトタイプチェーン上に `/audio|loopback|process/i` にマッチする
  メンバー名は **0 件**。
- `desktopCapturer` モジュールの直下にも同じパターンにマッチするメンバーは **0 件**
  (`getSources`/`startHandling`/`stopHandling` のみ)。
- `desktopCapturer.getSources()` が実際に返す `screen:`/`window:` ソースのフィールド形状は両方とも
  `["appIcon", "display_id", "id", "name", "thumbnail"]` のみで、音声関連フィールドは無い。

(注: `setDisplayMediaRequestHandler` 自体はこの正規表現に一致しないメソッド名なので、この
リフレクションは「**既知の 1 API 以外に何か隠れていないか**」の確認であり、それ自体をゼロ件で
示すものではない — 上のドキュメント記載と合わせて判断した。)

`desktopCapturer` にウィンドウ単位音声の口は無い。session/webContents 系にも process loopback
相当の新規 API は無い。Electron 39〜43 のリリースノート **[文書]** を確認した範囲でも、
audio ループバック関連の変更は macOS 向け (ScreenCaptureKit 対応、Issue #47490) が中心で、
Windows 向けに「プロセス単位」を指せる新設 API の追加は見当たらなかった。

### 2. Chromium (Windows) のウィンドウ音声キャプチャ **[文書]**

Chromium/Electron の `"loopback"` は Windows の**旧来からある「システム全体 loopback
capture」**(既定オーディオ出力エンドポイントの IAudioClient loopback) を叩いているだけで、
どのソース (screen/window) を選んでも音声側のスコープは変わらない (システム全体ミックスのまま)。
これは native-milestones.md に既に書かれている前提 (「loopback は『システム全体ミックス』」) と
一致する。

Electron の Issue トラッカーにこの制約に対する要望が複数年にわたって存在し、いずれも
「システム全体でなくアプリ単位で取りたい」という同種の要望である:

- [#18231 "Per window audio capture from getUserMedia"](https://github.com/electron/electron/issues/18231)
- [#25120 "desktopCapture audio capture include application audio on Window 10"](https://github.com/electron/electron/issues/25120)
  (closed as not planned)

これらから、**Electron はプロセス/ウィンドウ単位の音声キャプチャを継承していない
(Chromium 側にその機能が無い、または Electron が公開していない) というのが長年変わらない状態**
と判断した。

### 3. 不可の場合の代替: WASAPI プロセスループバックの自作 **[文書]**

Windows 自体は 2020 年に「特定プロセスツリー (と子孫) の音声だけを、またはそれ以外全部を」
キャプチャできる新しい WASAPI アクティベーションを追加している
(`AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK` +
`ActivateAudioInterfaceAsync`、パラメータ構造体 `AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS`)。これは
Discord の「アプリケーション音声」機能と同種の OS レベル機構であり、Microsoft 公式サンプル
(`microsoft/Windows-classic-samples` の `Samples/ApplicationLoopback`, C++) が存在する。
公式サンプルの記載では **Windows 10 build 20348 以降**を要求すると明記されている
(一般に語られる「2004/19041 以降」よりやや新しいビルド番号だが、これは公式サンプルのページの
記載をそのまま引用したもの)。

**既存 npm 実装**: [`WerdoxDev/application-loopback`](https://github.com/WerdoxDev/application-loopback)
という MIT ライセンスのパッケージが見つかった。ただし:

- Node ネイティブアドオン (napi) ではなく、Microsoft のサンプルを元にコンパイルした**外部 exe を
  子プロセスとして起動し、PCM を stdout にダンプしてそれを Node 側で読む**という構成
  (「ネイティブモジュール」というより「ヘルパープロセス方式」)。
- コミット数 22・公開リリース無し、Windows 10 x64 限定。メンテナンスの継続性は不明で、
  本番組み込み前には最低限のコード監査が要る規模の未成熟な単独開発者プロジェクトとみられる。
- Web Audio / LiveKit へつなぐには、この exe が吐く PCM を自前で `MediaStreamTrack` 化する部分
  (下記) を結局自分で書く必要があり、「npm install するだけ」では完結しない。

自前実装する場合の工数見積り (**推定、実測ではない**):

| 要素 | 内容 | 見積り |
|---|---|---|
| ネイティブ層 | napi (node-addon-api) で COM 非同期アクティベーション (`IActivateAudioInterfaceCompletionHandler`) + `IAudioCaptureClient` からのフレーム取得を実装 | 中 (Windows COM/WASAPI に慣れていれば数日、初めてなら 1〜2 週間) |
| プロセス間の音声転送 | ネイティブ層 (Electron main プロセス内 or 別ヘルパープロセス) → レンダラへのリアルタイム PCM 転送。IPC 越しに音切れ/遅延なく届けるバッファリング設計が要る | 中 |
| レンダラ側の `MediaStreamTrack` 化 | Electron/Chromium に「任意の PCM バッファを直接 MediaStreamTrack にする」公式な差し込み口は無いため、`AudioContext` + `AudioWorkletNode` (もしくは非推奨の `ScriptProcessorNode`) で PCM を書き込み、`MediaStreamAudioDestinationNode` から `MediaStreamTrack` を取り出す形になる。LiveKit の `publishTrack` にはこの track をそのまま渡せる見込み (通常の getUserMedia/getDisplayMedia 由来である必要は無い) | 中 |
| パッケージング/保守 | napi は ABI 安定なので Electron バージョンを跨いだ再ビルドの必要性は比較的低いが、Windows 専用ネイティブビルド (node-gyp + Visual Studio Build Tools/Windows SDK) の CI 整備は要る。M2 決定 1 (Windows のみ) により他 OS 分岐は不要な点はプラス | 小〜中 (継続保守コストとして) |
| **合計** | | **中〜大** |

### 4. 実証できた最小プローブ

`native-prototype/src/app-audio-capture-probe.cjs` (上記 1 節) が該当する。「Electron 43 の API
面に、ドキュメントに載っていない per-app/per-window 音声 API が生えていないか」を実際の
オブジェクトへのリフレクションで確認した。ネイティブ WASAPI プロセスループバックの自作までは
今回のスパイクの範囲外 (依頼は「工数見積り」であり実装ではないため、C++/napi 実装そのものは
行っていない)。

---

## 選択肢の比較表

| 選択肢 | 実現性 | キャプチャ範囲 | 実装コスト | 保守コスト | 成熟度/ライセンス | 根拠 |
|---|---|---|---|---|---|---|
| A. Electron 標準 API (`setDisplayMediaRequestHandler` の `"loopback"`) | **実装済み・実機確認 PASS** | システム全体ミックスのみ (アプリ単位不可) | 極小 (main.cjs に実装済み) | 極小 | Electron 本体 (MIT) | タスク A で実測 |
| B. WASAPI Process Loopback を napi で自作 | 技術的に実現可能。MS 公式 API・公式サンプルあり | 指定プロセスツリー単位 (Discord の「アプリ音声のみ」相当) | 中〜大 | 中 (napi は ABI 安定だが COM/WASAPI 部分は独自メンテ) | 自作なので制約なし | 文書調査 (2-3 節) |
| C. 既存 npm (`application-loopback`) | 一部実証はされている (README ベース) が低成熟 | プロセス単位 | 小 (導入自体) 〜中 (Electron への統合と監査) | 不明瞭 (実質未メンテ想定) | MIT、単独開発者の実験的実装 | 文書調査、コード自体は未実行 |
| D. 何もしない (LATER) | - | - | ゼロ | ゼロ | - | - |

## M2 要件化への推奨

**アプリ単位の音声キャプチャは LATER (M2 の MUST/SHOULD には含めない) を推奨する。**

根拠:

1. Electron 43 には per-app/per-window 音声を取る公式手段が無く **[実測 + 文書]**、
   これは Electron 側の長年 (数年単位) 未解決の既知の制約であり、次のマイナーアップデートで
   急に解消される見込みは薄い。
2. 唯一の実現路線 (WASAPI Process Loopback を napi ネイティブモジュールとして自作し、
   PCM → AudioWorklet 経由で `MediaStreamTrack` 化して LiveKit へ publish する) は工数
   **中〜大**、かつ Windows ネイティブビルドの継続保守という新しい負債を抱える。
3. 既存の npm 実装 (`application-loopback`) は「外部 exe + stdout ダンプ」という設計で
   成熟度も低く、そのまま本番に組み込める状態ではない。
4. 一方で M2 決定 3 により**システム音声 (全体ミックス) は既に要件化済み**であり
   (タスク A で実機確認 PASS)、Discord パリティのうち「配信中に自分の PC の音を届ける」という
   主要ユースケースは既にこれで満たせる。「配信対象アプリの音声だけを選んで届ける」は
   Discord の差別化機能ではあるが、友人サークル規模 (運用者 + 数名) の利用シーンでは、
   全体ミックスで妥協しても実用上の支障は小さいと考えられる。
5. LATER として保留し、次のいずれかが起きたら再評価する: (a) Electron/Chromium が
   per-app 音声キャプチャを公式サポートする、(b) 十分に成熟した (実績のある/メンテされている)
   napi 実装が登場する、(c) 実際の運用で「全体ミックスでは困る」場面が繰り返し発生する。

## 新規・変更ファイル

- 新規: `native-prototype/src/system-audio-probe.cjs` / `system-audio-probe.html` — タスク A の
  実機確認プローブ (`npm run probe:system-audio`)。
- 新規: `native-prototype/src/app-audio-capture-probe.cjs` — タスク B の API サーフェス
  リフレクションプローブ (`npm run probe:app-audio-capture`)。
- 新規: `native-prototype/evidence/system-audio-result.json` / `app-audio-capture-api-surface-result.json`。
- 変更: `native-prototype/package.json` — 上記 2 スクリプトを追加 (`npm test` には含めない)。
- 変更: `native-prototype/README.md` — M1 step 3c-4 のセクションを追加。
- 新規: 本ファイル。
