## Task Genius 数据流全面重构计划（Refactor Plan）

### 目的（Goals）
- 去重与统一：消除项目识别、文件级元数据解析、任务解析、增强/继承、索引、缓存、持久化、事件传递在多处重复实现与分散入口的问题。
- 稳定与持久：建立单一数据源与可验证的数据流，降低未来演进/扩展成本。
- 一致与同步：保证视图数据与底层缓存/索引严格一致，避免“视图数据不同步”。
- 快速冷启动：最大程度复用持久化数据，避免用户反复 reindex。
- 事件驱动：所有上行/下行数据变更通过 Obsidian 事件系统传播，而不是上级组件直接 setTasks。
- 增量更新：跟随 Obsidian 的 vault/metadataCache/设置事件做最小代价的增量更新。

### 非目标（Non-goals）
- 不改变用户可见的功能语义与现有配置的含义（除非标注为改进项）。
- 不一次性大爆炸替换；采用阶段性迁移确保回退路径。

---

## 设计原则
- 单一职责与单一真相源（Single Source of Truth）：
  - 项目识别只在 ProjectResolver（统一接口）进行；解析器与增强器不再分散探测。
  - 继承/增强只在 TaskAugmentor 进行；解析器仅负责“从文本抽取”。
- 事件优于回调：统一使用 Obsidian workspace 事件分发数据变更，视图通过事件 + 查询 API 获取数据。
- 可重放、可回退：Worker 与主线程遵循相同协议；主线程兜底。
- 可持久与可验证：内容哈希 + 版本/架构版本管理；命名空间化缓存；精细化失效与一致性校验。
- 增量优先：文件内容变动仅重解析该文件；项目配置变动仅重跑增强；设置变动按 scope 精准失效。
- 向后兼容：提供 Adapter 兼容旧 setTasks 调用路径，逐步下线。

---

## 数据拥有权与边界（Ownership）
- 源事件（File events）：ObsidianSource 拥有，统一发出内部文件事件。
- 项目识别（Project）：ProjectResolver 拥有，对外只暴露“文件 → {tgProject, enhancedMetadata}”。
- 解析器（Parsers）：Markdown/Canvas/FileLevel 仅负责“抽取任务/文件级任务”，不写入项目或其他增强信息。
- 增强/继承（Augment）：TaskAugmentor 拥有“task > file > project”的可配置优先级合并。
- 索引（Indexing）：TaskIndexer 拥有内存索引与查询，不做解析与增强。
- 持久化（Persistence）：StorageAdapter（基于 LocalStorageCache）拥有命名空间与 hash/版本校验。
- 事件与查询（Events & Query）：Events 模块拥有事件契约；QueryAPI 对外只读查询。

---

## 目标数据流（高层）
1) Obsidian 事件 → Sources 标准化为 FileChanged/FileDeleted/Renamed 等内部事件。
2) ParsersEntry（根据文件类型）抽取：
   - FileLevelTaskParser：从 frontmatter/tags 形成“文件级任务”。
   - MarkdownTaskParserEntry / CanvasTaskParserEntry：从正文生成“基础任务”。
3) ProjectResolver 计算项目 + 项目增强元数据（可并行）。
4) TaskAugmentor：将“文件级 + 正文任务”与“文件元数据 + 项目增强元数据”按策略合并到任务对象。
5) TaskIndexer.updateIndexWithTasks(filePath, tasksEnhanced)。
6) Persistence：写入命名空间缓存（见下）；必要时更新 consolidated 索引快照。
7) 事件广播 task-genius:task-cache-updated { changedFiles }。
8) 视图订阅事件 → QueryAPI 拉取 → 渲染。

---

## 组件与目录结构（建议新增 src/dataflow/*）
- sources/ObsidianSource.ts
  - 订阅 vault/metadataCache/设置事件；统一去抖与批量合并；发出内部文件事件。
- project/ProjectResolver.ts
  - 合并现有 ProjectConfigManager + ProjectDataCache/Worker 的“对外接口”。
  - 输入：filePath；输出：{ tgProject?, enhancedMetadata, timestamp }。
  - 统一“frontmatter 指定项目、目录 config、tag/link 提示”的优先级；可配置。
- parsers/
  - MarkdownTaskParserEntry.ts（包装 ConfigurableTaskParser.parseLegacy）
  - CanvasTaskParserEntry.ts（包装 CanvasParser）
  - FileLevelTaskParser.ts（包装 FileMetadataTaskParser，禁用内部项目探测）
