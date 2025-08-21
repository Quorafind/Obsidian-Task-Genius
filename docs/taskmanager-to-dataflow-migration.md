# TaskManager → Dataflow 架构迁移计划

本计划用于逐步替换仓库内对 TaskManager 的依赖，全面切换到 Dataflow 架构（QueryAPI + Repository + Events + WorkerOrchestrator + WriteAPI）。

---

## 1. 现存 TaskManager 依赖清单（待迁移点）

以下为当前明确依赖 TaskManager 的文件与使用方式（以本仓库为范围）：

- src/index.ts
  - 持有实例：`taskManager: TaskManager`
  - 初始化：在 onload 时 `new TaskManager(...)` 并 `this.addChild(this.taskManager)`
  - 与版本管理耦合：VersionManager 检测版本变化后调用 `taskManager.initialize()` 触发重建
  - 数据查询/回退：WriteAPI 的 `getTaskById` 优先 dataflow，失败则回退 `this.taskManager.getTaskById`
  - 其它：`setProgressManager()`、`initialize()`、`getAllTasks()` 等调用路径

- src/pages/TaskView.ts
  - 读取：`this.plugin.taskManager.getAllTasksWithSync()` / `this.plugin.taskManager.getAllTasks()`
  - 用于初始化与后续刷新

- src/mcp/McpServer.ts
  - 判断/桥接：在 dataflow 未启用时检查 `this.plugin.taskManager` 存在性
  - 绑定桥：`this.taskBridge = new TaskManagerBridge(this.plugin, this.plugin.taskManager)`

- src/mcp/bridge/TaskManagerBridge.ts
  - 广泛使用 TaskManager：查询/索引/更新/获取文件任务等（`getAllTasks`、`indexFile`、`getTasksForFile`、`updateTask` 等）

- 文档说明（需更新）：
  - src/utils/README.md 描述了 TaskManager 是“Primary orchestrator”；迁移后将以 Dataflow 架构为主

> 备注：可能仍有零散依赖 `this.taskManager` 的地方，迁移期需通过全仓检索“`taskManager`”“`TaskManager`”逐步清理。

---

## 2. 迁移目标与原则

- 目标：所有读取、写入、索引、事件广播、缓存持久化均通过 Dataflow。
- 原则：
  - 渐进式切换：在开关/灰度下替换调用者，优先完成“读取路径”迁移，随后完成“写入路径”与“初始化/重建路径”迁移。
  - 兼容性：在切换窗口期保留 TaskManager 适配器与回退路径，直到完成验证。
  - 稳定性优先：每一阶段完成后提供可回退的 feature flag。

---

## 3. 分阶段实施计划（建议顺序）

### Phase 0：开关与基础
- 确认并使用既有 `settings.experimental.dataflowEnabled` 开关门控。
- 在该开关打开时：严禁新的调用者再接入 TaskManager；新功能只接入 Dataflow。

### Phase 1：读取路径迁移（Views/MCP 查询）
- 目标：所有“读”都从 Dataflow 的 QueryAPI/Repository 取数，而非 TaskManager。
- 任务：
  1. 视图层（以 TaskView 为起点）
     - 改造 `TaskView`：
       - 将 `loadTasksFromTaskManager()` 替换为基于 Dataflow 的查询：
         - 订阅 Dataflow 事件 `CACHE_READY`（initial/非 initial）与 `TASK_CACHE_UPDATED`
         - 初次加载：`dataflowOrchestrator.queryAPI.getAllTasks()` 或基于筛选的查询
       - 去除对 `this.plugin.taskManager` 的直接读取
  2. MCP 查询层
     - 用 `DataflowBridge` 取代 `TaskManagerBridge`：
       - 若缺功能（如按条件查询/搜索/按日期范围等），扩展 `DataflowBridge`，通过 `QueryAPI`/`Repository` 实现
       - 在 `McpServer` 中：当 dataflowEnabled 时，优先创建并使用 `DataflowBridge`，不再依赖 `TaskManagerBridge`

- 验收：关闭 TaskManager 后，视图和 MCP 查询仍能完整工作（仅依赖 Dataflow）。

### Phase 2：写入路径统一（创建/更新/删除）
- 目标：所有写操作通过 Dataflow 的 WriteAPI + 事件回流（而非 TaskManager 的更新方法）。
- 任务：
  - 统一写入口：确保 UI/MCP 写操作均使用 `WriteAPI`（已存在）
  - 监听 `WRITE_OPERATION_*` 与 `FILE_UPDATED`，由 Orchestrator 触发增量解析与索引
  - 从 `TaskManagerBridge` 中迁移写逻辑至 `DataflowBridge`（或直接调用 `WriteAPI`）

- 验收：关闭 TaskManager 后，写入与后续实时更新（事件/视图刷新）正常。

