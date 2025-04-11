# Task View 功能设计文档

## 1. 概述

Task View 是 Task Genius 插件的核心功能模块，旨在为 Obsidian 提供统一的任务管理界面，不破坏原生文本记录体验的同时，提供类似 OmniFocus 的任务管理功能，并支持与现有 Tasks 插件的兼容集成。

## 2. 核心功能

- 任务收集与索引
- 自定义视图 (Perspectives)
- 任务过滤和分组
- 任务编辑
- 任务状态追踪
- Tasks 插件兼容支持

## 3. 技术架构

### 3.1 基础组件

- **ItemView**: 使用 Obsidian 提供的 `ItemView` 创建任务视图
- **TypeScript**: 使用原生 TypeScript 实现界面渲染
- **EventEmitter**: 处理视图更新和数据变化
- **Parser**: 解析 Tasks 插件兼容的任务语法

### 3.2 数据缓存方案

```typescript
interface TaskCache {
  tasks: Map<string, Task>;  // taskId -> Task
  files: Map<string, Set<string>>;  // filePath -> Set<taskIds>
  tags: Map<string, Set<string>>;  // tag -> Set<taskIds>
  projects: Map<string, Set<string>>;  // project -> Set<taskIds>
  contexts: Map<string, Set<string>>;  // context -> Set<taskIds>
  dueDate: Map<string, Set<string>>;  // dueDate -> Set<taskIds>
  startDate: Map<string, Set<string>>;  // startDate -> Set<taskIds>
  scheduledDate: Map<string, Set<string>>;  // scheduledDate -> Set<taskIds>
}

interface Task {
  id: string;  // unique identifier
  content: string;  // task content
  filePath: string;  // file path
  line: number;  // line number
  completed: boolean;  // completion status
  createdDate?: number;  // creation date
  startDate?: number;  // start date (Tasks plugin compatible)
  scheduledDate?: number;  // scheduled date (Tasks plugin compatible)
  dueDate?: number;  // due date
  completedDate?: number;  // completion date
  recurrence?: string;  // recurrence rule (Tasks plugin compatible)
  tags: string[];  // tags
  project?: string;  // project
  context?: string;  // context
  priority?: number;  // priority
  parent?: string;  // parent task ID
  children: string[];  // child task ID list
  originalMarkdown: string;  // original markdown text
  estimatedTime?: number;  // estimated time in minutes
  actualTime?: number;  // actual time spent in minutes
}
```

### 3.3 任务解析器

专门处理 Tasks 插件兼容的语法解析:

```typescript
class TaskParser {
  // Regular expressions for Tasks plugin syntax
  private readonly startDateRegex = /📅 (\d{4}-\d{2}-\d{2})/;
  private readonly completedDateRegex = /✅ (\d{4}-\d{2}-\d{2})/;
  private readonly dueDateRegex = /⏳ (\d{4}-\d{2}-\d{2})/;
  private readonly scheduledDateRegex = /⏰ (\d{4}-\d{2}-\d{2})/;
  private readonly recurrenceRegex = /🔁 (.*?)(?=\s|$)/;
  private readonly priorityRegex = /🔼|⏫|🔽/;
  
  parseTask(text: string, filePath: string, lineNum: number): Task {
    // Basic task info
    const task: Task = {
      id: generateUniqueId(),
      content: text.replace(/- \[.\] /, ''),
      filePath,
      line: lineNum,
      completed: text.includes('- [x]'),
      tags: [],
      children: [],
      originalMarkdown: text
    };
    
    // Parse Tasks plugin syntax
    const startDateMatch = text.match(this.startDateRegex);
    if (startDateMatch) {
      task.startDate = new Date(startDateMatch[1]).getTime();
    }
    
    // Parse other metadata...
    
    return task;
  }
  
  generateMarkdown(task: Task): string {
    // Convert task object back to markdown format
    // ...
  }
}
```

### 3.4 索引方案

1. **初始化索引**:
   - 使用 Obsidian 的 `vault.getMarkdownFiles()` 获取所有 Markdown 文件
   - 解析文件中的任务，构建初始缓存
   - 识别 Tasks 插件语法，提取元数据

2. **实时更新**:
   - 监听 Obsidian 的 `modify` 事件更新缓存
   - 使用 `InlineWorker` 在后台处理大型文件更新
   - 增量更新策略，只更新修改的行

