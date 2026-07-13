# フィーチャーマトリクス (web / native 機能対応表)

**状態: 正本** (2026-07-12 制定、2026-07-14更新)。[web-native-parallel.md](web-native-parallel.md) R3「機能パリティは
capability ベース、マトリクスを維持」を具体化した文書。R3 本文の簡易表 (41-48 行目) はこの文書の要約
であり、詳細・保守ルールはこちらを正とする。R3・[native-milestones.md](native-milestones.md)・
[requirements.md](requirements.md) §7 と矛盾がないことを制定時に確認済み (4 節「整合性メモ」参照)。

## 0. 前提: 1 コードベース・2 配布物、capability ベースのパリティ

- ソースコードは cinny fork 1 本 (`product/discord-style-shell`)。分岐するのは**ビルド (配布物) だけ**
  ([web-native-parallel.md](web-native-parallel.md))。
- **Matrix / Element Call 層は web・native で完全に同一** — 同じホームサーバー、同じ MatrixRTC/LiveKit
  backend、同じ Element Call fork を使う。したがって**同じ会話・同じ通話に web の友達と native の友達が
  混在して参加できる** ([web-native-parallel.md](web-native-parallel.md) R6、[requirements.md](requirements.md)
  §7「機能パリティは capability ベース」)。可視的な差は native 限定 UX (窓移動・system audio・トレイ等)
  に限られ、チャット・通話そのものの相互運用には影響しない。
- したがって「機能パリティ」は**バイト単位の一致ではなく capability の差として管理する**: バックエンド
  互換 (Matrix プロトコル・MatrixRTC・E2EE) は常に保つ MUST、UI/シェルの機能差 (どのボタンがあるか等) は
  capability として明示・許容する。この文書はその capability 差を一覧化したもの。
- [native-milestones.md](native-milestones.md) M4 の受け入れ条件「友達 1 人以上が手順書だけで native を
  インストール・通話でき、かつ別の友達が web で同じ会話・通話に参加できる」がこの考え方の実運用ゴール。

## 1. 機能 × (web / native) 対応表

凡例: ✅ = 対応・実装済み / ⚠ = 部分対応 / ✗ = 非対応 / LATER = 将来対応(設計では道を塞がない) /
未実装 = 対応方針は決まっているが未着手。

### 1.1 共通コード (web/native 両方に自動で乗る)

新機能はここに実装するのが既定 (2 節 R1)。cinny 本体 + Element Call embed のコードで完結し、
native 固有 API に依存しない。

