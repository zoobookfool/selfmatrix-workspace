# リリース基盤 (CI + 自動更新 + 自前署名)

**状態: 実装済みの正本** (2026-07-12)。実操作の手順は
[`selfmatrix-desktop/RELEASING.md`](https://github.com/zoobookfool/selfmatrix-desktop/blob/main/RELEASING.md)を使う。本書は信頼境界と
実装上の不変条件を記録する。

## 0. 結論

- 対応OSはWindows、配布物はNSIS installer。
- public GitHub Releasesを使うが、GitHubだけを更新の信頼根にしない。
- 運用者のオフラインminisign/Ed25519鍵でinstallerを署名する。秘密鍵はCI、GitHub Secrets、
  リポジトリへ置かない。
- CIは検証・ビルド・provenance・checksums・draft releaseまで。運用者が`.minisig`を追加して公開する。
- アプリは同じreleaseからsidecar署名を取得し、埋め込み公開鍵で検証できたinstallerだけを受理する。
- web版はimmutableなCinny image SHAを既定にし、`stable`/version tagへの昇格は手動操作に限定する。

## 1. 固定する入力

desktopの[`product-lock.json`](https://github.com/zoobookfool/selfmatrix-desktop/blob/main/product-lock.json)がnative buildの入力正本。

| 入力 | 固定方法 |
| --- | --- |
| desktop | `vX.Y.Z` tagが指すcommit |
| Cinny | product-lockの完全な40文字commit SHA |
| Element Call | product-lockの完全な40文字commit SHA |
| Cinnyが要求するEC | `.selfmatrix/element-call-ref`がdesktop lockと一致することをCIでassert |
| Actions | すべてcommit SHA固定 |
| Node/pnpm/Electron/updater | workflow、`.node-version`、package/lockfileで固定 |

`scripts/release-inputs.cjs`はタグとpackage version、実checkout、2つのEC lockをビルド前に検証する。
同じtagをrerunしても入力commitは変わらない。既存tagやassetの上書きは禁止する。

## 2. CI権限と保護

- release workflowは`contents: write`、`id-token: write`、`attestations: write`だけを持つ。
- 通常のpush/PR CIは`contents: read`だけを持つ。
- cross-repository checkoutはpublic repositoryのreadに限定し、credentialsを永続化しない。
- tag作成権限とdefault branchはGitHub ruleset/branch protectionで保護し、2FAを必須にする。
- Actions更新はDependabot等のPRでcommit SHA差分をレビューして行う。
- `BUILD-MANIFEST.json`へdesktop/Cinny/ECの3 SHAを記録し、installerと一緒にattestする。

**GitHub設定の残作業**: 2026-07-12のAPI確認では対象5リポジトリのrulesetは空で、desktop mainも
未保護だった。コード内の権限最小化とminisign信頼根は実装済みだが、初回public release前に少なくとも
desktopの`main`と`v*` tagへ削除/force-push防止を設定する。PR必須化は現在の単独開発・AI直接push運用を
変えるため、運用者合意なしに有効化しない。

## 3. ビルドとゲート

releaseと通常CIは同じ主要ゲートを実行する。

1. Element Call: frozen install、lint、unit、production audit、embedded build。
2. Cinny: `npm ci`、typecheck、ESLint、production audit、web build + no-native guard、native build +
   guardの負の対照。
3. desktop: `npm ci`、production audit、全probe、unpacked/NSIS build。
4. unpacked製品を起動し、実 `NsisUpdater` で正常署名・署名欠落・改ざんの3ケースを確認する。

native Cinny buildへdesktop versionとCinny/EC SHAを注入し、Aboutから利用者が報告できるようにする。

## 4. 自動更新の実経路

stock `electron-updater@6.8.9` の `NsisUpdater.verifySignature()` は `app-update.yml` に
`publisherName` が無いとcustom verifierを呼ばず成功扱いにする。また`latest.yml`は`.minisig`を列挙せず、
stock updaterはsidecarを取得しない。このため単なる`verifyUpdateCodeSignature`代入は使わない。

desktopの`MinisignNsisUpdater`は次を強制する。

1. check結果から選ばれた`.exe` URLを確定する。
2. pending update cacheを毎回消し、以前の未検証installerを再利用しない。
3. updater標準のSHA512確認付きでinstallerをダウンロードする。
4. installer URLへ`.minisig`を足したURLからsidecarを同じrequest contextで取得する。
5. `src/update-signature-verify.cjs`が埋め込み公開鍵でminisignを検証する。
6. 正常時だけ`update-downloaded`へ進む。欠落・HTTP失敗・形式不正・別鍵・内容改ざんは
   `ERR_UPDATER_INVALID_SIGNATURE`で拒否する。

実装はfull NSIS installerだけを許可し、web installerは無効。`allowDowngrade=false`。

### 検証済み範囲

- plain Nodeの署名パーサ/ファイルI/O。
- Electron 43でのEd25519 + pure JS BLAKE2b fallback。
- unpacked開発実行の実NsisUpdater download task。
- electron-builderで生成したunpacked製品実行ファイルからの実NsisUpdater download task。
- 正常署名のみ`update-downloaded=1`、署名欠落/改ざんは`update-downloaded=0`。

### 初回公開で残る確認

- 実minisign binaryが作る署名とのクロスチェック。
- published GitHub Releaseを使う旧版からの更新。
- 通話中に適用を保留し、通話終了後に適用する実機確認。

## 5. 署名鍵

公開鍵は`src/update-signature-verify.cjs`へ実鍵として埋め込み済み
(`key_id = 671E2DDA2737FAE3`)。対応する秘密鍵は運用者の手元だけにある。

リリース毎:

```sh
minisign -S -s selfmatrix.sec -m SelfMatrix-Setup-X.Y.Z.exe
```

生成された`SelfMatrix-Setup-X.Y.Z.exe.minisig`をdraftへ追加する。sidecarが無いdraftをpublishしては
ならない。鍵漏洩時は旧鍵で署名した既存版を上書きせず、鍵ローテーションを含む新しい上位versionを配る。

## 6. 完全性の4層

| 層 | 内容 |
| --- | --- |
| 1 | 2FA、branch/tag保護、最小CI権限、Actions SHA固定、immutable source lock |
| 2 | GitHub Artifact Attestation (`gh attestation verify`) |
| 3 | `SHA256SUMS`をreleaseとMatrix運用ルーム等の別経路で照合 |
| 4 | オフラインminisign鍵 + アプリ内fail-closed検証 |

GitHub release/metadataを攻撃者が変更できても、4層目の秘密鍵が無ければ更新は受理されない。

## 7. 更新適用とロールバック

- `checkForUpdatesAndNotify()`はpackaged native製品だけで有効にする。dev/probe/E2Eは外部更新へ接続しない。
- `update-downloaded`後も通話中は`quitAndInstall()`を呼ばない。
- `autoInstallOnAppQuit`により利用者が通常終了した場合は適用できる。
- rollbackはdowngradeでなく、修正版をより大きいversionとして配布する。

## 8. web imageの同期

Cinny product pushは`sha-<commit>` imageだけを自動生成する。mutableな`latest`は生成しない。
レビュー済みcommitを`stable`またはversion tagへ昇格する操作は`workflow_dispatch`で明示実行する。
selfmatrix composeの既定は具体的なSHA tagへ固定する。2026-07-12時点は`sha-ec64b63`。

nativeの`BUILD-MANIFEST.json`とwebのimage SHAから、同じCinny/EC組み合わせか追跡できる。

## 9. 初回インストール

埋め込み公開鍵が守るのは2回目以降の自動更新。最初のinstallerは次を案内する。

- out-of-band `SHA256SUMS`照合。
- `minisign -Vm`による署名確認。
- `gh attestation verify`によるprovenance確認。
- AuthenticodeなしのためSmartScreen「発行元不明」が出ることと、確認後の実行手順。
