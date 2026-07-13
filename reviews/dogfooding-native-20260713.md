# ネイティブ版 ドッグフーディング所見 (2026-07-13)

**状態: フィードバック記録 (修正担当 = GPT)。** 運用者が native アプリ (product/discord-style-shell
由来の packaged 版 + `npm start` dev 起動) を本番サーバー相手に実使用して挙げた所見。
運用者アカウント + テスト相手 (bob) の 2 ユーザー、スペース「デフォルトテスト」/ ボイスチャンネル「うううう」。
各項目に Claude が原因の当たり (native 限定 / web 共通 / 要確認) と参照箇所を付けた。**Claude は修正
しない** — GPT が対応する。対応したら本表の「状態」を更新し、backlog / feature-matrix と整合させること。

## 所見一覧

| # | 症状 | 分類 | 原因の当たり (要 GPT 検証) | 重要度 | 状態 |
| --- | --- | --- | --- | --- | --- |
| ① | 通話ヘッダーの 3 点リーダー (⋮) メニューを開くと、メニューが通話画面の下に隠れて正しく見えない | **native 限定** | 通話は WebContentsView (ネイティブ層) として cinny の HTML の上に重なっている。cinny 側 DOM のポップオーバー/ドロップダウンは常に WebContentsView の下になる (Electron の native 層 > HTML の z-order 制約)。メニューが通話ビュー領域に降りると occlude される | 高 (操作が隠れる) | 未対応 |
| ② | 後から通話に参加した人に、過去の「〇〇 が通話に参加/終了しました」通知が一気に流れる | **web 共通** | `cinny/src/app/features/room/RoomTimeline.tsx` が `joined_call`/`ended_call` (ja.json:445-446) をコールイベント 1 件ずつタイムラインに描画。集約 (連続する通話参加/終了イベントの折りたたみ) が無く、履歴ロード時に全件展開される | 中 | 未対応 |
| ③ | ルーム名/トピックとユーザー名の区別がつきにくい (「うううう」= チャンネル名、「ええええ」= トピック、「zoo」= ユーザー が同じ見た目で並ぶ) | **web 共通** | cinny のシェル UI の描き分け。Discord はチャンネル (#) とユーザーを明確に分けている。※「サーバのユーザとルームのユーザが違う」という運用者の疑問はこれが原因 (実際は zoo/bob の 2 人だけ、うううう はチャンネル名) | 低〜中 | 未対応 |
| ④ | 最上部の Electron メニューバー (File / Edit / View / Window) が英語で、Discord 風には不要 | **native 限定** | Electron 既定メニューが原因。`Menu.setApplicationMenu(null)` を ready 後に適用し、メイン窓・通話別窓から除去。tray probe へ回帰条件を追加 | 低 (体裁) | **対応済み** (`selfmatrix-desktop` `ec5c207`) |
| ⑤ | 新デバイスの E2EE デバイス認証ができない | **要確認** | 詳細不明 — 認証画面が出ない / リカバリーキー入力が弾かれる / 絵文字照合の相手が居ない、のどれか未特定。cinny の crypto/verification フロー (web 共通) か、native 環境固有 (IndexedDB/rust-crypto の永続化パス等) か切り分けが要る | 中〜高 (E2EE 参加の要) | 要운用者切り分け |
| ⑥ | ポップアウト窓とメインの通話画面で UI が違う | **native 限定** | M3 の設計どおり「別窓 = Element Call 本家フッター表示 / メイン = cinny の Discord 風コントロールバー」を出し分けている結果。意図的だが、同じ通話で操作系の見た目が別物になり一貫性が無い。方向性: 別窓にも cinny 風コントロールを出す (フッター注入 or 別窓用オーバーレイ) の検討 | 中 | 未対応 (設計判断含む) |
| ⑦ | 画面共有がそもそもできない | **web 共通ロジック (+ native ソースピッカー経路)** | `cinny/src/app/plugins/call/CallControl.ts:312-313` の `toggleScreenshare()` は `this.screenshareButton?.click()` (DOM クリック、カテゴリ B)。対象ボタンが EC の DOM に無いと no-op になる。**既知の残課題「単独参加中の共有開始クリック喪失」** (GPT-HANDOFF / roadmap Phase 8) と同一クラスの可能性。native では desktop の `setDisplayMediaRequestHandler` + 自前ピッカー経路も絡む | 高 (主要機能) | 未対応 / 要切り分け (下記) |
| ⑧ | スピーカーミュートが 1 人の時 ON にできない | **native 限定と確認** | native preload が `<audio>` 0 件を `target_not_found` としていたため、host 側の sound 状態も更新されなかった。相手 0 人でも希望状態を保持し、後から追加された audio へ適用する方式へ変更。web の `CallControl` は元から audio 0 件でも状態を保持する | 中 | **対応済み** (`selfmatrix-desktop` `ec5c207`) |
| ⑨ | UI は基本カス (総評) | **全体品質** | 個別バグと別軸。Discord 実物と並べた UI 総点検 (レイアウト・余白・アイコン・状態表示・文言・チャンネル/ユーザーの描き分け) を 1 テーマとして立てるべきサイン。①③⑥ もこの傘下 | 中 (継続テーマ) | 未対応 |

## GPT への切り分け依頼 (対応前に必要な追加情報)

- **⑤ デバイス認証**: 運用者に「認証画面が出ない / リカバリーキーが弾かれる / 絵文字照合の相手が居ない / そもそも導線が見えない」のどれかを確認してもらってから着手。web 版 (ブラウザ) で同じアカウントで認証できるかも切り分けの鍵 (web で OK なら native 固有)。
- **⑦ 画面共有**: 運用者に「共有ボタンを押したとき (a) 何も起きない / (b) ソース選択ピッカーは出るが共有が始まらない / (c) エラー / (d) ボタンが無い・押せない」のどれか、および packaged 版か dev 起動かを確認。①〜③人以上いる通話でも再現するか (単独固有か) も要確認。

## 分類サマリ

- **native 限定**: ①④⑥ (WebContentsView z-order / Electron メニュー / ポップアウトの UI 出し分け)
- **web 共通** (cinny 本体、web/native 両方に効く): ②③⑦ + ⑨の大半
- **対応済み native 限定**: ④⑧ (`selfmatrix-desktop` `ec5c207`)
- **要確認**: ⑤⑦ (再現条件の切り分け待ち)

native 限定の 3 件はいずれも「WebContentsView を重ねるネイティブ構成」に起因するか Electron 標準機能の
未調整であり、web 版には出ない。web 共通の 4 件は web 版でも同じはずなので、web 版で先に再現確認すると
デバッグが速い (native パッケージのビルド往復が要らない)。
