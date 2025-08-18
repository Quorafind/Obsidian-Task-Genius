# TaskIndexer 迁移动计划

## 1. 目标
- 将 TaskIndexer 从 `src/utils/import/TaskIndexer.ts` 迁移至 `src/dataflow/indexer/TaskIndexer.ts`。
- 统一“索引层”的所有权到 dataflow 命名空间，减少新旧架构交叉依赖。
- 保持功能零回归、提供兼容过渡（re-export），并具备可快速回滚能力。

## 2. 现状与依赖
- 现有引用（至少）：
  - dataflow: `src/dataflow/indexer/Repository.ts` → `../../utils/import/TaskIndexer`
  - legacy: `src/utils/TaskManager.ts` → `./import/TaskIndexer`
- 说明：Repository 属于 dataflow，却反向引用 utils 的 TaskIndexer；迁移后应改为本地引用 `./TaskIndexer`。

## 3. 分阶段迁移步骤

### 阶段 A：平滑迁移与适配（兼容期）
1) 移动实现
- 将 `src/utils/import/TaskIndexer.ts` 的实现移动到 `src/dataflow/indexer/TaskIndexer.ts`。
- 修正文件内部的相对导入路径（若有）。

2) 更新 dataflow 内部引用
- 修改 `src/dataflow/indexer/Repository.ts` 导入：
  - `import { TaskIndexer } from "./TaskIndexer";`

3) 旧路径提供 re-export（保持旧架构可用）
- 将 `src/utils/import/TaskIndexer.ts` 改为仅转发：
  ```ts
  export { TaskIndexer } from "../../dataflow/indexer/TaskIndexer";
  ```

4) （可选）在 `src/dataflow/index.ts` 导出 TaskIndexer（仅当需要对外暴露）

### 阶段 B：去耦旧架构依赖
5) 旧 TaskManager 改用新路径
- 在 `src/utils/TaskManager.ts` 将导入改为：
  - `import { TaskIndexer } from "../dataflow/indexer/TaskIndexer";`（或继续依赖上一步 re-export，推荐直接走 dataflow）

6) 全仓替换引用
- 搜索引用旧路径的地方（包含相对路径与别名路径），替换为 dataflow 新路径或保留通过 re-export 过渡。

7) 校验环依赖
- 确认 utils → dataflow 的依赖不会引入 dataflow ↔ utils 的循环（若存在，则保持 TaskManager 通过 re-export 访问）。

### 阶段 C：收尾与清理
8) 文档更新
- 更新架构文档中 TaskIndexer 所有权，归属 `src/dataflow/indexer`。

9) 清理 re-export（下个版本周期）
- 保留 `src/utils/import/TaskIndexer.ts` re-export 一个版本周期后，删除该文件。

10) 守护措施（可选）
- 在 `src/utils/import/` 目录添加 README 或 lint 规则，禁止新增 dataflow 相关实现，仅允许过渡性 re-export。

## 4. 任务清单（派工用）
- A1 移动实现并修正内部导入
- A2 更新 Repository 导入路径
- A3 添加 re-export 兼容层
- B1 更新 TaskManager 导入为 dataflow 新路径
- B2 全仓替换其他引用（如有）
- B3 编译/类型检查 + 本地运行验证
- C1 更新 docs（dataflow-architecture 等）
- C2 移除 re-export（一个版本周期后）

## 5. 验收标准（DoD）
- 构建与类型检查通过，无循环依赖警告
- dataflow 默认路径正常：
  - 冷启动从 Storage 快照恢复成功（Repository.initialize）
  - 事件广播与视图刷新正常（CACHE_READY/TASK_CACHE_UPDATED）
- 旧 TaskManager 路径仍可回退使用（过渡期）
- 全仓再无对 `utils/import/TaskIndexer` 的直接实现引用（仅允许 re-export 在过渡期存在）

## 6. 风险与回滚
- 风险：隐性引用遗漏
  - 缓解：grep 全仓 `from "./import/TaskIndexer"` 与 `from "../../utils/import/TaskIndexer"`。
- 风险：环依赖
  - 缓解：TaskManager 如引入环，则继续通过 re-export 访问；确认后再做进一步解耦。
- 回滚：保留 re-export 不删即可回滚（Repository 可临时指回旧路径）。

## 7. 预估工作量
- A–B：0.5–1 天（含全仓引用更新与验证）
- C：合并后 1 个版本周期内清理（0.5 天）

