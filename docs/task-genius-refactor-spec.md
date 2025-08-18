## Task Genius 数据流重构实施规范（Implementation Spec）

本规范补充《task-genius-refactor-plan.md》，面向执行同学，提供可直接落地的事件载荷类型、QueryAPI 函数签名、StorageAdapter 的 Key 规则，以及示例代码与任务清单。

---

### 1. 事件载荷类型（建议）

事件名称与 obsidian-ex.d.ts 兼容，并统一通过 Events.ts 导出常量与帮助方法。

- task-genius:cache-ready
  - payload: { initial: boolean; timestamp: number; seq: number }
- task-genius:task-cache-updated
  - payload: { changedFiles?: string[]; stats?: { total: number; changed: number }; timestamp: number; seq: number }
- task-genius:file-updated
  - payload: { path: string; reason: "modify" | "frontmatter" | "rename" | "delete"; timestamp: number }
- task-genius:project-data-updated
  - payload: { affectedFiles: string[]; reason?: string; timestamp: number }
- task-genius:settings-changed
  - payload: { scopes: ("parser" | "augment" | "index" | "view")[]; timestamp: number }
- 保留：task-genius:task-completed/task-added/task-updated/task-deleted（按现有类型）

辅助：
- seq 为单调递增序号（TaskRepository 维护）
- timestamp 为事件生成时间

---

### 2. QueryAPI 函数签名（草案）

文件：src/dataflow/api/QueryAPI.ts

- getAllTasks(): Promise<Task[]>
- getTasksByProject(projectName: string): Promise<Task[]>
- getTasksByTags(tags: string[]): Promise<Task[]>
- getTasksByStatus(completed: boolean): Promise<Task[]>
- getTasksByDateRange(opts: { from?: number; to?: number; field?: "due" | "start" | "scheduled" }): Promise<Task[]>
- getTaskById(id: string): Promise<Task | null>
- getIndexSummary(): Promise<{ total: number; byProject: Record<string, number>; byTag: Record<string, number> }>

实现要点：
- 背后依赖 TaskRepository（组合 TaskIndexer + Persistence），严禁直接访问内部索引结构于视图层。
- 函数返回的 Task 均为“增强后任务”。

---

### 3. StorageAdapter Key 规则与版本

文件：src/dataflow/persistence/StorageAdapter.ts

- 命名空间规范（namespace:key）
  - tasks.raw:<filePath>
  - project.data:<filePath>
  - tasks.augmented:<filePath>
  - consolidated:taskIndex
  - meta:version（插件版本）
  - meta:schemaVersion（缓存架构版本）

- 哈希与版本
  - tasks.raw 记录：{ hash: string; time: number; version: string; schema: number; data: Task[] }
  - project.data 记录：{ hash: string; time: number; version: string; schema: number; data: { tgProject?: TgProject; enhancedMetadata: Record<string, any> } }
  - tasks.augmented 记录：{ hash: string; time: number; version: string; schema: number; data: Task[] }
  - consolidated:taskIndex 记录：{ time: number; version: string; schema: number; data: TaskCacheSnapshot }

- 兼容策略
  - 版本或 schema 不兼容时仅清理受影响命名空间。
  - hash 优先判定是否需要重算；mtime 仅作为辅助。

---

### 4. 代码示例（2 段）

示例 A：视图订阅事件 + QueryAPI 拉取（替代 setTasks）

```ts
// 在某视图 onOpen 内
import { subscribeTaskCacheUpdated } from "src/dataflow/events/Events";
import { QueryAPI } from "src/dataflow/api/QueryAPI";

let unsub: () => void;
this.registerEvent(
  (unsub = subscribeTaskCacheUpdated(async (payload) => {
    const tasks = await QueryAPI.getTasksByProject(this.currentProject ?? "");
    this.renderer.render(tasks); // 视图自身的渲染方法
  }))
);

// onClose 时
if (unsub) unsub();
```

示例 B：单文件变更 → 解析 + 增强 + 索引 + 事件

