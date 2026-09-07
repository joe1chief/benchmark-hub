# benchmark-package/v1

实现依据：`scripts/benchmark_catalog/benchmark_package.mjs` 的 `compileMetadata`、`compileEvidence`、`compileBenchmarkPackage`，以及 `manage_benchmark.mjs`。变更前核对当前实现；不要猜测字段或把输出字段塞回输入。`fixtures/new-benchmark.json` 是明确标记的合成回归夹具，其 `passed` 不代表任何真实论文审核，不能复制为新条目的审核依据。

## 顶层与 benchmark

新增 `--input` 与更新 `--update` 共用此格式。顶层仅接受 `format`、`benchmark`、`evidence`、`specs`，`format` 必须为 `benchmark-package/v1`。下表是新增与更新合并后的规范元数据约束；更新输入只必须显式给出 `id`，其余 patch 规则见下节。

| 字段 | 输入约束 |
|---|---|
| `benchmark.id` | 新 ID 匹配 `[A-Za-z0-9][A-Za-z0-9_.-]*`；无路径分隔符、首尾空格或控制字符 |
| `name`, `l1`, `intro`, `intro_en`, `paper_url`, `published`, `org` | 必填非空字符串，内容须有来源；必要信息未知时留在草稿，不为过验证虚构 |
| `l1` | 复用 catalog 已有中文分类；缺省 `l1_color`、`l1_en`、`default_l1` 采用该分类最常见组合 |
| `published`, `year` | `published` 为 `YYYY` 或 `YYYY-MM`；`year` 默认取前四位，显式提供时必须一致 |
| `l1_color` | 若提供，必须为六位十六进制颜色，如 `#123456` |
| `paper_url` | 必填绝对 HTTP(S) URL，不含凭据；没有可用主要来源时先解决来源，不伪造论文地址 |
| `arxiv_pdf_url`, `pdf_cdn_url`, `homepage` | 可为空字符串；非空时为不含凭据的绝对 HTTP(S) URL |
| `openness` | `public`、`partly public`、`in-house` 或未知时 `""` |
| `has_leaderboard`, `widely_tested` | boolean，默认 false；不能写字符串或以 true 表示“待确认” |
| `related_benchmarks` | 默认 `[]`；引用已有 ID 或唯一展示名，完整 validator 继续核对可解析性 |

允许的全部字符串字段如下；新增时除上表必填项外默认 `""`，不要用 null 表示未知文本：

```text
id name l1 l1_color l2 intro paper_url arxiv_pdf_url pdf_cdn_url published year org
build_method metric openness modality language task_type difficulty eval_feature scale
pdf_filename family variant homepage l1_en l2_en difficulty_en openness_en modality_en
task_type_en build_method_en eval_feature_en intro_en language_en scale_en metric_en
default_l1 default_l2
```

仅列表中的字符串字段、两个 boolean 和 `related_benchmarks` 被接受。对 `l2`、`difficulty`、`openness`、`modality`、`task_type`、`build_method`、`eval_feature`、`intro`、`language`、`scale`、`metric`，原字段含汉字时对应 `*_en` 必须为非空英文；这些 `*_en` 字段不能混入汉字。其余真实可知的双语信息也应补全；翻译不改变定义。不要输入生成的 `drawio_*` 路径或 `flowchart_*` fallback。

网站内嵌论文阅读器只使用 `pdf_cdn_url` 或 `arxiv_pdf_url`，不会从 `paper_url` 推导 PDF。一手来源提供 PDF 时，核实并填写对应字段（保留论文版本）；只有外部论文页面时才留空，不为填满字段猜测下载地址。

## 更新已有 benchmark

CLI：`node scripts/benchmark_catalog/manage_benchmark.mjs --update REVIEWED_PACKAGE.json [--root REPO] [--write]`；package 入口为 `pnpm benchmark:update --update REVIEWED_PACKAGE.json`。程序接口为 `manageBenchmark({ update: packageObject, root, write })`。`--update` 与 `--input`、`--rebuild` 互斥；程序接口对应的 `update`、`input`、`rebuildId` 也互斥。

更新只接受已注册且 catalog、manifest、detail 身份一致的目标 ID。必须提供 `benchmark.id`；此模式不能新建或改 ID。更新包仍包含 `format`、`benchmark`、`evidence`、`specs`，其中：

