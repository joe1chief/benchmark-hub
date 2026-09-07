# 条件发布与部署

仅在用户要求相应外部操作时读取并执行。新增 benchmark 或本地 `--write` 不自动授权 Git commit/push、创建 PR、合并或部署；已有明确授权覆盖的步骤无需重复确认。缺少下一步授权时，先完成本地内容、验证与可审阅 diff，报告具体待执行动作；不要把本参考当作授权。

1. 检查当前工作区、分支、远端和 PR；保护无关改动，使用明确路径暂存，不 `git add .`。只有本次发布需要时才读取远端状态，不把 fetch/PR 枚举作为普通录入前置条件。
2. 在已授权范围内提交、推送 topic branch、创建面向 `main` 的 PR；普通流程不直接推 main，也不运行独立 `gh-pages` 发布命令。核对远端 topic SHA 等于本地提交。
3. 从当前 `.github/workflows/ci.yml`、`deploy.yml` 及仓库规则确认必需检查。网站路径使用 source、HTML audit、数据/前端回归及 Pages build；旧 Draw.io/macOS fidelity 是独立可选流程，不把历史 macOS 分片要求移植为网站发布前置条件。若当前保护规则另有要求，按实际规则核对，不自行削弱规则。
4. 合并前核对 PR head SHA 和对应 required checks；分支更新后旧绿色运行不能证明新提交通过。不使用 admin merge 或取消检查绕过失败；merge 本身需要对应授权。
5. 合并后核对实际 merge/squash SHA 在远端 main，查看该 SHA 的 CI 和 Pages workflow 结果，再核对线上 URL 与本次 benchmark。工作流名称、触发方式和部署目录以当前文件为准，不硬编码旧流程假设。

| 可报告状态 | 所需证据 |
|---|---|
| 本地完成 | 本次 diff、幂等与重建检查、实际测试结果 |
| 已推送 | 远端 topic SHA 与本地提交一致 |
| 已合并 | PR 为 MERGED，结果提交在远端 main |
| CI 通过 | 目标 SHA 的 required checks 全部成功；skipped/neutral 不冒充成功 |
| 已部署 | 部署运行成功且对应目标 source SHA，线上条目核验通过 |

源提交 SHA 与部署产物分支 SHA 可以不同，核对它们的关联。构建通过不等于部署完成。发布结束不触发工作树清理；依赖/Dependabot PR 仅在用户明确要求处理时进入独立任务，不能随 benchmark PR 顺带合并。
