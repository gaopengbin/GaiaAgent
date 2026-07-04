# GaiaAgent 发布、签名、SBOM 与回滚 Runbook

## 发布前检查

1. 确认版本号同步：
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
2. 运行质量门禁：
   - `npm run check:web`
   - `cargo test --manifest-path src-tauri/Cargo.toml`
   - `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
   - `npm run sbom`
   - `git diff --check`
3. 完成 `docs/testing/e2e-matrix.md` 中的候选版本手工 E2E。
4. 确认 GitHub Actions secrets 已配置：
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

## 发布流程

1. 创建候选 tag，例如 `v0.3.0-rc.1`，等待 release workflow 完成。
2. 下载并抽查各平台 artifact 与 `sbom-*` artifacts。
3. 如果 RC 通过，创建正式 tag，例如 `v0.3.0`。
4. Release workflow 会：
   - 安装锁定依赖；
   - 校验 tag 发布所需签名 secret；
   - 生成 npm CycloneDX SBOM 与 Cargo metadata；
   - 构建 Tauri 平台包；
   - 为 tag 创建 GitHub Release。

## SBOM

`npm run sbom` 输出：

- `dist/sbom/npm-cyclonedx.json`
- `dist/sbom/cargo-metadata.json`

发布时将它们作为 workflow artifact 保存；正式发版后应附加到 GitHub Release 或归档到内部制品库。

## 回滚策略

| 情况 | 动作 |
| --- | --- |
| 构建失败 | 不发布 release；修复后重新打 RC tag |
| RC 发现阻断缺陷 | 删除或标记失败 RC；修复后递增 RC tag |
| 正式 release 已发布但未推广 | 将 GitHub Release 标记为 prerelease 或撤稿；公告使用上一稳定版本 |
| 正式 release 已推广 | 发布 hotfix tag；如 updater 已启用，指向上一稳定版本或 hotfix 版本 |

回滚时必须保留失败版本的 trace、日志、SBOM 和 commit SHA，用于缺陷复盘。

## 签名与 updater 说明

当前 workflow 已在 tag 发布前强制检查 Tauri 签名 secret，但 `tauri.conf.json` 尚未启用 updater 端点。启用自动更新前需要补齐：

- updater plugin 与 public key；
- 平台签名/公证策略；
- release metadata 托管地址；
- 一次从旧版本到新版本、再回滚到稳定版本的 updater E2E。
