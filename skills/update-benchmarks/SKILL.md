---
name: update-benchmarks
description: 在 llm-benchmark-costco 仓库新增或修改 benchmark 元数据、双语构建与评测流程源，并验证 HTML 展示与确定性重建。用于 benchmark 录入、来源修订和派生产物同步；发布或清理只在用户另有相应要求时执行。
---

# 更新 benchmark 与 HTML 流程源

从代码 checkout 根目录执行命令；CLI 的目标数据根目录可另由 `--root` 指定。先看 `git status -sb`、相关 diff、`package.json` 与适用的项目规则，识别其他任务的改动。仅处理用户指定的 benchmark；已有授权内的可逆本地添加无需再次确认。普通录入不自动创建工作树、更新依赖或发布网站。

## 先形成有来源的内容

1. 在用户授权的数据与访问范围内读取论文原文、官方仓库或数据卡；核对具体版本、revision、节/图/表或文件位置。新来源超出已有授权范围时再解决访问范围，不重复确认已授权阅读。
2. 分别抽取 **数据构建** 与 **运行评测**：输入、筛选/标注、划分/发布，以及任务输入、模型/工具、评分/汇总。只纳入来源实际支持的环节；未公开的信息明确写为边界，不套用通用流程补齐。
3. 保留全部有意义的决策分支、回退、循环、可选路径和边标签。节点用来源支持的语义命名，保留完整说明与换行，不能为缩短图而删去条件或因果关系。来源支持的 repair/retry 循环必须保留；布局卡住或 validator 不兼容应定位实现问题，不能删回边来满足 UI 或校验。
4. EN/ZH 翻译只改可翻译文本；节点、边的 ID、顺序、类型、端点、样式及 module membership 一致。有标签的边两种语言都保留标签。中文描述有对应 `*_en` 时填写英文，英文描述不混入汉字；节点 ID 和无冲突模块归属遵循包格式约束。使用明确的 `construction` / `evaluation` 模块归属表达阶段；未能据来源归类的节点保持 neutral，不按名字或关键词猜测阶段。
5. 对照来源逐项核验图与元数据，完成后才记录实际 `paper_alignment_review`。生成器、结构校验和 HTML audit 通过不能替代这一步。

首次准备输入先读 [包格式与字段约束](references/package.md)。[示例 JSON](assets/benchmark-package.example.json)是含占位内容的 **pending 草稿**，不是可发布 benchmark，也不是可直接导入的通过样例。

## 新增、修订与重建

工具真实入口：`scripts/benchmark_catalog/manage_benchmark.mjs`；字段与派生规则见 `benchmark_package.mjs`。操作前可运行 `node scripts/benchmark_catalog/manage_benchmark.mjs --help`。

CLI 接受 `(--input PACKAGE.json | --update REVIEWED_PACKAGE.json | --rebuild ID) [--root REPO] [--write]`，三个模式互斥，默认 dry-run。选择与任务一致的模式：

| 模式 | 用途 |
|---|---|
| `pnpm benchmark:add --input PACKAGE.json` | 新增已审核 benchmark；完全相同的重复添加为 no-op，不覆盖内容不同的已有 ID |
| `pnpm benchmark:update --update REVIEWED_PACKAGE.json` | 更新已注册且 catalog/manifest/detail 身份一致的同一 ID；metadata 为 patch，evidence 和双语 specs 完整替换 |
| `pnpm benchmark:rebuild --rebuild ID` | 从已有 spec 重建 arch、fallback、已有 generation hash 和 README；不修改 authored spec 或补做审核 |

