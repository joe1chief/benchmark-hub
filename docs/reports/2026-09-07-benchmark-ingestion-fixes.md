# benchmark 录入 Skill 修复与验收（2026-09-07）

本次完成上一轮评审提出的三项修复：保留非目标 JSON 原始字节、统一已有条目的更新入口、补充此前未收录 benchmark 的独立真实录入测试。修复后的 Skill 已通过本地新增、更新和重建链路的验收。来源语义仍需逐项审核，自动检查不替代论文/源码审阅。

本次修改真实 checkout 的录入工具、测试及说明；真实数据目录保持 610 条，全部数据文件相对本轮开始的快照不变。CRMArena-Pro 仅加入独立完整 checkout，形成 611 条测试状态。没有执行 Git 提交、推送、PR、合并或部署。

## 三项修复

| 原问题 | 最终行为 | 主要位置 |
|---|---|---|
| 聚合 JSON 整文件重排，造成无关 diff | 新增只插入必要内容；更新只替换目标对象；其他记录、顺序、空白与 Unicode 转义保持原始字节。语义相同的目标记录直接返回原文 | scripts/benchmark_catalog/json_records.mjs |
| 修改已有 benchmark 需要临时跨文件脚本 | 统一 `benchmark:update --update REVIEWED_PACKAGE.json`；metadata 使用 patch，evidence 与 EN/ZH spec 完整替换；同一套 staging 校验与原子落地同步 catalog/detail/manifest/spec/arch | scripts/benchmark_catalog/manage_benchmark.mjs、benchmark_package.mjs |
| 只有旧条目恢复测试，未验证真正的新录入 | 无前序上下文的独立代理依据 Skill、原始论文及固定官方源码准备 CRMArena-Pro，先完成首次新增，再接受来源与页面集成复核 | 隔离测试及证据目录见下文 |

更新时，省略的规范元数据保留；显式空字符串、空数组或 false 按字段约束清空/关闭。双语描述对改动要求同时提交。旧来源派生字段整体更新，未知扩展保留并在 `preserved_fields` 报告中列出，供人工确认。

独立代码复查额外复现了一个缺陷：若规范元数据只存在于 detail，第一次实现会以 catalog 的缺省值覆盖。最终实现分别以 catalog、detail 各自的已有记录为基线；只有 detail 缺失的字段才继承 catalog。已通过公开 CLI 复现、修复后的独立复查以及针对性的回归测试，覆盖保留、显式清空和缺失继承。

## 旧条目更新回放

在隔离数据副本恢复 AutomationBench 的旧数据后，使用已有审核包走统一更新入口：

- dry-run 与 write 均为 7 个目标文件。
- 重复 update、随后 rebuild 均为 `changed_files: []`。
- 主代理使用独立 JSON 解码与字节比较确认：两份聚合 JSON 中，其余 609 条对象、顺序及非目标原始字节完全一致。
- 目标元数据与四份图源/产物吻合本轮之前已审核的当前版本；没有重新声称完成一次新的论文审核。

证据：`update-replay-checks.json`、`update-independent-proof.json` 和 `update-*.stdout.json`。

## 真正新增的独立验证

