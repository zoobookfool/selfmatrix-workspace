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

合格条件:

- LiveKit participant が再作成されない。
- 受信/送信 track が途切れない、または視聴上の瞬断が 1 秒未満で自動復帰する。
- EC の internal state が初期化されない。
- 他参加者から見て leave/join イベントが増えない。

## 失敗条件

次のどれかが発生したら、案 B は「少なくとも素直には成立しない」と判定する。

- view 移動で EC が reload する。
- LiveKit が reconnect / rejoin / participant replacement を起こす。
- Matrix widget API の親子関係が壊れ、shell と call view の制御が不安定になる。
- 主要 OS のどれかで実用できないほど表示・入力・画面共有ピッカーが壊れる。

## 判断

- **合格**: `selfmatrix-desktop` を新フェーズとして roadmap に追加する。第一段階は Electron シェル + 同梱 Cinny、第二段階で WebContentsView 分離を実装する。
- **不合格**: web 版の [call-window-mode.md](../design/call-window-mode.md) を実装候補に戻す。ネイティブ化は配布・更新・公開面縮小の価値だけで再評価する。

## 実装メモ

- `BrowserView` は使わず `WebContentsView` を使う。
- 共有対象ピッカー、最前面固定、外部ミュート制御はこのスパイクの主目的ではない。まず「無再接続移動」だけを判定する。
- 成果物は fork/product ブランチへ混ぜず、実験コードを一時 repo または `spike/*` ブランチに置き、結果だけをこの文書へ追記する。
