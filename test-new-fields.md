# 新字段测试文档

## 测试新字段功能

### 1. OnCompletion 字段测试
- [ ] 测试任务1 🏁 sendEmail
- [ ] 测试任务2 [onCompletion:: notifyTeam]

### 2. DependsOn 字段测试  
- [ ] 测试任务3 ⛔ task1,task2
- [ ] 测试任务4 [dependsOn:: task3,task5]

### 3. ID 字段测试
- [ ] 测试任务5 🆔 task-001
- [ ] 测试任务6 [id:: task-002]

### 4. 混合字段测试
- [ ] 复杂任务 🏁 cleanup ⛔ task-001,task-002 🆔 complex-task-001 📅 2024-12-31
- [ ] 另一个复杂任务 [onCompletion:: archive] [dependsOn:: complex-task-001] [id:: final-task] [due:: 2025-01-15]

### 5. 编辑测试
这些任务可以用来测试：
- 内联编辑器的新字段编辑功能
- 元数据编辑器的新字段支持
- 字段的显示和样式
- 数据的正确保存和加载