```typescript
class TaskIndexer {
  private taskCache: TaskCache;
  private worker: Worker | null = null;
  private parser: TaskParser;
  private lastIndexTime: Map<string, number> = new Map();

  constructor(plugin: TaskGeniusPlugin) {
    this.taskCache = this.initEmptyCache();
    this.parser = new TaskParser();
    this.setupEventListeners(plugin);
    
    if (window.Worker) {
      this.worker = new Worker('indexer-worker.js');
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
    }
  }

  async indexFile(file: TFile, plugin: TaskGeniusPlugin): Promise<void> {
    const fileContent = await plugin.app.vault.read(file);
    const lines = fileContent.split('\n');
    const taskIds: Set<string> = new Set();
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (this.isTaskLine(line)) {
        const task = this.parser.parseTask(line, file.path, i);
        this.taskCache.tasks.set(task.id, task);
        taskIds.add(task.id);
        
        // Update index maps
        this.updateIndexMaps(task);
      }
    }
    
    // Update file index
    this.taskCache.files.set(file.path, taskIds);
    this.lastIndexTime.set(file.path, Date.now());
  }
  
  private updateIndexMaps(task: Task): void {
    // Add to tag index
    task.tags.forEach(tag => {
      const tasks = this.taskCache.tags.get(tag) || new Set();
      tasks.add(task.id);
      this.taskCache.tags.set(tag, tasks);
    });
    
    // Add to date indexes
    if (task.startDate) {
      const dateStr = this.formatDate(task.startDate);
      const tasks = this.taskCache.startDate.get(dateStr) || new Set();
      tasks.add(task.id);
      this.taskCache.startDate.set(dateStr, tasks);
    }
    
    // Update other indexes...
  }
  
  // Helper methods...
}
```

## 4. 设置项

1. **基本设置**:
   - 任务识别格式 (默认: `- [ ]`)
   - 完成任务格式 (默认: `- [x]`)
   - 排除文件夹列表
   - Tasks 插件兼容模式开关

2. **视图设置**:
   - 默认视图 (今日/收件箱/项目等)
   - 显示列 (标签/截止日期/优先级等)
   - 分组方式 (按项目/日期/标签等)
   - 排序方式 (按优先级/创建时间/名称等)

3. **日期格式设置**:
   - 起始日期表示方式 (`📅`, `start:` 等)
   - 截止日期表示方式 (`⏳`, `due:` 等)
   - 计划日期表示方式 (`⏰`, `scheduled:` 等)
   - 日期格式 (YYYY-MM-DD, MM/DD/YYYY 等)

4. **元数据设置**:
   - 特殊标签前缀 (如项目标签、上下文标签)
   - 优先级表示方式 (`🔼`, `⏫`, `priority:` 等)
   - 时间估算表示方式 (`estimate:` 等)

5. **快捷键**:
   - 打开任务视图
   - 快速添加任务
   - 任务完成/取消
   - 视图切换

## 5. 自定义视图 (Perspectives)

类似 OmniFocus 的 Perspectives，允许用户创建自定义视图:

```typescript
interface Perspective {
  id: string;
  name: string;
  icon?: string;
  filters: TaskFilter[];
  groupBy?: GroupingMethod;
  sortBy: SortingCriteria[];
  columns: ColumnDefinition[];
  savedSearches?: SavedSearch[];
}

interface TaskFilter {
  type: 'tag' | 'project' | 'context' | 'dueDate' | 'startDate' | 
         'scheduledDate' | 'status' | 'priority' | 'recurrence';
  operator: '=' | '!=' | '<' | '>' | 'contains' | 'empty' | 'not-empty' | 'before' | 'after';
  value: any;
  conjunction?: 'AND' | 'OR';
}

interface SavedSearch {
  id: string;
  name: string;
  filters: TaskFilter[];
}
```

默认视图:
- 收件箱 (无项目/上下文的任务)
- 今日任务 (今日截止或标记为今日)
- 已规划 (已分配项目的任务)
- 即将开始 (有起始日期的任务)
- 已安排 (有计划日期的任务)
- 已完成 (最近完成的任务)

## 6. 数据查询与过滤引擎

