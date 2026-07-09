# リリース基盤 (CI + 自動更新 + 自前署名) 設計 (M2)

**状態: ドラフト** — 2026-07-09。selfmatrix-desktop の配布・自動更新・完全性検証の実装計画。
リポジトリを見られない AI (GPT) でも検討できるよう自己完結で書く。実装前の設計であり、
electron-builder / electron-updater の**正確な API 名・オプションは実装時にバージョンで再確認**する
(下記で「要実装時確認」と明記した箇所)。前提と多層対策の正本は
[native-milestones.md](../planning/native-milestones.md) の M2「配布物の完全性」節。

## 0. 結論サマリ

- **署名鍵は運用者のオフライン手元鍵 (minisign / Ed25519)**。CI にも GitHub にも秘密鍵を置かない。
  → **鍵生成は運用者が手元で行う作業** (§5 のランブック)。AI は生成できない。
- CI (GitHub Actions) は「ビルド + Artifact Attestation + SHA256SUMS + ドラフトリリース作成」まで。
  **署名は運用者が手元で行い .minisig を添付してから publish** する半自動フロー。
- アプリの自動更新 (electron-updater) は、更新物を適用する前に**埋め込み公開鍵で minisign 署名を
  検証**する (`NsisUpdater.verifyUpdateCodeSignature` に自前検証関数を差す。§4)。
  → GitHub アカウントが乗っ取られても、署名鍵が無ければ改造バイナリを自動更新で配れない。
- **これは native (selfmatrix-desktop) だけの話**。web 版は従来どおり Docker イメージ配布で無関係
  (併走ルール [web-native-parallel.md](../planning/web-native-parallel.md))。

## 1. 前提 (M2 確定事項より)

- 対応 OS: **Windows のみ**。パッケージは NSIS インストーラ (electron-builder)。
- 配布: **public GitHub Releases**。Authenticode コード署名は**しない** (個人には高コスト /
  Azure Trusted Signing は日本の個人は不可)。→ SmartScreen 警告は手順書で案内 (§8)。
- homeserver は**焼き込まない** (接続先はユーザー入力)。→ バイナリに実ドメインは入らない。
- cinny / EC は **native ビルド (`npm run build:native`) の dist を同梱** (web ビルドだと
  native 分岐が tree-shake されて通話ホストが成立しないため。tree-shake は既に実装済み)。

## 2. ビルド / パッケージング

- **electron-builder** で NSIS インストーラ + `latest.yml` (electron-updater 用のメタ) +
  `.blockmap` (差分更新用) を生成。target: `nsis` (Windows x64)。
- **同梱物のビルド順**: (1) cinny を `npm run build:native` → `dist/`、(2) EC を embedded ビルド、
  (3) desktop が両 dist を `resources/` 等に取り込む形で electron-builder が同梱。
  ※ 現状 desktop は sibling の `../cinny/dist` を実行時に配信している (prototype 由来)。
  **製品では同梱リソースとして固める** — この移行 (sibling 参照 → 同梱) は本実装のスコープに含む。
- `electron-builder.yml` (or package.json の `build` キー) に appId / productName `SelfMatrix` /
  publish 先 (github) / artifactName を定義。バージョンは package.json の version が正。
- **要実装時確認**: electron-builder のバージョン、asar 圧縮の可否 (WebContentsView で EC/cinny を
  file:// でなく内蔵 HTTP サーバー配信する現構成との相性 — 現行 main.cjs の静的サーバーを製品でも
  使うなら asar 内リソースの読み出し方に注意)。

## 3. 配布物の完全性 — 4 層 (native-milestones の計画を実装に落とす)

| 層 | 実装 | 誰が |
| --- | --- | --- |
| 1. 基本衛生 | GitHub 2FA / protected tag / CI 権限最小化 (`permissions:` を必要最小に) | 運用者 + CI |
| 2. Artifact Attestation | CI で `actions/attest-build-provenance`。検証は `gh attestation verify <file> --repo zoobookfool/selfmatrix-desktop` | CI |
| 3. SHA256SUMS 二系統 | CI が `SHA256SUMS` を生成しリリースに添付 + **運用者が Matrix 運用ルームにも掲示** (out-of-band) | CI + 運用者 |
| 4. **minisign 署名 + アプリ内検証 (本命)** | 運用者が手元で installer に minisign 署名 → `.minisig` をリリース添付。アプリは埋め込み公開鍵で自動更新物を検証 (§4) | 運用者 + アプリ |

- **なぜ 4 層目が本命か**: 1〜3 は「GitHub の外に検証手段を置く」対策だが、自動更新の適用を止める
  力があるのは 4 層目だけ。GitHub 完全乗っ取り時でも、秘密鍵が手元にある限り改造更新は適用されない。

## 4. 自動更新 (electron-updater + minisign 検証)

**フロー**:

```
起動時/定期: NsisUpdater が latest.yml を取得 → 新バージョンあり → installer + .blockmap DL
  → [検証] verifyUpdateCodeSignature(publisherName, installerPath):
       - 同ディレクトリ or リリースから installer に対応する .minisig を取得
       - 埋め込み公開鍵で Ed25519 署名を検証
       - OK → return null (electron-updater が適用へ進む)
       - NG → return "signature verification failed" (適用を中止)
  → 検証 OK なら quitAndInstall (通話中は保留、§7)
```

- **フック**: `NsisUpdater.verifyUpdateCodeSignature` に自前関数を代入。
  型は `(publisherName: string[], path: string) => Promise<string | null>` (null=成功 /
  文字列=失敗理由)。既定は Windows Authenticode 検証だが、**証明書が無いので publisherName は
  使わず、path の installer に対する minisign 署名検証に置き換える** (2026-07 時点の
  electron-updater で確認済みの公開フック。参考: Doyensec ElectronSafeUpdater)。
