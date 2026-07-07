# レビュー: GPT 第 2 ラウンド (EC 99a01f02 / cinny 5207a20)

レビュアー: Claude (敵対的レビュー 2 視点 + テスト実行 + 統合 E2E)。2026-07-07。

## 対象

- element-call `99a01f02` "Refine watched stream overlays" (ベース 9541b598)
- cinny `5207a20` "Fix docked channel nav layouts" + ref bump `23c2d2e` / `9d2789b`

## 結果サマリ

| 項目 | 結果 |
| --- | --- |
| EC unit 682 / tsc / i18n:check / eslint | green |
| cinny typecheck / vitest 33 / eslint | green |
| element-call-ref の連鎖 (6c69279→dd8966aa→9541b598→99a01f02) | 正しい (祖先関係・ブランチ先端一致を確認) |
| cinny 5207a20 | **LGTM** — chipNav 導入以来の実在バグ (上下ドッキング時にチップ行が縦積みのままだった) の正しい修正。4 方向・他画面への波及なし |
| EC 99a01f02 | **要修正 (critical 1 件)** — 下記 |
| 統合 E2E 16 項目 | **15 PASS / 1 FAIL** — FAIL は下記 critical の実機再現 |
| 本番反映 | **保留** (critical 修正まで自宅サーバーの pull を止めている。GHCR :latest にはこの回帰が含まれる) |

## 必須修正 (critical)

### 強調選択中に配信を視聴していると、選択外のタイルが画面から完全に消える

`src/state/CallViewModel/CallViewModel.ts` の gridLayoutMedia$ (1268-1286 行付近):

```ts
const suppressMiniTileStrip = watchedScreenShares.length > 0;
```

これは「視聴中の配信が 1 件でもあるか」しか見ておらず、**強調選択で何を選んだかと無関係に** strip を抑制する。

**失敗シナリオ (E2E で実証済み)**: Local・Alice・Bob の 3 人通話で Bob が配信、Local がそれを視聴中。
Local が強調選択を ON にして Alice だけを選ぶ → grid=[Alice]、strip=なし → **Local 自身・Bob・Bob の配信が
grid にも strip にも入らず、レイアウトから消失** (現 UI の描画経路は grid/strip のみ)。

コミット内コメントの意図 (「配信視聴中はスピーカーミニタイルの代わりに SpeakerOverlay ピルで話者を出す」)
は理解できるが、それが成立するのは**配信タイルが実際に描画されている場合だけ**。修正案:

- suppress の判定を「強調選択された集合に視聴中の配信が含まれるか」に変える、または
- 選択外 (strip 候補) に視聴中の配信が含まれる場合は strip を出す

修正時は「参加者のみを強調選択 + 他者の配信を視聴中」のケースの CallViewModel テストを必ず追加すること
(今回追加されたテストは「配信そのものを強調選択」の 1 ケースだけで、この回帰を検出できない)。

再現手順 (統合 E2E): グリッドモードで配信を視聴 (3 タイル) → 強調選択 ON → 参加者タイルを 1 枚選択 →
期待: 選択 1 枚 + strip に 2 枚 / 実際: 選択 1 枚のみで strip が出ない。

## 任意修正 (minor)

1. **ScreenShareQualityBadge の文言が i18n 未対応** — "FPS" 等をハードコード。既存の画質ピッカー
   (ShareScreenMenuButton) は t() 経由の慣習。en/ja キー追加を推奨
2. **speakerOverlayAlignment がデッドコード化 + 既存ユーザーの位置設定が無条件リセット** —
   新 speakerOverlayPosition(x,y) へのマイグレーションが無い。旧 Setting の宣言も残存。
   旧値→新値の変換 (右上→{1,0} 等) を入れるか、少なくとも旧宣言を削除
3. **qualityInfo$ が watching$ を見ずに 1 秒毎の RTP 統計ポーリングを回し続ける** —
   未視聴の配信にも走る。watching$ で switchMap して視聴中のみポーリングに
4. cinny `Space.tsx:351` の既存 `as any` (今回の変更行ではない) — ついでに直せるなら

## 良かった点

- ref bump を自律的に正しく実行 (前回の指摘が反映された)
- cinny の chipNav 修正は原因特定 (NavCategory が flex コンテナでなかった) が的確で、
  5 ルート一律適用・オプトイン既定化も含め丁寧
- SpeakerOverlay の自由配置化・受信品質バッジは製品価値のある追加 (バッジは i18n だけ追随を)

## 修正後の手順

修正 push → element-call-ref bump → CI green を確認したら、Claude 側で E2E 再実行と本番反映を行う。
