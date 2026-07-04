# ADR 0003锛氫娇鐢?rmcp 鏋勫缓 MCP Host

鐘舵€侊細宸叉帴鍙?
鏃ユ湡锛?026-07-01

## 鑳屾櫙

鏃?MCP 瀹㈡埛绔嚜琛岀淮鎶?stdio銆丣SON-RPC framing銆佸垵濮嬪寲鎻℃墜銆佸垎椤典笌宸ュ叿璋冪敤銆傚崗璁户缁紨杩涙椂锛岃繖浼氳鍏煎鎬с€佸畨鍏ㄨ竟鐣屽拰鐢熷懡鍛ㄦ湡澶勭悊閫愭笎鍋忕瑙勮寖銆?
## 鍐崇瓥

閲囩敤瀹樻柟 Rust SDK `rmcp` 2.x 浣滀负 MCP Host 鐨勫崗璁疄鐜帮紝骞跺叧闂粯璁ょ壒鎬с€佹寜闇€鍚敤浼犺緭锛?
- 褰撳墠鍚敤 `client` 涓?`transport-child-process`锛岃礋璐ｆ湰鍦?stdio 鐢熷懡鍛ㄦ湡銆佽兘鍔涘崗鍟嗐€佸伐鍏峰垎椤靛拰璋冪敤銆?- 淇濈暀 GaiaAgent 鑷繁鐨勫惎鍔ㄥ櫒鐧藉悕鍗曘€佸弬鏁板拰鐜鏍￠獙锛汼DK 璐熻矗鍗忚锛屼笉鏇夸唬 Host 鐨勬巿鏉冪瓥鐣ャ€?- 涓嬩竴姝ラ€氳繃 SDK 鐨?Streamable HTTP client transport 鎺ュ叆杩滅▼鏈嶅姟銆?- UI銆丄gent Runtime 鍜屽伐鍏风瓥鐣ュ彧娑堣垂 GaiaAgent 鐨勫唴閮ㄧ被鍨嬶紝涓嶇洿鎺ヤ緷璧?SDK model銆?
## 缁撴灉

- 鍒犻櫎鎵嬪啓 JSON-RPC 璇锋眰 ID銆佽鍐欏惊鐜拰鍒濆鍖栨秷鎭鐞嗐€?- 鏈嶅姟鍏抽棴浜ょ敱 `RunningService::close`锛屽瓙杩涚▼浠嶈缃?`kill_on_drop` 浣滀负鍏滃簳銆?- SDK 鍗囩骇闇€瑕侀€氳繃鏈湴涓庤繙绋?MCP contract tests锛涘湪杩欎簺娴嬭瘯寤烘垚鍓嶏紝Phase 4 浠嶆湭瀹屾垚銆?
## 闈炵洰鏍?
- 鏈?ADR 涓嶆巿浜?MCP 宸ュ叿鎵ц鏉冮檺銆?- 鏈?ADR 涓嶆妸 server 澹版槑鐨勯闄╃骇鍒涓哄彲淇℃巿鏉冧緷鎹€?- OAuth銆乪licitation銆佸姩鎬佸伐鍏锋洿鏂板拰鍋ュ悍鐘舵€佺敱 Phase 4 Host 灞傚疄鐜帮紱OAuth 鍑嵁鐢辩郴缁熷嚟鎹簱鎸佷箙鍖栵紝elicitation 鍙兘缁忓彲淇?UI 鏄惧紡澶勭悊銆?
