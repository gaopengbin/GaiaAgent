# GaiaAgent 涓氬姟鑳藉姏璺嚎鍥?
> 鐘舵€侊細Draft
> 鍒跺畾鏃ユ湡锛?026-07-02
> 鐩爣鐗堟湰锛歚0.5.x`锛堜笟鍔″簳搴э級鈫?`0.6.x`锛堢┖闂村垎鏋愶級鈫?`0.7.x`锛堜笓棰樺伐浣滄祦锛夆啋 `1.0.0`锛堝彲浜や粯涓氬姟浜у搧锛?
## 1. 鑳屾櫙

GaiaAgent 褰撳墠宸茬粡瀹屾垚浜嗚緝閲嶈鐨勬妧鏈簳搴у崌绾э細Rust Native Runtime銆丳rovider Adapter銆丮CP Host銆丄I Elements 瀵硅瘽鐣岄潰銆佷細璇濆巻鍙层€佷笂涓嬫枃鍘嬬缉銆乀race Store銆丆C Switch 鎺ュ叆绛夎兘鍔涘凡缁忚瀹冧粠鈥滃墠绔師鍨嬧€濊繘鍏ヤ簡鈥滃彲鎸佺画鎵╁睍鐨?Agent 宸ヤ綔鍙扳€濋樁娈点€?
浣嗕粠涓氬姟浜у搧瑙掑害鐪嬶紝鐜伴樁娈佃兘鍔涗粛鍋忓簳灞傚拰婕旂ず鍨嬶細鐢ㄦ埛鍙互閫氳繃鑷劧璇█鎺у埗涓夌淮鍦扮悆銆佸姞杞藉浘灞傘€佹坊鍔犳爣娉ㄣ€佽皟鐢ㄥ熀纭€ GIS 宸ュ叿锛屼絾杩樻病鏈夊舰鎴愨€滃鍏ョ湡瀹炰笟鍔℃暟鎹?鈫?鍒嗘瀽 鈫?瑙ｉ噴 鈫?鐢熸垚鎴愭灉 鈫?淇濆瓨澶嶇敤鈥濈殑瀹屾暣闂幆銆?
杩欎唤鏂囨。鐨勭洰鏍囷紝鏄妸 GaiaAgent 浠庘€淎I 鎺у埗 3D 鍦扮悆鈥濇帹杩涗负鈥滈潰鍚戠湡瀹炵┖闂翠笟鍔＄殑 GIS Agent 宸ヤ綔鍙扳€濄€?
## 2. 浜у搧瀹氫綅

GaiaAgent 鐨勪骇鍝佸畾浣嶅簲浠庯細

> Talk to 3D Globe in natural language

鍗囩骇涓猴細

> 鐢ㄨ嚜鐒惰瑷€瀹屾垚绌洪棿鏁版嵁鎺ュ叆銆佷笁缁村彲瑙嗗寲銆佺┖闂村垎鏋愩€佷笟鍔＄爺鍒や笌鎴愭灉浜や粯鐨?AI GIS 宸ヤ綔鍙般€?
涔熷氨鏄锛屽畠涓嶆槸鏅€氳亰澶╄蒋浠讹紝涔熶笉鏄紶缁?GIS 宸ュ叿鑿滃崟鐨勫鍒讹紝鑰屾槸鎶婂ぇ妯″瀷銆丮CP銆佷笁缁村満鏅€佺┖闂存暟鎹祫浜у拰涓氬姟娴佺▼缁勭粐鍦ㄤ竴璧枫€?
## 3. 涓氬姟鐩爣

### 3.1 鐢ㄦ埛鐩爣

- 涓嶅啓浠ｇ爜涔熻兘瀵煎叆銆佺悊瑙ｃ€佸垎鏋愮┖闂存暟鎹€?- 涓嶈宸ュ叿鑿滃崟涔熻兘鐢ㄨ嚜鐒惰瑷€瀹屾垚甯歌 GIS 鎿嶄綔銆?- 涓嶅彧鐪嬪湴鍥撅紝杩樿兘寰楀埌缁熻銆佽В閲娿€佺粨璁哄拰鍙氦浠樻垚鏋溿€?- 涓嶅彧鍋氫竴娆℃紨绀猴紝鑰屾槸鑳戒繚瀛橀」鐩€佸鐢ㄦ暟鎹€佸鐜板垎鏋愯繃绋嬨€?- 涓嶅彧渚濊禆鍐呯疆宸ュ叿锛岃€屾槸鑳芥帴鍏ュ閮?MCP銆佷紒涓氭湇鍔″拰琛屼笟鏁版嵁婧愩€?
### 3.2 浜у搧鐩爣

- 寤虹珛绌洪棿鏁版嵁璧勪骇灞傦紝璁╂墍鏈変笟鍔¤兘鍔涘洿缁曗€滄暟鎹祫浜р€濊€屼笉鏄复鏃跺浘灞傚睍寮€銆?- 寤虹珛鍩虹绌洪棿鍒嗘瀽鑳藉姏锛岃鐩栫偣銆佺嚎銆侀潰銆佹爡鏍笺€佷笁缁村満鏅殑楂橀鎿嶄綔銆?- 寤虹珛 Agent 浠诲姟缂栨帓鑳藉姏锛屼娇妯″瀷鑳藉畨鍏ㄣ€佸彲杩借釜鍦扮粍鍚堝涓伐鍏峰畬鎴愬鏉備换鍔°€?- 寤虹珛涓撻妯℃澘锛屼娇浜у搧鑳介潰鍚戝簲鎬ャ€佸煄甯傜鐞嗐€佽嚜鐒惰祫婧愩€佸洯鍖哄拰鏂囨梾绛夊満鏅€?- 寤虹珛鎴愭灉杈撳嚭鑳藉姏锛屼娇鍒嗘瀽缁撴灉鍙繚瀛樸€佸鍑恒€佸垎浜拰澶嶇幇銆?
## 4. 鑳藉姏鎬昏

```mermaid
flowchart TB
    User["鐢ㄦ埛鑷劧璇█浠诲姟"]
    Agent["GIS Agent Runtime"]
    Assets["绌洪棿鏁版嵁璧勪骇灞?]
    Scene["涓夌淮鍦烘櫙涓庡浘灞?]
    Analysis["绌洪棿鍒嗘瀽寮曟搸"]
    Workflows["涓氬姟涓撻宸ヤ綔娴?]
    Outputs["鎴愭灉杈撳嚭"]
    MCP["澶栭儴 MCP / 浼佷笟鏈嶅姟"]

    User --> Agent
    Agent <--> Assets
    Agent <--> Scene
    Agent <--> Analysis
    Agent <--> Workflows
    Agent <--> MCP
    Analysis --> Assets
    Analysis --> Scene
    Workflows --> Analysis
    Workflows --> Outputs
    Scene --> Outputs
```

| 鑳藉姏灞?    | 瑙ｅ喅鐨勯棶棰?                  | 鍏稿瀷鍔熻兘                                     |
| ---------- | ---------------------------- | -------------------------------------------- |
| 鏁版嵁鎺ュ叆   | 鐢ㄦ埛鐪熷疄涓氬姟鏁版嵁濡備綍杩涘叆绯荤粺 | 鏂囦欢瀵煎叆銆佹湇鍔¤繛鎺ャ€佸潗鏍囩郴璇嗗埆銆佸瓧娈垫憳瑕?    |
| 绌洪棿璧勪骇   | 鏁版嵁濡備綍琚鐞嗐€佸紩鐢ㄥ拰澶嶇敤   | 璧勪骇娉ㄥ唽銆佸厓鏁版嵁銆佸瓧娈?schema銆佹牱寮忋€佺増鏈?   |
| 鍥惧眰宸ヤ綔鍙?| 鏁版嵁濡備綍鍦ㄤ笁缁村湴鐞冧笂灞曠ず     | 鍥惧眰鍒楄〃銆佹牱寮忋€佽繃婊ゃ€侀€夋嫨銆佸畾浣嶃€佹樉闅?      |
| 绌洪棿鍒嗘瀽   | 绯荤粺濡備綍浜х敓涓氬姟浠峰€?        | 缂撳啿鍖恒€佸彔鍔犮€佺粺璁°€佽仛鍚堛€佽矾寰勩€佸湴褰€佸彲瑙嗗煙 |
| Agent 缂栨帓 | AI 濡備綍瀹屾垚澶氭楠や笟鍔′换鍔?   | 宸ュ叿璁″垝銆佸鎵广€佽繘搴︺€佸け璐ユ仮澶嶃€佺粨鏋滆В閲?    |
| 涓撻妯℃澘   | 濡備綍璐磋繎鍏蜂綋琛屼笟鍦烘櫙         | 搴旀€ャ€佸煄绠°€佽嚜鐒惰祫婧愩€佸洯鍖恒€佹枃鏃?            |
| 鎴愭灉杈撳嚭   | 鐢ㄦ埛濡備綍浜や粯宸ヤ綔缁撴灉         | 鎴浘銆佹姤鍛娿€丟eoJSON銆丆SV銆佸伐绋嬪寘銆佷换鍔″鐜?  |

## 5. Phase A锛氱┖闂存暟鎹帴鍏ヤ笌璧勪骇灞?
鐩爣锛氳鐢ㄦ埛鑳芥妸鐪熷疄鏁版嵁鏀捐繘 GaiaAgent锛屽苟璁?Agent 鐭ラ亾杩欎簺鏁版嵁鏄粈涔堛€?
### 5.1 鏂囦欢瀵煎叆

棣栨壒鏀寔锛?
- GeoJSON / JSON
- KML / KMZ
- CSV / Excel 鐐逛綅鏁版嵁
- Shapefile 鍘嬬缉鍖?- CZML
- 3D Tiles tileset.json

鍚庣画鏀寔锛?
- GeoPackage
- FlatGeobuf
- Parquet / GeoParquet
- LAS / LAZ 鐐逛簯
- 鏍呮牸 GeoTIFF

### 5.2 鏈嶅姟鎺ュ叆

棣栨壒鏀寔锛?
- XYZ / TMS 鐡︾墖
- WMS / WMTS
- ArcGIS REST FeatureServer / MapServer
- 3D Tiles
- Cesium Ion Asset

鍚庣画鏀寔锛?
- OGC API Features
- STAC Catalog
- PostGIS 杩炴帴
- 浼佷笟鍐呴儴鏁版嵁缃戝叧

### 5.3 鏁版嵁璧勪骇妯″瀷

寤鸿鏂板缁熶竴鐨?`SpatialAsset` 鍚庣妯″瀷锛岄伩鍏嶅浘灞傘€佹枃浠躲€佸垎鏋愮粨鏋滃悇鑷暎钀姐€?
```ts
interface SpatialAsset {
  id: string
  name: string
  kind: 'vector' | 'raster' | 'tileset' | 'terrain' | 'tabular' | 'analysis-result'
  source: {
    type: 'file' | 'url' | 'mcp' | 'generated'
    uri?: string
    provider?: string
  }
  geometryType?: 'point' | 'line' | 'polygon' | 'mixed'
  crs?: string
  featureCount?: number
  bbox?: [number, number, number, number]
  schema?: Record<string, FieldSchema>
  styleId?: string
  createdAt: number
  updatedAt: number
}
```

### 5.4 鍚庣鍛戒护寤鸿

| 鍛戒护                | 浣滅敤                                 |
| ------------------- | ------------------------------------ |
| `asset_import_file` | 瀵煎叆鏈湴鏂囦欢骞舵敞鍐屼负绌洪棿璧勪骇         |
| `asset_import_url`  | 浠?URL / 鏈嶅姟娉ㄥ唽绌洪棿璧勪骇            |
| `asset_list`        | 鏌ヨ褰撳墠椤圭洰璧勪骇鍒楄〃                 |
| `asset_describe`    | 鑾峰彇瀛楁銆佽寖鍥淬€佽绱犳暟銆佸潗鏍囩郴绛夋憳瑕?|
| `asset_delete`      | 鍒犻櫎璧勪骇鍙婃淳鐢熷浘灞?                  |
| `asset_export`      | 瀵煎嚭璧勪骇鎴栧垎鏋愮粨鏋?                  |

### 5.5 Agent 宸ュ叿寤鸿

| 宸ュ叿                     | 鑷劧璇█绀轰緥             |
| ------------------------ | ------------------------ |
| `import_spatial_file`    | 鈥滃鍏ヨ繖涓鏍＄偣浣嶈〃鈥?    |
| `describe_spatial_asset` | 鈥滆繖涓浘灞傞噷鏈夊摢浜涘瓧娈碉紵鈥?|
| `add_asset_to_scene`     | 鈥滄妸瀹冩樉绀哄埌鍦板浘涓娾€?      |
| `filter_asset_features`  | 鈥滃彧鐪嬬被鍨嬩负鍖婚櫌鐨勬暟鎹€?  |
| `summarize_asset`        | 鈥滃府鎴戞€荤粨杩欎釜鏁版嵁闆嗏€?    |

### 5.6 UI 寤鸿

- 宸︿晶鎴栧湴鍥炬诞灞傚鍔犫€滄暟鎹祫浜р€濋潰鏉裤€?- 姣忎釜璧勪骇鏄剧ず锛氬悕绉般€佺被鍨嬨€佽绱犳暟銆佽寖鍥淬€佸瓧娈点€佹潵婧愩€佹渶鍚庢洿鏂版椂闂淬€?- 鏀寔鎷栨嫿鏂囦欢瀵煎叆銆?- 瀵煎叆鎴愬姛鍚庤嚜鍔ㄧ敓鎴愭暟鎹憳瑕佸崱鐗囷紝Agent 鍙紩鐢ㄣ€?- 鍥惧眰涓庤祫浜у垎绂伙細涓€涓祫浜у彲浠ョ敓鎴愬涓浘灞傝鍥俱€?
### 5.7 楠屾敹鏍囧噯

- 鐢ㄦ埛鑳芥嫋鎷戒竴涓?GeoJSON 鏂囦欢骞舵樉绀哄湪涓夌淮鍦扮悆涓娿€?- 鐢ㄦ埛鑳藉鍏?CSV 鐐逛綅骞堕€夋嫨缁忕含搴﹀瓧娈点€?- Agent 鑳藉洖绛斺€滃綋鍓嶉」鐩噷鏈夊摢浜涙暟鎹紵鈥濄€?- Agent 鑳藉紩鐢ㄨ祫浜?ID锛岃€屼笉鏄妸澶ф暟鎹洿鎺ュ杩涙ā鍨嬩笂涓嬫枃銆?- 搴旂敤閲嶅惎鍚庤祫浜у厓鏁版嵁浠嶅彲鎭㈠銆?
## 6. Phase B锛氬熀纭€绌洪棿鍒嗘瀽鑳藉姏

鐩爣锛氳 GaiaAgent 鑳界湡姝ｂ€滅畻涓滆タ鈥濓紝鑰屼笉鍙槸鈥滅湅涓滆タ鈥濄€?
### 6.1 鐭㈤噺鍒嗘瀽

浼樺厛绾?P0锛?
- 缂撳啿鍖哄垎鏋?- 璺濈閲忔祴
- 闈㈢Н閲忔祴
- 鐐瑰湪闈㈠唴缁熻
- 鎸夎鏀垮尯 / 缃戞牸鑱氬悎缁熻
- 灞炴€ц繃婊?- 绌洪棿鏌ヨ锛氱浉浜ゃ€佸寘鍚€侀偦杩?
浼樺厛绾?P1锛?
- 瑁佸壀
- 鍚堝苟
- 鎿﹂櫎
- 宸泦
- 鏈€杩戦偦
- Voronoi / Thiessen 澶氳竟褰?- 鑱氱被
- 鐑姏鍥?
### 6.2 璺緞涓庣綉缁滃垎鏋?
浼樺厛绾?P1锛?
- 涓ょ偣璺緞瑙勫垝
- 澶氱偣閫旂粡璺緞
- 鍒拌揪鍦?/ 绛夋椂鍦?- 璧勬簮鏈€杩戣皟搴︾偣

澶栭儴渚濊禆鍙互閫氳繃 MCP 鎺ュ叆楂樺痉銆丱SRM銆丟raphHopper銆佷紒涓氳矾缃戞湇鍔°€?
### 6.3 鍦板舰涓庝笁缁村垎鏋?
浼樺厛绾?P1锛?
- 鍦板舰鍓栭潰
- 鍧″害 / 鍧″悜缁熻
- 楂樼▼閲囨牱
- 鍙鍩熷垎鏋?- 閫氳鍒嗘瀽
- 娣规病妯℃嫙鍩虹鐗?
浼樺厛绾?P2锛?
- 鏃ョ収鍒嗘瀽
- 澶╅檯绾垮垎鏋?- 浣撶Н閲忕畻
- 鎸栧～鏂逛及绠?
### 6.4 鏍呮牸涓庡奖鍍忓垎鏋?
浼樺厛绾?P2锛?
- 鏍呮牸瑁佸壀
- 鏍呮牸缁熻
- NDVI / 鎸囨暟璁＄畻
- 鍙樺寲妫€娴?- 鍒嗙被缁撴灉鍙鍖?
### 6.5 鍒嗘瀽缁撴灉妯″瀷

鍒嗘瀽缁撴灉涔熷簲娉ㄥ唽涓虹┖闂磋祫浜э紝骞堕澶栬褰曞彲澶嶇幇鍙傛暟銆?
```ts
interface AnalysisResultAsset extends SpatialAsset {
  kind: 'analysis-result'
  analysis: {
    type: string
    inputAssetIds: string[]
    parameters: Record<string, unknown>
    summary: string
    generatedByRunId?: string
  }
}
```

### 6.6 鍚庣鍛戒护寤鸿

| 鍛戒护                    | 浣滅敤                |
| ----------------------- | ------------------- |
| `analysis_buffer`       | 鐢熸垚缂撳啿鍖?         |
| `analysis_spatial_join` | 绌洪棿杩炴帴 / 鐐归潰缁熻 |
| `analysis_measure`      | 璺濈銆侀潰绉€侀暱搴?   |
| `analysis_nearest`      | 鏈€杩戦偦              |
| `analysis_aggregate`    | 鑱氬悎缁熻            |
| `analysis_profile`      | 鍦板舰鍓栭潰            |
| `analysis_viewshed`     | 鍙鍩?             |

### 6.7 Agent 宸ュ叿寤鸿

| 宸ュ叿                       | 鑷劧璇█绀轰緥                |
| -------------------------- | --------------------------- |
| `create_buffer`            | 鈥滅粰娌虫祦鍋?500 绫崇紦鍐插尯鈥?    |
| `count_points_in_polygons` | 鈥滅粺璁℃瘡涓閬撻噷鐨勫鏍℃暟閲忊€? |
| `find_nearby_features`     | 鈥滄壘鍑轰簨鏁呯偣 2 鍏噷鍐呯殑鍖婚櫌鈥?|
| `measure_scene_geometry`   | 鈥滈噺涓€涓嬭繖鍧楀尯鍩熼潰绉€?       |
| `generate_heatmap`         | 鈥滄妸鎶ヨ鐐瑰仛鎴愮儹鍔涘浘鈥?       |
| `sample_terrain_profile`   | 鈥滄部杩欐潯璺嚎鐢熸垚鍦板舰鍓栭潰鈥?   |

### 6.8 楠屾敹鏍囧噯

- Agent 鑳藉畬鎴愨€滄壘鍑烘渤娴?500 绫宠寖鍥村唴鐨勫鏍♀€濄€?- 鍒嗘瀽缁撴灉鑳戒綔涓烘柊鍥惧眰鏄剧ず锛屽苟鑳借鍚庣画浠诲姟缁х画寮曠敤銆?- 姣忎釜鍒嗘瀽缁撴灉閮芥湁杈撳叆銆佸弬鏁板拰鐢熸垚鏃堕棿锛屽彲澶嶇幇銆?- 澶ф暟鎹垎鏋愪笉闃诲 UI锛屾湁杩涘害鍜屽彇娑堣兘鍔涖€?
## 7. Phase C锛氫笟鍔′笓棰樻ā鏉?
鐩爣锛氫粠鈥滃伐鍏烽泦鍚堚€濆彉鎴愨€滃満鏅В鍐虫柟妗堚€濄€?
### 7.1 搴旀€ユ寚鎸ヤ笓棰?
鏍稿績浠诲姟锛?
- 浜嬩欢鐐瑰畾浣?- 褰卞搷鑼冨洿鐢熸垚
- 鍛ㄨ竟璧勬簮妫€绱?- 閬块櫓璺嚎瑙勫垝
- 搴旀€ョ墿璧?/ 鍖婚櫌 / 娑堥槻绔欑粺璁?- 鐜板満鎬佸娍鎶ュ憡鐢熸垚

绀轰緥浠诲姟锛?
> 鈥滆繖閲屽彂鐢熷北鐏紝甯垜鍒嗘瀽 5 鍏噷褰卞搷鑼冨洿鍐呯殑鏉戝簞銆侀亾璺拰姘存簮鐐癸紝骞剁敓鎴愪竴浠藉簲鎬ョ爺鍒ゃ€傗€?
### 7.2 鍩庡競绠＄悊涓撻

鏍稿績浠诲姟锛?
- 闂鐐逛綅瀵煎叆
- 缃戞牸鍖栫粺璁?- 楂橀闂鐑姏鍥?- 宸℃璺嚎瑙勫垝
- 澶勭疆鐘舵€佺湅鏉?
绀轰緥浠诲姟锛?
> 鈥滄妸鏈湀浜曠洊闂鎸夎閬撶粺璁★紝鎵惧嚭楂樺彂鍖哄煙锛屽苟瑙勫垝鏄庡ぉ鐨勫贰妫€璺嚎銆傗€?
### 7.3 鑷劧璧勬簮涓撻

鏍稿績浠诲姟锛?
- 鍦板潡瀵煎叆
- 鏉冨睘 / 瑙勫垝 / 褰卞儚鍙犲姞
- 鍦扮被缁熻
- 鍙樺寲妫€娴?- 鍚堣鎬ф鏌?
绀轰緥浠诲姟锛?
> 鈥滄鏌ヨ繖浜涢」鐩湴鍧楁槸鍚﹀帇鍗犵敓鎬佺孩绾匡紝骞惰緭鍑虹枒浼煎啿绐佹竻鍗曘€傗€?
### 7.4 鍥尯涓庢暟瀛楀鐢熶笓棰?
鏍稿績浠诲姟锛?
- 妤兼爧 / 璁惧 / 鎽勫儚澶?/ 鍛婅鐐圭鐞?- 鍛婅瀹氫綅
- 璁惧鐘舵€佸彲瑙嗗寲
- 浜鸿溅杞ㄨ抗鍥炴斁
- 浜嬩欢鑱斿姩澶勭疆

绀轰緥浠诲姟锛?
> 鈥滃畾浣嶄粖澶╃殑寮傚父鍛婅璁惧锛屾煡鐪嬮檮杩戞憚鍍忓ご锛屽苟鐢熸垚澶勭疆璁板綍銆傗€?
### 7.5 鏂囨梾灞曠ず涓撻

鏍稿績浠诲姟锛?
- 鏅偣鐐逛綅涓庤矾绾垮睍绀?- 涓夌淮鏍囨敞
- 娓歌璺嚎鐢熸垚
- 璁茶В璇嶇敓鎴?- 鎴浘 / 瑙嗛鑴氭湰杈撳嚭

绀轰緥浠诲姟锛?
> 鈥滀负杩欐潯鍙ゅ煄娓歌璺嚎鐢熸垚涓夌淮瀵艰锛屽苟缁欐瘡涓櫙鐐瑰啓涓€娈佃瑙ｈ瘝銆傗€?
### 7.6 涓撻妯℃澘妯″瀷

```ts
interface BusinessTemplate {
  id: string
  name: string
  domain: 'emergency' | 'city' | 'natural-resource' | 'park' | 'tourism' | 'custom'
  requiredAssets: AssetRequirement[]
  workflows: WorkflowDefinition[]
  defaultStyles: Record<string, unknown>
  reportTemplateId?: string
}
```

## 8. Phase D锛欰I 浠诲姟缂栨帓

鐩爣锛氳 Agent 浠庝竴闂竴绛斿崌绾т负鍙墽琛屻€佸彲瑙ｉ噴銆佸彲鎭㈠鐨勪笟鍔℃祦绋嬨€?
### 8.1 浠诲姟缂栨帓鍘熷垯

- 绠€鍗曚换鍔＄洿鎺ユ墽琛岋紝涓嶅己鍒剁敓鎴愬啑闀胯鍒掋€?- 澶氭楠や笟鍔′换鍔＄敓鎴愬彲瑙佺殑 Task Timeline銆?- 姣忎竴姝ュ繀椤绘湁杈撳叆銆佽緭鍑恒€佺姸鎬併€佽€楁椂鍜岄敊璇€?- 楂橀闄╂搷浣滈渶瑕佸鎵广€?- 涓棿缁撴灉蹇呴』淇濆瓨涓鸿祫浜ф垨缁撴瀯鍖栫粨鏋滐紝涓嶈兘鍙瓨鍦ㄦā鍨嬩笂涓嬫枃閲屻€?- 澶辫触鏃跺厑璁搁噸璇曘€佽烦杩囥€佹敼鍙傛暟銆佸洖婊氥€?
### 8.2 鍏稿瀷宸ヤ綔娴?
鐢ㄦ埛杈撳叆锛?
> 鈥滃垎鏋愯繖涓尯鍩熷鏍″垎甯冿紝骞剁敓鎴愪竴浠界畝鎶ャ€傗€?
Agent 缂栨帓锛?
1. 璇嗗埆褰撳墠鍖哄煙鑼冨洿銆?2. 鏌ユ壘鎴栬姹傜敤鎴峰鍏ュ鏍＄偣浣嶃€?3. 楠岃瘉瀛楁鍜屽潗鏍囩郴銆?4. 鐢熸垚瀛︽牎鐐逛綅鍥惧眰銆?5. 鎸夌綉鏍兼垨琛屾斂鍖虹粺璁°€?6. 鐢熸垚鐑姏鍥俱€?7. 鎬荤粨绌洪棿鍒嗗竷鐗瑰緛銆?8. 鎴彇鍦板浘蹇収銆?9. 鐢熸垚 Markdown / PDF 鎶ュ憡鑽夌銆?
### 8.3 Workflow 浜嬩欢妯″瀷

```ts
type WorkflowEvent =
  | { type: 'workflow.started'; workflowId: string; title: string }
  | { type: 'workflow.step.started'; workflowId: string; stepId: string; title: string }
  | { type: 'workflow.step.completed'; workflowId: string; stepId: string; outputRef?: string }
  | { type: 'workflow.step.failed'; workflowId: string; stepId: string; error: string }
  | { type: 'workflow.completed'; workflowId: string; resultAssetIds: string[] }
```

## 9. Phase E锛氭垚鏋滆緭鍑轰笌椤圭洰淇濆瓨

鐩爣锛氳鐢ㄦ埛鑳芥妸鍒嗘瀽缁撴灉甯﹁蛋銆佷氦浠樸€佸鐜般€?
### 9.1 杈撳嚭鑳藉姏

浼樺厛绾?P0锛?
- 瀵煎嚭褰撳墠鍦板浘鎴浘
- 瀵煎嚭 GeoJSON / CSV
- 瀵煎嚭鍒嗘瀽鎽樿 Markdown
- 淇濆瓨椤圭洰宸ョ▼

浼樺厛绾?P1锛?
- 瀵煎嚭 PDF 鎶ュ憡
- 瀵煎嚭 Word 鎶ュ憡
- 瀵煎嚭鍥惧眰鏍峰紡
- 瀵煎嚭浠诲姟 Trace
- 鐢熸垚姹囨姤鐢ㄥ浘鐗囧寘

浼樺厛绾?P2锛?
- 鐢熸垚 PPT 鑽夌
- 鐢熸垚瑙嗛鑴氭湰
- 鐢熸垚鍙垎浜彧璇婚」鐩寘

### 9.2 椤圭洰妯″瀷

```ts
interface GaiaProject {
  id: string
  name: string
  description?: string
  assets: SpatialAsset[]
  layers: SceneLayer[]
  workflows: WorkflowSummary[]
  reports: ReportAsset[]
  createdAt: number
  updatedAt: number
}
```

### 9.3 楠屾敹鏍囧噯

- 鐢ㄦ埛鑳戒繚瀛樹竴涓寘鍚暟鎹€佸浘灞傘€佹牱寮忋€佽瑙掑拰鍒嗘瀽缁撴灉鐨勯」鐩€?- 鐢ㄦ埛閲嶅惎搴旂敤鍚庤兘鎭㈠椤圭洰銆?- 鐢ㄦ埛鑳戒竴閿鍑哄綋鍓嶅垎鏋愭姤鍛娿€?- 鎶ュ憡涓寘鍚湴鍥惧揩鐓с€佸叧閿粺璁°€佺粨璁哄拰鏁版嵁鏉ユ簮銆?
## 10. 鏁版嵁涓庡垎鏋愭妧鏈€夊瀷

### 10.1 鍓嶇 / 鍦烘櫙渚?
- CesiumJS锛氫笁缁村彲瑙嗗寲銆佺浉鏈恒€佸疄浣撱€?D Tiles銆佸湴褰€?- Turf.js锛氳交閲忕煝閲忓垎鏋愶紝鍙敤浜庡墠绔揩閫熼瑙堛€?- deck.gl / MVT锛氬悗缁彲鐢ㄤ簬澶ц妯＄偣绾块潰娓叉煋銆?
### 10.2 鍚庣 / 鏈湴渚?
- Rust + Tauri Command锛氳祫浜х鐞嗐€佷换鍔＄紪鎺掋€佹枃浠跺鍏ャ€?- SQLite锛氶」鐩€佽祫浜с€佷細璇濄€乼race銆佸垎鏋愯褰曘€?- GDAL/OGR锛氬己 GIS 鏂囦欢鏍煎紡鏀寔锛屽缓璁綔涓哄彲閫夊寮鸿兘鍔涖€?- geo / geojson / proj锛氬熀纭€鍑犱綍涓庡潗鏍囪浆鎹㈣兘鍔涖€?
### 10.3 澶栭儴鏈嶅姟 / MCP

- 楂樺痉 / 澶╁湴鍥?/ ArcGIS / OSM锛氬湴鐞嗙紪鐮併€佽矾寰勩€佸簳鍥俱€丳OI銆?- PostGIS锛氫紒涓氱┖闂存暟鎹簱銆?- STAC / GeoServer / ArcGIS Server锛氫紒涓氭湇鍔℃帴鍏ャ€?- 鑷畾涔?MCP锛氳涓氭暟鎹€佷笟鍔＄郴缁熴€佸鎵圭郴缁熴€佹姤鍛婄郴缁熴€?
## 11. 鎺ㄨ崘瀹炴柦椤哄簭

### Iteration 1锛氭暟鎹祫浜ф渶灏忛棴鐜?
鐩爣锛氱湡瀹炴暟鎹兘杩涙潵銆佽兘鐪嬨€佽兘琚?Agent 鐞嗚В銆?
- 鏂板璧勪骇娉ㄥ唽琛ㄣ€?- 鏀寔 GeoJSON 瀵煎叆銆?- 鏀寔 CSV 鐐逛綅瀵煎叆銆?- 鍥惧眰闈㈡澘鏄剧ず璧勪骇鏉ユ簮鍜屽瓧娈垫憳瑕併€?- Agent 鏀寔鍒楀嚭銆佹弿杩般€佸姞杞借祫浜с€?
楠屾敹浠诲姟锛?
> 鈥滃鍏ヨ繖涓鏍＄偣浣?CSV锛屾樉绀哄湪鍦板浘涓婏紝骞跺憡璇夋垜鍏辨湁澶氬皯涓偣銆佹湁鍝簺瀛楁銆傗€?
### Iteration 2锛氬熀纭€鍒嗘瀽鏈€灏忛棴鐜?
鐩爣锛欰gent 鑳藉畬鎴愪竴涓湡姝ｇ殑绌洪棿鍒嗘瀽浠诲姟銆?
- 鏀寔缂撳啿鍖恒€?- 鏀寔鐐瑰湪闈㈠唴缁熻銆?- 鏀寔灞炴€ц繃婊ゃ€?- 鍒嗘瀽缁撴灉娉ㄥ唽涓鸿祫浜с€?- UI 灞曠ず鍒嗘瀽缁撴灉鍗＄墖銆?
楠屾敹浠诲姟锛?
> 鈥滄壘鍑烘渤娴?500 绫宠寖鍥村唴鐨勫鏍★紝鐢熸垚缁撴灉鍥惧眰锛屽苟瀵煎嚭 GeoJSON銆傗€?
### Iteration 3锛氭垚鏋滆緭鍑烘渶灏忛棴鐜?
鐩爣锛氬垎鏋愮粨鏋滆兘浜や粯銆?
- 鍦板浘鎴浘瀵煎嚭銆?- Markdown 鎶ュ憡瀵煎嚭銆?- 椤圭洰淇濆瓨 / 鎭㈠銆?- 鎶ュ憡寮曠敤璧勪骇銆佸浘灞傘€佺粺璁＄粨鏋滃拰鎴浘銆?
楠屾敹浠诲姟锛?
> 鈥滃熀浜庡垰鎵嶇殑鍒嗘瀽鐢熸垚涓€浠界畝鎶ワ紝鍖呮嫭鍦板浘鎴浘銆佺粺璁¤〃鍜岀粨璁恒€傗€?
### Iteration 4锛氬簲鎬ヤ笓棰樻牱鏉?
鐩爣锛氬仛鍑虹涓€涓€滆兘璁蹭笟鍔℃晠浜嬧€濈殑涓撻銆?
- 浜嬩欢鐐瑰伐浣滄祦銆?- 褰卞搷鑼冨洿鍒嗘瀽銆?- 鍛ㄨ竟璧勬簮妫€绱€?- 璺緞瑙勫垝鎺ュ叆銆?- 搴旀€ョ爺鍒ゆ姤鍛娿€?
楠屾敹浠诲姟锛?
> 鈥滄ā鎷熶竴涓簨鏁呯偣锛屽垎鏋?3 鍏噷鍐呭尰闄€佹秷闃茬珯鍜屽鏍★紝缁欏嚭搴旀€ュ缃缓璁€傗€?
### Iteration 5锛氭彃浠跺寲涓氬姟妯℃澘

鐩爣锛氳涓撻鍙互鎸佺画鎵╁睍銆?
- 涓氬姟妯℃澘 schema銆?- 妯℃澘甯傚満 / 妯℃澘鍒楄〃銆?- 妯℃澘鍐呯疆鎻愮ず璇嶃€佹牱寮忋€佹暟鎹姹傘€佹姤鍛婄粨鏋勩€?- 鐢ㄦ埛鍙垱寤鸿嚜瀹氫箟妯℃澘銆?
## 12. 褰撳墠鏈€搴旇鍋氱殑 10 涓换鍔?
鎸変笟鍔′环鍊煎拰瀹炵幇椋庨櫓鎺掑簭锛?
1. 鏂板缓 `SpatialAsset` 鏁版嵁妯″瀷鍜?SQLite 琛ㄣ€?2. 瀹炵幇 GeoJSON 瀵煎叆骞舵敞鍐岃祫浜с€?3. 瀹炵幇 CSV 鐐逛綅瀵煎叆鍚戝銆?4. 鍦?UI 澧炲姞鏁版嵁璧勪骇闈㈡澘銆?5. 澧炲姞 `asset_list` / `asset_describe` / `add_asset_to_scene` Agent 宸ュ叿銆?6. 瀹炵幇缂撳啿鍖哄垎鏋愩€?7. 瀹炵幇鐐瑰湪闈㈠唴缁熻銆?8. 瀹炵幇鍒嗘瀽缁撴灉娉ㄥ唽涓鸿祫浜с€?9. 瀹炵幇鍦板浘鎴浘 + Markdown 鎶ュ憡瀵煎嚭銆?10. 寤虹珛绗竴涓簲鎬ユ寚鎸ヤ笓棰?demo銆?
## 13. 椋庨櫓涓庣害鏉?
| 椋庨櫓               | 璇存槑                                   | 缂撹В                                                   |
| ------------------ | -------------------------------------- | ------------------------------------------------------ |
| GIS 鏍煎紡鏀寔鑶ㄨ儉   | 涓€娆℃€ф敮鎸佹墍鏈夋牸寮忎細鎷栨參杩涘害           | 鍏?GeoJSON / CSV / 3D Tiles锛屽啀寮曞叆 GDAL               |
| 澶ф暟鎹嫋鍨?WebView | 澶?GeoJSON 鐩存帴杩?Cesium Entity 鎬ц兘宸?| 璧勪骇灞傚瓨寮曠敤锛屾覆鏌撳眰鎸夎妯￠€夋嫨 Primitive / Tiles / MVT |
| Agent 骞昏鍒嗘瀽缁撴灉 | 妯″瀷鍙兘缂栭€犵粺璁＄粨璁?                  | 鎵€鏈夋暟瀛楁潵鑷伐鍏风粨鏋勫寲杈撳嚭锛屾姤鍛婂紩鐢ㄧ粨鏋?ID            |
| 澶栭儴鏈嶅姟閰嶇疆澶嶆潅   | 鍦扮悊缂栫爜銆佽矾寰勩€丳OI 鏈嶅姟闇€瑕?key       | 閫氳繃 MCP 鍜屽仴搴锋鏌ユ毚闇查厤缃姸鎬?                       |
| 鍧愭爣绯婚棶棰?        | CSV/Shapefile 鍧愭爣绯讳笉鏄庣‘             | 瀵煎叆鏃惰瘑鍒€佹彁绀恒€佸厑璁哥敤鎴风‘璁?                        |
| 涓氬姟妯℃澘娉涘寲鍥伴毦   | 涓嶅悓琛屼笟娴佺▼宸紓澶?                    | 鍏堝仛 1-2 涓牱鏉匡紝鍐嶆娊璞℃ā鏉?schema                     |
| 鎶ュ憡杈撳嚭璐ㄩ噺涓嶇ǔ瀹?| LLM 鐢熸垚鎶ュ憡鍙兘鏍煎紡婕傜Щ               | 浣跨敤鍥哄畾鎶ュ憡妯℃澘 + 缁撴瀯鍖栨暟鎹～鍏?                     |

## 14. 瀹屾垚瀹氫箟

涓€涓笟鍔¤兘鍔涘彧鏈夋弧瓒充互涓嬫潯浠舵墠绠楀畬鎴愶細

- 鏈?UI 鍏ュ彛鎴?Agent 宸ュ叿鍏ュ彛銆?- 鏈夊悗绔懡浠ゆ垨 MCP 宸ュ叿瀹炵幇銆?- 鏈夌粨鏋勫寲杈撳叆杈撳嚭锛屼笉鍙繑鍥炵函鏂囨湰銆?- 鏈夐敊璇姸鎬佸拰鐢ㄦ埛鍙悊瑙ｇ殑閿欒鎻愮ず銆?- 鏈?trace 璁板綍鍜屽彲澶嶇幇鍙傛暟銆?- 鏈夎嚦灏戜竴涓鍒扮楠屾敹浠诲姟銆?- 缁撴灉鍙繚瀛樹负璧勪骇銆佸浘灞傘€佹姤鍛婃垨椤圭洰鐨勪竴閮ㄥ垎銆?
Implementation note 2026-07-03: Phase A has a first native structured asset registry. The Agent can call `asset_register`, `asset_list`, and `asset_describe` to preserve spatial data asset metadata separately from rendered scene layers, including `asset:<id>` refs, URI, CRS, geometry type, feature count, bbox, schema, metadata, provenance, and lock state.

Implementation note 2026-07-03: Phase A now links rendered data layers back into the asset layer. Data-loading render tools automatically create companion `asset:<layerId>` records for GeoJSON/primitive GeoJSON, KML, CZML, imagery services, 3D Tiles, Gaussian splats, and heatmaps, so users can remove a rendered layer without losing the dataset metadata.

Implementation note 2026-07-03: Phase A now has a first local file import path for GeoJSON. The ScenePanel `瀵煎叆 GeoJSON` action reads local `.geojson`/`.json` files, infers lightweight metadata, renders the dataset, and persists the asset/layer pair for later Agent use.

Implementation note 2026-07-03: Phase A now has a first CSV point-table import path. The ScenePanel `瀵煎叆 CSV` action reads local CSV files, detects common longitude/latitude column names, converts valid rows to point features, renders the layer, and persists the dataset metadata as a reusable asset.

Implementation note 2026-07-03: Phase A assets imported from local GeoJSON/CSV can now be re-rendered from the asset card. This establishes the first reusable asset loop: import data once, remove the visual layer when needed, then add the asset back to the map without re-importing the file.

Implementation note 2026-07-03: Phase A now includes a safe data-asset summary loop. The Agent can call `asset_summarize` to answer what an imported dataset contains, including feature count, geometry, bbox, CRS, fields, and render status, while large render payloads are omitted. ScenePanel also surfaces these metadata fields in the selected asset detail view.

Implementation note 2026-07-03: Phase B has started with `analysis_buffer` for imported point assets. The Agent can now create meter-based polygon buffers from Point/MultiPoint GeoJSON assets, render the output as a map layer, and register the result as an `analysis-result` asset with source asset, distance, segment count, bbox, and feature count metadata.

Implementation note 2026-07-03: Phase B buffer analysis now has a first user-facing shortcut. ScenePanel data asset cards expose `鐢熸垚 500m 缂撳啿鍖篳 for renderable point datasets, and selected asset details expose 100m / 500m / 1km shortcuts, turning the backend analysis tool into a practical asset 鈫?analysis 鈫?result layer workflow.

Implementation note 2026-07-03: Phase A/B assets with stored render data now have a first deliverable output path. ScenePanel exposes `瀵煎嚭 GeoJSON` for imported data assets and generated analysis-result assets, writing the renderable GeoJSON together with GaiaAgent provenance metadata.

Implementation note 2026-07-03: Phase A point data assets now have a CSV deliverable path. ScenePanel exposes `瀵煎嚭 CSV` for assets with Point/MultiPoint render data, exporting feature properties plus longitude/latitude columns with safe filenames and CSV escaping.

Implementation note 2026-07-03: Phase E has a first lightweight report output. ScenePanel exposes `瀵煎嚭鎶ュ憡`, producing a Markdown analysis summary from the current SceneState with scene counts, camera, assets, analysis results, bbox/feature metadata, and available GeoJSON/CSV deliverables.

Implementation note 2026-07-03: the Agent-facing asset loop now includes read-only `asset_export`. Models can request bounded `summary`, `geojson`, or point `csv` payloads for registered assets by ref/id, so reasoning can use real asset content without flooding context or bypassing the UI download path for larger deliverables.

Implementation note 2026-07-04: Phase E now has a first deliverables package manifest. ScenePanel shows a `浠诲姟鎴愭灉鍖卄 summary and exports a compact JSON manifest that enumerates scene JSON, Markdown report, GeoJSON deliverables, CSV point deliverables, analysis-result counts, asset refs, and filename hints. This turns scattered export buttons into a single handoff inventory while keeping large payloads in their dedicated export paths.

Implementation note 2026-07-04: Phase E now also has a one-click ZIP handoff. ScenePanel `瀵煎嚭 ZIP` packages the manifest, README, scene JSON, Markdown report, GeoJSON assets, analysis GeoJSON, and point CSV tables into a single artifact, making 鈥滆祫浜?鈫?宸ュ叿 鈫?Agent 鈫?UI 鈫?杈撳嚭鈥?closer to a real deliverable workflow.

Implementation note 2026-07-04: Phase E ZIP handoff now includes `package/index.json` with packaged file paths, MIME types, byte sizes, SHA-256 hashes, file count, and total bytes. Import reads the index when present, verifies indexed file bytes and SHA-256 hashes, and surfaces success/anomaly status, giving exported packages a basic audit surface and preparing the format for stricter signature validation.

Implementation note 2026-07-04: Phase E now has the beginning of a package round trip. ScenePanel `瀵煎叆 ZIP` restores `scene/scene.json` from GaiaAgent deliverables packages and preserves registered data/analysis assets during import, so exported work can be brought back into the application as a reusable scene package rather than a dead archive.

Implementation note 2026-07-04: Phase E package import now surfaces lightweight diagnostics from `manifest.json`. When a package has a valid GaiaAgent manifest, the import status reports total deliverables plus GeoJSON/CSV counts; when the manifest is absent or older, the import can still proceed from `scene/scene.json`.

Implementation note 2026-07-04: Phase B now includes Agent-facing `analysis_nearest` for Point/MultiPoint data assets with preserved `metadata.renderData`. The tool compares two registered point assets, creates one nearest-target LineString per source point, stores distance fields and source/target feature indices, renders the result through `addGeoJsonLayer`, and registers it as an `analysis-result` asset. This adds a second concrete analysis loop after buffers and moves the roadmap toward real resource matching / nearest-service workflows.

Implementation note 2026-07-04: Phase B now also includes `analysis_measure` for renderable GeoJSON line and polygon assets. The tool measures LineString/MultiLineString length plus Polygon/MultiPolygon area and perimeter, writes per-feature measurement fields and aggregate totals into analysis metadata, renders the annotated GeoJSON through `addGeoJsonLayer`, and registers the output as a reusable `analysis-result` asset. ScenePanel exposes this as a selected-asset shortcut and card action for line/polygon/mixed datasets.

Implementation note 2026-07-04: Phase B now includes the first point-in-polygon spatial join through `analysis_spatial_join`. The tool accepts one Point/MultiPoint asset and one Polygon/MultiPolygon asset, counts matching points inside each polygon, stores per-polygon `pointCount` and matched point indices plus aggregate `totalMatches`, renders the annotated polygon result, and registers it as an `analysis-result`. ScenePanel exposes this from either side of the relationship: selected point assets can choose polygon assets for regional statistics, and selected polygon assets can choose point assets for in-area counts.

Implementation note 2026-07-04: Phase B now includes `analysis_filter`, the first attribute-query analysis loop. The tool filters a renderable GeoJSON asset with a single property condition (`eq`, `neq`, `contains`, numeric comparisons, or `exists`), renders the matching features, records matched/source counts and the predicate in metadata, and registers the output as an `analysis-result`. ScenePanel now surfaces quick equality filters from common scalar property values in imported features, while more complex predicates remain available to the Agent tool.

Implementation note 2026-07-04: Phase E reports now explain analysis results with business-oriented details instead of only listing raw asset metadata. Markdown reports render per-analysis summaries for buffers, nearest-neighbor links, measurements, point-in-polygon joins, and attribute filters, including matched counts, totals, predicates, area/length/perimeter, and source/target refs. This makes exported reports closer to a handoff artifact a GIS analyst can read directly.

Implementation note 2026-07-04: Phase E deliverables manifests now reuse the same analysis summary layer as Markdown reports. Analysis GeoJSON items in `manifest.json` include business-readable descriptions such as buffer radius, measurement totals, point-in-polygon totals, nearest source/target refs, and filter predicates, so a ZIP recipient can understand individual files from the package inventory before opening the report.

Implementation note 2026-07-04: Phase C now has the first business workflow template primitive. `regional-resource-coverage` defines a reusable 鈥滃尯鍩熻祫婧愯鐩栬瘎浼扳€?workflow with point-resource and polygon-area asset requirements, expected analysis tools (`analysis_spatial_join`, `analysis_buffer`, `analysis_nearest`, `analysis_filter`), and report focus areas. The chat panel can recommend this template from current scene assets and send a structured prompt that asks the Agent to inspect assets, run point-in-polygon statistics, optionally add coverage/nearest/filter analysis, and generate a deliverable summary.

Implementation note 2026-07-04: Phase C template primitives have expanded into a small multi-domain workflow library. In addition to `regional-resource-coverage`, GaiaAgent now defines `urban-issue-grid-governance` for city issue point/grid statistics and `natural-resource-compliance-screening` for project parcel/control-boundary compliance screening. The asset matcher now avoids reusing the same asset for multiple required roles, so templates that need two distinct polygon datasets correctly report partial readiness until both are available.

Implementation note 2026-07-04: Phase C workflow prompts now use template-specific step lists instead of one hard-coded resource-coverage flow. City governance prompts focus on issue-type filtering, grid statistics, high-frequency areas, and disposal priority, while natural-resource compliance prompts focus on parcel/control-boundary checks, measurements, attribute screening, and clearly flag the need for future polygon overlay for precise conflict verification.

Implementation note 2026-07-04: Natural-resource compliance screening now has a first native polygon conflict primitive: `analysis_polygon_overlap_screen`. It compares two polygon assets, emits source polygons with candidate target-boundary indices, and registers a renderable analysis result. The method uses bbox as a pre-filter, then checks vertex containment and polygon edge intersections (`vertex_or_edge_intersection`). It is still intentionally labeled as a screening step rather than exact polygon overlay, so reports should keep manual review wording until true overlay/intersection geometry is implemented.

Implementation note 2026-07-04: Report and deliverables summaries now understand `polygon_overlap_screen` metadata. Markdown reports and `manifest.json` descriptions list the project parcel asset, control-boundary asset, suspected-conflict parcel count, candidate boundary hit count, screening method, and the non-exact-overlay review caveat, making the natural-resource workflow handoff-readable instead of only map-layer-readable.

Implementation note 2026-07-04: `analysis_polygon_overlap_screen` now enriches each suspected-conflict parcel with its own area (`candidateAreaSquareMeters`, `candidateAreaHectares`) and a simple hit-count risk level (`overlapRiskLevel`, plus aggregate `riskLevelCounts`). This is a triage signal for review priority, not an occupied/overlapped area calculation; exact intersection area remains a later overlay capability.

## 15. 涓庣幇浠ｅ寲閲嶆瀯璁″垝鐨勫叧绯?
`docs/design/gaiaagent-modernization-roadmap.md` 瑙ｅ喅鐨勬槸宸ョ▼搴曞骇闂锛氳繍琛屾椂銆丳rovider銆丮CP銆佷細璇濄€佷笂涓嬫枃銆佸彲瑙傛祴鎬с€佸畨鍏ㄥ拰鍙戝竷銆?
鏈枃妗ｈВ鍐崇殑鏄笟鍔′骇鍝侀棶棰橈細鏁版嵁銆佸垎鏋愩€佷笓棰樸€佹垚鏋滃拰鍙氦浠樹环鍊笺€?
涓よ€呭叧绯绘槸锛?
- 鐜颁唬鍖栭噸鏋勬彁渚涚ǔ瀹氱殑 Agent Host銆佸伐鍏峰崗璁拰鎸佷箙鍖栬兘鍔涖€?- 涓氬姟鑳藉姏璺嚎鍥惧湪姝ゅ熀纭€涓婂畾涔夌敤鎴风湡姝ｄ細浣跨敤銆佷細浠樿垂銆佷細澶嶇敤鐨?GIS 鑳藉姏銆?
鍚庣画寮€鍙戝簲閬垮厤鍙仛搴曞眰妗嗘灦锛屼篃閬垮厤鍦ㄦ病鏈夊伐绋嬭竟鐣岀殑鎯呭喌涓嬪爢涓氬姟鍔熻兘銆傛瘡涓笟鍔¤兘鍔涢兘搴旇惤鍦ㄢ€滆祫浜?鈫?宸ュ叿 鈫?Agent 鈫?UI 鈫?杈撳嚭鈥濈殑闂幆閲屻€?