- augment/TaskAugmentor.ts
  - 单一继承/增强实现：
    - 标量：task 显式 > file > project > 默认
    - 数组：合并去重（保持稳定次序）
    - 状态/完成：只取 task 行级
    - 复发：task 显式优先
    - 子任务继承：按 FileMetadataInheritance/设置 per-key 控制
- workers/WorkerOrchestrator.ts
  - 统一任务/项目命令：parseFileTasks、batchParse、computeProjectData、batchCompute
  - 并发控制、重试、回退、指标
- indexer/TaskRepository.ts
  - 组合 TaskIndexer + Persistence；提供查询 API 的后端依赖
- persistence/StorageAdapter.ts
  - 命名空间 + hash（内容）+ 版本/架构版本 + 粒度化失效
  - Keyspace：
    - tasks.raw:<filePath>
    - project.data:<filePath>
    - tasks.augmented:<filePath>
    - consolidated:taskIndex
    - meta:version / meta:schemaVersion
- events/Events.ts
  - 事件常量/载荷类型/帮助方法（emit/subscribe）。与 obsidian-ex.d.ts 契约一致。
- api/QueryAPI.ts
  - 为视图提供只读查询（按项目/标签/状态/时间窗口等），屏蔽内部实现细节。

---

## 最大化避免与现有功能重复的策略
1) 单一入口与关停重复：
   - FileMetadataTaskParser：关闭其内部项目探测，统一由 ProjectResolver 提供 project 值后在 Augmentor 注入。
   - ConfigurableTaskParser/CanvasParser：不处理项目/继承，仅返回“基础任务”。
   - TaskManager 内的解析/增强/持久化逻辑收敛到新模块，TaskManager 变为编排薄层。
2) 功能所有权迁移表（旧 → 新）：
   - 项目识别：FileMetadataTaskParser.detectProjectFromFile / ProjectData* → ProjectResolver
   - 继承/增强：ConfigurableTaskParser 内部继承 / FileMetadataInheritance 分散 → TaskAugmentor
   - 数据广播：上层 setTasks → Events + QueryAPI
   - Worker 管理：TaskWorkerManager/ProjectDataWorkerManager → WorkerOrchestrator（内部保留原 Worker）
   - 持久化：LocalStorageCache 直接使用 → StorageAdapter 管理命名空间/版本/hash
3) Adapter 与 Deprecation：
   - ViewComponentManager.setTasks 标记 deprecated；提供兼容 Adapter：setTasks 内部转为发事件 + 触发查询，避免一次性改动所有视图。
   - FileMetadataTaskParser 暴露“允许/禁止项目探测”开关；重构期禁用。

---

## 视图同步与一致性保证
- 事件驱动 + 拉取查询：视图统一订阅 task-genius:task-cache-updated / filter-changed，随后调用 QueryAPI 拉取。彻底替代上级 setTasks 链接。
- 原子性：单文件变更导出单批次“增强后任务”提交到 Indexer，再触发事件，视图永远看到同一版本。
- 序号/时间戳：在广播载荷中携带 sequence/timestamp，视图可丢弃过期更新。
- 去抖/批量：Sources 对频繁变动进行批处理，减少 UI 抖动。
- 兼容策略：在迁移期间，旧视图通过 Adapter 仍可工作。

---

## 持久化与缓存策略
- 命名空间：
  - tasks.raw:<filePath> → 基础解析结果
  - project.data:<filePath> → {tgProject, enhancedMetadata}
  - tasks.augmented:<filePath> → Augmentor 合成产物（可选，提升冷启动）
  - consolidated:taskIndex → 全量索引快照（可选）
- 版本与架构版本：
  - meta:version（插件版本） + meta:schemaVersion（缓存结构版本）；不兼容时精准清理对应命名空间。
- 内容哈希：
  - tasks.raw 基于文件内容 hash；project.data 基于“有效配置 + frontmatter + tags/links”等来源 hash。
  - 仅当 hash 改变时重算；mtime 仅用于快速预判。
- 失效矩阵：
  - 文件正文变动：重算 tasks.raw → augment → 更新 index → 事件。
  - 文件 frontmatter/tags 变动：重做 file→task 继承与 augment（若正文未变，可跳过正文解析）。
  - 项目配置变动：仅失效 project.data 与 tasks.augmented，重做 augment；跳过正文解析。
  - 设置变动：按 scope（解析/增强/索引）精准失效。

---

## 失败与回退
- Worker 异常：自动回退主线程解析；熔断/退避重试；错误事件与日志。
- 缓存损坏：校验失败则清理对应命名空间并重建；保留其余命名空间。
- 事件风暴：限流与批处理；视图侧忽略过期序号。

