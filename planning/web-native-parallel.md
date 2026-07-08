# web 版 / native 版 併走の運用ルール

**状態: 正本** (2026-07-08 制定、運用者決定「web と native を併走。新機能もできるだけ両方に」)。
M4 の「web 撤収」方針を撤回し、**web と native を 2 系統の配布物として定常運用する**。本文書が
その運用ルールの正本。requirements §7 / native-milestones M2・M4 はこれを参照する。

## 前提: 1 コードベース・2 配布物

分岐するのは**ビルド (配布物) だけ**で、ソースコードは cinny fork 1 本 (`product/discord-style-shell`)。

| 配布物 | ビルド | 配信 | 到達範囲 | native 分岐 |
| --- | --- | --- | --- | --- |
| **web 版** | `npm run build` | chat.<自サーバー> (既存 CI → GHCR → 自宅 pull) | 任意のブラウザ (モバイル / Mac 含む) | **無効 (ビルド時に除去)** |
| **native 版** | Electron シェルに cinny を同梱 (M2 selfmatrix-desktop) | GitHub Releases (Windows のみ) | Windows デスクトップ | 有効 |

native 固有機能 (無再接続ポップアウト / system audio / トレイ常駐 / 最前面ピン / 外部ミュート制御) は
`src/app/plugins/call/native/` + `window.selfmatrixNative` 検出でゲートされる。それ以外
(チャット・UI・i18n・通話コントロール・画質ピッカー等) は**共通コードなので web にも自動で乗る**。
→ 「新機能もできるだけ両方に」は、既定で共通コードに実装すれば自然に達成される。

## ルール

### R1. 既定は共通実装 (併走がデフォルト)
新機能は原則**共通コード**に実装する。両ビルドが自動で得る。native 固有にするのは、native の
能力 (WebContentsView 再親子付け / loopback / OS トレイ等) が**技術的に必須**な機能に限る。
「web では難しいから native だけ」ではなく「web では**原理的に**できないものだけ native 限定」。

### R2. web ビルドは native 分岐を無効化する `MUST` (セキュリティ)
`getSelfmatrixNativeBridge()` を**ビルド時定数でゲート**し、web ビルドでは常に undefined を返して
native 分岐を tree-shake で除去する。native シェルの同梱 cinny のみフラグ ON でビルドする。
- 理由: 検出が実行時の `window.selfmatrixNative` 存在チェックだけだと、web で MAIN-world 拡張や
  サプライチェーン汚染がこのグローバルを植えた場合に通話 embed を乗っ取り、room/state/to-device
  トラフィックを攻撃者オブジェクトへ渡せる (2026-07-08 Fable 全体レビュー sec-critical #1)。
- **現状の暫定リスク**: native ビルドパイプライン (M2) が未成立のため、現行 web 本番は native 分岐を
  含んだままである。悪用には攻撃者がグローバルを植える前提が必要 (境界つき)。**M2 の MUST として
  恒久対処**するまでこのリスクは残る。M2 で最優先。

### R3. 機能パリティは capability ベース (差は出る前提で明示管理)
差が出るのは確定なので、**フィーチャーマトリクス**を維持して「どの機能がどちらにあるか」を明示する。

| 機能 | web | native | 備考 |
| --- | --- | --- | --- |
| チャット / ルーム / UI / i18n / テーマ | ✅ | ✅ | 共通コード |
| 通話参加 / 配信 / 視聴 / 画質ピッカー / 通話コントロール | ✅ | ✅ | 共通コード (EC 埋め込み) |
| 無再接続ポップアウト (Discord 準拠窓移動) | ⚠ 再接続あり or 無効 | ✅ | native の WebContentsView 再親子付けが必須 (M3) |
| system audio (全体ミックス) 付き配信 | ✅ 画面全体共有時のみ | ✅ どのソースでも | loopback は native の利得 |
| アプリ単位音声 | ✗ | LATER | Electron 43 に口なし ([spikes/app-audio-capture-spike.md](../spikes/app-audio-capture-spike.md)) |
| トレイ常駐 / 最前面ピン / 外部ミュート制御 | ✗ | ✅ (一部 LATER) | OS 統合 |

- **web-only 機能は作らない**: web は「広く届く受け皿」であり、web でできることは native でもできる。
  できない方向 (native→web) だけが差になる。
- web で native 限定機能に触れる導線は、degrade (再接続ありポップアウト等) か非表示にする
  (M1 で popout ボタンを native ではガード済み。web 側は従来 UI)。

### R4. ブランチ / マージ
- `product/discord-style-shell` が両ビルドの共通の正本ブランチ。
- **native コードは製品ブランチに R2 のビルドフラグ配下でマージする** (恒久的な別ブランチにしない)。
  → web と native はコードベースを fork しない。違うのはビルドフラグだけ。
  M2 着手時に `spike/native-shell` を製品ブランチへ統合する。
- 共通のバグ修正 (例: 2026-07-08 の CallEmbed リスナーリーク 77d0196d) は製品ブランチに入れれば
  両ビルドが同時に得る。

### R5. デプロイ・ゲート
- **web**: push → CI (typecheck 含む) → GHCR → 自宅 `docker compose pull cinny && up -d cinny` (既存)。
- **native** (M2): タグ → electron-builder CI → GitHub Releases + minisign 署名。
- **共通の不変条件**: native 固有コードを追加しても**フラグ OFF の web ビルド (typecheck + build) が
  必ず通ること**。native 側のゲート (シェル smoke + E2E) は selfmatrix-desktop の CI で回す。
- どちらも各ゲート green を製品ブランチ上で確認してから該当配布物をデプロイ。

### R6. 版ズレ・相互運用
- web (モバイル/Mac) と native (Windows) でユーザーの配布物が違い得るが、**Matrix / EC 層は同一**
  (両方 cinny → 同じ Matrix・同じ Element Call) なので通話・チャットの相互運用は影響なし。
  可視的な差は native 限定 UX (窓移動・system audio) のみ。フィーチャーマトリクス (R3) と
  短いユーザー向け注記で周知する。

## M4 の書き換え

M4 は「移行ガイド + バージョン強制 + **web 版撤収**」だった。→ **撤収は廃止**。M4 は
「2 系統の定常運用の確立」に置き換える: フィーチャーマトリクスの維持、R2 (web の native 分岐無効化)
の恒久化、リリース同期ルール、native 版の配布導線整備。web は現役の broad-reach ビルドとして継続。
