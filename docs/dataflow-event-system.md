# Dataflow 事件系统架构

## 概述

Dataflow 架构通过事件驱动的方式处理任务的增删改查操作，确保 UI 和数据层的同步更新。

## 核心组件

### 1. ObsidianSource
- **作用**: 监听 Obsidian 文件系统事件
- **事件**: 
  - 文件创建/修改/删除/重命名
  - 元数据变更
- **特性**: 
  - 自动去抖动（300ms）
  - 批量处理
  - 跳过 WriteAPI 触发的修改

### 2. DataflowOrchestrator
- **作用**: 协调所有数据流组件
- **监听事件**:
  - `FILE_UPDATED`: 处理文件变更
  - `TASK_CACHE_UPDATED`: 处理批量更新
  - `WRITE_OPERATION_COMPLETE`: 处理 WriteAPI 完成的操作
- **处理流程**:
  1. 接收事件
  2. 解析文件内容
  3. 增强任务数据
  4. 更新 Repository
  5. 触发 UI 更新

### 3. Repository
- **作用**: 中央数据仓库
- **功能**:
  - 维护任务索引
  - 持久化存储
  - 触发 `TASK_CACHE_UPDATED` 事件通知 UI

### 4. WriteAPI
- **作用**: 处理所有写操作
- **事件流程**:
  1. 发送 `WRITE_OPERATION_START` 事件
  2. 修改文件
  3. 发送 `WRITE_OPERATION_COMPLETE` 事件
  4. Orchestrator 接收事件并重新处理文件

## 数据流路径

### 场景 1: UI 更新任务
```
UI操作 → WriteAPI → 发送 WRITE_OPERATION_START 
                  → 修改文件 
                  → 发送 WRITE_OPERATION_COMPLETE
                  → Orchestrator 处理文件
                  → Repository 更新
                  → 发送 TASK_CACHE_UPDATED
                  → UI 更新
```

### 场景 2: 直接编辑文件
```
文件编辑 → ObsidianSource 检测变化
        → 发送 FILE_UPDATED 事件
        → Orchestrator 处理文件
        → Repository 更新
        → 发送 TASK_CACHE_UPDATED
        → UI 更新
```

### 场景 3: Canvas 任务更新
```
Canvas 任务编辑 → CanvasTaskUpdater
               → 发送 WRITE_OPERATION_START
               → 修改 Canvas JSON
               → 发送 WRITE_OPERATION_COMPLETE
               → Orchestrator 处理
               → UI 更新
```

## 关键事件

### Events 定义
```typescript
export const Events = {
  CACHE_READY: "task-genius:cache-ready",
  TASK_CACHE_UPDATED: "task-genius:task-cache-updated",
  FILE_UPDATED: "task-genius:file-updated",
  WRITE_OPERATION_START: "task-genius:write-operation-start",
  WRITE_OPERATION_COMPLETE: "task-genius:write-operation-complete",
  // ...
}
```

### 事件协作

1. **ObsidianSource 与 WriteAPI 协作**:
   - WriteAPI 发送 `WRITE_OPERATION_START` 时，ObsidianSource 标记该文件
   - ObsidianSource 跳过被标记文件的 modify 事件
   - 避免重复处理

2. **Orchestrator 事件处理**:
   - 监听多个事件源
   - 对 WriteAPI 操作立即处理（无去抖）
   - 对文件系统事件进行去抖处理

3. **Repository 事件发送**:
   - 每次更新后发送 `TASK_CACHE_UPDATED`
   - 包含变更文件列表和统计信息
   - UI 组件监听此事件进行更新

## 实现细节

### 去抖动机制
- ObsidianSource: 300ms 去抖
- Orchestrator: 300ms 去抖（除 WriteAPI 操作外）
- 批量操作: 150ms 批处理延迟

### 事件跳过机制
```typescript
// ObsidianSource
if (this.skipNextModify.has(file.path)) {
  this.skipNextModify.delete(file.path);
  console.log(`Skipping modify event (handled by WriteAPI)`);
  return;
}
```

### 立即处理机制
```typescript
// Orchestrator - WriteAPI 操作立即处理
on(Events.WRITE_OPERATION_COMPLETE, async (payload) => {
  const file = this.vault.getAbstractFileByPath(payload.path);
  if (file) {
    await this.processFileImmediate(file); // 无去抖
  }
});
```

## 测试要点

1. **UI 更新测试**:
   - 通过 UI 修改任务状态
   - 验证文件被更新
   - 验证 UI 自动刷新

2. **文件编辑测试**:
   - 直接在 Obsidian 中编辑任务
   - 验证 UI 在 300ms 后更新

3. **Canvas 任务测试**:
   - 在 Canvas 中修改任务
   - 验证 Canvas 文件更新
   - 验证任务列表刷新

4. **批量操作测试**:
   - 同时修改多个文件
   - 验证批处理机制工作
   - 验证性能优化效果

## 调试技巧

### 启用日志
```typescript
// 在 Orchestrator 中
console.log(`[DataflowOrchestrator] FILE_UPDATED: ${path}`);
console.log(`[DataflowOrchestrator] WRITE_OPERATION_COMPLETE: ${path}`);

// 在 ObsidianSource 中
console.log(`ObsidianSource: File modified - ${file.path}`);
console.log(`ObsidianSource: Skipping modify event (handled by WriteAPI)`);
```

### 事件流追踪
1. 打开控制台
2. 执行操作
3. 观察事件序列:
   - WRITE_OPERATION_START
   - File modification (可能被跳过)
   - WRITE_OPERATION_COMPLETE
   - TASK_CACHE_UPDATED

### 常见问题

1. **UI 不更新**:
   - 检查 TASK_CACHE_UPDATED 事件是否触发
   - 验证 UI 组件是否正确监听事件

2. **重复处理**:
   - 检查 skipNextModify 机制
   - 验证去抖动时间设置

3. **Canvas 更新失败**:
   - 检查 CanvasTaskUpdater 事件发送
   - 验证 Canvas JSON 格式正确

## 未来改进

1. **性能优化**:
   - 实现更智能的增量更新
   - 优化大文件处理

2. **错误处理**:
   - 添加重试机制
   - 改进错误报告

3. **监控**:
   - 添加性能指标
   - 实现事件追踪系统