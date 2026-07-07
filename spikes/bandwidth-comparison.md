# ホスティング各社の帯域・転送量比較(調査日 2026-07-03)

SelfMatrix の VPS 選定にあたり、MatrixRTC/LiveKit の UDP メディア終端(WebRTC SFU)を運用する上での判断材料として、国内外の主要ホスティング各社の回線帯域・転送量・帯域制限ポリシーを比較する。出典はすべて各ベンダーの公式ページ(公式サイト・公式ドキュメント・公式サポート FAQ・公式料金表)で、記載内容は調査日(2026-07-03)時点で WebFetch により再確認したもの。数値の創作・補完は行わず、公式に明記がない項目は「公式明記なし」「要再確認」とそのまま記載する。

## 国内 VPS

### さくらのVPS

| 項目 | 内容 |
| --- | --- |
| 回線/NIC 帯域 | インターネット(外部通信): 100Mbps 共有回線。ローカルネットワーク: 1Gbps 共有回線。いずれも帯域保証の記載なし。IPv4×1個・IPv6×1個のグローバル IP 付与 |
| 転送量制限 | 「無制限」と明記。従量課金の記載なし |
| 帯域制限ポリシー | (さくらのクラウド向けマニュアルの記載からの類推)共有セグメントは送信(Outbound)100Mbps に制限、受信(Inbound)は制限なし。月間転送量の目安を大幅に超過した場合、バックボーン帯域の状況により個別サーバーの帯域制限を行う場合がある(月初0時より順次解除)。この詳細挙動は VPS 公式ページ上での直接の明記ではなく、クラウド向け技術資料からの類推である点に注意 |
| 増強オプション | 公式サイト上に「回線帯域を増強する有償オプション」は見当たらず。ローカルネットワーク用のスイッチ追加機能(1会員IDにつき各リージョン最大20個、1Gbps ベストエフォート)はあるが、VPS 間接続用であり外部インターネット回線(100Mbps 共有)の増強策ではない |
| 料金メモ | 年額契約時の月額換算(税込、要件3のリージョン別データより): 512MB プラン 石狩643円/大阪671円/東京698円。1Gプラン 石狩880円/大阪935円/東京990円。2Gプラン 石狩1,738円/大阪1,848円/東京1,958円。4Gプラン 石狩3,520円/大阪3,740円/東京3,960円。8Gプラン 石狩7,040円/大阪7,480円/東京7,920円。16Gプラン 石狩13,200円/大阪14,300円/東京15,400円。32Gプラン 石狩26,400円/大阪28,600円/東京30,800円。3リージョンとも回線速度自体は同一(100Mbps共有)で差はない |
| 出典 | [vps.sakura.ad.jp/specification/](https://vps.sakura.ad.jp/specification/) / [manual.sakura.ad.jp/cloud/support/technical/network.html](https://manual.sakura.ad.jp/cloud/support/technical/network.html) |

### ConoHa VPS

| 項目 | 内容 |
| --- | --- |
| 回線/NIC 帯域 | 「インターネット: 100Mbps共有」「プライベートネットワーク: 1Gbps共有」と公式サポート FAQ に明記。物理ネットワークは10Gbps環境である旨の記載あり |
| 転送量制限 | 「データ転送量による従量課金なし」と明記。ただし具体的な上限 GB 数値の記載なし |
| 帯域制限ポリシー | 「共有回線のため他のVPS環境に影響が発生するようなトラフィックの場合には、制限をさせていただく場合がございます」と明記。具体的しきい値(Mbps/GB)は非公開。25番ポートは大量通信検知時に制限の可能性がある旨を確認(22/80/1900番ポートの個別記載は要再確認) |
| 増強オプション | 「ネットワーク帯域拡張」ページに「グローバルネットワークの帯域幅を100Mbpsから300Mbpsへ拡張することが可能」「時間課金制+月額上限額あり」と明記。ただし具体的な時間単価・月額上限額の数値は要再確認 |
| 料金メモ | まとめトク(1ヶ月契約)月額: 512MB=460円、1GB=763円、2GB=1,259円、4GB=2,189円、12GB=4,389円、24GB=9,746円、48GB=22,099円、96GB=44,198円、128GB=58,927円 |
| 出典 | [support.conoha.jp/vps/faq/vps-q/overview-q/](https://support.conoha.jp/vps/faq/vps-q/overview-q/) / [vps.conoha.jp/function/bandwidth_upgrade/](https://vps.conoha.jp/function/bandwidth_upgrade/) / [vps.conoha.jp/function/traffic/](https://vps.conoha.jp/function/traffic/) / [vps.conoha.jp/pricing/](https://vps.conoha.jp/pricing/) |

### Xserver VPS

| 項目 | 内容 |
| --- | --- |
| 回線/NIC 帯域 | 公式訂正記事(2022年9月30日付)に「物理ネットワークは10Gbps環境に直結していますが、サーバーが安定して稼働するために100Mbpsの制限がございます」と明記(2GB/4GB/8GBプラン) |
| 転送量制限 | 料金ページに「データ転送量は無制限」と明記 |
| 帯域制限ポリシー | 公式明記なし(100Mbps制限が事実上の帯域上限。具体的な公平利用条件の記載は確認できず) |
| 増強オプション | 2GB/4GB/8GBプランには増強の公式発表なし。**別ブランド「Xserver VPS for Game」の16GB以上プランでは帯域強化あり**(後述)。通常版本体サイトでの同等発表は今回の調査では見つからなかった |
| 料金メモ | 12ヶ月契約の月額: 2GB=1,170円、6GB=1,800円、12GB=3,600円、24GB=7,800円、48GB=19,500円、96GB=39,000円(初期費用0円)。2GBプランは2025年12月1日実施で900円→1,170円に改定予定 |
| 出典 | [vps.xserver.ne.jp/support/news_detail.php?view_id=9764](https://vps.xserver.ne.jp/support/news_detail.php?view_id=9764) / [vps.xserver.ne.jp/price.php](https://vps.xserver.ne.jp/price.php) / [vps.xserver.ne.jp/support/news_detail.php?view_id=16856](https://vps.xserver.ne.jp/support/news_detail.php?view_id=16856) |

参考: Xserver VPS for Game(ゲーム専用ブランド、16GB/32GB/64GBプラン)は 2025/01/31 付お知らせで「16GBプラン: 300Mbps(従来100Mbps)」「32GBプラン: 500Mbps(従来100Mbps)」「64GBプラン: 1Gbps(従来100Mbps)」への帯域強化を追加料金なしで実施(出典: [vps.xserver.ne.jp/game-server/news/detail.php?view_id=14615](https://vps.xserver.ne.jp/game-server/news/detail.php?view_id=14615))。ただし通常版 Xserver VPS 本体と同一インフラかは公式に明記なし(要再確認)。

### KAGOYA CLOUD VPS

| 項目 | 内容 |
| --- | --- |
| 回線/NIC 帯域 | 「最大1Gbps共有回線」(インターネット回線・ローカルネットワークとも)。「ネットワーク回線の帯域はベストエフォート方式となります」と公式注記。全プラン(1GB〜32GB)共通 |
| 転送量制限 | 「転送量に制限はありません」と公式 FAQ に明記 |
| 帯域制限ポリシー | 「特定のお客様の転送量が極端に多い場合は、他のお客様が利用可能な回線帯域が細くなるため、特定のお客様が同時に占有できる帯域を調整する場合があります」と条件付きで明記 |
| 増強オプション | 「回線アップグレード」オプション(専有回線 100M/300M/500M/1G占有、帯域保証あり)は公式ページ上で **CLOUD VPS 向けではなく FLEX クラウドサーバー/FLEX ベアメタルサーバー/FLEX プライベートクラウド Suite 向け** と明記されている。CLOUD VPS には適用不可(料金は問い合わせ制) |
| 料金メモ | 月額(税込目安): 1GB=550円、2GB=770円、3GB=1,430円、4GB=1,760円、8GB=3,410円、16GB=7,810円、32GB=20,130円。年間契約はさらに割引 |
| 出典 | [www.kagoya.jp/vps/feature/network/](https://www.kagoya.jp/vps/feature/network/) / [support.kagoya.jp FAQ](https://support.kagoya.jp/vps/faq/index.php?action=artikel&cat=1&id=24&artlang=ja) / [www.kagoya.jp/vps/function-plan/](https://www.kagoya.jp/vps/function-plan/) / [www.kagoya.jp/option/network-bandwidth_upgrade/](https://www.kagoya.jp/option/network-bandwidth_upgrade/) |

### WebARENA Indigo (NTTPC)

上り/下りそれぞれの上限で、合計値ではない旨が公式に注記されている。1日あたり転送量の「目安」(制限値ではない)が公式ガイドに一部プランのみ記載。

| プラン | 回線帯域 | 転送量の目安(1日) | 料金(税込、時間単価/月額上限) |
| --- | --- | --- | --- |
| 768MB | 100Mbps上限 | 要再確認(公式ガイドに記載なし) | 0.52円/319円 |
| 1GB | 100Mbps上限 | 20GB以下 | 0.70円/449円 |
| 2GB | 100Mbps上限 | 40GB以下 | 1.27円/814円 |
| 4GB | 500Mbps上限 | 80GB以下 | 2.55円/1,630円 |
| 8GB | 1Gbps上限 | 160GB以下 | 5.35円/3,410円 |
| 16GB | 1Gbps上限 | 要再確認(記載なし) | 11.24円/7,150円 |
| 32GB | 1Gbps上限 | 要再確認(記載なし) | 24.21円/15,400円 |

転送量そのものへの従量課金はなし(ベストエフォート提供)。超過時は「システム保全のためサービスのご利用を制限することがあります」と明記。専用の帯域増強オプションの記載はなし。セルフホスト SFU 用途では 4GB プラン(500Mbps上限)以上が候補になりうる。

出典: [web.arena.ne.jp/indigo/spec/](https://web.arena.ne.jp/indigo/spec/) / [web.arena.ne.jp/indigo/price/](https://web.arena.ne.jp/indigo/price/) / [web.arena.ne.jp/indigo/spec/guide.html](https://web.arena.ne.jp/indigo/spec/guide.html)

## 国内クラウド(帯域増強オプションあり)

### さくらのクラウド サーバー

| 項目 | 内容 |
| --- | --- |
| 回線/NIC 帯域 | 共有セグメント: 100Mbps共有回線(帯域保証なし)。送信(Outbound)は100Mbpsに制限、受信(Inbound)は制限なしと公式マニュアルに明記。ルータ+スイッチ経由接続時のサーバー⇔スイッチ間 Outbound 帯域はメモリ量に応じ変動: 32GB未満=1.0Gbps、32GB以上128GB未満=2.0Gbps、128GB以上224GB未満=5.0Gbps、224GB以上=10.0Gbps(受信方向は無制限) |
| 転送量制限 | 従量課金なし。「データ転移量による従量課金一切なし」と明記 |
| 帯域制限ポリシー | 帯域保証プランはなし。「いずれのプランも複数のお客様で帯域を共有する回線のため、帯域保証はありません」と公式マニュアルに明記。月間転送量が目安を大幅に超過した場合、上限が設定される場合がある(月初日0時より順次解除) |
| 増強オプション | 単体サーバーの共有セグメント帯域(100Mbps)自体の増強オプションは見当たらない。「ルータ+スイッチ」製品(下記)により帯域増強が可能 |
| 料金メモ | サーバー/ディスク利用料は時間・日割・月額課金のうち最安が自動適用。ネットワークトラフィックへの課金なし |
| 出典 | [manual.sakura.ad.jp/cloud/support/technical/network.html](https://manual.sakura.ad.jp/cloud/support/technical/network.html) / [cloud.sakura.ad.jp/payment/](https://cloud.sakura.ad.jp/payment/) |

### さくらのクラウド ルータ+スイッチ(帯域増強オプション製品)

| 項目 | 内容 |
| --- | --- |
| 回線/NIC 帯域 | 選択可能帯域: 石狩第1・東京第1ゾーン(石狩第2・第3含む)は100Mbps〜5,000Mbps(最大5Gbps)。東京第2ゾーンは100Mbps〜10,000Mbps(最大10Gbps)。ルータ+スイッチに接続可能なサーバー側 NIC 数の制限については要再確認 |
| 転送量制限 | 従量課金なし(月額/時間額の帯域プラン課金のみ) |
| 帯域制限ポリシー | 帯域保証プランはない(「いずれのプランも複数のお客様で帯域を共有する回線のため、帯域保証はありません」)。回線負荷などの状況に応じて外部接続回線の帯域幅を無停止でいつでも変更可能な「帯域変更機能」あり |
| 増強オプション | 帯域プランの変更(アップグレード/ダウングレード)がコントロールパネルから無停止で可能。ただし内部的にルータアプライアンスが再作成され新規課金が発生する点に注意 |
| 料金メモ | ルータ: 月額制または時間額制。例: 100Mbps=月額2,200円(時間額4円)、5,000Mbps=月額547,800円(時間額1,140円)。スイッチ: 月額2,200円(全ゾーン共通)。追加IPアドレス: /28(16個)=3,520円〜/24(256個)=56,320円 |
| 出典 | [cloud.sakura.ad.jp/products/router-switch/](https://cloud.sakura.ad.jp/products/router-switch/) / [manual.sakura.ad.jp/cloud/network/switch/bandwidth-change.html](https://manual.sakura.ad.jp/cloud/network/switch/bandwidth-change.html) |

## 海外系(東京リージョン)

### Vultr — Cloud Compute

| 項目 | 内容 |
| --- | --- |
| 回線/NIC 帯域 | 公式明記なし(pricing/products ページ本文に Gbps 単位の NIC 速度表記なし) |
| 転送量制限 | プラン(Regular Performance)ごとに 0.5TB〜4.0TB/月。上位ライン(High Performance/High Frequency/VX1)は 1.0TB〜7.0TB/月程度。全世界共通で無料 inbound、月2TBの無料 outbound 枠あり(繰り越し不可) |
| 帯域制限ポリシー | 記載なし(公表されている公平利用ポリシー等の記載は確認できず) |
| 増強オプション | 追加帯域の個別購入オプションは公式ドキュメントに明記された仕組みが確認できず |
| 料金メモ | Regular Performance 月額 $3.50前後〜$40。無料枠超過は全世界統一 $0.01/GB(2023年1月1日施行、旧「東京は$0.025/GB」情報は非公式ソースのみで公式では確認できず)。東京リージョンの提供状況自体は要個別確認(pricing ページ本文に名指し記載なし) |
| 出典 | [www.vultr.com/pricing/](https://www.vultr.com/pricing/) / [www.vultr.com/products/cloud-compute/](https://www.vultr.com/products/cloud-compute/) / [docs.vultr.com 帯域超過料金ページ](https://docs.vultr.com/support/platform/billing/what-is-the-bandwidth-overage-rate) / [Vultr公式ブログ](https://blogs.vultr.com/Vultr-Announces-Reduced-Bandwidth-Pricing-2-Tb-Of-Free-Monthly-Egress-Free-Ingress-And-Global-Pooling) |

### Akamai Connected Cloud (Linode)

| プラン系統 | 回線/NIC 帯域 | 転送量 | 料金メモ |
| --- | --- | --- | --- |
| Shared CPU (Nanode/Standard) | 公式明記なし | 1TB〜20TB/月(プランサイズに応じてバンドル、アカウント内全インスタンスでプール) | 最安$5/moから。プラン別詳細表は pricing ページが動的レンダリングのため今回未取得(要ブラウザ確認) |
| Dedicated CPU G6/G7(旧世代) | Outbound 4Gbps〜12Gbps | Outbound 4TB〜12TB/月 | 具体的月額は要再確認。超過単価はコアデータセンター(東京含むと推定)$0.005/GB |
| Dedicated CPU G8(最新世代) | Outbound 4-12Gbps(in/out区別・個別値は要再確認) | バンドル転送量なし、使用量ベース従量課金 | 従量単価: コアデータセンター$0.005/GB、ジャカルタ$0.015/GB、サンパウロ$0.007/GB、分散リージョン$0.01/GB |

リージョンは Tokyo, JP (ap-northeast) および Tokyo Expansion, JP (jp-tyo-3) がいずれも Full availability。東京固有の転送単価の名指し記載はなく「コアデータセンター」区分に含まれると推定されるのみ(公式に地域名での明記なし)。

出典: [www.akamai.com/cloud/pricing](https://www.akamai.com/cloud/pricing) / [techdocs.akamai.com shared-cpu](https://techdocs.akamai.com/cloud-computing/docs/shared-cpu-compute-instances) / [techdocs.akamai.com dedicated-cpu](https://techdocs.akamai.com/cloud-computing/docs/dedicated-cpu-compute-instances) / [techdocs.akamai.com network-transfer-usage-and-costs](https://techdocs.akamai.com/cloud-computing/docs/network-transfer-usage-and-costs) / [availability](https://www.akamai.com/why-akamai/global-infrastructure/availability)

## ハイパースケーラー(egress 従量課金型)

### AWS EC2 (Data Transfer OUT to internet, ap-northeast-1 東京)

- 回線/NIC 帯域: 公式明記なし(EC2ネットワーク帯域はインスタンスタイプ依存。転送料金ページには非記載)
- 転送量制限: 無制限(従量課金)。グローバル集計で毎月最初の100GBは無料
- 東京リージョンからインターネットへの送信料金(階層制、2026-06-01時点): 最初の10TB/月 $0.114/GB、次の40TB/月 $0.089/GB、次の100TB/月 $0.086/GB、150TB超 $0.084/GB。500TB/月超は個別見積り
- 帯域制限ポリシー: 記載なし
- 増強オプション: 該当なし(従量課金のため。インスタンスタイプ変更で NIC 上限は変わる)
- 出典: [AWS Price List API (ap-northeast-1)](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/current/ap-northeast-1/index.json) / [aws.amazon.com/ec2/pricing/on-demand/](https://aws.amazon.com/ec2/pricing/on-demand/)

### Amazon Lightsail

- 回線/NIC 帯域: 公式明記なし
- 転送量制限: プラン別に月間転送量込み。$5プラン=1TB 〜 $1,764プラン=10TB(11段階)。IN/OUT合算で枠を消費(超過課金対象はOUTのみ)
- 超過料金: 東京リージョンで $0.14/GB(地域により異なる。US/EU等 $0.09、シンガポール $0.12 等)。ムンバイ・シドニー・ジャカルタ・マレーシア・香港・サンパウロは転送量枠が他リージョンの半分
- 帯域制限ポリシー: 記載なし(枠超過は帯域制限ではなく従量課金)
- 増強オプション: 上位プランへの変更で転送量枠を増やせる。ロードバランサー経由トラフィックは枠を消費しない
- 出典: [aws.amazon.com/lightsail/pricing/](https://aws.amazon.com/lightsail/pricing/) / [docs.aws.amazon.com Lightsail FAQ](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-data-transfer-allowance.html)

### Google Cloud Compute Engine (インターネットEgress, asia-northeast1 Tokyo)

- 回線/NIC 帯域: 料金ページ自体には明記なし(別ドキュメントに vCPUあたり最大2Gbps、Tier_1ネットワーキング有効時は最大50〜200Gbpsとの記載あり)
- 転送量制限: 無制限(従量課金)。Standard Tier は全リージョンで毎月200GiBまで無料(リージョンごとに独立集計)
- Premium Tier(Tokyo発): 北米/欧州向け 0〜10,240GiB $0.12/GiB、10,240GiB以上 $0.085/GiB。アジア向け 0〜1,024GiB $0.12/GiB、1,024〜10,240GiB $0.11/GiB、10,240GiB以上 $0.085/GiB
- Standard Tier(Tokyo発): 200〜10,240GiB $0.11/GiB、10,240〜153,600GiB $0.075/GiB、153,600GiB以上 $0.07/GiB
- 帯域制限ポリシー: 記載なし
- 増強オプション: 該当なし(従量課金)。Tier 1ネットワーキング設定でVMごとの帯域上限を引き上げ可能
- 出典: [cloud.google.com/vpc/network-pricing](https://cloud.google.com/vpc/network-pricing) / [GCP公式ブログ(Standard Tier無料枠)](https://cloud.google.com/blog/products/networking/standard-tier-network-now-includes-200-gb-data-transfer-per-month)

### Oracle Cloud Infrastructure

- 回線/NIC 帯域: 公式明記なし
- 転送量制限: テナンシごと毎月10TBまで無料(Outbound Data Transfer、APAC・日本・南米発を含む)。Always Free 枠でも同じく月10TB outbound が無料
- 超過料金: 10TB超過分の具体的な $/GB 単価は、料金ページの該当表示欄が空欄になっており公式ページ本文からは確認できず(非公式情報の$0.0085/GBは公式裏付けなし)
- FastConnect(専用線接続)は 1/10/100/400 Gb/sec の4段階。プライベート仮想回線では inbound/outbound データ転送は別課金なし
- 帯域制限ポリシー: 記載なし
- 「全リージョンでegress課金を完全撤廃した」という情報は非公式ニュースサイト経由のみで、Oracle公式ページ本文では確認できず(未確定情報)
- 出典: [oracle.com/cloud/networking/pricing/](https://www.oracle.com/cloud/networking/pricing/) / [oracle.com/cloud/data-egress-costs/](https://www.oracle.com/cloud/data-egress-costs/) / [docs.oracle.com Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

補足: Oracle Cloud Always Free (Arm Ampere A1 Compute) も月10TB outbound は同一。ただし直近7日間のCPU/ネットワーク/メモリ使用率(95パーセンタイル)がいずれも20%を下回るとアイドルインスタンスとして回収(reclaim)される場合がある(帯域制限ではなくリソース回収の話)。ホームリージョンはグローバルだが韓国北(Chuncheon)は対象外。

## 参考: レンタルサーバー

**レンタルサーバーは共有ホスティングであり、常駐プロセスの実行が規約上想定されていないため、SFU(LiveKit 等の常駐 UDP メディアサーバー)は動かせない。** 以下は参考情報として掲載する。

### さくらのレンタルサーバ

- 回線/NIC帯域: 基本仕様表に「回線速度: 1000Mbps」と明記(サービスとして提供される回線速度であり、NIC自体の物理速度の明示ではない)
- 転送量制限: 2022年3月2日付で全プラン「転送量の無制限化」を実施済み。ただし「サーバーの負荷によってプログラム実行制限や個別の転送量制限がかかる場合があります」と明記
- 帯域制限ポリシー: 「一律での転送容量制限は撤廃いたしますが…個別の転送量制限がかかる場合があります」。CGI高負荷時に制限を設けることがある旨も確認
- 規約上の制約: 利用規約(ご利用上の注意)に「daemonとしてサーバーに常駐するプログラムの実行」の禁止が明記されている。これによりSFU等の常駐プロセスは規約上運用不可と読める。UDP待受可否そのものの明示記載はなし
- 増強オプション: コンテンツブースト(CDN、無料枠あり)の案内はあるが帯域増強オプションではない
- プラン: ライト/スタンダード/プレミアム(2024年4月1日新規申込受付終了、既存利用者のみ継続可)/ビジネス/ビジネスプロ
- 出典: [help.sakura.ad.jp/rs/2251/](https://help.sakura.ad.jp/rs/2251/) / [転送量無制限化announcement](https://www.sakura.ad.jp/corporate/information/announcements/2022/03/02/1968209100/) / [rs.sakura.ad.jp/terms/](https://rs.sakura.ad.jp/terms/) / [プレミアム新規受付終了announcement](https://www.sakura.ad.jp/corporate/information/announcements/2024/02/19/1968215093/)

### エックスサーバー

- 回線/NIC帯域: 公式明記なし(サーバー仕様一覧ページに Mbps/Gbps の具体的数値の記載は確認できず)
- 転送量制限: サーバー仕様一覧ページに「転送量: 無制限」と明記。2022年3月1日付お知らせで、従来のスタンダード900GB/日・プレミアム1,200GB/日・ビジネス1,500GB/日という目安値から無制限化されたことを確認
- 帯域制限ポリシー: 「ネットワークやサーバーに対して過大な負荷が掛かる場合には、制限を行う場合があります」という趣旨の注記あり
- 規約上の制約: **要再確認・重要** — 利用規約第22条やFAQ(常駐プロセス/デーモン/ポート待受の可否に関する記述)について、複数回の WebFetch 再取得で毎回異なる(相互に矛盾する)内容が返され、ページ本文を安定して確認できなかった。「daemon常駐禁止条項の明示なし」「CGI常駐/ポート待受の可否」は今回の調査では公式一次情報として確定できず、ブラウザでの直接目視確認が必要
- プラン: スタンダード/プレミアム/ビジネス(旧X10/X20/X30の後継)。CPU/メモリ: スタンダード6コア/8GB、プレミアム8コア/12GB、ビジネス10コア/16GB
- 出典: [www.xserver.ne.jp/manual/man_server_spec.php](https://www.xserver.ne.jp/manual/man_server_spec.php) / [転送量無制限化news](https://www.xserver.ne.jp/news_detail.php?view_id=8793) / [rule.php](https://www.xserver.ne.jp/rule/rule.php)

## さくらのVPS 適合確認(経路 A 要件)

SelfMatrix の経路A(Cloudflare → VPS → Tailscale → 自宅)構成を前提に、さくらのVPSが要件を満たすかを確認した結果。

- **要件1: グローバルIPv4アドレスの割り当て(固定か)**
  IPアドレスの追加・変更は不可(公式サポートFAQで明記、「いいえ、IPアドレスを追加することはできません」「いいえ、IPアドレスを変更することはできません」)。仕様一覧に「グローバルIPアドレス IPv4アドレス×1個、IPv6アドレス×1個」と明記。契約中は同一IPが割り当てられ続けると推測されるが、「固定IPアドレス」という用語自体の明記はなし。解約・再構築時の扱いも公式記載なし(要再確認)

- **要件2: パケットフィルターでのTCP/UDPポート範囲指定・ルール数上限・無効化可否**
  TCP/UDPとも個別ポート指定は「1から32767」の範囲の数値で設定可能(レンジ指定構文ではなく、単一ポート番号を1ルールずつ登録する運用と解釈される。UI実機確認を推奨)。ルール数上限は合計40ルール。常時自動許可(ICMP全ポート、UDP123/NTP、TCP・UDP 32768-65535の戻りパケット等)は変更不可。「パケットフィルターを利用しない」選択で無効化しOS側FWに完全委任することが可能。**LiveKitのUDPメディアポートが32768番以降であれば、そもそもパケットフィルターの制約を受けずに開いている可能性がある**

- **要件3: リージョンと料金差**
  石狩・大阪・東京の3リージョンで提供。回線速度・スペック自体のリージョン差の明記はなく、いずれも「インターネット100Mbps共有回線、ローカルネットワーク1Gbps共有回線」で統一。料金は石狩が最安、東京が最高(例: 1Gプラン 石狩880円/大阪935円/東京990円)。データ転送量は全リージョン共通で無制限。専用回線化・帯域増強オプションはVPSページ内では見当たらない(専用サーバPHYには別サービスとして「専用グローバルネットワーク」オプションがあるが、VPSには適用されない)

- **要件4: IPv6対応**
  IPv6アドレスは標準で1個付与(仕様一覧に明記)。ただし2017年4月5日よりIPv6はデフォルトで無効化されており、有効化にはユーザー自身の作業が必要(OSごとの有効化手順ページあり)

- 要件5(おまけ): 逆引きDNS設定可否 — コントロールパネルからIPv4・IPv6双方の逆引き(PTRレコード)をホスト単位で設定可能。正引き(Aレコード)が同一ホスト名で対象IPに設定されている必要があり、正引きがCNAMEの場合は設定不可。IPv6逆引きは「V3以降のバージョン」で利用可能(「V3」の定義は明記なし、要再確認)。IPv6逆引きホスト名設定機能の提供開始日は2018年8月21日

- 出典: [manual.sakura.ad.jp/vps/support/technical/ip-address.html](https://manual.sakura.ad.jp/vps/support/technical/ip-address.html) / [vps.sakura.ad.jp/specification/](https://vps.sakura.ad.jp/specification/) / [manual.sakura.ad.jp/vps/network/packetfilter.html](https://manual.sakura.ad.jp/vps/network/packetfilter.html) / [vps.sakura.ad.jp/feature/packetfilter.html](https://vps.sakura.ad.jp/feature/packetfilter.html) / [vps.sakura.ad.jp/news/ipv6-reverse-hostname/](https://vps.sakura.ad.jp/news/ipv6-reverse-hostname/) / [manual.sakura.ad.jp/vps/controlpanel/reverse-hostname.html](https://manual.sakura.ad.jp/vps/controlpanel/reverse-hostname.html)

## 要再確認事項

- さくらのVPS: 月額料金表(512MB ¥641/月等、旧spec.pdf由来の初出値)はバイナリPDF由来で本文からの直接確認ができなかった箇所がある(要件3の再取得値は本文確認済み)
- さくらのVPS: 「回線帯域を増強する有償オプション」が本当に存在しないかの悉皆確認はできていない
- さくらのVPS: IPアドレスの「固定」という用語の明記、解約・再構築時のIP扱い
- さくらのVPS: 逆引きDNS「V3以降のバージョン」の定義
- さくらのクラウド: 「オブジェクトストレージのみ転送量課金の例外あり」という主張の直接裏付けが取れず
- さくらのクラウド ルータ+スイッチ: 「サーバー側NICはサーバーあたり1個に制限」という記載が今回のWebFetchでは見当たらず
- ConoHa VPS: 帯域拡張オプション(100Mbps→300Mbps)の具体的な時間単価・月額上限額の数値
- ConoHa VPS: 「長期契約で最大72%引き」という記載が今回のFetch結果には現れず
- ConoHa VPS: 22/80/1900番ポートの個別通信制御に関する記載
- Xserver VPS: 「通信速度に関する記載の訂正」ページの訂正前の具体的文言、100Mbps制限の適用プラン範囲の明記
- Xserver VPS: Xserver VPS for Gameの帯域強化(16GB以上)が通常版本体にも適用されるか
- WebARENA Indigo: 768MBプラン、16GB/32GBプランの1日あたり転送量目安の具体的数値
- WebARENA Indigo: 4GBプランのSSD容量表記(80GB)
- Vultr: プラン価格の正確な現在の一覧(取得のたびに表示が変動する可能性)、Tokyoリージョンが33データセンターに含まれる旨の名指し記載
- Akamai Connected Cloud (Linode): Shared CPU/Dedicated CPU(G6/G7/G8)のプランサイズ別の具体的な月額・時間額一覧(pricing ページが動的レンダリングのため未取得)
- Akamai Connected Cloud: G7/G8の「40/12 Gbps」等in/out区別を含む具体的帯域値のpricingページ本文からの直接確認
- Oracle Cloud: Outbound Data Transfer 10TB超過分の具体的な$/GB単価(ページ表示が空欄)
- Oracle Cloud: 「全リージョンでegress課金を完全撤廃した」という情報の真偽(公式ページでは確認できず、未確定情報として扱う)
- さくらのレンタルサーバ: お試し期間中の転送量制限、「503 Service Temporarily Unavailable」の具体的文言、コンテンツブーストの無料枠数値、プラン別月額料金(動的レンダリングのため未取得)
- エックスサーバー: 利用規約第22条・FAQ(常駐プロセス/デーモン/ポート待受の可否)の内容 — 複数回の取得で矛盾する結果が返り、公式一次情報として確定できなかった。ブラウザでの直接目視確認が必要

---

料金・仕様は各社の改定やキャンペーンにより変動するため、実際の利用時には必ず公式ページで最新情報を再確認すること。
