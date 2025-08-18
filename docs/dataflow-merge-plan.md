# Dataflow 合并计划（Merge Plan）

## 1. 目标与范围
- 将现有基于 src/utils 的任务数据流（TaskManager 等）合并/迁移到新架构 src/dataflow。
- 保持功能等价（或用户可感知差异为 0），并提供可回滚路径与灰度开关。
- 完成后：
  - Orchestrator：由 DataflowOrchestrator 统一编排事件、解析、增强、索引、存储与 workers。
  - 查询：视图/桥接改用 QueryAPI（Repository）统一查询接口。
  - 事件：统一使用 src/dataflow/events/Events。
  - 持久化：统一通过 src/dataflow/persistence/Storage。

不在本次：外部功能（如 ICS 管理、非任务相关的管理器）重构。

## 2. 成功标准（Definition of Done）
- 插件默认启用 dataflow 路径且无明显性能/功能回退；所有现有视图正常显示。
- 端到端：创建/修改/删除文件与 frontmatter、Canvas 变化均能触发索引与视图刷新。
- 关键指标：
  - 初始化耗时不劣于当前实现（±10% 内），或通过持久化快照优化。
  - 大仓库连续运行稳定，无 worker 软熔断（或有熔断也能自动退回主线程）。
- 回滚：一键切换到旧 TaskManager 流程仍可工作。

## 3. 阶段与时间线

阶段 A：并行接入与灰度（1-2 周）
- 在 src/index.ts 增加实验开关（如 settings.experimental.dataflowEnabled）。
- 引入 createDataflow(app, vault, metadataCache, plugin)，并在开关启用时初始化。
- 选择 1 个视图或只读功能改为通过 QueryAPI 获取数据，以验证链路。

阶段 B：查询与事件统一（1-2 周）
- 视图层全部迁移为订阅 dataflow Events（TASK_CACHE_UPDATED 等），并通过 QueryAPI 拉取。
- MCP Bridge 新增 Dataflow 版本（并存），验证常用工具链。

阶段 C：解析与增强职责归位（1 周）
- 确认 Markdown/Canvas/FileMeta 三入口仅产出“基础任务”。
- 将继承/增强统一放入 Augmentor，补齐数组去重、复发、子任务继承 per-key 等策略。

阶段 D：持久化与索引统一（1 周）
- Repository 侧完成 consolidate 快照读写路径，Storage 命名空间稳定。
- 移除对 LocalStorageCache 的直接上层调用，统一经 Storage。

阶段 E：切换默认与清理（1 周）
- 默认启用 dataflow；保留回滚开关一个版本周期。
- 在确认稳定后，标记 utils 下冗余模块为 deprecated，并计划实体删除。

## 4. 旧 → 新 模块映射与动作

- 入口/编排
  - 旧：utils/TaskManager.ts → 新：dataflow/Orchestrator.ts + sources/ObsidianSource.ts + workers/WorkerOrchestrator.ts + api/QueryAPI.ts + indexer/Repository.ts + events/Events.ts + persistence/Storage.ts
  - 动作：并行接入 → 视图迁移 → 默认切换 → 弃用 TaskManager

- 解析层
  - 旧：workers/ConfigurableTaskParser.ts、parsing/CanvasParser.ts、workers/FileMetadataTaskParser.ts
  - 新：parsers/MarkdownEntry.ts、CanvasEntry.ts、FileMetaEntry.ts（包装旧实现，禁用项目探测）
  - 动作：保持只产出基础任务；增强交给 Augmentor

- 项目识别与增强
  - 旧：ProjectConfigManager + ProjectDataCache + FileMetadataTaskParser.detectProjectFromFile / 分散继承
  - 新：project/Resolver.ts + augment/Augmentor.ts
  - 动作：解析阶段禁用项目探测；统一从 Resolver 获取，Augmentor 注入/继承

- 索引与持久化
  - 旧：import/TaskIndexer.ts + persister.ts 的直连使用
  - 新：indexer/Repository.ts（复用 TaskIndexer）+ persistence/Storage.ts（包装 LocalStorageCache）
  - 动作：Repository 统一发事件并维护快照；上层仅经 Repository/QueryAPI 访问

- Workers
  - 旧：workers/TaskWorkerManager.ts、ProjectDataWorkerManager.ts
  - 新：workers/WorkerOrchestrator.ts（统一调度与重试/熔断/指标）
  - 动作：Orchestrator 只依赖两个 Manager；必要时扩展指标上报

- 事件
  - 旧：分散触发 app.workspace.trigger("task-genius:task-cache-updated", ...)
  - 新：events/Events.ts 统一 emit/on + 常量 + 序号 Seq
  - 动作：视图统一订阅；Repository 更新时广播

## 5. 风险与缓解
- 风险：大仓库初次初始化耗时上升
  - 缓解：优先加载 consolidate 快照；批量/去抖处理；ObsidianSource 批处理元数据 resolve
- 风险：workers 线程不稳定/浏览器限制
  - 缓解：WorkerOrchestrator 提供重试/退避/熔断与主线程回退；指标追踪
- 风险：功能回归（继承策略差异、项目识别边角）
  - 缓解：Augmentor 策略按计划补齐；引入针对性用例的回归清单（见下）
- 风险：视图与桥接迁移不完整
  - 缓解：灰度开关 + 并存桥接（TaskManagerBridge 与 DataflowBridge 并存一个周期）

## 6. 验证与回归清单（按阶段）
- A 阶段
  - 初始化不报错，QueryAPI.all() 返回任务数与旧实现同量级
  - 变更单文件（md/canvas/frontmatter）能触发 TASK_CACHE_UPDATED
- B 阶段
  - 视图均从 QueryAPI 拉取且一致；跨项目/标签/状态/日期查询对齐
- C 阶段
  - Augmentor 对 tags/dependsOn 去重；recurrence 仅 task 显式；子任务继承 per-key 生效
- D 阶段
  - Consolidated 快照恢复成功；版本/schema 变化时自动失效清理
- E 阶段
  - 默认切换后一周无新增崩溃；回滚开关验证可用

## 7. 回滚与开关
- 配置项：settings.experimental.dataflowEnabled（默认 false → 最终 true）
- 回滚：关闭开关后恢复 TaskManager 流程；不删除旧代码一个版本周期
- 监控：日志中打印 Orchestrator 初始化、Source 订阅、Repository 事件计数、WorkerOrchestrator 指标

## 8. 具体任务清单（可用于 issue 拆分）
- A1 在 index.ts 接入 createDataflow 与开关；并联初始化
- A2 选定一个只读视图改为 QueryAPI（保留旧路径）
- B1 视图层统一订阅 Events；替换查询为 QueryAPI
- B2 增加 DataflowBridge（MCP）并存
- C1 确认三解析入口仅产出基础任务；Augmentor 策略补齐（数组/复发/子任务）
- D1 Repository 持久化与快照恢复流程完善；移除上层对 persister 直连
- E1 默认启用 dataflow；保留回滚；标记弃用旧模块并列清单

## 9. 待移除/弃用候选（切换稳定后）
- utils/TaskManager.ts、utils/TaskParsingService.ts
- utils/fileTypeUtils.ts、utils/FileFilterManager.ts
- utils/workers/FileMetadataTaskUpdater.ts、utils/parsing/CanvasTaskUpdater.ts
- utils/TaskFilterUtils.ts、utils/filterUtils.ts、utils/projectFilter.ts
- mcp/bridge/TaskManagerBridge.ts（由 DataflowBridge 取代）