选择 [CRMArena-Pro v1 论文](https://arxiv.org/html/2505.18878v1) 与 [官方代码 a37d882c3a947f0330a907f513b90a7f08b9c532](https://github.com/SalesforceAIResearch/CRMArena/tree/a37d882c3a947f0330a907f513b90a7f08b9c532)。固定代码身份不冒充论文实验使用的代码 commit。主代理检索当前全部 610 条记录，确认 CRMArena 家族名称与论文编号均未收录。

独立代理只收到具体录入需求、Skill、原始来源与隔离目录限制；没有收到预期节点、边或审阅答案。首次新增包保留。主代理在首次输出后复核并提出以下修订，再通过统一 update 入口落地：

- checkpoint 跳过的是“已有记录”，包括失败结果，不能写成仅跳过成功任务。
- “评价器使用参考答案”不等于参考答案未公开。
- 公开数据/代码不证明能离线运行；实际运行需要可访问的 Salesforce Org。
- 阅读器消费 PDF 字段：核实官方 v1 PDF 后补入 `arxiv_pdf_url`，并将这个 UI 约束补入 Skill 参考文档。此文档改进发生在首次独立测试之后，不作为首次指导的证据。

最终双语图均为 **31 个节点、47 条边**，构建/评测模块分别 7/24 个节点。保留动作格式修复、工具返回、用户澄清、checkpoint 复用、答案解析回退及异常计分路径。没有凭通用模板补造数据修复循环、train/dev/test 划分或模型成功结果。

首次新增写入 8 文件；重复新增和重建均无变化。复核修订走 update，最终重复 update 和重建也均无变化。来源/拓扑断言 6 项通过。最终输入包 SHA-256：

`cf4329e90d0d484ce098c7e57b8ebe8324c9d8e5c4e9eeaa3fdbf974ff420fae`

主代理独立核验确认：

- 新增后的 catalog/manifest 均为 611 条；排除必要插入后，所有原始字节完全保留。
- 其余 610 条对象、顺序、记录原文不变，其他 3,050 份原始数据文件字节不变。
- EN/ZH authored spec 与 arch 逐字节等于最终包经当前编译器的输出，四项 manifest SHA-256 与实际文件吻合。
- 核验的核心代码/Skill 文件在真实 checkout 与测试副本中的身份一致。副本最终检查前后 285 份源码、Skill、配置文件哈希不变。
- Pages 构建实际包含目标 611 条数据；不是用另一份 610 条构建冒充新条目的前端验收。

## 最终本地验证

真实 610 条 checkout 和最终 611 条隔离 checkout 分别执行对应完整检查；以下计数来自本轮实际日志。测试类别间可能有交集，不相加为独立用例总数。

| 检查 | 结果 |
|---|---|
| test:benchmark-ingestion | 3 Python、27 Node、14 前端测试通过 |
| test:build-process | 41 Python、128 Node、103 前端测试通过 |
| test:html-flowchart | 15 Node 与 724 项保留的 HTML 回归通过；219 项旧导出检查按既有 runner 分类排除 |
| source gate | 真实目录 1,220 份图源、隔离目录 1,222 份图源，均零漂移 |
| 隔离 HTML audit / validator | 611 条完整双语条目，ID 集合一致；0 错误、0 警告 |
| TypeScript / Pages build | 两个 checkout 均通过 |
| Skill quick_validate / git diff --check | 真实 checkout 通过；隔离副本不是 Git 仓库，不伪称执行 Git 检查 |

完整主目录检查之后只有 PDF 字段说明及本报告等文档变化；最后再次执行 Skill 验证与 diff 检查。已有 Node 弃用提示及构建 chunk 大小提示保留，没有隐藏警告或改依赖。

浏览器读取隔离 Pages 构建，已实际检查英文浅色、中文深色的 CSS+HTML 流程、阶段详情及拓扑模式。节点数、边数、阶段归属与换行正确，拓扑坐标无 NaN/Infinity。catalog、目标 detail 与双语 arch 的 HTTP 请求均为 200。官方 v1 PDF 在完整论文面板中成功显示，31 页、首页标题和版本正确。临时预览已关闭。

同时观察到一个既有 UI 标签问题：详情页的“论文页面”按钮实际上使用 homepage，CRMArena-Pro 因此指向官方仓库；已与 HEAD 核对，属于此前已有代码，未纳入这三项 Skill 修复。构建流程页的原始论文链接、下载 PDF 与论文阅读器均正确。

## 失败记录与验证边界

保留独立测试初期失败：输入准备代码的变量覆盖导致一次 `benchmark must be an object`；隔离副本复制因 Unicode 路径转义漏掉一个旧条目的 5 文件，完整校验在写入前拦截，补齐后同一包通过。后者是副本准备错误。初期跨越数据修复或被中断的检查不作为最终成功证据；最终采用完整成功批次。

本次来源审阅由 AI 对照原文/代码完成，未经外部人工认证；没有执行上游 benchmark、模型调用或真实 Salesforce smoke。实测覆盖一个此前未收录的复杂 benchmark，不能证明任意未来来源都无需语义复核。

## 交付入口与证据

- Skill：`skills/update-benchmarks/SKILL.md`；包格式：`skills/update-benchmarks/references/package.md`。
- 新增：`pnpm benchmark:add --input PACKAGE.json`。
- 更新：`pnpm benchmark:update --update REVIEWED_PACKAGE.json`。
- 重建：`pnpm benchmark:rebuild --rebuild ID`。
- 三种模式默认 dry-run；检查计划后在已有授权内加 `--write`。
- 本机证据目录：`/Users/joe1chief/Documents/Codex/2026-09-07/xia/benchmark-skill-fix-evidence/`。
- 关键索引：`final-checks.json`、`independent-artifact-proof.json`、`independent-compiler-proof.json`、`browser-qa.json`、`browser-http.log`。
- 真实新增子目录：`independent-intake/REPORT.md`、`source-review.md`、`review-amendments.md`、`final-result.json`、最终输入包及全部原始日志。