| 機能 | web | native | 実装/根拠 |
| --- | --- | --- | --- |
| Discord 風シェル (Space=サーバー / Room=チャンネル の見せ方) | ✅ | ✅ | [requirements.md](requirements.md) §2。cinny 本体 UI |
| i18n (日本語/英語) | ✅ | ✅ | 全 1,538 キー翻訳済み (cinny-i18n-incremental 系の成果、`public/locales/`) |
| テーマ (Light/Silver/Dark/Butter/SelfMatrix の 5 種) | ✅ | ✅ | `cinny/src/colors.css.ts` (vanilla-extract のビルド時 CSS)、`useTheme.ts`/`ThemeManager.tsx` |
| 通話参加 / 配信 / 視聴 (Element Call embed) | ✅ | ✅ | `cinny/src/app/plugins/call/CallEmbed.ts` 経由の widget 埋め込み。[web-native-parallel.md](web-native-parallel.md) R3 |
| 画質/FPS ピッカー (配信開始時に 720p/1080p/ソース解像度 × 15/30/60fps) | ✅ | ✅ | webはCinny、nativeはElement Call共通フッターから同じ選択肢を操作。nativeはEC `e662d28` + desktop `095bbe9`。[requirements.md](requirements.md) §3 |
| 視聴オプトイン (見る配信を視聴者が選ぶ。未視聴配信は購読しない) | ✅ | ✅ | element-call の LiveKit track subscription 制御。[design/ui-design-notes.md](../design/ui-design-notes.md) |
| 表示モード (注視/グリッド) + グリッド中の強調選択トグル | ✅ | ✅ | `cinny/src/app/plugins/call/CallControl.ts` の emphasis 制御、element-call の grid/spotlight tile |
| 話者オーバーレイ (発話中ユーザー表示 + 右クリックのユーザー別ミュート/音量) | ✅ | ✅ | `element-call/src/tile/SpeakerOverlay.tsx` (EC `dd8966aa`) |
| 配信タイル単位の音量調整 | ✅ | ✅ | element-call 側の per-tile ボリューム制御 |
| RNNoise ノイズ抑制 (Krisp 相当、既定 ON・トグル可) | ✅ | ✅ | `element-call/src/livekit/NoiseSuppressionProcessor.ts` + `AudioProcessorContext.tsx`。[requirements.md](requirements.md) §3 |
| Discord 風コントロールバー (マイク/受信音声/画面共有/設定 等) | ✅ | ✅ | webはCinnyバー。nativeはWebContentsViewのz-order制約を避けるため、メイン/別窓ともElement Call共通フッターを使用 (Cinny `ffefe11` / EC `e662d28` / desktop `095bbe9`) |
| About 画面 + AGPL コンプライアンス表記 (fork 元/変更概要/ライセンス) | ✅ | ✅ | Cinny product branch。Client版を常時表示し、nativeではDesktop版と同梱Cinny/EC commitも表示。[native-milestones.md](native-milestones.md) M2 |
| E2EE ルーム標準運用 | ✅ | ✅ | [requirements.md](requirements.md) §2、Matrix/E2EE 層は web/native で同一 |

### 1.2 native 限定 (原理的に web 不可、実装済み)

「web では**原理的に**できないものだけ native 限定」(2 節 R1) の基準を満たすものだけを載せる。
それぞれ「なぜ web で不可能か」を 1 行で明記する。