新增和更新都使用 `benchmark-package/v1`。更新必须显式提供 `benchmark.id`；省略的已有规范元数据保留，清空/关闭用字段允许的 `""`、`[]`、`false`。修改双语描述对中任一项时显式提交另一项，即使另一项内容不变。分类与年份的联动默认、来源派生字段替换和扩展字段保留规则见 [更新语义](references/package.md#更新已有-benchmark)。不要再手工跨 catalog/detail/manifest 同步来源修订，也不需要单次任务的临时录入脚本。

每次先 dry-run，审阅 `changed_files`、`validation` 和更新报告的 `preserved_fields`，再在已有授权内用相同命令加 `--write`。工具在临时完整数据快照上运行真实 Python validator、source gate 与 HTML audit，成功后原子落地 metadata、来源及派生产物。JSON 定点写入保留非目标记录原始字节、位置与转义，不整文件格式化。保留的未知扩展不会自动随新来源更新，需人工核对其是否仍适用。报告中的 `committed` 仅表示文件批次落地；工具不联网、不自动审核或发布。

`--root` 指定目标数据根目录，可为具有 catalog/manifest/detail/spec/arch/README 结构的纯数据副本；校验程序来自运行 CLI 的代码 checkout，包文件路径相对当前工作目录解析。`--root` 不限制 staging 位置，dry-run 也使用 `os.tmpdir()`。用户限定写入边界时，在授权目录下创建 tmp，并对每次 CLI 设置 `TMPDIR`，见 [隔离目录与临时写入](references/package.md#隔离目录与临时写入)。

旧 spec 可缺少 `edge.id`，按边数组顺序补成 `edge-1` 等 ID；恢复或重建保留原边顺序。重建只刷新 manifest 已有 `html_generation`，不补造审核状态。不要手改派生产物来掩盖漂移。

HTML 效果由共享 renderer 控制。保留历史 `client/public/drawio/` 源目录名，但本工作流不生成孤立 HTML 页面，也不要求 `.drawio`、SVG、PNG 或 macOS Desktop 导出。

## 验证与交付

针对同一目标 root 验证完整链路：新增为 `--input` dry-run → `--input --write` → 相同 `--input` dry-run → `--rebuild` dry-run；更新为 `--update` dry-run → `--update --write` → 相同 `--update` dry-run → `--rebuild` dry-run。落地后的两次 dry-run 均应 `changed_files: []`。单独重建也先审阅计划再落地，随后确认重建 no-op。每次保持相同 `--root` 和适用的 `TMPDIR`；失败时定位真实输入/模型/序列化差异，不以生成了文件代替验收。

下面的裸 `pnpm` 测试/构建及未指定 `--root` 的校验针对当前代码 checkout，不会继承上一次 CLI 的 `--root`。完整前端验收优先在包含目标数据的完整隔离 checkout 执行。纯数据副本上的 CLI source/audit/validator 结果只证明数据验收，不能与另一 checkout 的测试或构建合称该副本的完整前端验收。

```bash
pnpm test:benchmark-ingestion
pnpm check:build-process-source
pnpm audit:build-process
python3 scripts/validate_benchmarks.py --html
pnpm test:html-flowchart
pnpm test:build-process
pnpm check
pnpm build:ghpages
git diff --check
```

纯数据副本若需浏览，可在授权的独立预览目录中组合已构建 `dist/public`（Pages 构建则为 `dist-ghpages`）的静态代码和目标 root 的 `client/public` 数据；遵循构建的 base 路径，核对请求确实读取目标数据。此结果记为“指定代码版本＋目标数据”的隔离预览，不替代完整隔离 checkout 的前端测试/构建。不需要新造脚本或拷贝依赖。

`test:build-process` 包含前端回归。图有新来源语义时补充有针对性的来源/拓扑断言，网站测试不得因旧导出缺失而跳过这些断言。完成相关页面的双语、换行、阶段归属和分支展示检查；明确未完成的视觉检查。相同输入/版本的检查已由本轮其他任务完成时核对证据，避免无理由重跑。

交付报告包含 ID、精确来源/审核依据、改动文件、保留扩展字段的复核、重复添加/更新与重建结果、实际验证及未确认边界。测试数量用当前运行证据，不复用历史数值。已审核条目的隔离恢复验证沿用原有审核证据，清楚区分恢复/重建验证与新的论文审核。

- 用户要求发布时再读 [发布与部署](references/release.md)；本 Skill 不授予提交、推送、PR、合并或部署权限。
- 用户明确要求分支/工作树清理时再读 [清理路由](references/cleanup.md)。普通新增、重建及发布完成不会自动触发清理；Dependabot 属于独立任务。