- **benchmark 是 metadata patch**：catalog 与 detail 分别以各自已有规范字段为底稿；detail 完全缺失的字段才从 catalog 补齐。省略的已有字段保持各自原值，不用 catalog 的空值覆盖 detail 中的有效内容；显式 `""`、`[]`、`false` 表示清空或关闭，仍须满足字段约束（必填内容不能清空）。不要把未知扩展复制进 patch，未知字段不是受支持的输入。
- **双语描述对必须显式成对提交**：改变 `l2`、`difficulty`、`openness`、`modality`、`task_type`、`build_method`、`eval_feature`、`intro`、`language`、`scale`、`metric` 与对应 `*_en` 中任一项时，另一项也要明确提供；允许另一项值不变，但不能靠省略隐式沿用。
- **联动默认**：`l1` 改变时，没有显式提交的 `l1_color`、`l1_en`、`default_l1` 使用新分类默认组合；显式值仍须有效。`published` 改变且未显式提供 `year` 时重新计算 year，显式提供时必须一致。
- **evidence、specs.en、specs.zh 完整替换**：不是局部合并，必须携带本次来源对应的完整证据、实际已完成的审核和两种语言完整图。即使只改 metadata，也要提供这些完整对象；工具不会自动审核。

同一原子批次更新 metadata、source、arch、fallback 和 manifest。具体字段处理遵循 `planUpdate`，不能笼统理解为所有旧字段都会更新：

- **catalog/detail**：先删除所有旧 `drawio_*` 字段，再注入本次编译的规范 metadata、fallback 和新 spec/arch 指针。若原记录有 `drawio_review_note`，将其改写为新 `source_locator`；原来没有则不补造此字段。两处各自的未知、非 `drawio_*` 扩展全部保留。
- **manifest**：已知托管的来源、审核、assets、generation，以及旧构建/评测步骤、导出审核、`diagram_labels_en/zh`、`diagram_types`、`diagram`、`display_name` 等字段由新 manifest 替换；新 manifest 不再提供的旧字段移除。其他未知字段原样保留，具体托管清单以 `MANAGED_MANIFEST_FIELDS` 为准。
- `preserved_fields.catalog`、`.detail`、`.manifest` 分别列出保留扩展的字段名。逐项复核其是否仍符合新来源；保留不是自动更新或语义认证。上述指针/字段清理不删除磁盘上的旧导出文件。

更新流程为 dry-run → 审阅计划与保留字段 → 同包 `--write` → 同包 `--update` dry-run → `--rebuild ID` dry-run。后两次 `changed_files` 均应为空。新增和重建原有行为保持兼容；不要用新增模式覆盖不同的已有条目。

## evidence 与实际审核

必填非空字段：`source_type`、`source_url`、`source_locator`、`evidence_summary_en`、`evidence_summary_zh`，以及对象 `paper_alignment_review`。

- `source_url` 必须为不含凭据的绝对 HTTP(S) URL，优先固定版本的论文、官方文件或 commit permalink。
- **当前没有独立 `source_version` 字段**。在 URL 和 `source_locator` 中明确论文版本、仓库 commit、数据 revision，以及节、图、表、文件/行等定位。多来源在 locator 和双语摘要中逐项区分，并保持主来源身份明确。
- 双语摘要说明实际构建与评测协议、范围和关键决策，不把推断写成来源事实。
- `paper_alignment_review.status` 只有实际完成核验后才能为 `passed`。其 `source_url`、`source_locator` 必须逐字等于 evidence 的对应字段；`reviewed_at` 是真实有效的 `YYYY-MM-DD` 审核日期。
- `known_limits_en`、`known_limits_zh` 为可选字符串，写未公开/尚未确认的信息和边界。
- `language_exempt_node_ids` 为可选技术标识节点 ID 列表；只用于必要技术标识，不用它放行未翻译的说明文字。

[示例](../assets/benchmark-package.example.json)故意使用 `status: "pending"` 和明确占位内容，预期无法导入。它只展示字段和多行说明的形状；必须先完成真实内容提取与审核，不能只把 pending 改为 passed。CLI 只校验提交的审核元数据，不独立读取来源或认证审核结论。

## specs.en / specs.zh

两者都是对象。每种语言的 `meta.title`、`meta.description`、`meta.legend` 必填非空。编译默认补入 `profile: academic-paper`、`theme: academic-color`、`source: generated`、`layout: horizontal`；这里的 generated 是模型元数据，不改变 checked-in spec 的 authored authority。

