# GPT 全体レビュー (2026-07-12)

## 対象

| リポジトリ | 対象 HEAD |
| --- | --- |
| `zoobookfool/selfmatrix-workspace` | `1c1718472dbf343a5a5f834150300168d3dd2e5d` |
| `zoobookfool/selfmatrix-desktop` | `5fc3909f8d470bc7efc9969b80614f1d97897e22` |
| `zoobookfool/selfmatrix-cinny` | `9ea79b8bcbb0ad092e8b59bb92b7f5b757cefc36` (`product/discord-style-shell`) |
| `zoobookfool/selfmatrix-element-call` | `db6693f7a44df6d361e0d82fe35b4d261a1ed827` (`product/discord-style-shell`) |
| `zoobookfool/selfmatrix` | `44f5c417b09d1a6477b94f74284a99e6b77d3f2f` |
| `zoobookfool/selfmatrix-hires` | `9e7775b71cd87a2b8f5421ff68c3cfa5fd8a99d3` |

前回 GPT レビュー (`gpt-review-desktop-m2-readiness-followup-20260708.md`) 以降の更新に加え、
web/native の配布経路、正本文書、未更新の本体/hires も含めて横断確認した。

## 結論

M3 の無再接続ポップアウト、最前面固定、外部ミュート A+B、Cinny の product 統合はよくまとまっている。
desktop の probe 群、Cinny の web/native tree-shake ガード、Element Call の unit test も実行可能な状態を
維持している。

ただし、**初回 native リリースは現状のまま publish しないこと**。minisign 検証は純関数と代入確認の
probe は通るが、実際の `electron-updater` の NSIS ダウンロード経路では検証関数が呼ばれず、
`.minisig` も updater のキャッシュへ取得されない。設計上の「GitHub 乗っ取り時にも更新を拒否する」
最後の防衛線が実運用では成立していない。

## 対応結果 (2026-07-12)

以下のFindingはすべて実装修正済み。本文はレビュー時点の監査履歴として残す。

- **P0 updater**: desktop `9b6e66d`で`MinisignNsisUpdater`を実装。実`NsisUpdater`がinstallerと
  同一releaseの`.minisig`を取得し、pending cacheを毎回消してから検証する。生成済みunpacked製品を
  起動した正常/欠落/改ざんの3ケースで、正常だけ`update-downloaded=1`、欠落/改ざんは
  `ERR_UPDATER_INVALID_SIGNATURE`を確認した。
- **P1 release入力/CI**: desktop `9b6e66d`の`product-lock.json`でCinny
  `ec64b637438dd79bc96f0c0c4dae95aeee8cdc9f`とElement Call
  `e31f335f93a16b20fa1767ee8605c3eec2e2e398`を完全SHA固定。tag-version、実checkout、Cinny側EC refを
  fail-closedで検証し、Actionsもcommit SHA固定した。desktop `75c5f23`では非推奨Node 20 actionを
  runner上のCorepack shimへ置換した。
- **P1 web配布**: Cinnyは自動`latest`生成を廃止し、reviewed pushは`sha-*`だけをpublishする。
  selfmatrix `d55ff4a556acb9c69b343692ebc8f2b2f8b6eaa3`は
  `ghcr.io/zoobookfool/selfmatrix-cinny:sha-ec64b63`を既定に固定した。
- **P1 lint/audit**: Element Call `e31f335f`でunused設定を除去しproduct CIを追加。Cinny
  `08958070`/`ec64b637`でproduction auditを0件にし、OS差のあったESLint走査を`eslint src`へ統一した。
- **P2 desktop作法**: desktop `9b6e66d`でsingle-instance lock、実2プロセスprobe、通話窓boundsの
  work area復元を追加。Cinny AboutはClient/Desktop版と同梱Cinny/EC commitを区別して表示する。
- **正本文書**: current-status/backlog/native-milestones/feature-matrix/release-pipeline/RELEASINGを
  実状態へ更新し、native-client-rethinkをGO前の履歴へ降格した。