| 機能 | web | native | なぜ web で不可能か | 根拠 |
| --- | --- | --- | --- | --- |
| 無再接続ポップアウト (Discord 準拠の窓移動) | ⚠ 再接続あり (別窓に新規 iframe を作り直して再 join) | ✅ 完全無再接続 | ブラウザの iframe を DOM ツリーから別ウィンドウへ移動する Web API は存在せず、`window.open()` で別ウィンドウを作っても中身は新規 iframe になり再接続が必須になる。Electron の WebContentsView は OS ウィンドウ間で再親子付け (付け替え) ができ、通話セッションを維持したまま移動できる | nativeは[native-milestones.md](native-milestones.md) M3。10往復E2Eに加え、2026-07-14にEC共通フッターの実preload bridge経路もRTC probeで確認 (desktop `095bbe9`) |
| トレイ常駐 (閉じる=最小化、右クリックメニュー) | ✗ | ✅ | ブラウザ/PWA には OS のシステムトレイ(通知領域)にアイコン常駐する Web API がない | [native-milestones.md](native-milestones.md) M2 (desktop 7ac049c/ecfaae6) |
| 自動起動 (OS ログイン時、既定 OFF・opt-in) | ✗ | ✅ | ブラウザページは OS のスタートアップ登録 (レジストリ/スタートアップフォルダ) を操作する権限を持たない | 同上 |
| 通知クリックで前面化 | ⚠ Notification API のクリックでタブはアクティブにできるが、アプリウィンドウの復元・最前面化はできない | ✅ | Web Notification のクリックイベントはブラウザタブの活性化はできるが、OS ウィンドウの復元/フォーカスまでは制御できない。Electron は通知クリックから直接 `BrowserWindow.show()`/`focus()` を呼べる | [native-milestones.md](native-milestones.md) M2 |
| システム音声 (全体ミックス) をどのソース共有でも付与 | ⚠ 画面全体共有時のみ (Chrome の標準ピッカーが音声共有チェックボックスを画面全体選択時にしか出さない仕様上の制約) | ✅ どのソースでも | web はブラウザ標準ピッカーの UI 制約に従うしかない。native は Electron の `session.setDisplayMediaRequestHandler` で自前ピッカーを実装しているため、この制約を回避できる | [requirements.md](requirements.md) §3、[web-native-parallel.md](web-native-parallel.md) R3、実機確認は[app-audio-capture-spike.md](../spikes/app-audio-capture-spike.md) タスク A (`audioModeUsed: "loopback"` 実測 PASS) |
| 画面共有ソース選択ピッカー (Discord 風の自前 UI) | ⚠ ブラウザ標準ピッカーは使える (ソース選択自体は web でも可能) | ✅ 自前実装 | 上記のシステム音声をどのソースでも付与するために `setDisplayMediaRequestHandler` を登録すると Chromium 標準ピッカーが表示されなくなり、`desktopCapturer.getSources()` から自前でソース一覧 UI を構築する必要が生じる (cinny レンダラに生の画面キャプチャ能力を渡さない contractSurfaceGate 設計込み)。web は標準ピッカーをそのまま使えるため実装不要 — **ソース選択そのものは web でも可能な点に注意**(不可能なのは「どのソースでもシステム音声を付与」の組み合わせ) | [native-milestones.md](native-milestones.md) M2 (desktop 3a2d088) |
| 自前署名 (minisign/Ed25519) による自動更新 | 該当なし (概念が存在しない) | ✅ | web は配布がサーバー側の即時反映であり「更新」という概念自体がない。native はローカルにインストールされた実行ファイルを差し替える必要があり、GitHub アカウント乗っ取り等に対する検証つき自動更新の仕組みが要る | desktop `9b6e66d`。実`NsisUpdater`がinstallerとsidecarを取得し、packaged製品で正常署名のみ受理、欠落/改ざん拒否を確認。[native-milestones.md](native-milestones.md) M2 |
| 最前面ピン留め (通話別窓を常に手前に表示) | ✗ | ✅ | ブラウザには自ウィンドウを他の OS ウィンドウより常に手前へ固定する Web API がない (Electron の `BrowserWindow.setAlwaysOnTop` が前提) | 2026-07-12実装。2026-07-14から共通フッターでも操作可能 (desktop `095bbe9`)。既定OFF・永続化・probe検証 |
| 外部ミュート制御 (グローバルホットキー / トレイ / localhost 制御 API) | ✗ | ✅ | ブラウザ JS はフォーカスの無いタブでは OS 全体のキー入力を捕捉できず、タブのライフサイクルに縛られない常駐ローカルサーバーも持てない ([external-mute-control.md](../design/external-mute-control.md) §6) | 2026-07-12 実装。A=グローバルホットキー (プリセット 4 択・既定 OFF、desktop 902d1d02 + cinny 29c7e08d の transport 契約拡張) / B=localhost HTTP API (127.0.0.1 bind + token 定数時間比較 + Origin 拒否 + レート制限、desktop 5fc3909)。C (公式 Stream Deck プラグイン) は LATER |

### 1.3 web 限定 or web 優位

「web-only 機能は作らない」([web-native-parallel.md](web-native-parallel.md) R3)の原則のとおり、
web だけに実装する機能は無い。ここに挙げるのは**コード上の排他機能ではなく、配布形態そのものが持つ
到達範囲・利便性の優位**。

| 項目 | 内容 | 根拠 |
| --- | --- | --- |
| モバイル/Mac の受け皿 | native は Windows のみ対応([native-milestones.md](native-milestones.md) M2 前提決定 1)。web は任意のブラウザ (モバイル/Mac 含む) から到達できる | [web-native-parallel.md](web-native-parallel.md) 配布物表、M4「web は撤収しない」 |
| URL 一発アクセス・インストール不要 | web は自サーバーのサブドメイン (`chat.<自サーバー>`) に配布済みで、ログイン画面へ即到達できる。native は公開配布 (GitHub Releases) のためアプリに自サーバーを焼き込めず、初回ログイン時にユーザーがホームサーバー URL を入力する一手間がある | [requirements.md](requirements.md) §7 (2026-07-07 補足)、[native-milestones.md](native-milestones.md) M2 前提決定 5 |
| 更新の即時反映 | web は `docker compose pull && up -d` でユーザー操作なしに全員へ即時反映される。native は都度ダウンロード・インストール操作が要る (自動更新はあるが起動再開が要る) | [web-native-parallel.md](web-native-parallel.md) R5 |