- `nodes`：稳定唯一 `id`，新节点 ID 必须匹配 `^[A-Za-z][A-Za-z0-9_-]*$`（与 benchmark ID 规则不同，不允许点或数字开头）；完整双语 `label`、明确 `type`；支持模型保留的 `module`、`icon`、`size`。JSON 用 `\n` 表达真实换行，不把整段解释截成泛化短词。
- `edges`：`from`、`to`、`type`，新包优先显式提供稳定唯一 `id`，必要时双语 `label`、`bidirectional`。旧规范允许缺少 `edge.id`；共享模型按原数组的一基位置补为 `edge-1`、`edge-2` 等。其稳定性依赖边顺序，恢复/重建旧 spec 必须保留边数组顺序；已有显式 ID 会保留，显式与生成 ID 也不能碰撞。端点必须存在；不要省略失败、重试、回退或支线以凑成线性流程。
- `modules`：稳定 `id`、双语 `label`、明确成员 `nodes`（也支持 `nodeIds`），可有 `color`。成员必须指向存在节点；若填写 `node.module`，它必须引用已声明 module，且与成员列表一致。一个节点不能归属多个 module；不得通过冲突归属表达阶段交叉。`construction` / `evaluation` 应来自实际流程归属。无来源依据的节点不强行归组，交给共享展示的 neutral 状态，不添加猜测字段。
- EN/ZH 的规范化节点、边、module 的顺序、ID、类型、端点、非翻译属性与归属一致；边标签可翻译，但有无标签必须一致。按相同结构翻译，不分别设计两幅图。
- 来源支持的 repair/retry cycle 是合法流程，保留回边及其条件。若布局卡住或校验不兼容，报告并修复对应实现，不通过删边、断开循环或改写来源语义来满足 UI/validator。
- 排版/样式能力以当前 `flowchart_model.mjs` 和共享 renderer 为准；不能假设旧 Draw.io 的几何扩展会进入 HTML 模型。

示例只有一个未分类的待提取边界节点，不提供可套用的虚构 benchmark 步骤。实际节点、阶段、决策边必须从该 benchmark 一手来源重新提取。

## 输出与操作语义

新增生成、更新同步 `client/public/benchmarks.json`、`benchmarks_detail/ID.json`、`benchmarks_build_process_manifest.json` 的一致记录，以及 `drawio/ID/ID.{en,zh}.{spec.yaml,arch.json}` 和 README 统计。新 manifest 含 `spec_authority: checked_in`、spec/arch 路径和 `html_generation` 的 spec/arch SHA-256；不需要旧导出字段。HTML audit 对已有 `html_generation` 校验 format、model_version、双语 hash 格式及路径，并读取实际文件字节核对 SHA-256；hash 不匹配或资产不可读会报错。旧条目没有该记录时不会凭空要求补造；重建只刷新已有记录。

`--input` 对已有 ID 的相同包只有在 catalog/manifest 对象与 detail/spec/arch 序列化内容精确一致时为 no-op；不同内容拒绝，应使用已审核的 `--update`。JSON 定点写入保留非目标记录的原始字节、位置和转义；不会为修改单个条目而整文件重新格式化。`--rebuild ID` 仅派生 arch、fallback、已有 generation 记录和 README，不替代来源或元数据修订，也不补造审核状态。对已审核条目进行隔离恢复/forward-test 时，沿用可核验的原审核来源、locator 和日期，报告的是恢复与重建结果，不重新声称完成 paper review。

每次操作在临时完整 HTML 输入快照上先更新 README、执行 `validate_benchmarks.py --html --root`、`check_arch_sources.mjs --root`、`audit_build_process_assets.mjs --html --json --root`。只有 `--write` 且有差异才写计划文件；写入前检查并发变动，失败保留其他写入者数据。报告检查 `changed_files`（path/action/hash）、`preserved_fields`（保留扩展，更新时需审阅）、`validation`、`committed` 和可能的 `cleanup_warnings`；no-op 的 committed 为 false 并非失败。异常、并发冲突或现存 lock 先诊断，不能无条件删锁重试。

## 隔离目录与临时写入

`--root` 选择读取和最终落地的数据根目录，不要求该目录包含代码或依赖。CLI 使用自身代码 checkout 的校验程序验证目标数据的临时快照；裸 `pnpm` 测试/构建仍操作其所在代码 checkout，不继承 `--root`。报告分别标识代码版本、数据 root 与验证层次。纯数据副本的 CLI 验证是数据验收；完整前端验收优先在具有目标数据的完整隔离 checkout 执行。仅浏览时可组合现有构建静态代码与目标 `client/public` 数据作隔离预览，但应明确该组合的身份，不能称为对目标副本重新构建并通过全部测试。

staging 使用 `mkdtempSync(join(os.tmpdir(), 'costco-benchmark-'))`，dry-run 同样会临时写入；`--root` 本身不是写入沙箱。若用户要求写入仅限某授权目录，先替换下面的路径，在其下创建 tmp，并对每次 CLI 进程设置 `TMPDIR`：

```bash
mkdir -p /authorized/work/tmp
TMPDIR=/authorized/work/tmp node scripts/benchmark_catalog/manage_benchmark.mjs --root /authorized/work/data --input /authorized/work/reviewed-package.json
```

更新时将 `--input` 换为 `--update`，重建时换为 `--rebuild ID`；每次进程都保留同一 TMPDIR，落地时才追加 `--write`。

以上是目录选择示例，不授予 `/authorized/work` 的写权限。执行前可用同一环境下的 `node -p 'require("node:os").tmpdir()'` 核对实际临时根目录；TMPDIR 只控制临时目录选择，不约束其他测试/构建输出。目标 root、tmp 和预览/构建目录均应在本次授权范围内，不复制依赖或更改全局临时目录设置来绕过边界。