再検証はdesktop `npm test`、packaged updater probe、Cinny typecheck/ESLint/audit/web+native guard、
Element Call lint/unit/audit/build、selfmatrix compose/shell checksで成功。Element Call product CI、Cinnyの
tree-shake/image CI、selfmatrix CI、desktop `75c5f23` Product CIもgreenを確認した。

**残るのは公開運用ゲート**: 実minisign binaryとのクロスチェック、初回tag/draft/publish、旧版からの
実更新、通話中適用保留、web/native混在通話の実測。GitHub API確認ではruleset/branch protectionが
未設定だったため、desktop `main`/`v*`の保護方針も初回公開前に決める。PR必須化は直接push運用を変える
ため、運用者合意なしには設定していない。

## Findings

### [P0] 実 NSIS 更新経路では minisign 検証が実行されない

desktop は [`setupAutoUpdater()`](https://github.com/zoobookfool/selfmatrix-desktop/blob/5fc3909f8d470bc7efc9969b80614f1d97897e22/src/main.cjs#L1882-L1895)
で `autoUpdater.verifyUpdateCodeSignature` を差し替えている。しかし、同梱される
`electron-updater@6.8.9` の `NsisUpdater.verifySignature()` は `app-update.yml` に
`publisherName` が無い場合、カスタム関数を呼ぶ前に `null` を返す
(`node_modules/electron-updater/out/NsisUpdater.js` 84-99 行)。今回 `npm run package:win` で生成した
`dist/win-unpacked/resources/app-update.yml` は次の 4 項目だけで、`publisherName` は無かった。

```yaml
owner: zoobookfool
repo: selfmatrix-desktop
provider: github
updaterCacheDirName: selfmatrix-desktop-updater
```

さらに検証関数は [`<installerPath>.minisig` の隣接ファイル](https://github.com/zoobookfool/selfmatrix-desktop/blob/5fc3909f8d470bc7efc9969b80614f1d97897e22/src/update-signature-verify.cjs#L32-L41)
を読むが、生成された `latest.yml` が列挙するのは `.exe` だけである。リリース手順は `.minisig` を
GitHub Release へ手動添付するだけで、`electron-updater` がそれを installer と一緒にダウンロードして
updater cache に置く処理はない。

現状の結果は次のどちらかになる。

- 今の構成: `publisherName` 不在によりカスタム検証がスキップされ、GitHub 側の `latest.yml` の
  SHA512 検証だけで更新が通る。GitHub アカウント/リリースが侵害された場合の防御にならない。
- `publisherName` だけ足した構成: カスタム検証は呼ばれるが隣接 `.minisig` が無いため、正規更新も失敗する。

対応案:

1. `.minisig` の取得を updater の同じダウンロード処理に組み込み、installer cache の隣へ置く。
2. `publisherName` の有無に依存せず必ず fail-closed で minisign 検証へ入る方式にする。必要なら
   `NsisUpdater` の薄いサブクラス/ラッパを用意する。
3. ローカル HTTP の偽 update provider を使った packaged-app 統合テストを追加し、
   `正しい署名=update-downloaded` / `署名欠落=拒否` / `改ざん=拒否` を実際の
   `NsisUpdater.doDownloadUpdate()` 経路で確認する。
4. このテストが成立するまで M2 の「自前署名による更新検証 完了」を再オープンする。

既存 `update-wiring-probe` は
[`関数参照が代入されたこと`](https://github.com/zoobookfool/selfmatrix-desktop/blob/5fc3909f8d470bc7efc9969b80614f1d97897e22/src/main.cjs#L5904-L5908)
だけを確認しており、上記の `NsisUpdater` 内部早期 return と署名ファイル取得漏れは検知できない。

### [P1] web 本番が mutable な `latest` を既定にしており、再現性 MUST とリリース同期を破る

本体の [`.env.example`](https://github.com/zoobookfool/selfmatrix/blob/44f5c417b09d1a6477b94f74284a99e6b77d3f2f/.env.example#L12-L14)
と [`compose.yaml`](https://github.com/zoobookfool/selfmatrix/blob/44f5c417b09d1a6477b94f74284a99e6b77d3f2f/compose.yaml#L47-L51)
は Cinny image を `latest` で起動する。対して Cinny の
[`SelfMatrix image` workflow](https://github.com/zoobookfool/selfmatrix-cinny/blob/9ea79b8bcbb0ad092e8b59bb92b7f5b757cefc36/.github/workflows/selfmatrix-image.yml#L13-L16)
は product branch の全 push で動き、[`latest` を publish](https://github.com/zoobookfool/selfmatrix-cinny/blob/9ea79b8bcbb0ad092e8b59bb92b7f5b757cefc36/.github/workflows/selfmatrix-image.yml#L99-L110)
する。

これは [requirements.md §8](../planning/requirements.md#L121) の「イメージタグ固定 `MUST`」と矛盾し、
レビュー前の push や回帰を次回 `docker compose pull` で本番へ取り込む。また native release が固定した
Cinny/EC の組み合わせと web の `latest` がずれ、M4 の 2 配布物同期も追跡できない。

対応案: `.env.example` の既定を immutable な `sha-<cinny commit>` にし、product push は SHA tag の
build まで、`stable`/version tag への昇格はレビュー・検証後の明示操作に分離する。`latest` は開発者が
明示選択した場合だけにする。

### [P1] native release の入力と Actions が固定されておらず、同じ tag を再現できない

desktop release workflow は
[`CINNY_REF` / `ELEMENT_CALL_REF` に branch 名](https://github.com/zoobookfool/selfmatrix-desktop/blob/5fc3909f8d470bc7efc9969b80614f1d97897e22/.github/workflows/release.yml#L40-L56)
を使う。同じ desktop tag を rerun しても、両 branch が進んでいれば別バイナリになる。web image は
Cinny の `.selfmatrix/element-call-ref` (`db6693f7`) を使うのに、native release はこの lock を無視するため、
web/native で別の EC を同梱する余地もある。

また release workflow の `actions/checkout@v5`、`actions/setup-node@v6`、
`pnpm/action-setup@v4`、`actions/attest-build-provenance@v4`、`softprops/action-gh-release@v2` は
commit SHA 固定ではない。Cinny image workflow でも `actions/upload-artifact@v7` と
`actions/download-artifact@v8` だけが未固定で、後者は `packages: write` の job 内で実行される。

対応案:

- desktop に `product-lock.json` 等を置き、Cinny SHA と EC SHA をレビュー対象として固定する。
- EC SHA は Cinny の `.selfmatrix/element-call-ref` と一致することを CI で assert する。
- 全 Actions を commit SHA へ固定し、Dependabot/Renovate で更新する。
- tag `vX.Y.Z` と desktop `package.json` の `version` が完全一致しなければ release を失敗させる。
  現状は任意の `v*` tag で `package.json` の `0.1.0` をそのままビルドできる。
- Attestation/リリースノートに desktop/Cinny/EC の 3 SHA を明記する。

### [P1] release 前の継続 CI が無く、Element Call の正規 lint も現在失敗する

`selfmatrix-desktop` の workflow は tag 専用 release 1 本だけで、main push/PR の `npm test` が無い。
GitHub Actions の実行履歴も今回確認時点で 0 件だった。release job 自身も Cinny/EC/desktop を build する
だけで、desktop `npm test`、Cinny `typecheck`、Element Call `lint`/unit test、audit を実行しない。

今回の手元確認では desktop `npm test` と Element Call unit test は通ったが、Element Call の
`pnpm lint` は [`speakerOverlayAlignment`](https://github.com/zoobookfool/selfmatrix-element-call/blob/db6693f7a44df6d361e0d82fe35b4d261a1ed827/src/settings/settings.ts#L194-L202)
が未使用 export として `knip` で失敗した。free-placement の `speakerOverlayPosition` へ移行した後の
旧 corner 設定の残骸に見える。

対応案: 未使用 export を削除するか migration 用に実際に読む。desktop/Cinny/EC それぞれに push/PR CI を
置き、release は同じ reusable gate を再実行してから packaging する。少なくとも
`desktop npm test`、`cinny typecheck + web/native build guard`、`EC lint + unit + build:embedded` を必須にする。

### [P1] Cinny の production dependency audit が 18 件で失敗する

`npm audit --omit=dev` は `high: 6 / moderate: 11 / low: 1`。直接依存にも
`vite` (high)、`@vanilla-extract/vite-plugin`、`i18next-http-backend`、`react-router-dom` が含まれ、
全件に npm が修正版候補を返している。Vite/Rollup/tar 等は主に build/dev 経路で実アプリへの到達性を
個別評価すべきだが、`i18next-http-backend` の URL/path injection と `react-router` の open redirect は
ブラウザ runtime に入るため、単に「build-only」と一括除外できない。

対応案: direct runtime 依存を先に更新し、transitive/build-only は到達性と CI threat model を記録して
例外化または更新する。少なくとも public native 初回リリース前に audit の triage 記録を残し、
[backlog.md](../planning/backlog.md) の periodic security/audit を具体タスク化する。

### [P1] 正本文書が M2/M3/M4 の実状態と食い違い、P0 を「完了」と表示している

- [current-status.md](../planning/current-status.md#L5) は最新が 2026-07-09/M2 のままで、
  「次にやること」も M2、未完了一覧も外部ミュート未実装のまま。
- [backlog.md](../planning/backlog.md#L8) は M2 を「進行中、残: web tree-shake / mainWindow 監査 / ...」
  とし、既に完了した項目を列挙している。
- [native-milestones.md](../planning/native-milestones.md#L141) は同じ M2 節で packaging/CI/update を
  「残」と書いた後、[177 行目](../planning/native-milestones.md#L177) で署名検証完了、
  [187 行目](../planning/native-milestones.md#L187) で実鍵生成待ちとしている。実公開鍵は既に desktop
  `2d2cc61` で入っている一方、実 updater 経路は上記 P0 により未成立。
- [feature-matrix.md](../planning/feature-matrix.md#L62) は「minisign による自動更新」を native ✅ としている。
- [release-pipeline.md](../design/release-pipeline.md#L3) はまだドラフト/実装前文言で、`.minisig` の
  入手経路も [79 行目](../design/release-pipeline.md#L79) で未決定のまま。
- desktop `RELEASING.md` も実公開鍵をまだプレースホルダと説明する箇所が残る。

対応案: 先に P0 を直し、それまでは M2 を「実装済み・更新経路の実統合は再オープン」にする。
`current-status` は M3 完了/M4 初回リリース待ちへ更新し、`backlog` は完了行を履歴へ移して今回の
P0/P1 を追加する。release-pipeline は実装後の正本/ランブックへ昇格し、計画時の未決定文言を消す。

### [P2] desktop に single-instance lock が無い

`main.cjs` は `app.requestSingleInstanceLock()` / `second-instance` を使わず、毎回
[`main()` から server/window/tray/API を新規作成](https://github.com/zoobookfool/selfmatrix-desktop/blob/5fc3909f8d470bc7efc9969b80614f1d97897e22/src/main.cjs#L5828-L5850)
する。自動起動、ユーザーの二重クリック、既存 tray を見失った状態で 2 個目が起動すると、同じ userData
を共有する 2 プロセスができる。外部 API が ON の場合、2 個目は `EADDRINUSE` になり、
[`enabled:false` を永続化](https://github.com/zoobookfool/selfmatrix-desktop/blob/5fc3909f8d470bc7efc9969b80614f1d97897e22/src/main.cjs#L1636-L1644)
するため、次回起動時には設定まで OFF になる。

対応案: ready 前に single-instance lock を取得し、2 個目は終了。`second-instance` では既存
mainWindow を restore/show/focus する。probe で「2 個目が tray/API を作らず、1 個目が前面化される」を確認する。

### [P2] 保存した通話窓が、モニター構成変更後に画面外へ消える

[`loadCallWindowState()`](https://github.com/zoobookfool/selfmatrix-desktop/blob/5fc3909f8d470bc7efc9969b80614f1d97897e22/src/main.cjs#L1125-L1134)
は有限値と正の幅/高さしか検証せず、[`createCallWindow()`](https://github.com/zoobookfool/selfmatrix-desktop/blob/5fc3909f8d470bc7efc9969b80614f1d97897e22/src/main.cjs#L1732-L1752)
が x/y/width/height をそのまま復元する。外部モニターを外した後や解像度/DPI を変えた後、別窓が見えない
位置に復元される。

対応案: `screen.getAllDisplays()`/`getDisplayMatching()` で保存矩形が現行 display の workArea と十分に
交差するか確認し、交差しなければ primary display 中央へ戻す。幅/高さにも workArea 上限と最小値を設ける。

### [P2] About の表示バージョンと native の配布バージョンが別物のまま

Cinny の [About](https://github.com/zoobookfool/selfmatrix-cinny/blob/9ea79b8bcbb0ad092e8b59bb92b7f5b757cefc36/src/app/features/settings/about/About.tsx#L49-L53)
は `SelfMatrix v4.12.3` を固定表示する一方、desktop installer は `package.json` の `0.1.0`。
不具合報告や updater 確認時に、利用者がどちらをアプリ版として伝えるべきか分からない。

対応案: web は Cinny fork version、native は desktop version + 同梱 Cinny/EC commit をビルド情報として
表示する。最低限 `SelfMatrix Desktop 0.1.0 / Client 4.12.3` のように区別し、hard-code ではなく build 時注入にする。

## 検証結果

| 対象 | 結果 |
| --- | --- |
| desktop `npm test` | PASS (smoke/memory/cinny-shell/tray/external mute/API/minisign/update/M3/probe 一式) |
| desktop `npm run package:win` | PASS。NSIS 生成成功。ただし実物 `app-update.yml` に `publisherName` 無しを確認 |
| Cinny `npm run typecheck` | PASS |
| Cinny `npm run check:eslint` | PASS (既存 warning 3 件) |
| Cinny web build + no-native guard | PASS |
| Cinny native build + guard negative control | PASS (native 識別子 8 種を検知) |
| Cinny `npm run check:prettier` | FAIL。既存 baseline/改行差を含む 773 ファイル。今回の差分固有とは判定せず |
| Element Call unit | PASS: 86 files / 685 tests、11 skipped |
| Element Call embedded build | PASS |
| Element Call `pnpm lint` | FAIL: unused export `speakerOverlayAlignment` |
| selfmatrix compose validation | main/rtc とも PASS |
| selfmatrix shell scripts `bash -n` | PASS |
| selfmatrix-hires `gateway/selftest.py` | PASS 39 / FAIL 0 / SKIP 2 (WavPack DLL 不在) |
| dependency audit | desktop 0、Element Call 0、Cinny 18 (high 6 / moderate 11 / low 1) |
| GitHub Actions | Cinny current HEAD の image/tree-shake は success。desktop は tag 未作成のため run 0 件 |

未実施:

- desktop `e2e:join` / `e2e:callflow`: dev Matrix backend と Alice/Bob の環境変数が必要なため今回は再実行していない。
- 実 minisign binary での署名クロスチェック、published GitHub Release を使う自動更新実機テスト。
- hires WavPack 実 DLL 経路。

## Fable / ClaudeCode への推奨実装順

1. **P0 updater 実統合を修正し、packaged NSIS + 偽 update server の fail-closed E2E を追加する。**
2. desktop/Cinny/EC の release lock、Actions SHA pin、tag-version gate を入れる。
3. web の `latest` 既定を immutable SHA + 明示 promotion に置き換える。
4. desktop push/PR CI と release gate を作り、Element Call lint と Cinny audit を解消/triage する。
5. 正本 5 文書 + `RELEASING.md` を実状態へ更新する。
6. single-instance、窓位置 clamp、About build info を実装する。

P0 の完了条件は「検証関数を呼べる」ではなく、**実 updater が取得した正規 installer だけを受理し、
署名欠落/改ざん installer では `update-downloaded` に到達しないこと**とする。
