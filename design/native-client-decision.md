# ネイティブ版 合否判断 (2026-07-07)

**判定: 条件付き GO。**

SelfMatrix は Electron 版 `selfmatrix-desktop` の作成へ進めてよい。
ここでの GO は「実装着手可」の意味であり、参加者へ配布する production release GO ではない。

## 結論

- 採用方針: **Electron shell + Cinny fork 同梱 (案 A) -> Element Call を `WebContentsView` 分離 (案 B)**。
- web 版の「別ウィンドウ通話開始モード」は fallback として残すが、先に native 案 B を進める。
- 初期対象 OS は Windows 優先。system audio は Windows loopback を利用できる見込み。
- 本番実装の中心タスクは、Cinny の iframe 前提 `ClientWidgetApi` を置き換える **NativeWidgetTransport / NativeCallHost adapter**。

## 合格根拠

| ゲート | 結果 | 根拠 |
| --- | --- | --- |
| 安い UI 回帰 | PASS | `test-harness` の Playwright UI test で、配信タイル右クリック音量と話者 overlay 右クリック音量の入口を確認 |
| Widget protocol 回帰 | PASS | `npm test` で `preload-voice-join` / `device-mute` / `bridge-origin-mismatch` / static contract が PASS |
| `WebContentsView` 再親子付け | PASS | Electron 43 / Chrome 150。10 回移動後も `loadCount=1`、`unloads=0`、WebRTC data channel `open` |
| 画面共有 constraints | PASS | `getDisplayMedia` で 1280x720/30fps を取得し、1920x1080/60fps へ `applyConstraints` 成功 |
| system audio | PASS | Windows で `audio: "loopback"` を返し、`audioTrackCount=1`、`deviceId="loopback"` の audio track を取得 |
| 実 Cinny/EC build artifact | PASS | `native-prototype` smoke で Cinny/EC dist を同一 local origin 配信し、EC boot、Widget API bridge、別窓移動/戻し、`io.element.join` 送信まで成功 |
| 再読み込みなし | PASS | `native-prototype` smoke の `hardNavigationCount=1`。初回 load 以外の main-frame navigation なし |

## まだ production release GO ではない理由

次は実装着手後の release gate として扱う。

- 実アカウント / dev MatrixRTC / LiveKit での authenticated join は未確認。
- 画面共有中の `WebContentsView` 移動で、LiveKit publish track が維持されるかは未確認。
- EC の実 UI から source picker / 画質/FPS / loopback audio を選んだ時の一連の UX は未実装。
- Cinny 本体の `ClientWidgetApi` は `iframe.contentWindow` 固定のため、そのままでは `WebContentsView` に接続できない。
- 署名なし自動更新、release 権限、checksum/provenance、rollback、最低バージョン強制は設計を詰める必要がある。

## 実装方針

1. `selfmatrix-desktop` を作る前に、workspace の `native-prototype` で adapter の形を固める。
2. Cinny 側は既存 `CallEmbed` の UI/状態管理を捨てず、iframe 依存を `NativeCallHost` のような境界へ寄せる。
3. Electron 側は `WebContentsView` を owner window 間で再親子付けし、Widget API message を IPC で中継する。
4. Element Call 側はできるだけ無改造で維持する。`WidgetApi(widgetId, parentOrigin)` の前提は preload bridge で吸収する。
5. 画面共有 picker は Electron 側に置く。Windows では system audio toggle が ON の場合に `audio: "loopback"` を返す。

## NO-GO / fallback 条件

次のどれかに当たったら native 案 B を止め、web 版の別ウィンドウ開始モードまたは native 案 A のみへ戻す。

- NativeWidgetTransport で `ClientWidgetApi` / `CallWidgetDriver` 相当を保てず、EC の MatrixRTC client が実用的に動かない。
- 実 LiveKit join 後、`WebContentsView` 移動で main-frame reload、renderer crash、WebRTC disconnect が再現性高く発生する。
- 画面共有中の移動で publish track が失われ、Discord 風の無再接続 popout という主目的を満たせない。
- system audio を要求に入れた場合、Windows loopback が実 EC/LiveKit で安定しない。

## 次の作業

- `native-prototype` に NativeWidgetTransport 相当を追加し、Cinny の `ClientWidgetApi` と同じ方向の request/response contract を通す。
- 実 Matrix account を使う dev MatrixRTC join 手順を作り、join / 共有開始 / 移動 / 戻しを 1 本の smoke として記録する。
- 合格後に `selfmatrix-desktop` リポジトリへ切り出す。
