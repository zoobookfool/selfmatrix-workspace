# ネイティブ版 ドッグフーディング所見 (2026-07-13)

**状態: フィードバック記録 (修正担当 = GPT)。** 運用者が native アプリ (product/discord-style-shell
由来の packaged 版 + `npm start` dev 起動) を実働テストサーバー相手に使用して挙げた所見。
運用者アカウント + テスト相手 (bob) の 2 ユーザー、スペース「デフォルトテスト」/ ボイスチャンネル「うううう」。
各項目に Claude が原因の当たり (native 限定 / web 共通 / 要確認) と参照箇所を付けた。
2026-07-14にGPTが①②⑥⑦の修正パスを実装し、backlog / feature-matrixへ反映した。

## 所見一覧

| # | 症状 | 分類 | 原因の当たり (要 GPT 検証) | 重要度 | 状態 |
| --- | --- | --- | --- | --- | --- |
| ① | 通話ヘッダーの 3 点リーダー (⋮) メニューを開くと、メニューが通話画面の下に隠れて正しく見えない | **native 限定** | WebContentsViewのz-order制約は変えられないため、nativeのCinny重複通話バーを非表示にし、必要操作をElement Call共通フッターへ移した | 高 (操作が隠れる) | **対応済み** (Cinny `ffefe11` / EC `e662d28` / desktop `095bbe9`) |
| ② | 後から通話に参加した人に、過去の「〇〇 が通話に参加/終了しました」通知が一気に流れる | **web 共通** | Discordアプリ実測で通話イベント行はゼロと確認。`RoomTimeline.tsx`でcall memberイベントを折りたたまず完全非表示にした | 中 | **対応済み** (Cinny `2280a26`) |
| ③ | ルーム名/トピックとユーザー名の区別がつきにくい (「うううう」= チャンネル名、「ええええ」= トピック、「zoo」= ユーザー が同じ見た目で並ぶ) | **web 共通** | cinny のシェル UI の描き分け。Discord はチャンネル (#) とユーザーを明確に分けている。※「サーバのユーザとルームのユーザが違う」という運用者の疑問はこれが原因 (実際は zoo/bob の 2 人だけ、うううう はチャンネル名) | 低〜中 | 未対応 |
| ④ | 最上部の Electron メニューバー (File / Edit / View / Window) が英語で、Discord 風には不要 | **native 限定** | Electron 既定メニューが原因。`Menu.setApplicationMenu(null)` を ready 後に適用し、メイン窓・通話別窓から除去。tray probe へ回帰条件を追加 | 低 (体裁) | **対応済み** (`selfmatrix-desktop` `ec5c207`) |
| ⑤ | 新デバイスの E2EE デバイス認証ができない | **要確認** | 詳細不明 — 認証画面が出ない / リカバリーキー入力が弾かれる / 絵文字照合の相手が居ない、のどれか未特定。cinny の crypto/verification フロー (web 共通) か、native 環境固有 (IndexedDB/rust-crypto の永続化パス等) か切り分けが要る | 中〜高 (E2EE 参加の要) | 要運用者切り分け |
| ⑥ | ポップアウト窓とメインの通話画面で UI が違う | **native 限定** | 初期M3の出し分けを廃止し、メイン/別窓とも同じElement Callフッターを表示。popout/popin/pin/fullscreenも同じ場所へ集約 | 中 | **対応済み** (EC `e662d28` / desktop `095bbe9`) |
| ⑦ | 画面共有がそもそもできない | **native 操作経路 + ソースピッカー** | nativeの可視操作面をElement Callへ統一し、実screenshareボタンから`getDisplayMedia`とネイティブ共有元ピッカーを直接通す。旧Cinny DOMクリック依存は互換経路に限定 | 高 (主要機能) | **修正実装済み、実通話再確認待ち** (EC `e662d28` / desktop `095bbe9`) |
| ⑧ | スピーカーミュートが 1 人の時 ON にできない | **native 限定と確認** | native preload が `<audio>` 0 件を `target_not_found` としていたため、host 側の sound 状態も更新されなかった。相手 0 人でも希望状態を保持し、後から追加された audio へ適用する方式へ変更。web の `CallControl` は元から audio 0 件でも状態を保持する | 中 | **対応済み** (`selfmatrix-desktop` `ec5c207`) |
| ⑨ | UI は基本カス (総評) | **全体品質** | 個別バグと別軸。Discord 実物と並べた UI 総点検 (レイアウト・余白・アイコン・状態表示・文言・チャンネル/ユーザーの描き分け) を 1 テーマとして立てるべきサイン。①③⑥ もこの傘下 | 中 (継続テーマ) | 未対応 |

## GPT への切り分け依頼 (対応前に必要な追加情報)

- **⑤ デバイス認証**: 運用者に「認証画面が出ない / リカバリーキーが弾かれる / 絵文字照合の相手が居ない / そもそも導線が見えない」のどれかを確認してもらってから着手。web 版 (ブラウザ) で同じアカウントで認証できるかも切り分けの鍵 (web で OK なら native 固有)。
- **⑦ 画面共有**: 修正版で、単独時にピッカーが開いて共有開始できること、2名時に相手へ映像/音声が届くことを再確認する。自動probeは通過したが、実アカウント用認証情報が無いため2名E2Eは未実行。

## 分類サマリ

- **対応済み native 限定**: ①④⑥⑧
- **対応済み web 共通**: ②
- **未対応**: ③⑨
- **要確認**: ⑤。⑦は修正済みで実通話受け入れ待ち

## 2026-07-14 検証記録

- Cinny: typecheck、5 test files / 33 tests、native build通過。
- Element Call: 88 test files / 690 tests通過 (11 skipped)、ESLint、type、i18n、embedded build通過。
- desktop: 全probe通過。追加した実preload bridge probeで同一WebContents/RTC接続を維持した
  `main -> window -> main`と、明示popin後の空窓破棄を確認。
- 未実行: 実Matrix/LiveKitの2ユーザー`e2e:callflow`。認証情報が環境に無いため、⑦だけ実機受け入れを残す。
