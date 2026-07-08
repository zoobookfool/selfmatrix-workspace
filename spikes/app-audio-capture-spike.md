# システム音声実機確認 + アプリ単位音声キャプチャのスパイク (M1 step 3c-4)

**状態: 完了。M2 前提決定 3 (「アプリ単位の音声は M1 スパイクの結果を見て判断」) への回答として
LATER を推奨。** 対象: [native-milestones.md](../planning/native-milestones.md) M1 step 3c-4 の
残り 2 項目 (system audio 実機確認 / アプリ単位音声キャプチャのスパイク)。

**2026-07-08 追記**: 運用者指示「アプリ単位音声取得は OBS の機能のイメージ。OBS を参考にできない?」
を受け、OBS Studio の実装 (一次ソース) を参考に具体的な実装計画・工数根拠まで掘り下げた再調査を
末尾の [「2026-07-08 OBS 参考の再調査」](#2026-07-08-obs-参考の再調査) 節に追加した。
**結論 (LATER 推奨) 自体は変わらないが、実装経路はこの再調査でかなり具体化された** (特に
Element Call 側の統合ポイント: `CallEmbed.ts` からの `getDisplayMedia` 差し替えで EC/livekit-client
本体には一切手を入れずに済む設計が見えた)。以下の本文 (タスク A/B) は 2026-07-07 時点の初回スパイクを
そのまま残してある。

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

---

## 2026-07-08 OBS 参考の再調査

運用者指示:「アプリ単位音声取得は OBS の機能のイメージ。OBS を参考にできない?」を受け、前回スパイク
(上記) の結論 (LATER 推奨) を、OBS Studio の実装を一次ソースで確認したうえで、実装計画・工数根拠まで
掘り下げて再検証した。**再委譲はせず全て自分で調査・実行した。** git 操作 (commit/push/checkout/
restore/reset) は行っていない。npm install は隔離ディレクトリ
(`scratchpad/app-audio-probe/`) のみで実施し、cinny/native-prototype には一切手を加えていない。

凡例は前回スパイクと同じ: **[実測]** = このワークスペース (隔離ディレクトリ) で実際にコマンドを
実行して得た結果。**[実測(直接確認)]** = GitHub 上の一次ソースファイル (COPYING/LICENSE 等) を
直接取得して文面を確認したもの (コードは実行していないが、二次情報の伝聞ではない)。**[文書]** =
Microsoft Learn / GitHub Issue / npm registry 等の一次情報を読んだ結果 (実行はしていない)。**[設計]**
= 今回新たに導き出した実装方針 (未実装・未検証)。

### 1. OBS の実装の正体 [実測(直接確認) + 文書]

OBS Studio 本体の「Application Audio Capture (Beta)」は `plugins/win-wasapi/win-wasapi.cpp`
(obsproject/obs-studio, master) に実装されている。前身は
[bozbez/win-capture-audio](https://github.com/bozbez/win-capture-audio) というサードパーティ
プラグインで、OBS 28.0 でこの機能 (v2.1.0-beta 相当) が本体にマージされた。

**使用している Win32 API** (win-wasapi.cpp から実際に引用):

```c
res = activate_audio_interface_async(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                                      __uuidof(IAudioClient), &activateParams,
                                      handler.Get(), &asyncOp);
...
audioclientActivationParams.ActivationType =
  AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
audioclientActivationParams.ProcessLoopbackParams.ProcessLoopbackMode =
  PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
```

対象プロセスの特定は、OBS のウィンドウキャプチャ選択 UI で選ばれた `hwnd` から
`GetWindowThreadProcessId(hwnd, &dwProcessId)` で PID を引き、それを
`ProcessLoopbackParams.TargetProcessId` に渡す方式 (ウィンドウ選択 → PID 逆引き、という導線は
OBS のゲームキャプチャ/ウィンドウキャプチャと同じ UX パターン)。

**「プロセスツリー」の意味** — MS Learn の一次ソース (`PROCESS_LOOPBACK_MODE` 列挙型) を確認した:

| 定数 | 説明 (原文引用) |
|---|---|
| `PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE` | "Render streams from the specified process and its child processes are included in the activated process loopback stream." |
| `PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE` | "Render streams from the specified process and its child processes are excluded from the activated process loopback stream." |

つまり文字通り「指定 PID + その子孫プロセス全て」が単位になる。これは字面だけでなく実例でも
裏付けられた: [obs-studio issue #9669](https://github.com/obsproject/obs-studio/issues/9669) は、
Streamer.bot から起動された OBS 自身が「Streamer.bot のプロセスツリー」に含まれてしまい、
Streamer.bot のアプリ音声キャプチャに OBS 自身の音まで混入するという報告で、OBS 側は
「プロセスツリー捕捉を無効化するトグルを追加してほしい」という要望を "not planned" でクローズしている
(=常時 INCLUDE 固定で運用中)。Chrome/Discord のような**マルチプロセスアプリでは「タブ/レンダラごと」
ではなくブラウザ全体の全タブ・全プロセスがまとめて対象になる**ことを意味し、選択の粒度としては
「ウィンドウ単位」というより「そのウィンドウを持つアプリの全プロセスツリー単位」であることに注意が要る。

**既知の制約 (MS Learn 一次ソースで確認できたもの)**:

- **排他モード (exclusive mode) は対象外**: [loopback-recording](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)
  に "A client can enable loopback mode only for a shared-mode stream
  (AUDCLNT_SHAREMODE_SHARED). Exclusive-mode streams cannot operate in loopback mode." と明記。
  排他モードで音声出力しているアプリ (一部のプロプライエタリなオーディオソフト等) は原理的に
  キャプチャ不可。
- **保護コンテンツ (DRM) は除外**: 同ページに "a trusted audio driver does not permit a loopback
  device to capture digital streams that contain protected content" と明記。DRM 保護された
  再生ストリームは信頼済みオーディオドライバの時点でループバックから弾かれる。
- **必要 Windows バージョン**: `PROCESS_LOOPBACK_MODE` の Requirements 表で
  "Minimum supported client: Windows 10 Build 20348" と明記 (前回スパイクの記述と一致)。OBS の
  公式ガイドでは実務上「Windows 10 (Version 2004 以降) and Windows 11」と案内している (どちらも
  同じ制約の言い換え)。
- **サンプルレート/フォーマット**: win-wasapi.cpp は `KSDATAFORMAT_SUBTYPE_IEEE_FLOAT` を明示指定し、
  OBS 側の設定サンプルレートで `IAudioClient` を初期化している (WASAPI 共有モードの内部リサンプラーに
  変換を委ねる設計)。公式 API ドキュメントにフォーマット固定の明記は無いが、実務ではデバイスの
  ミックスフォーマット (一般的に 48kHz / float32 / stereo) に依存する。tsubome/ProcessAudioCapture
  (後述) は README で「48kHz, 32bit float, stereo 固定」と明言しており、この前提を裏付ける。
- **システム音 (全体ミックス) からの除外は自動では起きない**: [OBS 公式ガイド
  (Application Audio Capture Guide)](https://obsproject.com/kb/application-audio-capture-guide)
  を確認したところ、Application Audio Capture は既定の Desktop Audio (システム全体 loopback) とは
  **独立した別パイプライン**であり、両方を有効にしていると同じ音を二重に拾って「エコーが聞こえる」
  問題が起きる。公式ガイドは「Desktop Audio をグローバル無効化するか、Desktop Audio 側の
  "Capture all audio EXCEPT sessions from selected executables" で対象アプリを除外すること」を
  推奨している。**これは SelfMatrix の設計にも直結する論点** — 下記 4 節で扱う。
- **既知の非対応ケース**: 同公式ガイドは「一部アプリの音声出力方式によっては Application Audio
  Capture (BETA) と非互換」と明記し、具体例として **Valorant と Call of Duty のボイスチャット音声**
  を名指ししている (代替として VB-Cable 等の仮想オーディオケーブルを推奨)。OBS という何年も磨かれた
  一次実装ですら 100% のアプリ網羅はできていない、という現実的な上限を示す実例。

### 2. ライセンス [実測(直接確認) + 判断]

一次ソースを直接取得して確認した:

| リポジトリ | ライセンス | 確認方法 |
|---|---|---|
| obsproject/obs-studio (`COPYING`) | GNU GPL **Version 2** (June 1991) 全文 | [実測(直接確認)] raw ファイル取得 |
| bozbez/win-capture-audio (`LICENSE`) | GNU GPL **Version 2** | [実測(直接確認)] raw ファイル取得 |
| microsoft/Windows-classic-samples (`LICENSE`) | **MIT License** (Copyright (c) Microsoft Corporation)。一部フォントアセットのみ SIL OFL (今回のコードとは無関係) | [実測(直接確認)] raw ファイル取得 |

**判断**: OBS/win-capture-audio のソースコードを読んで API の呼び方・落とし穴を理解すること自体は
著作権上問題にならない (アイデアや API 呼び出しパターンそのものは保護対象ではない)。しかし、その
GPL-2.0 のコード文言を実際にコピー・改変して AGPL-3.0 ベースの cinny/element-call fork (+独自シェル)
に組み込むと:

1. 組み込んだファイル/モジュールに GPL-2.0 の頒布義務 (ソース開示・ライセンス文表示等) が発生する。
2. GPL-2.0-only のコードと AGPL-3.0 のコードを 1 つの結合著作物として頒布することは、ライセンス
   両立性の観点で問題になりうる (GPL-2.0-only は AGPL-3.0 と非両立。GPL-2.0 側が「or (at your
   option) any later version」を採用していれば GPLv3 経由で AGPLv3 と両立できるが、OBS/
   win-capture-audio の個々のファイルが実際に「or later」を採用しているかは未確認)。
3. 友人サークル規模への配布であっても GPL の「頒布 (convey)」要件はビルド済みバイナリを渡した
   時点でトリガーされ得るため、実務上の手間・リスクになる。

**推奨**: **実装のベースは OBS/win-capture-audio ではなく、Microsoft 公式の ApplicationLoopback
サンプル (MIT) を使う。** 呼び出す Win32 API 自体は完全に同一 (`ActivateAudioInterfaceAsync` +
`AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK`) なので、MIT サンプルを直接の実装ベースにすれば
ライセンス上のグレーゾーンを最初から避けられる。OBS/win-capture-audio のソースは「システムがどう
振る舞うべきか (実例・既知の落とし穴)」を学ぶための参考資料として読むにとどめ、コードはコピーしない
方針とする。

傍証: 後述の WerdoxDev/application-loopback (MIT) 自身が README で「Microsoft's classic samples
repo のサンプルを削ぎ落としたもの」と明言しており、MIT サンプル起点の実装が実際に成立する/
一般的であることを裏付けている。

### 3. napi/Node ネイティブモジュールの現状 (2026-07 時点) [実測 + 文書]

**[実測]** このワークスペースの隔離ディレクトリ (`scratchpad/app-audio-probe/`, cinny/
native-prototype とは無関係) で `npm install application-loopback` (WerdoxDev 作, MIT) を実際に
試した。

- このマシンには `cl.exe` (MSVC) / `node-gyp` / `MSBuild` のいずれも PATH に無いことを確認済み
  (`where` コマンドでいずれも「見つかりません」)。にもかかわらず**インストールは問題なく成功した**
  — このパッケージは `bin/win32-x64/ApplicationLoopback.exe` と `ProcessList.exe` という
  **prebuilt exe を同梱**しており、ビルドツール不要でインストールできる設計だったため。
- 前回スパイク時点 (2026-07-07) は「コミット 22・公開リリース無し」という記述だったが、
  **[実測] npm registry** (`registry.npmjs.org/application-loopback`) を確認したところ最新版は
  `1.2.7` (2025-11-13 公開) で、GitHub 上のリリースは相変わらず 0 件のまま npm へは継続的に
  公開され続けている状態だった。アーキテクチャは変わらず「napi ネイティブアドオンではなく、外部
  exe を child_process として spawn し、stdout から生 PCM を読む」方式のまま
  (`dist/index.cjs` を直接読んで確認)。
- **[実測]** `getActiveWindowProcessIds()` を実行し、この開発機で実際に起動中の全ウィンドウ/PID
  一覧 (十数件) を正しく取得できることを確認した (`ProcessList.exe` の実行に成功)。
- **[実測]** `startAudioCapture(pid, { onData })` を複数シナリオで実行:
  1. 実行中の実アプリ (ブラウザ) の PID を対象に 3 秒間試行 → エラー無し、**0 バイト**。
  2. 既知の音源として、PowerShell 自身に `[System.Media.SystemSounds]::Asterisk.Play()` を
     複数回実行させ、その PowerShell プロセスの PID を対象に約 5.5 秒間試行 (既定の出力デバイス/
     音量設定は変更していない) → エラー無し、**0 バイト**。
  3. コントロールとして、存在しない PID (`999999`) を対象に 2.5 秒試行 → こちらもエラー無し、
     **0 バイト** (有効な PID の場合と区別できない挙動)。
  - **結論: この開発機では実際の PCM データ取得を確認できなかった。** かつ、有効な PID と明らかに
    無効な PID とで挙動に差が出ず、**このツールにはエラー/状態通知の手段が皆無**であることが
    判明した (`stderr` も空、例外も投げない)。原因は未特定 — 候補として、この開発機には
    `Get-CimInstance Win32_SoundDevice` で確認した限り Realtek USB Audio, AMD Streaming Audio
    Device, Steam Streaming Speakers, SteelSeries Sonar Virtual Audio Device など多数のオーディオ
    デバイスが導入されており、既定の出力デバイスが Realtek 以外である可能性がある (このワークスペース
    の既存メモに「実オーディオを使う検証は必ず Realtek を指定」という運用ノートがあるのはこの多重
    デバイス環境が理由とみられる)。今回はデバイス切り替えという実機設定変更を伴うため、このタスクの
    安全側の判断として深追いはしなかった。**「プロセス一覧取得は成功したが、実際のオーディオ
    キャプチャの成功は実測できなかった」というのが正直な結論。**
  - この「エラーが一切出ない」という挙動自体が重要な実測結果であり、本番導入する場合の弱点として
    そのまま工数見積りに反映する (下記 6 節)。

**新たに見つかった類似プロジェクト [文書]**:

| プロジェクト | 言語/バインディング | ライセンス | 活動状況 | 備考 |
|---|---|---|---|---|
| [tsubome/ProcessAudioCapture](https://github.com/tsubome/ProcessAudioCapture) | C++ DLL + **Python バインディングのみ** (Node/napi 無し) | MIT | 2025-12-03 公開 (v1.0.0)、star 1・commit 6 | README で MS 公式サンプル由来を明言。48kHz/32bit float/stereo 固定、DRM 非対応と明記 (MS 公式ドキュメントの制約と整合) |
| [huxinhai/audio-capture](https://github.com/huxinhai/audiotee-wasapi) (旧名 audiotee-wasapi) | C++ (Win: WASAPI / Mac: ScreenCaptureKit) | 明記なし | 2026-05-15 v2.0.0、star 11 | クロスプラットフォーム志向だが**プロセス単位フィルタは「未実装 (📝 planned)」**、現状はシステム全体ループバックのみ |
| [alectrocute/electron-audio-loopback](https://github.com/alectrocute/electron-audio-loopback) | TypeScript (Electron の `getDisplayMedia` パッチ) | MIT | npm 1.0.6、2025-08-03 公開、star 118 | **システム全体**ループバック (プロセス単位ではない)。SelfMatrix が既に実装済みの Task A 相当と同種。nodeIntegration 無効でも動く IPC 設計は参考になる |

結論: **2026 年 7 月時点でも、Electron/Node 向けに「本番投入できる成熟した WASAPI プロセスループバック
napi モジュール」は存在しない。** 唯一のプロセス単位対応 npm パッケージ (WerdoxDev/
application-loopback) は今も外部 exe 方式のままで、今回の実測でエラー通知皆無という運用上の弱点も
新たに判明した。

**napi-rs + windows crate (Rust) の可能性 [文書]**: Microsoft 公式の `windows` crate
(ライセンス: MIT OR Apache-2.0、[microsoft/windows-rs](https://github.com/microsoft/windows-rs))
には `ActivateAudioInterfaceAsync` / `VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK` 等のバインディングが
既に用意されている ([microsoft.github.io/windows-docs-rs](https://microsoft.github.io/windows-docs-rs/doc/windows/Win32/Media/Audio/fn.ActivateAudioInterfaceAsync.html)
で確認)。COM シグネチャを自前で FFI 宣言し直す手間が省ける。ただし「napi-rs + windows crate で
process loopback を実装した公開実装」は検索した範囲では見つからず、車輪はあるが組み立ては自分で
やる必要がある。napi-rs は GitHub Actions ベースの複数ターゲット prebuild テンプレートを備えており
(Windows 専用に絞る前提なら)、node-gyp + Visual Studio Build Tools 方式より CI での prebuild 配布の
ハードルは低いと見込める。

### 4. Electron 統合経路の具体化 [ソースコード確認 + 設計]

**重要な発見 (このワークスペースの実ソースを確認して判明)**: cinny の `CallEmbed.ts`
(`cinny/src/app/plugins/call/CallEmbed.ts`) を読んだところ、Element Call は**同一 origin の
ただの `<iframe>`** として埋め込まれている:

```ts
iframe.sandbox =
  'allow-forms allow-scripts allow-same-origin allow-popups allow-modals allow-downloads';
iframe.src = url; // url は `${cinny の origin}/public/element-call/index.html?...`
```

`allow-same-origin` が付与されており、かつ実際に cinny と同一 origin から配信されるため、
**別 BrowserWindow でも `<webview>` でもなく、cinny 側の親フレーム JS から `iframe.contentWindow`
に (クロスオリジン制限なしで) 直接アクセスできる**。

さらに element-call が実際に使っている `livekit-client` の配布物
(`element-call/node_modules/.pnpm/livekit-client@2.19.0.../dist/livekit-client.esm.mjs`) を
確認したところ、`createLocalScreenTracks()` / `createScreenTracks()` は**呼び出しの都度**

```js
const stream = yield navigator.mediaDevices.getDisplayMedia(constraints);
...
if (stream.getAudioTracks().length > 0) {
  const screenAudio = new LocalAudioTrack(stream.getAudioTracks()[0], undefined, false);
  screenAudio.source = Track.Source.ScreenShareAudio;
}
```

という形で `navigator.mediaDevices.getDisplayMedia` を呼び、返ってきた `stream` の
`getAudioTracks()[0]` を**無条件にそのまま** `LocalAudioTrack` にラップしているだけであり、
モジュール読み込み時に関数参照をキャッシュしてもいない (呼び出し時点の `navigator.mediaDevices.
getDisplayMedia` を毎回引く)。

**この 2 点から導かれる設計 [設計・未実装]**: **EC/livekit-client 本体には一切手を入れず**、
cinny の `CallEmbed.ts` 側だけで以下の割り込みが可能と判断できる。

1. iframe 生成直後 (`constructor` 内、`container.append(iframe)` の後) に
   `iframe.contentWindow.navigator.mediaDevices.getDisplayMedia` を関数ラッパーで差し替える。
   Web Audio グラフの構築 (`AudioContext`, `AudioWorkletNode`,
   `MediaStreamAudioDestinationNode` 等) も **iframe 側の realm のコンストラクタ**
   (`iframe.contentWindow.AudioContext` 等) を使って組み立てることで、realm をまたぐ
   オブジェクト生成の懸念を避ける。
2. ラッパーの処理: (a) 元の `getDisplayMedia` を呼び出しビデオ + (あれば) システム loopback
   音声トラックを取得 → (b) main プロセス経由でネイティブ capture モジュールから届く
   アプリ単位 PCM を、iframe realm の `AudioWorkletNode` (または `MediaStreamTrackGenerator`,
   `kind: "audio"` — Chrome 94 以降で対応済みなので Electron 43 / Chromium 150 で確実に利用可能、
   [Chrome for Developers の Insertable Streams ドキュメント](https://developer.chrome.com/docs/capabilities/web-apis/mediastreamtrack-insertable-media-processing)
   で確認) に書き込み MediaStreamTrack 化 → (c) 必要ならシステム loopback トラックとも
   `AudioContext` 上でミックス → (d) 最終的な音声トラックで `stream` のオーディオトラックを
   差し替えてから返す。
3. 呼び出し元 (`createScreenTracks`) は差し替え後の `stream` をそのまま使うため、EC/
   livekit-client 側のコード変更は不要。
4. LiveKit の `LocalAudioTrack` コンストラクタは任意の `MediaStreamTrack` を受け付ける仕様である
   ことを [LiveKit 公式ドキュメント (Processing raw media tracks)](https://docs.livekit.io/home/client/tracks/raw-tracks/)
   で確認済み — カスタムソースの音声トラックを渡すこと自体は SDK のサポート範囲内。

**未検証・要検証事項として明記** (今回は設計レベルの調査に留め、実装/実機検証はしていない):

- (a) 同一 origin iframe をまたいだ `MediaStream`/`MediaStreamTrack` の受け渡しが実際に問題なく
  動くか (理論上は同一 origin なので問題ないはずだが未検証)。
- (b) main プロセスのネイティブ capture モジュール → レンダラプロセス (かつ iframe 内) への
  リアルタイム PCM 転送経路。Electron の `ipcRenderer` は preload スクリプト経由が基本だが、
  iframe 自体は EC 自身のバンドルが動いており cinny 用の preload とは別コンテキストの可能性が
  高いため、実際には「親フレーム (cinny のメインレンダラ、preload 経由で IPC 受信可能) が PCM を
  受け取り、`iframe.contentWindow` 経由で iframe realm 内の `AudioWorklet` に直接メッセージを
  渡す」形になる可能性が高い (要設計確定)。
- (c) 遅延: main プロセスのネイティブキャプチャ → IPC → AudioWorklet 処理の全経路で数十 ms 程度の
  バッファリング遅延が想定されるが、実測はしていない。
- (d) クロック同期: ネイティブキャプチャのタイムスタンプと Web Audio のタイムスタンプ系は別物なので、
  AudioWorklet への書き込みはジッターバッファ (数十〜100ms 程度) を挟んだ free-running 再生になり、
  映像との正確な A/V 同期は保証されない設計になる可能性が高い (「デスクトップ音声を配信に足す」
  用途では通常許容範囲と想定)。
- (e) **二重取得の回避**: OBS が抱えるのと同じ問題 (1 節参照) がそのまま当てはまる。アプリ単位音声を
  追加する場合、既存のシステム全体 loopback (タスク A で実装済み) と**同時に有効化すると同じ音を
  二重に配信してしまう**。設計としては「アプリ単位音声が有効な間はシステム全体 loopback を無効化し
  完全に置き換える」のが最もシンプルで、OBS のように「システム音声から特定アプリだけ除外する」
  高度な制御は当面不要と考える (友人サークル規模の用途では過剰)。

**「自 frame の音を audio として返す仕組み」(`WebFrameMain` の `enableLocalEcho`) の転用検討**:
Electron 公式ドキュメントで `WebFrameMain` を `setDisplayMediaRequestHandler` の `audio` に渡すと
**その frame 自身が再生している音声をキャプチャできる**ことを確認した [文書]。理論上、「ネイティブ
キャプチャした PCM を一旦隠し frame で再生 → その frame を `WebFrameMain` として `audio` に渡して
"再キャプチャ"する」という迂回は技術的には成立しうる。しかし**今回の設計 (上記 1〜4) ではそもそも
PCM を AudioWorklet/`MediaStreamTrackGenerator` 経由で直接 `MediaStreamTrack` にできるため、この
迂回は不要**という結論に至った — 隠しウィンドウで一度音を鳴らして録り直すのは、追加の遅延・音質
劣化・実装の複雑さが増えるだけで得るものがない。この迂回策は「もし `AudioWorklet`/
`MediaStreamTrackGenerator` が何らかの制約で使えなかった場合の代替 Plan B」として記録に留める。

### 5. 最小実証 [実測]

- **ビルド環境の欠如を確認**: このマシンには `cl.exe` (MSVC) / `node-gyp` / `MSBuild` のいずれも
  無いことを `where` コマンドで確認した (いずれも「指定されたパターンのファイルが見つかりません」)。
  よって C++/Rust のネイティブアドオンを自前でコンパイルする実証はできない。
- 代わりに、隔離ディレクトリ (`scratchpad/app-audio-probe/`) で prebuilt exe 同梱の
  `application-loopback` (npm, MIT) を実際にインストール・実行し、「ビルドツール無しでも試せる」
  経路で実証を行った。結果は 3 節の通り: **インストール・プロセス列挙は成功、実際の PCM 取得は
  今回のテスト内では確認できなかった** (原因未特定。デバイス切り替え等の実機設定変更は安全側の
  判断として行わなかったため、これ以上は深追いしていない)。
- 使用したファイルは全て隔離ディレクトリ内のみ (`package.json`, `list-processes.cjs`,
  `capture-probe.cjs`, `raw-spawn-probe.cjs`, `known-source-capture-probe.cjs`,
  `known-source-capture-probe2.cjs`)。cinny/native-prototype には一切手を加えていない。実行中の
  ウィンドウタイトルの実データ (個人のファイルパスを含む) は本文書には転記していない
  (件数・種類のみ記載)。バックグラウンドに残っていたプロセスが無いことも確認済み。

### 6. 工数の再見積り (分解)

前回スパイクの「中〜大」という一括見積りを、今回の調査で判明した内容を踏まえて要素分解する
(**すべて推定、実装はしていない**)。「前回」列は前回スパイクの一括見積りとの対比。

| 要素 | 内容 | 見積り | 前回からの変化 |
|---|---|---|---|
| ネイティブ capture モジュール | Rust (napi-rs + `windows` crate, MIT OR Apache-2.0) か C++ (node-addon-api) で、MS 公式 MIT サンプルをベースに COM 非同期アクティベーション + `IAudioCaptureClient` フレーム取得を実装。既存 OSS (WerdoxDev 版) には皆無だった**エラー/状態通知 (HRESULT 伝播、デバイス変更・対象プロセス終了時のイベント通知等) を作り込む**必要がある (今回の実測で自明になった弱点) | 中 (数日〜1.5週間程度。`windows` crate のバインディングが既製なので COM シグネチャの手書きは不要だが、エラー処理を欲張ると増える) | ほぼ横ばい (バインディングの存在でやや軽くなるが、エラー処理の作り込みで相殺) |
| フォーマット処理 | 対象デバイスのミックスフォーマット (実務上 48kHz/float32/stereo が多いが保証はない) を実行時に検出し、必要なら LiveKit 側が期待するサンプルレートへの変換を挟む | 小〜中 (新規に明示化した項目) | 前回は暗黙的にしか触れていなかった項目を明示化 |
| プロセス間の音声転送 | ネイティブ層 (Electron main プロセス内 or 別ヘルパープロセス) → レンダラ (かつ EC の iframe realm) へのリアルタイム PCM 転送。iframe をまたぐ経路の設計が新たに必要になった (4 節) | 中 | ほぼ横ばい (iframe 越えの経路が新たに明確になった分、設計の見通しは良くなった) |
| iframe realm での `MediaStreamTrack` 化 | `AudioWorkletNode` (または `MediaStreamTrackGenerator`, kind:"audio") + `MediaStreamAudioDestinationNode` で PCM を `MediaStreamTrack` 化 | 中 | 横ばい (使う API 自体は前回と同じ想定) |
| EC 統合 (`getDisplayMedia` 差し替え) | `CallEmbed.ts` で iframe の `getDisplayMedia` をラップし、システム loopback トラックとのミックス/差し替えを行う。**EC/livekit-client 本体の改修は不要**と判明 (4 節) | 小〜中 (前回は「EC 側の受け口」自体が未知数だったため見積り不能に近かった) | **明確に軽くなった** — 統合ポイントが具体的なファイル・具体的な差し込み方法まで特定できた |
| 二重取得回避の設計/UI | アプリ単位音声 ON 時にシステム loopback を自動的に無効化する切り替えロジック、UI 上の選択 (アプリ選択 UI、`desktopCapturer`/`getActiveWindowProcessIds` 相当の一覧表示) | 小〜中 (新規に明示化した項目。OBS の実例調査で判明した論点) | 前回は無かった項目 |
| パッケージング/保守 | napi は ABI 安定なので Electron バージョンを跨いだ再ビルド必要性は低いが、Windows 専用ネイティブビルドの CI 整備は要る。napi-rs の prebuild テンプレートを使えば node-gyp 方式より多少軽い見込み | 小〜中 (継続保守コスト) | やや軽くなった (napi-rs のエコシステムの分) |
| **合計** | | **中 (中の下寄り)** | 「中〜大」から**「大」の要素が後退し、範囲が絞られた**。ただし「小」には落ちない — ネイティブ Windows モジュールの新規開発・保守という性質上の下限がある |

**工数見積りが動いた理由のまとめ**:

1. **軽くなった要素**: EC 統合経路が具体化した (`CallEmbed.ts` での `getDisplayMedia` 差し替えで
   EC/livekit-client 本体は無改修) ことで、前回「不明」だった最大の不確実性の 1 つが解消した。
   `windows` crate の存在で COM バインディングの手書きも不要になった。
2. **新たに顕在化した/横ばいの要素**: (a) 既存 OSS 実装の実測でエラー通知が皆無と判明し、自作でも
   ここを丁寧に作らないと運用時にデバッグ不能になることが分かった。(b) フォーマット検出/変換、
   (c) 二重取得回避の設計、(d) iframe をまたぐ転送経路の設計、が新たに明示的なタスクとして
   浮上した。
3. **どうやっても消えない上限**: OBS という何年も磨かれた一次実装ですら Valorant/COD 等の一部
   アプリで非互換と公式に認めている。**どれだけ工数をかけても「全アプリ 100% 対応」にはならない**
   という製品的な限界がある。

### 7. 選択肢の比較表 (更新)

| 選択肢 | 実現性 | キャプチャ範囲 | 実装コスト | 保守コスト | ライセンス | 根拠 |
|---|---|---|---|---|---|---|
| A. Electron 標準 API (`"loopback"`) | **実装済み・実機確認 PASS** | システム全体ミックスのみ | 極小 (実装済み) | 極小 | Electron 本体 (MIT) | 前回スパイク タスク A |
| B. WASAPI Process Loopback を napi/napi-rs で自作 (MS 公式 MIT サンプルをベースに) | 技術的に実現可能。API 面・EC 統合経路とも具体化済み | 指定プロセスツリー単位 (Discord の「アプリ音声のみ」相当) | **中 (中の下寄り)** — 前回「中〜大」から絞られた | 中 (napi は ABI 安定だが COM/WASAPI 部分・エラー処理は独自メンテ) | MIT サンプル起点なので自由 | 今回の再調査 (1〜6 節) |
| C. 既存 npm (`application-loopback`, WerdoxDev) | インストールは容易 (prebuilt exe 同梱、ビルドツール不要と実測確認)。ただし**実際の PCM 取得は実機で確認できず、エラー通知も皆無**と判明 | プロセス単位 (設計上は) | 小 (導入) 〜中 (デバッグ・監査。エラーが見えない分むしろ大変) | 不明瞭 (GitHub リリース無し、issue 2 件未解決) | MIT | [実測] 隔離ディレクトリでのインストール・実行 |
| D. 何もしない (LATER) | - | - | ゼロ | ゼロ | - | - |

### 8. M2 要件化への推奨 (更新)

**結論は前回と同じく LATER を維持する。** ただし根拠は今回の調査でより具体的になった:

1. OBS の一次実装を確認した結果、使っている Win32 API・制約 (排他モード除外、DRM 除外、
   プロセスツリー単位、システム音との二重取得問題) は全て文書化でき、**技術的な実現可能性の面では
   「やればできる」ことが明確になった**。これは前回の「Electron に口が無い」で止まっていた調査より
   一歩前進している。
2. 一方で、**2026 年 7 月時点でも "npm install するだけ" で使える成熟したプロセス単位オーディオ
   キャプチャの napi モジュールは存在しない**。唯一のプロセス単位対応パッケージ
   (WerdoxDev/application-loopback) は実測でエラー通知皆無・PCM 取得未確認という弱点が判明し、
   本番導入するにはこの部分から自作し直す必要がある。
3. EC 統合経路 (`CallEmbed.ts` での `getDisplayMedia` 差し替え) は具体化できたが、実機未検証の
   要素 (iframe 越えの `MediaStreamTrack` 受け渡し、IPC 転送経路、遅延) がまだ複数残っており、
   実装に着手すれば追加の検証コストが発生する。
4. OBS という何年も磨かれた実装ですら Valorant/COD 等の実アプリで非互換を公式に認めている
   ことから、**自作しても「全アプリで完璧に動く」機能にはならない**という製品的な上限がある。
5. 友人サークル規模の利用シーンでは、M2 で既に要件化・実機確認済みのシステム全体 loopback
   (タスク A) で「配信中に自分の PC の音を届ける」という主要ユースケースは満たせている。
   「配信対象アプリの音声だけを選んで届ける」は差別化機能ではあるが、必須度は低い。
6. 工数は「中〜大」から**「中 (中の下寄り)」に絞られた**ため、前回よりは着手のハードルが下がって
   いる。**LATER で保留するが、M3 以降に検討する場合は「何を作ればよいか」が今回の調査で
   ほぼ設計レベルまで固まっている**ため、着手判断さえ付けば前回時点より速く動けると見込む。
7. 再評価のトリガーは前回と同じ: (a) Electron/Chromium が per-app 音声キャプチャを公式サポートする、
   (b) 十分に成熟した (エラー処理も含めて実用的な) napi 実装が登場する、(c) 実際の運用で
   「全体ミックスでは困る」場面が繰り返し発生する。

### 総括 (結論サマリ)

- **OBS の方式は流用可能か**: **API の使い方 (WASAPI Process Loopback) はそのまま参考にしてよいが、
  コードは流用しない。** 実装のベースは OBS/win-capture-audio (GPL-2.0) ではなく、Microsoft 公式
  ApplicationLoopback サンプル (MIT) にする。
- **最短経路**: (1) MS 公式 MIT サンプルを Rust (napi-rs + `windows` crate) か C++ に移植して
  ネイティブ capture モジュールを自作 (エラー処理も含めて作り込む) → (2) main プロセスから
  レンダラ (cinny メインフレーム) へ IPC で PCM 転送 → (3) `CallEmbed.ts` で iframe の
  `getDisplayMedia` を差し替え、iframe realm 内の `AudioWorkletNode`/`MediaStreamTrackGenerator`
  で `MediaStreamTrack` 化し、システム loopback トラックと排他的に切り替え → (4) EC/livekit-client
  本体は無改修で `LocalAudioTrack` に自然に載る。
- **工数**: 前回「中〜大」→ 今回の分解で **「中 (中の下寄り)」** に絞られた。ネイティブ Windows
  モジュールの新規開発・保守という性質上、「小」までは下がらない。
- **推奨**: **LATER を維持** (M2 の MUST/SHOULD には含めない)。ただし設計はほぼ固まったので、
  M3 以降で着手判断する際のリードタイムは短縮できる見込み。
