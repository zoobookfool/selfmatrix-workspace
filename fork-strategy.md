# Cinny Fork Strategy

## Principle

Cinny本体の差分は小さく保ちます。Matrix SDK、暗号化、sync 周りに深い改造を入れると upstream 追従が重くなります。

## Fork repositories (2026-07-03 作成済み)

- [zoobookfool/selfmatrix-cinny](https://github.com/zoobookfool/selfmatrix-cinny) — cinnyapp/cinny の fork
- [zoobookfool/selfmatrix-element-call](https://github.com/zoobookfool/selfmatrix-element-call) — element-hq/element-call の fork。
  ベースは **v0.20.1**(cinny の依存 `@element-hq/element-call-embedded@0.20.1` に合わせて固定)

ローカルの clone は `remote rename origin upstream` + `remote add origin <fork>` 構成。

ブランチ方針(両 fork 共通、実施済み):

- `upstream-dev`: upstream `dev` を追うだけ
- `product/discord-style-shell`: UIと設定の差分(**デフォルトブランチ**)
- `spike/*`: 技術検証の保存(cinny: `spike/call-popout`、EC: `spike/media-params`)
- `release/*`: デプロイ用

## First fork changes

優先順は以下です。

1. `config.json` を自分のhomeserver固定にする
2. 使わない public explore / featured communities を閉じる
3. UI文言を Matrix 用語から利用者向けの言い方へ寄せる
4. Legal / source link / license notice を見える場所に置く
5. Space を server、Room を channel として見せるためのラベル調整
6. E2EE key backup と device verification の導線を強くする

## What to avoid early

- crypto 実装への変更
- sync engine の置き換え
- 独自Matrix拡張イベントの乱用
- server-side API を前提にしたCinny専用機能
- upstreamと衝突しやすい大規模リファクタ

## AGPL checklist

- fork repository を公開する、または利用者が対応ソースへアクセスできる導線を用意する
- upstream copyright / license notice を消さない
- 自分の変更点と日付が追えるようにする
- UI上の「ソースコード」「ライセンス」導線を消さない