- **minisign 署名の検証実装**: minisign は Ed25519。検証は Node 組み込み `crypto` の Ed25519
  (`crypto.verify(null, data, publicKey, signature)`) で可能な見込み。minisign のファイル形式
  (base64 の署名行 + trusted comment) をパースして署名バイト列を取り出す薄いパーサを実装、または
  実績のある小さな JS 実装を精査して採用 (依存は最小・監査可能なものに限る)。**要実装時確認**。
- **.minisig の入手経路**: installer と同じ GitHub Release から取得。latest.yml に併記できるか、
  別 DL するかは実装時に決定 (electron-updater の DL フックとの兼ね合い)。
- **allowDowngrade 無効** (古い改造版へのダウングレード誘導を防ぐ)。

## 5. 運用者の鍵生成ランブック (オフライン作業、AI は代行不可)

1. **鍵生成** (信頼できる手元マシンで、ネットから隔離した状態が理想):
   `minisign -G -p selfmatrix.pub -s selfmatrix.sec` (パスフレーズ付き)。
2. **公開鍵をアプリに埋め込む**: `selfmatrix.pub` の公開鍵文字列を desktop のソース
   (定数 or リソース) に置く。**公開鍵はリポジトリに入れてよい** (公開情報)。
3. **秘密鍵 (`selfmatrix.sec`) は手元のみ**。GitHub / CI / どのリポジトリにも置かない。
   バックアップは運用者のパスワードマネージャ or オフライン媒体。
4. **リリース毎の署名** (手元):
   `minisign -S -s selfmatrix.sec -m SelfMatrix-Setup-x.y.z.exe`
   → `.minisig` をリリースに添付。
   - **初回実署名時の必須チェック (実装時の未達検証を運用者が閉じる)**: アプリ内の minisign 検証器
     (`src/minisign-verify.cjs`) は仕様 + 自家生成ベクタで検証済みだが、**実 minisign バイナリが
     生成した署名との突き合わせは実装時に未実施** (サンドボックス制約)。初回の実署名で作った
     `.exe` + `.minisig` + 公開鍵を検証器に食わせ、`ok:true` が返ることを一度確認すること
     (形式が実 minisign と一致している最終確証。ここで落ちたら形式パースのバグなので実装へ差し戻し)。
5. **初回インストールは TOFU** (trust-on-first-use): 最初の入手時だけ、SHA256 二系統 (§3-3) と
   Attestation (§3-2) の 2/3 を手順書で確認してもらう (§8)。以降の更新は minisign が自動で守る。

**確認事項 (運用者)**: (a) 鍵生成を今やるか M2 の後半でやるか。(b) 公開鍵のローテーション方針
(鍵漏洩時の切替 — 旧鍵署名を受け付けない新バージョンを配る等)。

## 6. CI ワークフロー (GitHub Actions) の骨子

```
on: push tags 'v*'   (protected tag)
permissions: { contents: write, id-token: write, attestations: write }  # 最小
jobs.build (windows):
  - checkout desktop + cinny + element-call (pinned)
  - cinny: npm ci && npm run build:native
  - EC: embedded build
  - desktop: npm ci && electron-builder (publish=never, ドラフト生成用の成果物のみ)
  - actions/attest-build-provenance で installer に provenance 発行
  - SHA256SUMS 生成
  - ドラフトリリース作成 + 成果物 + SHA256SUMS + latest.yml をアップロード (publish しない)
→ [手動ゲート] 運用者が installer を DL → 手元で minisign 署名 → .minisig をリリースに添付
   → リリースを publish (ここで初めて公開)
```

- **署名を CI に入れない**のが肝 (秘密鍵を CI に置かない設計を貫くため半自動)。
- **要確認**: electron-updater は publish された Release の latest.yml を見る。ドラフト中は
  更新対象にならないので、publish のタイミング = 配布開始で整合。

## 7. 自動更新の実運用ルール

- **通話中は更新を保留**: `quitAndInstall` を通話中 (call view active) は呼ばない。通話終了後 or
  次回起動時に適用。
- 更新チェックの頻度、ユーザーへの通知 (「更新があります」→再起動導線) は UI 工程 (GPT/後) と連携。
- ロールバック: allowDowngrade 無効のため、問題版が出たら**新しい上位バージョン**で修正して配る。

## 8. SmartScreen / 誤検知 手順書 (公開 Issue or README)

- 無署名 EXE は SmartScreen が「発行元不明」警告を出す → 「詳細 → 実行」の案内。
- 初回 TOFU 検証の手順 (SHA256 二系統照合 + `gh attestation verify` の 2/3)。
- AV 誤検知時: Microsoft への申告手順を運用に含める。

## 9. 実装順序と運用者への確認事項

**実装順序 (提案)**: (1) electron-builder で無署名インストーラを作れる状態にする (同梱リソース化含む)
→ (2) CI で build + Attestation + SHA256SUMS + ドラフト → (3) minisign 検証フックをアプリに実装
(公開鍵は運用者生成待ち、それまではダミー公開鍵 + テストベクタで検証ロジックだけ固める) →
(4) 運用者が鍵生成 → 実公開鍵を埋め込み → 初回リリースで通し検証。

**確認事項**:
- [ ] リリース CI をこの M2 で作るか、UI (ソース選択・About・homeserver 選択) を先にやってから最後に回すか
- [ ] minisign 鍵生成を今やるか (それまで実装は (3) のダミー鍵まで進められる)
- [ ] 自動更新のチェック頻度・通知 UX (UI 工程と連携)
- [ ] winget 登録 (LATER) を M2 に含めるか M3 以降か