```ts
import { ParsersEntry } from "src/dataflow/parsers";
import { ProjectResolver } from "src/dataflow/project/ProjectResolver";
import { TaskAugmentor } from "src/dataflow/augment/TaskAugmentor";
import { TaskRepository } from "src/dataflow/indexer/TaskRepository";
import { emitTaskCacheUpdated } from "src/dataflow/events/Events";
import { StorageAdapter } from "src/dataflow/persistence/StorageAdapter";

async function handleFileChanged(filePath: string) {
  // 1. 尝试读取 tasks.raw（hash 命中则跳过正文解析）
  const raw = await StorageAdapter.loadRaw(filePath);
  const needsParse = !(raw && StorageAdapter.isRawValid(filePath, raw));
  const rawTasks = needsParse
    ? await ParsersEntry.parseFile(filePath) // Markdown/Canvas/FileLevel 分流
    : raw.data;

  if (needsParse) await StorageAdapter.storeRaw(filePath, rawTasks);

  // 2. 读取/计算项目数据（可并行）
  const proj = await ProjectResolver.getProjectData(filePath);
  await StorageAdapter.storeProjectData(filePath, proj);

  // 3. 增强合并
  const augmented = await TaskAugmentor.merge({ filePath, rawTasks, project: proj });
  await StorageAdapter.storeAugmented(filePath, augmented);

  // 4. 更新索引
  await TaskRepository.updateFile(filePath, augmented);

  // 5. 广播事件
  emitTaskCacheUpdated({ changedFiles: [filePath], timestamp: Date.now() });
}
```

---

### 5. 执行清单（给贡献者）

1) 新增骨架文件
- src/dataflow/events/Events.ts：事件常量与 emit/subscribe；内部维护 seq。
- src/dataflow/api/QueryAPI.ts：空壳方法先返回现有 TaskManager 数据（过渡）。
- src/dataflow/parsers/MarkdownTaskParserEntry.ts：包装现有 ConfigurableTaskParser.parseLegacy。
- src/dataflow/parsers/CanvasTaskParserEntry.ts：包装现有 CanvasParser。
- src/dataflow/parsers/FileLevelTaskParser.ts：包装现有 FileMetadataTaskParser，并添加“禁用项目探测”配置（默认禁用）。
- src/dataflow/augment/TaskAugmentor.ts：实现继承策略（task>file>project）；支持子任务控制。
- src/dataflow/project/ProjectResolver.ts：统一项目识别接口；内部复用 ProjectConfigManager/ProjectDataCache。
- src/dataflow/persistence/StorageAdapter.ts：命名空间 + 版本/schema + hash 校验；读写 helpers。
- src/dataflow/indexer/TaskRepository.ts：组合 TaskIndexer 与 StorageAdapter；对外提供查询。

2) TaskManager 接入
- 触发事件统一改为 Events.ts 的封装。
- 冷启动改为优先读取 consolidated 或 tasks.augmented，失败再回落旧流程。
- 单文件变更路径替换为“解析入口 + Augmentor + Repository”的新流水线（逐步灰度）。

3) 视图迁移（首批 1-2 个）
- 去除直接 setTasks 调用，改成订阅 task-cache-updated + QueryAPI 拉取。
- 保留 Adapter 以兼容未迁移视图。

4) 持久化与失效策略
- 引入命名空间 key 规则与 hash 计算；对项目配置变更只失效 project.data 与 tasks.augmented。

5) 测试
- 单测：ParsersEntry、TaskAugmentor（继承策略）、StorageAdapter（hash/版本/失效）、ProjectResolver（优先级）。
- 集成：单文件改动/重命名/删除、项目配置变更、冷启动、事件序号。

6) 文档
- 在 README 或开发文档中标注 setTasks 已废弃（迁移至事件 + QueryAPI）。

---

如需我补充具体类型定义（TypeScript 接口）或更详细的函数注释，请告知要优先完善的模块。