### 1.4 未実装 / LATER

「原理的に web 不可」に該当するかどうかを含め、想定区分を明記する。実装時は 1.1〜1.3 の該当表へ移す。

| 機能 | 想定区分 | 状態 | 根拠 |
| --- | --- | --- | --- |
| アプリ単位音声キャプチャ (配信対象アプリだけの音声) | native 限定 (getUserMedia/getDisplayMedia に特定プロセスだけを選んで音声取得する API がなく、Windows の WASAPI プロセスループバックをネイティブモジュール経由で叩く必要がある) | LATER (工数「中」と見積り済み、M3 以降で着手判断) | [spikes/app-audio-capture-spike.md](../spikes/app-audio-capture-spike.md) |
| ユーザーカスタム機構: テーマの宣言的トークン開放 | 共通コード想定 (CSS カスタムプロパティの話でしかなく native 固有の理由がない) | ドラフト (運用者回答済み、GPT レビュー待ち) | [design/user-customization.md](../design/user-customization.md) §5.1, §7 (M5a) |
| ユーザーカスタム機構: 音声フィルタの宣言的パラメータ化 (ノイズゲート/コンプレッサー/EQ 等) | 共通コード想定 (Web Audio API 標準ノードで実装可能、既存の RNNoise 挿入点の一般化) | ドラフト | 同上 §5.2 (M5b) |
| ユーザーカスタム機構: プラグイン基盤 (サンドボックス型、widget capability モデル流用) | 実行サンドボックス自体は共通コード想定。**未キュレーションプラグインの個人インストールは native 限定にする案**(配布制で見知らぬ第三者が直接触れないため) | ドラフト、web 側は運用者判断待ち | 同上 §6.5, §7 (M5c) |
| グリッド配信タイルの単体ポップアウト `🗗` | webはECの同一track追加attach、nativeはsecureなhost契約が必要 | web実装済み / native保留。nativeの動かないボタンは非表示。自動追従PiPは不採用 | [backlog.md](backlog.md) P1、EC `e662d28`、[design/ui-design-notes.md](../design/ui-design-notes.md) |
| SFU 切断時の自動再参加 | 共通コード想定 | 未実施 | [backlog.md](backlog.md) P1 |
| 未読バッジ / ブランドアイコン (トレイ・タスクバー) | 共通コード想定 (バッジ自体は web の favicon/Badge API でも一部可能。トレイアイコンの装飾のみ native 固有) | LATER | [native-milestones.md](native-milestones.md) M2「未読バッジ・ブランドアイコンは LATER」 |
| winget 登録 | native 限定 (配布経路の話) | LATER | [native-milestones.md](native-milestones.md) M2 |

**明示的な非対応 (LATER ではなく不採用)**: 画面遷移へ自動追従するアプリ内PiP/ミニプレイヤー、
生カスタム CSS の第三者配布 (フィッシング的な見た目偽装・
CSS 単体でのデータ漏洩のリスクを理由に 2026-07-08 運用者確定で不採用)、BetterDiscord 型の非サンドボックス
JS 注入プラグイン (脅威モデル上不採用)。いずれも [design/user-customization.md](../design/user-customization.md)
§4, §8 参照。将来これらを覆す場合もこの文書の該当表を更新すること。

## 2. 保守ルール (新機能を追加する時)

[web-native-parallel.md](web-native-parallel.md) R1/R2 と整合。この文書はその運用の実務手順。

1. **既定は共通コードに書く。** 新機能はまず「cinny 本体 + Element Call embed の共通コードで実現できないか」
   を検討する。実現できるなら 1.1 表に追加して終わり — native 固有の分岐を作らない。
