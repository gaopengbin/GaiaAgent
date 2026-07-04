# GaiaAgent 濞佽儊妯″瀷涓庢潈闄愭竻鍗?
> 鐘舵€侊細Phase 0 baseline
> 鏇存柊鏃ユ湡锛?026-06-30

## 1. 淇濇姢瀵硅薄

- 妯″瀷 API Key銆丱Auth token銆佸湴鍥炬湇鍔?token銆?- 鐢ㄦ埛鐨勬湰鏈烘枃浠躲€佽繘绋嬨€佺綉缁滆闂兘鍔涘拰绯荤粺閰嶇疆銆?- MCP 鏈嶅姟鑾峰緱鐨勬暟鎹笌鎵ц鏉冮檺銆?- 瀵硅瘽銆佺┖闂存暟鎹€佸満鏅揩鐓у拰宸ュ叿缁撴灉銆?- 鍙戝竷鍖呫€佽嚜鍔ㄦ洿鏂板厓鏁版嵁鍜屼緷璧栦緵搴旈摼銆?
## 2. 淇′换杈圭晫

| 杈圭晫 | 杈冧綆淇′换渚?| 杈冮珮鏉冮檺渚?|
|---|---|---|
| Tauri IPC | React/WebView | Rust Core |
| 妯″瀷璋冪敤 | 妯″瀷杈撳嚭 | Agent Runtime / Tool Executor |
| MCP | 绗笁鏂?MCP server | GaiaAgent Host |
| Cesium bridge | 椤甸潰涓?bridge 娑堟伅 | 鍦烘櫙淇敼鑳藉姏 |
| 缃戠粶 | 杩滅▼ API 鍝嶅簲 | 鏈湴浼氳瘽涓庤祫浜?|
| 鏇存柊 | 鍙戝竷鏈嶅姟鍣ㄤ笌涓嬭浇鍐呭 | 宸插畨瑁呭簲鐢?|

浠讳綍璺ㄨ竟鐣岃緭鍏ラ兘蹇呴』琚涓轰笉鍙俊鏁版嵁銆傛ā鍨嬭緭鍑哄拰 MCP 宸ュ叿鎻忚堪涓嶆槸鎺堟潈渚濇嵁銆?
## 3. 褰撳墠鏉冮檺娓呭崟

### WebView 鍙Е杈剧殑 Tauri 鑳藉姏

- `core:default`
- 绐楀彛鏈€灏忓寲銆佹渶澶у寲銆佸叧闂笌鎷栧姩

涓荤獥鍙ｄ笉鍐嶆嫢鏈?shell 鎴栨枃浠剁郴缁熸彃浠舵潈闄愩€傝繘绋嬩笌閰嶇疆鏂囦欢鎿嶄綔浠呰兘閫氳繃鍙楅獙璇佺殑 Rust 鍛戒护瀹屾垚銆?
### Rust 鍛戒护

- 妯″瀷 HTTP 璇锋眰涓庢祦寮忚姹傦細浠呭厑璁稿綋鍓?provider 鍩哄潃涓嬬殑 JSON POST锛汻ust 娉ㄥ叆鍑嵁銆?- 妯″瀷璁剧疆璇诲啓锛歴ecret 浣跨敤绯荤粺鍑嵁搴擄紝鏅€?JSON 涓嶅啀搴忓垪鍖?secret銆?- Cesium runtime 鍚姩涓庡伐鍏疯皟鐢ㄣ€?- MCP server 鍚仠銆侀厤缃€佹秷鎭拰宸ュ叿璋冪敤銆?
### 澶栭儴杩涚▼

