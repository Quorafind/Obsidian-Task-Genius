# Storage API 修复记录

## 完成的修复

### 1. API 不匹配问题
- **问题**: Storage.ts 使用了 LocalStorageCache 不存在的方法 `clearFile()` 和 `getKeys()`
- **修复**: 
  - 将所有 `clearFile()` 调用替换为 `removeFile()`
  - 将所有 `getKeys()` 调用替换为 `allFiles()` 或 `allKeys()`

### 2. 哈希校验逻辑不一致
- **问题**: 
  - `storeRaw()` 使用任务数组计算哈希
  - `isRawValid()` 使用文件内容计算哈希
  - 导致校验失真
- **修复**: 
  - 修改 `storeRaw()` 签名，增加可选的 `fileContent` 参数
  - 使用文件内容（如果提供）计算哈希，保持语义一致
  - 更新 Orchestrator.processFileImmediate() 调用，传入 fileContent

### 3. clearNamespace 实现修正
- **问题**: 原实现使用底层的完整键，而非路径化键
- **修复**: 
  - 改为使用 `allFiles()` 获取路径化键
  - 按正确的前缀模式匹配和删除
  - 为每个命名空间定义明确的前缀映射

### 4. consolidated 快照 API 统一
- **问题**: 混用了 `loadFile()` 和专用的 consolidated API
- **修复**: 
  - `loadConsolidated()` 改用 `loadConsolidatedCache()`
  - `storeConsolidated()` 改用 `storeConsolidatedCache()`
  - 保持与 LocalStorageCache 的设计一致

### 5. getStats() 统计方法修正
- **问题**: 使用底层键统计，计数不准确
- **修复**: 
  - 改用 `allFiles()` 获取路径化键
  - 按正确的前缀模式统计各命名空间的文件数

## 影响范围

### 修改的文件
1. `/src/dataflow/persistence/Storage.ts` - 主要修复
2. `/src/dataflow/Orchestrator.ts` - 更新 storeRaw() 调用参数

### 行为改进
- ✅ 冷启动优先从快照加载，无需等待索引
- ✅ 单文件内容校验准确可靠
- ✅ 命名空间清理功能正常工作
- ✅ 统计数据准确反映实际存储状态
- ✅ 版本不兼容时正确清理过期缓存

## 后续建议

### 短期优化
1. 考虑将 Keys 命名空间管理抽象为独立的 helper 类
2. 添加单元测试覆盖所有存储操作
3. 增加缓存命中率的监控指标

### 长期改进
1. 实现渐进式 schema 迁移器，而非简单的版本检查删除
2. 考虑添加缓存压缩机制以减少存储空间占用
3. 实现更智能的缓存淘汰策略（LRU/LFU）

## 验证清单

- [x] removeFile() 方法调用正常
- [x] allFiles() 返回正确的路径化键
- [x] clearNamespace 按前缀正确删除
- [x] consolidated API 使用统一
- [x] 哈希校验逻辑一致
- [x] getStats() 统计准确
- [x] Orchestrator 传参更新

## 相关文档
- [TaskIndexer 迁移计划](./taskindexer-migration-plan.md)
- [Dataflow 架构文档](./dataflow-architecture.md)