# GaiaAgent 鐜颁唬鍖栭噸鏋勮鍒?
> 鐘舵€侊細Draft
> 鍒跺畾鏃ユ湡锛?026-06-30
> 鐩爣鐗堟湰锛歚0.3.x`锛堝熀纭€娌荤悊锛夆啋 `0.4.x`锛堟柊杩愯鏃讹級鈫?`1.0.0`锛堢ǔ瀹氫骇鍝侊級

## 1. 鑳屾櫙

GaiaAgent 褰撳墠宸茬粡鍏峰鍙伐浣滅殑 Tauri 2銆丷eact銆丆esiumJS銆丷eAct Agent 涓?MCP 闆嗘垚锛屼絾鏍稿績瀹炵幇浠嶅甫鏈夊師鍨嬮樁娈电壒寰侊細妯″瀷鍗忚鐢卞墠绔墜宸ラ€傞厤銆丄gent 渚濊禆鏂囨湰 JSON 瑙ｆ瀽銆丮CP 瀹㈡埛绔嚜琛岀淮鎶?JSON-RPC銆佸嚟鎹拰绯荤粺鏉冮檺杈圭晫杈冨锛屾祴璇曚笌鍙娴嬫€т笉瓒炽€?
鏈閲嶆瀯涓嶄互鈥滃崌绾ф墍鏈変緷璧栤€濇垨鈥滈噸鍐欓」鐩€濅负鐩爣锛岃€屾槸淇濈暀宸茬粡楠岃瘉鏈夋晥鐨勪骇鍝佹柟鍚戝拰鎶€鏈祫浜э紝閫愭鏇挎崲闃荤鍙潬鎬с€佸畨鍏ㄦ€у拰鎵╁睍鎬х殑閮ㄥ垎銆?
## 2. 閲嶆瀯鐩爣

### 2.1 浜у搧鐩爣

- 浠庘€滆亰澶╂帶鍒朵笁缁村湴鐞冣€濆崌绾т负鍙璁°€佸彲鎭㈠鐨勭┖闂翠换鍔″伐浣滃彴銆?- 鏀寔鏈湴妯″瀷銆佷富娴佷簯妯″瀷涓?OpenAI-compatible 鏈嶅姟锛岄伩鍏嶇粦瀹氬崟涓€渚涘簲鍟嗐€?- 鍚屾椂鏀寔鏈湴鍜岃繙绋?MCP 鏈嶅姟锛屽苟娓呮灞曠ず宸ュ叿鏉ユ簮銆佸弬鏁般€佺姸鎬佷笌椋庨櫓銆?- 璁╃敤鎴疯兘澶熸煡鐪嬨€佹殏鍋溿€佹壒鍑嗐€佸彇娑堛€侀噸璇曞拰鎭㈠绌洪棿浠诲姟銆?- 涓哄悗缁枃浠跺垎鏋愩€佺┖闂存暟鎹祫浜с€佸満鏅揩鐓у拰澶氭ā鎬佽緭鍏ラ鐣欑ǔ瀹氭帴鍙ｃ€?
### 2.2 宸ョ▼鐩爣

- Agent銆佹ā鍨嬨€丮CP銆丆esium 鍜?UI 涔嬮棿閫氳繃鏄庣‘鐨勭被鍨嬪寲鍗忚瑙ｈ€︺€?- 鍙噸澶嶆瀯寤猴紝閿佹枃浠朵竴鑷达紝杩愯鏃朵笉鍐嶉粯璁や笅杞?`@latest` 鍖呫€?- 鏍稿績娴佺▼鍏峰鍗曞厓娴嬭瘯銆侀泦鎴愭祴璇曞拰绔埌绔啋鐑熸祴璇曘€?- API Key 涓嶄互鏄庢枃 JSON 淇濆瓨锛涢珮椋庨櫓鎿嶄綔蹇呴』缁忚繃绛栫暐鍒ゆ柇鎴栫敤鎴锋壒鍑嗐€?- 姣忔浠诲姟鍏锋湁缁撴瀯鍖栨棩蹇椼€佽€楁椂銆佹ā鍨嬬敤閲忓拰宸ュ叿璋冪敤杞ㄨ抗銆?
## 3. 闈炵洰鏍?
- 涓嶅湪绗竴闃舵鍒囨崲鍒?Electron銆丯ext.js 鎴栨湇鍔＄ Web 鏋舵瀯銆?- 涓嶄竴娆℃€у崌绾?React銆乀ailwind銆乂ite 绛夋墍鏈夊ぇ鐗堟湰銆?- 涓嶄互鏌愪竴瀹舵ā鍨嬪巶鍟嗙殑 Agents SDK 浣滀负鏁翠釜椤圭洰鐨勫敮涓€杩愯鏃躲€?- 涓嶅湪瀹屾垚琛屼负鍩虹嚎鍓嶅垹闄ゆ棫 Agent 瀹炵幇銆?- 涓嶅皢 Cesium 鍦烘櫙鐘舵€佸畬鍏ㄥ鍒跺埌 React 鐘舵€佹爲銆?
## 4. 鐩爣鏋舵瀯

```mermaid
flowchart TB
    UI[React + AI Elements 宸ヤ綔鍙癩
    IPC[绫诲瀷鍖?Tauri IPC / Event Stream]

    subgraph Host[Rust Agent Host]
        Runtime[Agent Runtime]
        Policy[Policy / Approval Engine]
        Session[Session / Trace Store]
        Providers[Provider Adapters]
        MCP[MCP Host]
        Vault[Credential Store]
    end

    subgraph GIS[Cesium Workspace]
        Adapter[Scene Adapter]
        Scene[CesiumJS Scene]
        Assets[Spatial Assets]
    end

    UI <--> IPC
    IPC <--> Runtime
    Runtime --> Policy
    Runtime <--> Session
    Runtime <--> Providers
    Runtime <--> MCP
    Providers --> Vault
    MCP --> Vault
    Runtime <--> Adapter
    Adapter <--> Scene
    Adapter <--> Assets
```

### 4.1 鍒嗗眰鑱岃矗

| 灞?| 璐熻矗 | 涓嶈礋璐?|
|---|---|---|
| React UI | 灞曠ず浜嬩欢銆佹敹闆嗚緭鍏ャ€佸鎵广€佷换鍔℃帶鍒?| 妯″瀷璇锋眰銆佸瘑閽ョ鐞嗐€佸伐鍏锋墽琛?|
| Agent Runtime | 浠诲姟鐘舵€佹満銆佸伐鍏峰惊鐜€侀绠椼€佸彇娑堝拰鎭㈠ | 鍏蜂綋渚涘簲鍟嗗崗璁€丆esium DOM 鎿嶄綔 |
| Provider Adapter | 妯″瀷璇锋眰銆佹祦寮忚В鏋愩€佺粨鏋勫寲宸ュ叿璋冪敤 | UI 鐘舵€佸拰 GIS 涓氬姟瑙勫垯 |
| MCP Host | 鐢熷懡鍛ㄦ湡銆佷紶杈撱€佽兘鍔涘崗鍟嗗拰宸ュ叿娉ㄥ唽 | 鍐冲畾宸ュ叿鏄惁鍏佽鎵ц |
| Policy Engine | 椋庨櫓鍒嗙骇銆佸鎵广€佺綉缁滀笌璺緞绛栫暐 | 瀹為檯鎵ц宸ュ叿 |
| Scene Adapter | 鍦烘櫙鍛戒护銆佺粨鏋滃叧鑱斻€佸満鏅揩鐓?| 閫氱敤 Agent 鎺ㄧ悊 |
| Session Store | 浼氳瘽銆佷簨浠躲€佸揩鐓с€佺敤閲忓拰鎭㈠ | 闀挎湡鏁忔劅鍑嵁 |

## 5. 鏍稿績鍗忚

### 5.1 Agent 浜嬩欢妯″瀷

鎵€鏈夎繍琛岃繃绋嬬粺涓€涓哄彲搴忓垪鍖栦簨浠讹紝UI 涓嶅啀浠庡涓竷灏旂姸鎬佹帹鏂?Agent 琛屼负銆?
```ts
type AgentEvent =
  | { type: 'run.started'; runId: string; goal: string }
  | { type: 'message.delta'; runId: string; text: string }
  | { type: 'reasoning.status'; runId: string; status: string }
  | { type: 'tool.requested'; runId: string; call: ToolCall }
  | { type: 'tool.approval_required'; runId: string; call: ToolCall; risk: RiskLevel }
  | { type: 'tool.started'; runId: string; callId: string }
  | { type: 'tool.completed'; runId: string; callId: string; result: ToolResult }
  | { type: 'tool.failed'; runId: string; callId: string; error: AgentError }
  | { type: 'scene.changed'; runId: string; patch: ScenePatch }
  | { type: 'usage.updated'; runId: string; usage: Usage }
  | { type: 'run.completed'; runId: string }
  | { type: 'run.cancelled'; runId: string }
  | { type: 'run.failed'; runId: string; error: AgentError }
```

浜嬩欢鍗忚搴斿甫鐗堟湰鍙凤紝骞跺厑璁告湭鐭ヤ簨浠惰鏃?UI 瀹夊叏蹇界暐銆?
### 5.2 宸ュ叿妯″瀷

姣忎釜宸ュ叿鑷冲皯鍖呭惈锛?
- 绋冲畾 ID銆佹樉绀哄悕绉般€佹潵婧愬拰鐗堟湰銆?- JSON Schema 杈撳叆杈撳嚭銆?- `read`銆乣scene-write`銆乣network`銆乣filesystem`銆乣process` 椋庨櫓鏍囩銆?- 骞傜瓑鎬с€佽秴鏃躲€佹槸鍚︽敮鎸佸彇娑堛€?- 鍙睍绀虹殑缁撴瀯鍖栫粨鏋滐紝鑰岄潪浠呮湁 `output: string`銆?
## 6. 妯″潡閲嶆瀯璁″垝

### 6.1 Agent Runtime

- 浣跨敤 Rust Native Runtime 浣滀负鍞竴 Agent 鐘舵€佹満銆?- 浣跨敤妯″瀷鍘熺敓 tool calling / structured output锛屽仠姝緷璧栨鍒欐彁鍙?JSON銆?- 鏀寔鍙栨秷銆佸崟姝ヨ秴鏃躲€佹€昏繍琛岄绠椼€佹渶澶ц疆娆″拰澶辫触閲嶈瘯绛栫暐銆?- 鏀寔涓茶涓庡彈鎺у苟琛屽伐鍏疯皟鐢ㄣ€?- 灏嗚鍒掍綔涓哄彲閫夎兘鍔涳紱绠€鍗曚换鍔℃棤闇€鍏堢敓鎴愬畬鏁磋鍒掋€?- 鍒犻櫎 Legacy Runtime feature flag锛屽墠绔笉鍐嶇洿鎺ヨ皟鐢ㄦā鍨嬫垨瑙ｆ瀽璁″垝 JSON銆?
### 6.2 妯″瀷渚涘簲鍟嗗眰

- 瀹氫箟缁熶竴 `ModelProvider` 鎺ュ彛鍜屾爣鍑嗘祦寮忎簨浠躲€?- 棣栨壒閫傞厤锛歄penAI Responses銆丱penAI-compatible銆丄nthropic銆丱llama銆?- 妯″瀷鑳藉姏閫氳繃 capability 鎻忚堪锛岃€屼笉鏄寜 provider 鍚嶇О鍐欐潯浠跺垎鏀€?- 鍖哄垎 reasoning銆乿ision銆乼ool calling銆丣SON Schema銆乧ontext window 绛夎兘鍔涖€?- 妯″瀷鍚嶇О鍜岄粯璁ゅ€艰繘鍏ュ彲鏇存柊閰嶇疆锛屼笉纭紪鐮佸湪 UI 鎴?Rust 榛樿瀹炵幇涓€?- 瀵归敊璇繘琛岀粺涓€鍒嗙被锛氳璇併€侀檺娴併€佷笂涓嬫枃婧㈠嚭銆佹ā鍨嬩笉鏀寔銆佺綉缁滃拰鏈嶅姟绔敊璇€?
### 6.3 MCP Host

- 浣跨敤缁存姢涓殑 MCP SDK 鏇挎崲鎵嬪啓 JSON-RPC framing銆?- 鏀寔 stdio 涓?Streamable HTTP銆?- 姝ｇ‘瀹炵幇 initialize銆乧apability negotiation銆侀€氱煡銆乸rogress 鍜屽彇娑堛€?- 鍚庣画鏀寔 OAuth銆乪licitation銆乺esources銆乸rompts 涓?tasks銆?- 鏈嶅姟閰嶇疆澧炲姞鐗堟湰鍥哄畾銆佹潵婧愩€佹潈闄愩€佸仴搴风姸鎬佸拰鏈€杩戦敊璇€?- 宸ュ叿鍒楄〃鍙樻洿閫氳繃閫氱煡鍒锋柊锛屼笉瑕佹眰閲嶅惎鏁翠釜搴旂敤銆?- 榛樿绂佹浠绘剰鍛戒护锛涙湰鍦版湇鍔＄敱鍙楁帶鍚姩閰嶇疆鍜岀瓥鐣ュ眰鍏卞悓鎺堟潈銆?
### 6.4 Cesium 涓庣┖闂存暟鎹眰

- 鍗囩骇骞跺榻?CesiumJS銆乣cesium-mcp-runtime` 鍜?bridge 鐨勫吋瀹圭増鏈€?- 鐢?`Scene Adapter` 鍙栦唬鍩轰簬宸ュ叿鍙傛暟鎺ㄦ柇鍦烘櫙鐘舵€佺殑鏂瑰紡銆?- 涓哄懡浠ゅ垎閰?`callId`锛屽彲闈犲叧鑱?HTTP/MCP 璇锋眰鍜?WebSocket/bridge 缁撴灉銆?- 鍘婚櫎鍥哄畾 300ms/2s 绛夊緟閫昏緫锛屾敼涓哄畬鎴愪簨浠躲€佽秴鏃跺拰鍙栨秷鍗忚銆?- 寤虹珛鍦烘櫙蹇収锛氱浉鏈恒€佸浘灞傘€佸疄浣撱€佹椂闂磋酱銆侀€夋嫨闆嗗拰鏁版嵁璧勪骇寮曠敤銆?- 澶у瀷 GeoJSON 浼樺厛璇勪及 Primitive 璺嚎锛涜瘎浼?MVT銆佺煝閲?3D Tiles 涓?3D Tiles 1.1銆?- 灏嗗ぇ鏁版嵁淇濆瓨鍦ㄧ┖闂磋祫浜у眰锛孉gent 涓婁笅鏂囧彧浼犲紩鐢ㄣ€佹憳瑕佸拰 schema銆?
### 6.5 浼氳瘽銆佽蹇嗕笌鎭㈠

- 浣跨敤 SQLite 淇濆瓨浼氳瘽銆佽繍琛屻€佷簨浠躲€佸伐鍏风粨鏋滄憳瑕佸拰鍦烘櫙蹇収銆?- 鍘熷澶у瀷宸ュ叿缁撴灉鍐欏叆鐙珛璧勪骇瀛樺偍锛屼互 ID 寮曠敤銆?- 鏀寔搴旂敤閲嶅惎鍚庢仮澶嶅璇濆拰鏈€杩戠ǔ瀹氬満鏅€?- 鐭湡璁板繂浣跨敤鏈€杩戞秷鎭?+ 鍦烘櫙蹇収 + 浠诲姟鎽樿銆?- 闀挎湡璁板繂蹇呴』鐢辩敤鎴锋樉寮忓惎鐢紝骞舵敮鎸佹煡鐪嬪拰鍒犻櫎銆?- 涓婁笅鏂囪鍓互 token 鍜岃涔夎竟鐣屼负鍑嗭紝涓嶅啀鍙寜瀛楃鎴柇銆?
### 6.6 UI 宸ヤ綔鍙?
- 浣跨敤 AI Elements 閲嶆瀯 Conversation銆丮essage銆丳romptInput銆丷easoning 鍜?Tool UI銆?- 澧炲姞宸ュ叿瀹℃壒銆佽繍琛屾椂闂寸嚎銆佸彇娑?閲嶈瘯銆侀敊璇仮澶嶅拰鏉ユ簮鏍囪瘑銆?- 浣跨敤 Agent timeline 灞曠ず Task/Workflow锛屼笉寮哄埗鎵€鏈変换鍔￠鍏堣鍒掋€?- GIS 缁撴灉浣跨敤鑷畾涔?message parts锛氱浉鏈哄畾浣嶃€佸浘灞傘€佽绱犻泦銆佸垎鏋愮粨鏋滃拰蹇収銆?- UI 閫氳繃 Gaia `AgentEvent 鈫?UIMessage` 閫傞厤鍣ㄦ秷璐瑰悗绔簨浠躲€?- AI Elements 鍙綔涓?UI 婧愮爜缁勪欢锛屼笉瑕佹眰浣跨敤 Vercel AI Gateway銆?- 淇濇寔鍦板浘涓轰富宸ヤ綔鍖猴紝鑱婂ぉ涓庝换鍔￠潰鏉挎敮鎸佹姌鍙犲拰瀹藉害璋冩暣銆?- 婊¤冻閿洏鎿嶄綔銆佸彲瑙佺劍鐐广€佸噺灏戝姩鐢诲拰鏄庢殫涓婚瀵规瘮搴﹁姹傘€?
### 6.7 瀹夊叏

- 鍚敤涓ユ牸 CSP锛屽彧寮€鏀惧繀瑕佺殑杩炴帴銆佸浘鐗囧拰璧勬簮鏉ユ簮銆?- 鏀剁揣 Tauri capabilities锛岀Щ闄ゅ墠绔笉蹇呰鐨?`shell` 鍜屽娉?`fs` 鏉冮檺銆?- 灏?API Key銆丱Auth token 淇濆瓨鍒扮郴缁熷嚟鎹簱銆?- 闄愬埗 `ai_fetch` 鐨勫崗璁€佷富鏈恒€侀噸瀹氬悜銆佽姹備綋鍜屽搷搴斿ぇ灏忥紝闃叉 SSRF銆?- MCP 鏈嶅姟涓庡伐鍏锋寜椋庨櫓鍒嗙骇锛涢珮椋庨櫓璋冪敤杩涘叆瀹℃壒娴佺▼銆?- 绂佹榛樿鎵ц `npx --yes package@latest`锛屾敼涓哄浐瀹氱増鏈垨闅忓簲鐢ㄦ墦鍖呫€?- 瀵规棩蹇楀拰閿欒娑堟伅杩涜瀵嗛挜銆丄uthorization header 鍜屼釜浜轰俊鎭劚鏁忋€?- 鍙戝竷鐗╁惎鐢ㄧ鍚嶃€佹洿鏂扮鍚嶆牎楠屽拰渚濊禆瀹夊叏鎵弿銆?
### 6.8 宸ョ▼璐ㄩ噺涓庡彲瑙傛祴鎬?
- 澧炲姞 ESLint銆丳rettier銆丷ustfmt銆丆lippy 鍜岀粺涓€妫€鏌ヨ剼鏈€?- TypeScript 浣跨敤 Vitest锛汻ust 浣跨敤鍗曞厓娴嬭瘯鍜岄泦鎴愭祴璇曘€?- 涓?Agent 鐘舵€佹満寤虹珛纭畾鎬?fake provider 涓?fake tools銆?- 涓?MCP 寤虹珛 stdio/HTTP contract tests銆?- 浣跨敤 Playwright 鎴?Tauri 椹卞姩鏂规瑕嗙洊鍚姩銆佸彂閫佽姹傘€佸伐鍏峰鎵瑰拰鍙栨秷銆?- 璁板綍 run銆乺ound銆乸rovider銆乵odel銆乼ool銆乨uration銆乽sage 鍜?error category銆?- 寮€鍙戞ā寮忔彁渚涘彲瀵煎嚭鐨?trace viewer锛涢粯璁や笉璁板綍瀵嗛挜鍜屽畬鏁存晱鎰熷唴瀹广€?
### 6.9 鏋勫缓銆佸彂甯冧笌鏇存柊

- 淇 npm/Cargo 鐗堟湰鍜岄攣鏂囦欢婕傜Щ銆?- CI 鍒嗕负 format銆乴int銆乼est銆乥uild銆乤udit 鍜?package銆?- 浣跨敤 Dependabot/Renovate 鍒嗙粍鏇存柊锛岀姝㈡棤楠岃瘉鐨勫ぇ鐗堟湰鑷姩鍚堝苟銆?- 澧炲姞 Tauri updater锛屽苟浣跨敤绛惧悕鐨?GitHub Release 鍏冩暟鎹€?- 鍙戝竷鐭╅樀浠ュ疄闄呮敮鎸佺殑骞冲彴涓哄噯锛涙枃妗ｅ拰 CI 淇濇寔涓€鑷淬€?- 鐢熸垚 SBOM銆佸彉鏇存棩蹇楀拰鍙洖婊氬彂甯冭鏄庛€?
## 7. 鍒嗛樁娈靛疄鏂?
### Phase 0锛氬熀绾夸笌鍐崇瓥璁板綍

鐩爣锛氬湪鏀瑰彉琛屼负鍓嶅缓绔嬪彲淇″熀绾裤€?
- [x] 淇 `Cargo.lock` 椤圭洰鐗堟湰涓嶄竴鑷淬€?- [x] 鍥哄畾 Node銆乶pm 鍜?Rust toolchain 鐗堟湰銆?- [x] 澧炲姞 format銆乴int銆乼est銆乧heck 鑴氭湰銆?- [x] 涓虹幇鏈夋牳蹇冪敤鎴疯矾寰勫綍鍒跺啋鐑熺敤渚嬨€?- [x] 寤虹珛 ADR锛氳繍琛屾椂浣嶇疆銆丮CP SDK銆丼QLite銆佸嚟鎹簱鍜屼簨浠跺崗璁€?- [x] 寤虹珛渚濊禆涓庡畨鍏ㄦ紡娲炴竻鍗曘€?
楠屾敹锛氬共鍑€鐜涓彲浣跨敤閿佹枃浠跺畬鎴?Web 涓?Rust 鏋勫缓锛孋I 鑳界ǔ瀹氬鐜般€?
### Phase 1锛氬畨鍏ㄤ笌渚涘簲閾炬不鐞?
鐩爣锛氬厛鏀剁揣鐜版湁浜у搧鐨勯闄╅潰銆?
- [x] 閰嶇疆 CSP 鍜屾渶灏?Tauri capabilities銆?- [x] 杩佺Щ API Key 鑷崇郴缁熷嚟鎹簱銆?- [x] 闄愬埗缃戠粶浠ｇ悊鎺ュ彛鍜?MCP 杩涚▼鍚姩銆?- [x] 鍥哄畾 runtime/bridge 鐗堟湰锛岀Щ闄よ繍琛屾椂 `@latest`銆?- [x] 淇鐢熶骇渚濊禆瀹夊叏婕忔礊銆?
楠屾敹锛氬畨鍏ㄦ鏌ユ棤 critical/high 婕忔礊锛涘墠绔棤娉曠洿鎺ヨ幏寰楀瘑閽ユ垨浠绘剰鎵ц鍛戒护銆?
### Phase 2锛氫簨浠跺崗璁笌鏂?UI 澶栧３

鐩爣锛氬厛绋冲畾鍓嶅悗绔竟鐣岋紝涓鸿繍琛屾椂鏇挎崲鍒涢€犳潯浠躲€?
- [x] 瀹氫箟骞剁増鏈寲 `AgentEvent`銆乣ToolCall`銆乣ToolResult` 鍜?`AgentError`銆?- [x] 寤虹珛 Tauri 娴佸紡浜嬩欢閫氶亾鍜屽墠绔?reducer/store銆?- [x] 澧炲姞 AI Elements 鍩虹缁勪欢涓?Gaia 涓婚銆?- [x] 瀹屾垚娑堟伅銆佸伐鍏风姸鎬併€佸鎵广€佸彇娑堝拰閿欒 UI 鍨傜洿鍒囩墖銆?- [x] 閫氳繃閫傞厤鍣ㄥ吋瀹规棫 ReAct Runtime銆?
楠屾敹锛氭棫杩愯鏃跺彲閫氳繃鏂颁簨浠跺崗璁┍鍔ㄦ柊 UI锛屼富瑕佺敤鎴疯矾寰勬棤鍔熻兘鍥為€€銆?
### Phase 3锛歅rovider Adapter 涓?Agent Runtime

鐩爣锛氭浛鎹㈡枃鏈崗璁拰鑴嗗急鐨勫墠绔?ReAct 寰幆銆?
- [x] 瀹炵幇鍚庣 Agent 鐘舵€佹満銆?- [x] 鎺ュ叆 OpenAI Responses 鍜?OpenAI-compatible adapter銆?- [x] 鎺ュ叆 Anthropic 涓?Ollama adapter銆?- [x] 鏀寔鍘熺敓宸ュ叿璋冪敤銆佸彇娑堛€佽秴鏃躲€侀绠楀拰缁熶竴閿欒銆?- [x] 寤虹珛鏃?鏂?Runtime 琛屼负瀵圭収娴嬭瘯銆?
楠屾敹锛氭牳蹇?GIS 鍦烘櫙閫氳繃纭畾鎬ф祴璇曪紱涓嶅啀渚濊禆妯″瀷杈撳嚭鏂囨湰 JSON 鎵ц宸ュ叿銆?
### Phase 4锛氭爣鍑?MCP Host

鐩爣锛氳幏寰楀彲鎸佺画鐨?MCP 鍏煎鎬с€?
- [x] 鐢?SDK 鏇挎崲鎵嬪啓瀹㈡埛绔€?- [x] 鏀寔 stdio 涓?Streamable HTTP銆?- [x] 鏀寔杩涘害銆佸彇娑堛€佸姩鎬佸伐鍏峰垪琛ㄥ拰鍋ュ悍鐘舵€併€?- [x] 澧炲姞 OAuth/elicitation 鍩虹鐣岄潰涓庡畨鍏ㄧ瓥鐣ャ€?- [x] 寤虹珛 MCP Inspector/contract 娴嬭瘯娴佺▼銆?
楠屾敹锛氳嚦灏戜竴涓湰鍦板拰涓€涓繙绋?MCP 鏈嶅姟閫氳繃瀹屾暣鐢熷懡鍛ㄦ湡娴嬭瘯銆?
### Phase 5锛歋cene Adapter 涓庣┖闂磋祫浜?
鐩爣锛氳 Agent 鑾峰緱鐪熷疄銆佸彲鎭㈠鐨勫満鏅姸鎬併€?
- [x] 寤虹珛鍛戒护鍏宠仈鍜屽彲闈犲畬鎴愪簨浠躲€?- [x] 瀹炵幇鍦烘櫙蹇収涓庡閲?patch銆?- [x] 寤虹珛绌洪棿璧勪骇娉ㄥ唽琛ㄥ拰缁撴灉寮曠敤銆?- [x] 鍗囩骇 Cesium 宸ュ叿閾惧苟楠岃瘉澶у瀷鏁版嵁鎬ц兘銆?- [x] 鍒犻櫎鍥哄畾绛夊緟鍜屼粠宸ュ叿鍙傛暟鎺ㄦ柇鍦烘櫙鐨勬棫閫昏緫銆?
楠屾敹锛氶暱鑰楁椂 GIS 鎿嶄綔鍙拷韪€佸彲鍙栨秷锛涘簲鐢ㄦ仮澶嶅悗鑳介噸寤烘渶杩戠ǔ瀹氬満鏅€?
### Phase 6锛氫細璇濇寔涔呭寲銆佸彲瑙傛祴鎬т笌鍙戝竷

鐩爣锛氳揪鍒板彲鍏紑绋冲畾鍙戝竷鐨勫伐绋嬭川閲忋€?
- [x] SQLite 浼氳瘽涓?trace 鎸佷箙鍖栥€?- [x] Trace viewer銆佺敤閲忕粺璁″拰璇婃柇瀵煎嚭銆?- [x] 瀹屾垚绔埌绔祴璇曠煩闃点€?- [x] 閰嶇疆绛惧悕鏇存柊銆丼BOM 鍜屽彂甯冨洖婊氭柟妗堛€?- [x] 鍒犻櫎 Legacy Runtime 鍜屽簾寮冨吋瀹逛唬鐮併€?
楠屾敹锛氭弧瓒?1.0 鍙戝竷妫€鏌ヨ〃锛岃繛缁涓€欓€夌増鏈棤闃绘柇绾у洖褰掋€?
## 8. 娴嬭瘯鐭╅樀

| 鍦烘櫙 | 棰勬湡 |
|---|---|
| 鍗曟瀹氫綅 | 涓€娆″伐鍏疯皟鐢ㄥ畬鎴愶紝鍦烘櫙蹇収姝ｇ‘ |
| 鍦扮悊缂栫爜鍚庢坊鍔犳爣璁?| 鍚庝竴姝ヤ娇鐢ㄥ墠涓€姝ョ粨鏋勫寲缁撴灉 |
| 宸ュ叿鍙傛暟鏃犳晥 | 妯″瀷鑾峰緱缁撴瀯鍖栭敊璇苟鍙慨姝?|
| 楂橀闄?MCP 宸ュ叿 | 鎵ц鍓嶅嚭鐜版潵婧愩€佸弬鏁板拰椋庨櫓瀹℃壒 |
| 鐢ㄦ埛鍙栨秷 | 妯″瀷娴併€佸伐鍏疯皟鐢ㄥ拰 UI 鐘舵€佸潎鍋滄 |
| MCP 鏈嶅姟宕╂簝 | 杩涚▼琚洖鏀讹紝鐘舵€佸彲瑙侊紝鍙墜鍔ㄩ噸杩?|
| 缃戠粶涓柇 | 閿欒鍒嗙被鍑嗙‘锛屼笉娉勯湶鍑嵁锛屽彲閲嶈瘯 |
| 搴旂敤閲嶅惎 | 浼氳瘽鍜屾渶杩戠ǔ瀹氬満鏅彲鎭㈠ |
| 澶у瀷 GeoJSON/MVT | UI 涓嶉樆濉烇紝鍐呭瓨鍜屾覆鏌撴寚鏍囧浜庨绠楀唴 |
| 鏃фā鍨嬬己灏戝伐鍏疯皟鐢?| 鏄庣‘闄嶇骇鎴栨嫆缁濓紝涓嶈В鏋愪笉鍙俊鏂囨湰鎵ц |

## 9. 瀹屾垚瀹氫箟

涓€涓樁娈靛彧鏈夊湪浠ヤ笅鏉′欢鍏ㄩ儴婊¤冻鏃舵墠绠楀畬鎴愶細

- 浠ｇ爜銆佹祴璇曞拰杩佺Щ璇存槑鍚屾椂鎻愪氦銆?- 鏂板鍏叡鍗忚鏈夌増鏈拰鍏煎绛栫暐銆?- 瀹夊叏鏉冮檺娌℃湁鏃犺鏄庢墿澶с€?- 鏋勫缓銆乴int銆佹祴璇曞拰瀹¤鍏ㄩ儴閫氳繃銆?- 鍏抽敭浜や簰缁忚繃鏄庢殫涓婚銆侀敭鐩樻搷浣滃拰閿欒鐘舵€侀獙璇併€?- 鏂囨。涓殑鏋舵瀯銆侀厤缃€佹敮鎸佸钩鍙颁笌瀹為檯瀹炵幇涓€鑷淬€?- 鏈夋槑纭洖婊氳矾寰勶紝鏃у疄鐜颁粎鍦ㄨ縼绉荤獥鍙ｅ唴淇濈暀銆?
## 10. 椋庨櫓涓庣紦瑙?
| 椋庨櫓 | 缂撹В鎺柦 |
|---|---|
| 鍚屾椂鏀?UI 鍜?Runtime 瀵艰嚧鍥炲綊闅惧畾浣?| 鍏堝畾涔変簨浠跺崗璁紝浠ユ棫 Runtime 椹卞姩鏂?UI |
| 澶氫緵搴斿晢鑳藉姏宸紓鎵╁ぇ鎶借薄澶嶆潅搴?| capability-driven adapter锛屽厑璁告樉寮忛檷绾?|
| MCP 瑙勮寖缁х画婕旇繘 | 閲囩敤 SDK銆佸崗璁崗鍟嗗拰 contract tests |
| Cesium 鐘舵€佷笌 Agent 鐘舵€佹紓绉?| Scene Adapter 涓哄敮涓€浜嬪疄鏉ユ簮锛屼娇鐢ㄥ揩鐓ф牎楠?|
| 杩佺Щ鏈熼噸澶嶄唬鐮佸鍔?| feature flag 璁剧疆鍒犻櫎鏃ユ湡鍜岄€€鍑烘潯浠?|
| 瀹夊叏鏀剁揣鐮村潖鐜版湁鍔熻兘 | 寤虹珛鏉冮檺娓呭崟涓庣鍒扮鐢ㄤ緥鍚庨€愰」缂╂潈 |
| 澶х増鏈崌绾у彔鍔犻闄?| 琛屼负閲嶆瀯涓庢鏋跺ぇ鐗堟湰鍗囩骇鍒嗘壒杩涜 |

## 11. 鎺ㄨ崘鐨勯涓凯浠?
棣栦釜杩唬鍙鐞?Phase 0锛屼笉绔嬪嵆寮曞叆鏂版鏋讹細

1. 淇鐗堟湰涓庨攣鏂囦欢銆?2. 琛ラ綈 lint銆乫ormat銆乼est銆乧heck 鍛戒护鍜?CI銆?3. 涓哄洓鏉℃牳蹇?GIS 浠诲姟寤虹珛 fake provider 鍥炲綊娴嬭瘯銆?4. 杈撳嚭 AgentEvent 涓?ToolCall ADR 鑽夋銆?5. 寤虹珛瀹夊叏濞佽儊妯″瀷鍜屾潈闄愭竻鍗曘€?
瀹屾垚鍚庡啀杩涘叆 AI Elements 鍜屾柊 Runtime 鐨勪唬鐮佽縼绉伙紝鍙互鏄捐憲闄嶄綆鈥滆竟閲嶅啓杈圭寽鏃ц涓衡€濈殑椋庨櫓銆?
## 12. 鍙傝€冭祫鏂?
- [AI Elements](https://elements.ai-sdk.dev/)
- [OpenAI Responses API migration](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Model Context Protocol architecture](https://modelcontextprotocol.io/docs/learn/architecture)
- [MCP transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Tauri security](https://v2.tauri.app/security/)
- [Tauri CSP](https://v2.tauri.app/security/csp/)
- [React 19.2](https://react.dev/blog/2025/10/01/react-19-2)
- [CesiumJS 1.142 release](https://cesium.com/blog/2026/06/01/cesium-releases-in-june-2026/)