2. **native 限定にするのは、web では原理的に不可能な場合だけ。** 判断基準は「ブラウザの標準 Web API
   (getDisplayMedia / Notification / Service Worker 等) で実現できるか」であり、「面倒だから」
   「ブラウザの制約を回避するのが大変だから」は native 限定化の理由にならない。判断に迷ったら
   1.2 表の「なぜ web で不可能か」欄と同水準の、具体的な API/仕様上の制約を 1 行で書けるかを基準にする。
   書けないなら共通コードに実装する。
3. **native 固有コードはビルド時フラグ配下に置く MUST。** `VITE_SELFMATRIX_NATIVE` でゲートし、
   web ビルドでは tree-shake で完全に除去する ([web-native-parallel.md](web-native-parallel.md) R2、
   セキュリティ上の MUST — 検出を実行時の `window.selfmatrixNative` 存在チェックだけに頼らない)。
4. **この文書 (feature-matrix.md) を更新するタイミング**:
   - **機能追加時**: 実装が「共通コード」か「native 限定」かを決めた時点で、該当する表に 1 行追加する
     (native 限定にした場合は「なぜ web で不可能か」を必ず埋める)。
   - **マイルストーン完了時** (native-milestones.md の M0〜M4 等の完了報告時): 実装済み状態を反映し、
     1.4 (未実装/LATER) から該当行を該当表へ移す。
   - [web-native-parallel.md](web-native-parallel.md) R3 の簡易表、[requirements.md](requirements.md) §7、
     [backlog.md](backlog.md) の状態欄を更新する際は、矛盾が出ないようこの文書も同時に見直す。
5. **web-only 機能は作らない。** web は「広く届く受け皿」であり、web でできることは native でもできる。
   差が出るのは native→web 方向 (native だけの機能) だけという前提を崩さない。1.3 表はコード上の
   排他機能ではなく配布形態の利点の記録であることに注意する。

## 3. 分類ごとの機能数 (このマトリクス制定時点)

- 共通コード: 13 機能
- native 限定 (実装済み): 9 機能 (2026-07-12 に最前面ピン留め・外部ミュート制御が 1.4 から昇格)
- web 限定/web 優位 (配布形態の利点): 3 項目
- 未実装/LATER: 9 項目 (うち native 限定想定 2、共通コード想定 5、判断保留 2 [プラグイン基盤・グリッドタイル単体ポップアウトは共通コード基盤 + native 拡張の混在案])

## 4. 整合性メモ (制定時点の検証記録)

- [web-native-parallel.md](web-native-parallel.md) R3 の簡易表 (41-48 行目) とは矛盾なし。特に
  「system audio (全体ミックス) 付き配信」の行 (web=✅ 画面全体共有時のみ / native=✅ どのソースでも)
  はそのまま 1.2 表に引き継いだ。
- 「画面共有ソース選択ピッカー」は [native-milestones.md](native-milestones.md) M2 の記述
  (システム音声トグルと同一コミットで実装) をそのまま native 限定として載せたが、**ソース選択自体は
  web でも標準ピッカーで可能**であり、native 限定の実体は「どのソースでもシステム音声を付与するために
  自前ピッカーが必要になったこと」である点を 1.2 表の備考に明記した (web-native-parallel.md R3 の
  表現「web では原理的にできないものだけ native 限定」との整合を取るための調整)。
- [requirements.md](requirements.md) §7 の「配布物は web 版/native 版の 2 系統」「機能パリティは
  capability ベース」との矛盾なし。
- [design/user-customization.md](../design/user-customization.md) の運用者回答 (3)「差分は少なくあって
  欲しい。対応できる範囲で web にも。中核は web 互換で設計し、native 限定は原理的に web 不可のみ」を
  1.4 表のカスタム機構 3 行に反映した。
- 秘匿情報 (実ドメイン・IP・認証情報・個人環境パス) は含めていない。ファイル参照はすべてリポジトリ内
  相対パスで記載した。
