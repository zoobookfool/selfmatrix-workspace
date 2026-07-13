# GPT Review: native 通話UI追補 (2026-07-14)

**状態: 実装修正・ローカル検証・push完了。実2ユーザー画面共有の運用受け入れ待ち。**

## 対象

- Cinny `ffefe11c3ec466d33212e0ad113bb16d9983c033`
- Element Call `e662d2868dacffa48270345b3d9fa49e8300edf4`
- selfmatrix-desktop `095bbe9`
- 起点: [dogfooding-native-20260713.md](dogfooding-native-20260713.md) ①②⑥⑦
- Discord基準: [discord-behavior-log-app.html](../design/mocks/discord-behavior-log-app.html)

## Findings

### [P1] 実2ユーザーの画面共有受け入れだけ未完了

nativeの可視画面共有ボタン、画質/FPS選択、`getDisplayMedia`、共有元ピッカーの製品経路へE2Eコードを
更新し、desktopのsource-picker probeは通過した。ただし環境にAlice/Bobの認証情報が無く、実Matrix /
LiveKitの`npm run e2e:callflow`は未実行。単独で共有開始できることと、2名時に相手へ映像/音声が届くことを
修正版で再確認するまで、backlog P1は閉じない。

### [P2] UI総点検とデバイス認証は今回の修正範囲外

チャンネル/ユーザーの描き分け、Discord実物との余白・状態表示比較、E2EEデバイス認証の再現切り分けは
未着手のまま。今回の通話バー統一で解決した扱いにはしない。

### [P1] native配信単体ポップアウトはhost連携待ち

ECには同一trackを別videoへattachするweb用の手動ポップアウトがあるが、native shellはrendererからの
`window.open`を常時拒否する。そのためnativeではボタンだけ見えて動かない状態だった。今回、nativeだけ
そのボタンを非表示にして誤操作を防止した。secureなhost契約による手動ポップアウトはbacklogで継続し、
画面遷移へ自動追従するPiPは実装しない。

## 解消した指摘

- **① メニューが通話Viewの下に隠れる**: WebContentsViewのz-order制約を前提に、nativeのCinny重複
  通話バーを非表示化。必要操作をElement Callフッターへ移し、DOMポップオーバーを重ねる構造を廃止。
- **② 通話イベント洪水**: Discord実測に合わせ、call memberイベントをタイムラインで完全非表示。
- **⑥ メイン/別窓のUI不一致**: 両配置で同じElement Callフッターを表示。
- **⑦ 画面共有操作が届かない**: nativeの製品操作をElement Call実ボタンへ一本化し、Cinnyからの
  DOMクリックRPC依存を可視UIから除外。実通話受け入れだけ継続。
- 明示popin時は同じWebContentsViewをメインへ戻してから空のcallWindowを破棄。
- `selfmatrixCallWindow`はraw IPCを公開せず、通話Viewのmain frameだけを許可する狭いAPIに限定。
- 全体確認で、話者オーバーレイ右クリックのユーザー別ミュート/音量はEC `dd8966aa`で実装済みと確認。
  staleだったbacklog P1を完了履歴へ移した。

## 仕様判断

- 自動追従するアプリ内PiP/ミニプレイヤーは作らない。
- 通話全体popoutはユーザーの明示操作で行い、同一接続を維持する。
- 配信単体popoutは、自動追従しない明示操作として別途保留する。
- 視聴中配信が1本でもあれば、メイン/別窓を問わず話者ミニタイルを出さない。

## 検証

- Cinny: `npm run typecheck`、5 files / 33 tests、`npm run build:native`通過。
- Element Call: 88 files / 690 tests通過、11 skipped。ESLint、type、i18n、embedded build通過。
- desktop: `npm test`全probe通過、`release-inputs --verify-siblings`通過、構文確認通過。
- 追加probe: 実preloadから`getState -> popout -> pin往復 -> popin`を実行し、WebContents ID、RTC接続、
  load markerの不変、明示popin後の空窓破棄を確認。
- push後Actions: Cinny image/tree-shake、Element Call product checks、desktop Product CIがすべてgreen。

## 判定

コード上の新しいblocking findingは無し。3リポジトリへのpushは妥当。次の合否ゲートは修正版nativeでの
単独共有と実2ユーザー共有のドッグフーディングである。