- Cesium runtime 閫氳繃 `npx --no-install cesium-mcp-runtime` 浣跨敤閿佸畾鐨勬湰鍦颁緷璧栥€?- MCP server 鍏佽 `npx`銆乣node`銆乣python`銆乣uv`銆乣bun`銆乣deno` 绛夊惎鍔ㄥ櫒銆?
MCP 鍚姩鍣ㄥ繀椤讳娇鐢ㄨ８鍛戒护鍚嶏紱鍙傛暟绂佹 shell 鍏冨瓧绗﹀拰鎹㈣锛涘瓙杩涚▼鍙户鎵挎渶灏忕郴缁熺幆澧冿紝骞堕樆鏂父瑙佽繍琛屾椂娉ㄥ叆鍙橀噺銆傚伐鍏风骇鐢ㄦ埛瀹℃壒浠嶇敱鍚庣画 Policy Engine 瀹炵幇銆?
杩滅▼ MCP 浠呮帴鍙?HTTPS锛涗负鏈湴寮€鍙戜繚鐣欑殑鏄庢枃 HTTP 鍙厑璁?`localhost` 鎴栧洖鐜?IP銆俇RL 涓嶅厑璁稿唴宓屽嚟鎹垨 fragment锛岃繙绋嬭璇佹潗鏂欏繀椤昏繘鍏ョ郴缁熷嚟鎹簱锛岃€屼笉鏄?MCP 閰嶇疆鏂囦欢銆?
MCP OAuth 浣跨敤 SDK 鐨?Authorization Code + PKCE 娴佺▼銆傚埛鏂颁护鐗屽拰璁块棶浠ょ墝浠呭簭鍒楀寲鍒版搷浣滅郴缁熷嚟鎹簱锛涢厤缃枃浠跺彧淇濆瓨璁よ瘉妯″紡鍜?scope銆傚洖璋冨繀椤荤簿纭尮閰?GaiaAgent 鍥哄畾鐨勫洖鐜?redirect URI锛孲DK 璐熻矗鏍￠獙 CSRF state銆乮ssuer 涓庡彈淇濇姢璧勬簮鍏冩暟鎹€侽Auth 鎺堟潈閾炬帴蹇呴』鐢辩敤鎴锋樉寮忔墦寮€銆?
MCP elicitation 涓€寰嬭涓虹涓夋柟杈撳叆锛氫笉浼氳嚜鍔ㄦ帴鍙楁垨鑷姩鎵撳紑 URL锛沀RL 鍙厑璁?HTTPS锛堟湰鏈哄紑鍙戝彲鐢ㄥ洖鐜?HTTP锛夛紝鐣岄潰灞曠ず鏈嶅姟鏉ユ簮骞惰鍛婁笉寰楁彁浜ゅ瘑閽ャ€侶ost 鏈€澶氬悓鏃朵繚鐣?16 涓姹傦紝120 绉掕嚜鍔ㄦ嫆缁濓紝琛ㄥ崟鍝嶅簲蹇呴』鏄皬浜?64 KiB 鐨?JSON 瀵硅薄銆?
## 4. 涓昏濞佽儊

| ID | 濞佽儊 | 褰撳墠璇佹嵁 | 浼樺厛绾?| 璁″垝鎺у埗 |
|---|---|---|---|---|
| T1 | WebView 琚敞鍏ュ悗璋冪敤鏈満鑳藉姏 | 宸插惎鐢?CSP 骞剁Щ闄?WebView shell/fs 鏉冮檺 | P0 | 鎸佺画楠岃瘉鏈€灏?capabilities |
| T2 | SSRF 鎴栦换鎰忕綉缁滀唬鐞?| 宸查檺鍒?provider origin/path銆佽姹傜被鍨嬨€侀噸瀹氬悜鍜屽ぇ灏?| P0 | 鍚庣画 provider adapter 鍙栦唬閫氱敤浠ｇ悊 |
| T3 | API Key 鏄庢枃娉勯湶 | secret 宸茶縼绉荤郴缁熷嚟鎹簱涓旇烦杩?JSON 搴忓垪鍖?| P0 | 澧炲姞鏄惧紡鍑嵁绠＄悊鐣岄潰 |
| T4 | 渚涘簲閾捐繙绋嬩唬鐮佹墽琛?| runtime/bridge 宸查攣瀹氫笖绂佹鍦ㄧ嚎瀹夎 | P0 | 鍚庣画闅忓簲鐢ㄦ墦鍖呭苟鏍￠獙浜х墿 |
| T5 | 鎭舵剰 MCP server 鎵ц涓庢暟鎹浼?| 宸查檺鍒跺惎鍔ㄥ櫒銆佸弬鏁颁笌缁ф壙鐜 | P0 | 鏈嶅姟鎺堟潈鍜屽伐鍏峰鎵?|
| T6 | Prompt injection 璇卞楂橀闄╁伐鍏?| 褰撳墠娌℃湁缁熶竴绛栫暐灞?| P0 | 椋庨櫓鏍囩銆丳olicy Engine銆佺敤鎴峰鎵?|
| T7 | 宸ュ叿缁撴灉鎴栨棩蹇楁硠闇叉晱鎰熸暟鎹?| 鏃犵粺涓€鑴辨晱鍜屼繚鐣欑瓥鐣?| P1 | 缁撴瀯鍖栨棩蹇楄繃婊ゃ€佹暟鎹繚鐣欒缃?|
| T8 | Bridge 娑堟伅閿欓厤鎴栦吉閫犲畬鎴?| 浠ユ柟娉曞悕鍜屾椂闂寸瓑寰呭叧鑱?| P1 | `callId`銆乻chema 鏍￠獙銆佹潵婧愭牎楠?|
| T9 | 鏇存柊鍖呰绡℃敼 | 鏈惎鐢?updater 绛惧悕娴佺▼ | P1 | 绛惧悕鏇存柊銆佹牎楠屻€佸洖婊?|
| T10 | 渚濊禆婕忔礊 | npm audit 宸插彂鐜伴珮椋庨櫓浼犻€掍緷璧?| P0 | 鍏煎鍗囩骇銆佸璁￠棬绂併€丼BOM |

## 5. 宸ュ叿椋庨櫓绾у埆

| 绾у埆 | 绀轰緥 | 榛樿绛栫暐 |
|---|---|---|
| Read | 鏌ヨ鐩告満銆佸垪鍑哄浘灞傘€佽鍙栧叕寮€鏁版嵁 | 鑷姩鍏佽骞惰褰?|
| Scene Write | 绉诲姩鐩告満銆佹坊鍔犲疄浣撱€佷慨鏀瑰浘灞?| 褰撳墠浼氳瘽鍏佽锛屽彲鎾ら攢浼樺厛 |
| Network | 璇锋眰绗笁鏂?API銆佷笂浼犲唴瀹?| 棣栨鎸夋潵婧愭壒鍑?|
| Filesystem | 璇诲啓鐢ㄦ埛鏂囦欢 | 绮剧‘璺緞瀹℃壒 |
| Process | 鍚姩鍛戒护銆佸畨瑁呮垨杩愯鍖?| 姣忔瀹℃壒锛岄粯璁ゆ嫆缁濇湭鐭ユ潵婧?|

椋庨櫓鍒ゆ柇蹇呴』鐢卞彲淇?Host 鏍规嵁宸ュ叿鏉ユ簮銆佸０鏄庡拰瀹為檯鍙傛暟鍏卞悓璁＄畻锛屼笉鑳藉彧鐩镐俊 MCP server 鎻愪緵鐨勬弿杩般€?
## 6. Phase 1 瀹夊叏楠屾敹

- [x] Tauri CSP 涓嶅啀涓?`null`锛岀敓浜ф瀯寤烘棤涓嶅繀瑕佺殑杩滅▼鑴氭湰鏉ユ簮銆?- [x] 涓?WebView 涓嶅叿澶囧娉?`shell:allow-execute` 鍜?`fs:default`銆?- [x] API Key 涓嶅啀淇濆瓨鍦ㄦ櫘閫?JSON锛屾棩蹇椾腑涓嶅彲瑙併€?- [x] 妯″瀷浠ｇ悊鍙闂樉寮忛厤缃笖楠岃瘉杩囩殑 provider endpoint銆?- [x] Cesium runtime 浣跨敤鍥哄畾鐗堟湰鎴栭殢搴旂敤鍒嗗彂銆?- [x] MCP server 鍚姩閰嶇疆鍏峰鏉ユ簮銆佸弬鏁板拰鐜闄愬埗銆?- [ ] 楂橀闄╁伐鍏疯皟鐢ㄥ彲琚嫆缁濄€佸彇娑堜笖鏈夊璁′簨浠躲€?- [x] 鐢熶骇渚濊禆涓嶅瓨鍦?critical/high 宸茬煡婕忔礊銆?# Native Agent Runtime controls

- Provider credentials are read from the operating-system credential store by the Rust backend and are never returned to the WebView.
- Native tool calls are schema-derived provider objects; malformed call IDs, names, or argument objects are rejected before execution.
- Destructive, network, filesystem, and process-like operations pause at a backend approval gate.
- Each run has round, tool-call, token, and wall-clock tool limits plus a cancellation token.