### Phase 3：初始化/重建路径迁移
- 目标：去除对 TaskManager 初始化与 VersionManager-重建的耦合，改由 Dataflow 主导冷启动与重建。
- 任务：
  - 在 `src/index.ts`：
    - 若 dataflowEnabled：跳过 `new TaskManager(...)` 与其 `initialize()`、`setProgressManager()`、版本重建流程；以 Dataflow 的 `Repository.initialize()` + `Orchestrator.initialize()` 为唯一路径
    - 若需要版本驱动重建（兼容策略），在 Dataflow 中实现对应的重建触发（调用 `DataflowOrchestrator.rebuild()`）

- 验收：dataflowEnabled 下，重启不再触发 TaskManager 重建路径；缓存与增量解析由 Dataflow 自洽。

### Phase 4：适配器/回退清理
- 目标：在默认启用 Dataflow 后，移除大部分 TaskManager 依赖，保留最小回退。
- 任务：
  - 在配置中隐藏或标注 TaskManager 已废弃
  - 将 `TaskManagerBridge` 标记 deprecated，并在代码注释中引导迁移到 `DataflowBridge`
  - 清理 src/utils/README.md 等文档中对 TaskManager 的“Primary orchestrator”描述，改为 Dataflow

### Phase 5：彻底移除 TaskManager（最终）
- 前置条件：稳定运行一段时间（至少 1-2 个版本周期），无回退需求
- 任务：移除 `src/managers/task-manager.ts` 与相关桥接/引用、设置项

---

## 4. 详细改动清单（按文件）

- src/index.ts
  - [Phase 3] dataflowEnabled 时：不实例化 TaskManager，不进入 VersionManager→TaskManager 的重建流程
  - [Phase 1/2] WriteAPI 只走 Dataflow，`getTaskById` 的 fallback 去除（或仅在禁用 dataflow 时保留）

- src/pages/TaskView.ts
  - [Phase 1] 替换为订阅 Dataflow 事件 + `QueryAPI` 拉取
  - 移除 `loadTasksFromTaskManager` / `this.plugin.taskManager` 依赖

- src/mcp/McpServer.ts
  - [Phase 1] dataflowEnabled 时绑定 `DataflowBridge`（扩展其查询接口）
  - 移除/降级 `TaskManagerBridge` 使用

- src/mcp/bridge/TaskManagerBridge.ts
  - [Phase 2/4] 将功能迁移至 `DataflowBridge`，并标记 deprecated；最终删除

- 文档
  - src/utils/README.md：更新“核心架构图/职责”，以 Dataflow 为准

- （全仓）
  - 检索与替换：`this.taskManager` / `TaskManager` 的 import/方法调用

---

## 5. 事件/查询对齐（供视图迁移参照）

- 事件：
  - 使用 Dataflow 事件中心（src/dataflow/events/Events.ts）：
    - `CACHE_READY`（initial 与非 initial）
    - `TASK_CACHE_UPDATED`（批量或单文件更新）
- 查询：
  - 使用 Dataflow `QueryAPI`：
    - `getAllTasks()`、`getTasksByProject(project)`、`getTasksByTags(tags)`、`byDateRange({from,to,field})` 等（可按需扩展）

---

## 6. 风险与回滚

- 风险：
  - 视图或 MCP 仍有隐藏依赖 `TaskManager`
  - 写入后事件链路与增量索引在部分场景不同步
- 缓解：
  - 阶段性灰度与双写/双读对比（仅限调试）
  - 增强日志与 metrics（WorkerOrchestrator.metrics、Repository.persist 频率等）
- 回滚策略：
  - 保留设置开关：关闭 dataflow 时恢复 TaskManager 初始化/路径

---

## 7. 建议的实施顺序与 PR 拆分

1) PR#1：视图读取改造（TaskView → Dataflow），不改写入与初始化
2) PR#2：MCP 查询改造（TaskManagerBridge → DataflowBridge 扩展）
3) PR#3：写入统一（全面使用 WriteAPI + Dataflow 事件）
4) PR#4：启动/重建路径切换（dataflowEnabled 时禁用 TaskManager 初始化及其重建）
5) PR#5：清理与文档（deprecated 标记、README 更新）
6) PR#6：移除 TaskManager（最终）

---

## 8. 待办检查清单（简版）

- [ ] 全仓检索并列出所有 `taskManager`/`TaskManager` 引用
- [ ] TaskView 读取改为 Dataflow + 事件订阅
- [ ] MCP 查询改为 DataflowBridge + QueryAPI
- [ ] 写入统一走 WriteAPI（Dataflow），确认事件与索引链路
- [ ] dataflowEnabled 下禁用 TaskManager 初始化与重建
- [ ] 文档更新与 deprecated 标记
- [ ] 最终删除 TaskManager 代码