---

## 性能与 SLO
- 冷启动：优先使用 consolidated:taskIndex 或 tasks.augmented，目标 P50 < 300ms（视库大小微调）。
- 增量更新：单文件保存到视图更新 P95 < 150ms（含解析 + augment + index + 事件）。
- 内存：索引结构保持与现有相当；新增缓存命名空间带来可控增量。

---

## 向后兼容与迁移
- Adapter：
  - 视图 setTasks 调用 → 转为发事件并触发 QueryAPI，从而兼容旧代码；逐视图切换到纯事件。
- 逐步替换：
  - ProjectResolver 接管后，禁用 FileMetadataTaskParser 的项目探测。
  - Augmentor 接管继承后，解析器不再做继承。
- 配置兼容：沿用原设置字段并提供合理默认；新增 per-key 策略作为高级选项。

---

## 阶段性实施与检查清单
Phase A：事件封装 + 查询 API（2 天）
- [ ] 新增 events/Events.ts，封装现有触发点（保持事件名兼容）。
- [ ] 新增 api/QueryAPI.ts，提供最小查询（全部任务/按项目/按标签）。
- [ ] TaskManager 触发统一走 Events.ts。

Phase B：解析入口收敛 + Augmentor（3 天）
- [ ] 新建 parsers/*Entry.ts；主线程路径先打通。
- [ ] 新建 augment/TaskAugmentor.ts，落地继承策略（task>file>project）。
- [ ] 修改 FileMetadataTaskParser：允许禁用项目探测（默认禁用）。

Phase C：持久化命名空间 + hash（2 天）
- [ ] StorageAdapter.ts：命名空间 + 版本/架构版本 + hash。
- [ ] 冷启动优先加载 consolidated 或 tasks.augmented；兼容旧数据。

Phase D：WorkerOrchestrator（3 天）
- [ ] 合并任务/项目 worker 调度；统一命令协议与回退策略。
- [ ] 指标与日志：成功率、延迟、退避情况。

Phase E：视图去 setTasks（试点 2 个视图）（3 天）
- [ ] 视图订阅事件 + QueryAPI 拉取；移除直接 setTasks。
- [ ] 保留 Adapter 以兼容未迁移视图。

Phase F：项目配置变更仅增强重算（2 天）
- [ ] 变更监听 → 失效 project.data 与 tasks.augmented → augment → 事件。

Phase G：全面测试与性能调优（2 天）
- [ ] 单测/集成测补齐；SLO 校验；回归修复。

---

## 测试计划（重点）
- 冷启动：无修改 → 不 reindex；版本兼容 → 直接用。
- 文件增量：正文变更、frontmatter/tags 变更、重命名/删除；仅影响对应文件。
- 项目配置变更：仅增强重算；正文不解析。
- 设置变更：按 scope 精准失效。
- 事件一致性：视图通过事件 + 查询看到一致数据；序号去重验证。
- 兼容回归：
  - 空/Null 排序规则：空值永远排在非空之后（双向排序）。
  - 中文标签重复历史问题：复发任务创建链路校验不重复，解析层不二次注入。
- 性能：P50/P95 指标达标；压力下稳定。

---

## 回退计划
- 任意阶段可切回旧路径：
  - 解析：保留旧 TaskWorkerManager/TaskManager 主路径开关。
  - 事件：保留 setTasks Adapter。
  - 缓存：清空新命名空间后回退旧 consolidated 流程。

---

## 开放问题（需确认）
- 事件载荷是否需要强制携带 diff（新增/删除/修改的 taskIds）以优化大视图刷新？
- 默认继承策略中是否存在“项目优先于文件”的字段（例如 SLA 类字段）？
- consolidated:taskIndex 是否纳入默认启用，还是作为可选以节省空间？

---

## 附：事件契约（建议）
- task-genius:cache-ready { initial: boolean, timestamp, seq }
- task-genius:task-cache-updated { changedFiles?: string[], stats?, timestamp, seq }
- task-genius:file-updated { path, reason, timestamp }
- task-genius:project-data-updated { affectedFiles: string[], timestamp }
- task-genius:settings-changed { scopes: string[], timestamp }

说明：保持与现有 obsidian-ex.d.ts 的兼容命名（如 task-cache-updated）。

---

## 结束语
本方案以“单一真相源 + 事件驱动 + 命名空间缓存 + 可回退”为核心，最大化复用现有解析/索引能力，在不破坏现有功能的前提下，消除重复与耦合点，确保视图数据与缓存/索引一致。分阶段推进、可测可回退，可支撑后续长期演进。
