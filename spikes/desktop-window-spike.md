# Desktop Window Spike: WebContentsView 再親子付け検証 (未実施)

**状態: 次の判断ゲート。** [native-client-rethink.md](../design/native-client-rethink.md) の案 B
(Electron シェル + 通話を WebContentsView 分離) が成立するかを、実装前に小さく検証する。

## 検証したい仮説

Electron の `WebContentsView` に EC widget / LiveKit 通話を載せ、同じ view をメインウィンドウと
通話ウィンドウの間で再親子付けすれば、ブラウザ版では不可能だった「通話 UI の無再接続ポップアウト/戻す」ができるのではないか。

注意: Electron 公式では `BrowserView` が非推奨になり `WebContentsView` が後継とされているが、
それは「追加の web contents を view として扱える」ことの説明であり、**WebRTC 接続中の EC widget を
リロードなしで安全に窓移動できる保証ではない**。この文書のスパイクで実測する。

参考:

- [Electron: Migrating from BrowserView to WebContentsView](https://www.electronjs.org/blog/migrate-to-webcontentsview)
- [Electron BrowserView docs: deprecated and replaced by WebContentsView](https://www.electronjs.org/docs/latest/api/browser-view)

## 検証ステップ

### 1. 最小 WebContentsView 再親子付け

- 小さな Electron アプリを作る。
- 1 つの `WebContentsView` に、カウンター + `RTCPeerConnection` のローカル loopback ページを表示する。
- メインウィンドウ `contentView` から通話ウィンドウ `contentView` へ `removeChildView` / `addChildView` で移す。
- さらに元のウィンドウへ戻す。

合格条件:

- ページ reload が発生しない。
- カウンターがリセットされない。
- `RTCPeerConnection` が `connected` のまま維持される。
- `did-start-navigation`, `did-fail-load`, `render-process-gone` が発生しない。

### 2. EC widget 相当の iframe/認証境界を載せる

- Cinny 相当の shell view と、EC 相当の call view を分ける。
- call view には実際の EC embedded bundle か、Matrix widget API の postMessage を模したテストページを載せる。
- view 移動時に shell 側との message bridge が途切れないか確認する。

合格条件:

- 移動後も shell から call view へミュート/退出などの制御メッセージを送れる。
- call view から shell へ状態通知を返せる。
- cookie / localStorage / session partition が想定どおり共有される。

### 3. 実 EC + dev MatrixRTC で通話を動かす

- Element Call dev backend または既存 dev 環境で 2 ユーザー通話を作る。
- 片方を Electron spike app の call view で参加させる。
- 通話中に 10 回以上、メイン <-> 別窓へ view を移動する。
- 別窓側で画面共有を開始する。共有対象ピッカー、画質/FPS 選択、共有開始、共有停止まで確認する。
- 共有中にも 3 回以上 view を移動し、送信 track と視聴側表示が維持されるか確認する。

合格条件:

- LiveKit participant が再作成されない。
- 受信/送信 track が途切れない、または視聴上の瞬断が 1 秒未満で自動復帰する。
- EC の internal state が初期化されない。
- 他参加者から見て leave/join イベントが増えない。
- 別窓内から共有対象ピッカーを開き、720p/1080p/ソース解像度と 15/30/60fps の選択値を反映して共有開始できる。
- 共有中の再親子付けで送信 track が作り直されず、視聴側の配信タイルが消えない。

## 失敗条件

次のどれかが発生したら、案 B は「少なくとも素直には成立しない」と判定する。

- view 移動で EC が reload する。
- LiveKit が reconnect / rejoin / participant replacement を起こす。
- Matrix widget API の親子関係が壊れ、shell と call view の制御が不安定になる。
- 別窓内で画面共有ピッカー、画質/FPS 選択、共有開始・停止のいずれかが実用できない。
- 共有中の view 移動で送信 track が停止・再作成される。
- 主要 OS のどれかで実用できないほど表示・入力・画面共有ピッカーが壊れる。

## 判断

- **合格**: `selfmatrix-desktop` を新フェーズとして roadmap に追加する。第一段階は Electron シェル + 同梱 Cinny、第二段階で WebContentsView 分離を実装する。
- **不合格**: web 版の [call-window-mode.md](../design/call-window-mode.md) を実装候補に戻す。ネイティブ化は配布・更新・公開面縮小の価値だけで再評価する。

## 実装メモ

- `BrowserView` は使わず `WebContentsView` を使う。
- 最前面固定、外部ミュート制御はこのスパイクの主目的ではない。画面共有ピッカーと画質/FPS 選択は、別窓通話の必須操作として Phase 3 の合否に含める。
- 成果物は fork/product ブランチへ混ぜず、実験コードを一時 repo または `spike/*` ブランチに置き、結果だけをこの文書へ追記する。


## 追加の検証観点 (2026-07-07、着手前ギャップ監査より)

1. **window.parent 問題 (当落を決める)**: matrix-widget-api (widget 側) は `globalThis.parent` 固定で
   postMessage する。WebContentsView は DOM の親子関係ではないため、分離後に cinny 側へメッセージが
   届く経路が存在するかを最初に確認する。届かない場合は preload/IPC による中継層の設計が必要 —
   その工数込みで案 B の成否を判定すること。「同一プロセス内 iframe のままで動いていた」誤検証に注意
2. **Electron 既知バグの事前確認**: WebContentsView の再親子付けに関する issue #47247 (クラッシュ/無反応)
   と #44652 (removeChildView 後の表示残留)。検証に使う Electron バージョンを固定し、これらの
   再現有無をスパイク結果に記録する
3. **session partition と localStorage 契約**: cinny⇔EC の画質/FPS・ミニタイル位置連携は同一オリジン
   localStorage 依存 (screenShareSettings.ts / miniTileStripSettings.ts)。分離した WebContentsView が
   同じ session を共有していることを、実際にピッカーで値を変えて EC 側が拾うことまで確認する
4. **画面共有は案 A 段階の前提条件**: Electron では getDisplayMedia に
   `session.setDisplayMediaRequestHandler` + 自前ソースピッカー UI が必要 (ブラウザと同じには動かない)。
   EC が組み立てる width/height/frameRate constraints が desktopCapturer 経由でどう扱われるかも
   実機確認する。Windows の `audio: 'loopback'` (システム音声) の動作可否もここで併せて記録する
5. **dev TLS CA**: NODE_EXTRA_CA_CERTS は Electron で効かない既知問題があるため、dev backend への
   接続は `setCertificateVerifyProc` 等の dev 専用処置を用意してから検証を始める (これが無いと
   イテレーション自体が止まる)