```typescript
class TaskQueryEngine {
  constructor(private taskCache: TaskCache) {}
  
  query(filters: TaskFilter[], sortBy: SortingCriteria[]): Task[] {
    // Initial set is all tasks
    let taskIds = new Set<string>();
    
    // Get initial task set
    if (filters.length === 0) {
      this.taskCache.tasks.forEach((_, id) => taskIds.add(id));
    } else {
      // Apply each filter
      filters.forEach((filter, index) => {
        const filteredSet = this.applyFilter(filter);
        
        if (index === 0) {
          taskIds = filteredSet;
        } else {
          // Apply conjunction (AND/OR) with previous results
          if (filter.conjunction === 'OR') {
            // Union sets
            filteredSet.forEach(id => taskIds.add(id));
          } else {
            // Intersection (AND is default)
            taskIds = new Set([...taskIds].filter(id => filteredSet.has(id)));
          }
        }
      });
    }
    
    // Convert to task array
    const tasks = [...taskIds].map(id => this.taskCache.tasks.get(id)!);
    
    // Apply sorting
    return this.applySorting(tasks, sortBy);
  }
  
  private applyFilter(filter: TaskFilter): Set<string> {
    switch (filter.type) {
      case 'dueDate':
        return this.filterByDate(this.taskCache.dueDate, filter);
      case 'startDate':
        return this.filterByDate(this.taskCache.startDate, filter);
      case 'scheduledDate':
        return this.filterByDate(this.taskCache.scheduledDate, filter);
      // Other filter types...
    }
  }
  
  private filterByDate(dateMap: Map<string, Set<string>>, filter: TaskFilter): Set<string> {
    // Date filter implementation
    // ...
  }
  
  private applySorting(tasks: Task[], sortBy: SortingCriteria[]): Task[] {
    // Sorting implementation
    // ...
  }
}
```

## 7. 数据持久化

1. **缓存持久化**:
   - 将任务索引存储在 `.obsidian/plugins/task-genius/cache` 目录
   - 启动时快速加载缓存，然后在后台验证/更新
   - 定期自动保存以防数据丢失

2. **设置与视图持久化**:
   - 使用 Obsidian 的 `saveData` 和 `loadData` API
   - 将自定义视图和设置存储在 `.obsidian/plugins/task-genius/data.json`
   - 支持导入/导出自定义视图配置

3. **数据迁移**:
   - 支持从 Tasks 插件迁移设置和数据
   - 版本升级自动数据迁移机制

## 8. 性能考量

1. **增量更新**:
   - 只更新变更的文件，避免全局重新索引
   - 使用文件修改时间戳判断是否需要更新
   - 行级别的差异检测，只处理修改的任务

2. **延迟加载**:
   - 应用启动时只加载基本视图结构
   - 按需加载详细任务数据
   - 视图滚动时动态加载更多任务

3. **分批处理**:
   - 对大型库使用分批处理避免界面冻结
   - 使用 `requestIdleCallback` 优化处理时机
   - 基于用户交互优先级调整处理队列

4. **缓存策略**:
   - 多级缓存策略：内存、IndexedDB 和文件
   - LRU 缓存策略清理不常用数据
   - 压缩持久化数据减少存储需求

## 9. 用户界面

基于 OmniFocus 风格设计:
- 左侧视图切换栏（自定义视图列表）
- 上方过滤和搜索栏（高级过滤选项）
- 中间任务列表区域（支持分组和折叠）
- 右侧任务详情区域（元数据编辑）
- 底部信息栏（统计和快速操作）

UI 组件:
- 任务列表组件（支持嵌套、分组、批量操作）
- 任务编辑器（支持快速编辑任务元数据）
- 日期选择器（适配 Tasks 插件日期格式）
- 快速过滤栏（预设过滤条件）
- 拖放支持（重新排序和组织任务）

## 10. 与 Tasks 插件兼容

1. **语法兼容**:
   - 完全支持 Tasks 插件的任务语法
   - 兼容 Tasks 的日期格式 (📅, ⏳, ⏰)
   - 支持 Tasks 的优先级标记 (🔼, ⏫, 🔽)
   - 支持 Tasks 的重复任务语法 (🔁)

2. **功能兼容**:
   - 提供 Tasks 插件主要功能的超集
   - 可与 Tasks 插件并存，互不干扰
   - 可读取 Tasks 插件的设置和任务

3. **迁移工具**:
   - 提供从 Tasks 插件迁移配置的向导
   - 任务格式双向转换支持

## 11. 开发路线图

1. 第一阶段: 基础功能与 Tasks 兼容
   - 任务索引与缓存系统
   - Tasks 插件语法兼容
   - 基本视图与过滤
   - 任务编辑

2. 第二阶段: 高级功能
   - 自定义视图 (Perspectives)
   - 高级查询语言
   - 批量编辑功能
   - 任务依赖关系

3. 第三阶段: 性能优化与扩展
   - 大型库优化
   - 移动端支持
   - API 供其他插件使用
   - 插件集成能力

4. 第四阶段: 自动化与智能功能
   - 任务自动分类
   - 智能排序建议
   - 时间估算和提醒
   - 进度跟踪和报告
