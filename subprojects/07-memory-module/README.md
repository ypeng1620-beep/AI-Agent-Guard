# 跨轮记忆模块

存储Agent历史评估分数、违规操作、收敛数据，让Agent在启动新任务时自动读取历史记忆。

## 目录结构

```
07-memory-module/
├── memory-store.js      # 记忆存储模块
├── memory-reader.js     # 记忆读取模块
├── README.md            # 说明文档
└── storage/             # 存储目录（自动创建）
    ├── eval_history/     # 评估历史
    │   ├── general/     # 通用任务
    │   ├── tts/          # TTS任务
    │   └── code/         # 代码任务
    ├── violations/       # 违规记录
    │   ├── general/
    │   ├── tts/
    │   └── code/
    └── convergence/     # 收敛数据
        ├── general/
        ├── tts/
        └── code/
```

## 快速开始

### 1. 初始化存储

```javascript
const MemoryStore = require('./memory-store');
const MemoryReader = require('./memory-reader');

// 方式一：直接使用
const store = new MemoryStore('./storage');

// 方式二：配合Reader使用
const reader = new MemoryReader('./storage');
```

### 2. 存储评估结果

```javascript
// 存储评估结果
store.saveEval('task-001', {
  score: 85,
  totalScore: 100,
  criteria: {
    accuracy: 90,
    completeness: 80,
    efficiency: 85
  }
}, 'general');
```

### 3. 存储违规记录

```javascript
// 存储违规记录
store.saveViolation('task-001', {
  type: 'timeout',
  description: '任务执行超时',
  severity: 'medium',
  suggestion: '增加超时限制或优化执行效率'
}, 'general');
```

### 4. 存储收敛数据

```javascript
// 存储收敛数据
store.saveConvergence('task-001', {
  loopCount: 5,
  convergenceTime: 30000,  // 毫秒
  converged: true,
  finalError: 0.01
}, 'general');
```

### 5. 读取历史记忆

```javascript
// 获取同类任务的历史评估
const history = store.getHistory('general', 10);

// 获取违规历史
const violations = store.getViolations('general', 10);

// 获取收敛历史
const convergence = store.getConvergenceHistory('general', 10);
```

### 6. 生成记忆上下文

```javascript
// 构建供Agent使用的记忆上下文
const context = reader.buildContext('general', '执行数据清洗任务');

// 输出示例:
// 【跨轮记忆 - GENERAL】
// 
// 📊 收敛统计:
//   - 平均循环次数: 4.2次
//   - 平均收敛时间: 25秒
//   - 收敛率: 95.0%
// 
// ⚠️ 历史违规规避:
//   - [timeout] 任务执行超时
//     → 增加超时限制或优化执行效率
// 
// 📝 最近评估:
//   - task-001: 分数 85
```

### 7. 获取规避建议

```javascript
// 获取规避历史违规的建议
const hints = reader.getAvoidanceHints('code');
// 返回:
// [
//   {
//     pattern: 'timeout',
//     description: '任务执行超时',
//     suggestion: '增加超时限制或优化执行效率',
//     severity: 'medium'
//   },
//   ...
// ]
```

### 8. 获取收敛统计

```javascript
// 获取历史收敛数据统计
const stats = reader.getConvergenceData('tts');
// 返回:
// {
//   sampleCount: 20,
//   avgLoopCount: 3.5,
//   avgConvergenceTime: 15000,
//   minLoopCount: 2,
//   maxLoopCount: 8,
//   convergenceRate: 95.0,
//   tips: ['历史平均循环次数较高，建议优化收敛策略']
// }
```

### 9. 获取最佳实践

```javascript
// 获取相似任务的最佳实践
const bestPractices = reader.getBestPractices('code', 3);
// 返回得分最高的3条记录及其策略
```

## 数据格式

### 评估记录 (eval_history)

```json
{
  "taskId": "task-001",
  "taskType": "general",
  "timestamp": "2026-03-31T12:00:00.000Z",
  "data": {
    "score": 85,
    "totalScore": 100,
    "criteria": {...}
  }
}
```

### 违规记录 (violations)

```json
{
  "taskId": "task-001",
  "taskType": "general",
  "timestamp": "2026-03-31T12:00:00.000Z",
  "data": {
    "type": "timeout",
    "description": "任务执行超时",
    "severity": "medium",
    "suggestion": "增加超时限制"
  }
}
```

### 收敛记录 (convergence)

```json
{
  "taskId": "task-001",
  "taskType": "general",
  "timestamp": "2026-03-31T12:00:00.000Z",
  "data": {
    "loopCount": 5,
    "convergenceTime": 30000,
    "converged": true,
    "finalError": 0.01
  }
}
```

## 任务类型

| 类型 | 说明 | 使用场景 |
|------|------|----------|
| `general` | 通用任务 | 默认类型，通用任务 |
| `tts` | 语音合成任务 | TTS相关评估 |
| `code` | 编码任务 | 代码生成、调试等 |

## 索引机制

每个子目录包含 `_index.json` 文件，记录所有记录的元信息，用于快速检索：

```json
[
  {
    "taskId": "task-001",
    "file": "eval_1711876800000.json",
    "timestamp": "2026-03-31T12:00:00.000Z",
    "score": 85
  },
  ...
]
```

索引自动维护，保留最近100条记录。

## 维护功能

### 清理旧记录

```javascript
// 保留每种类型最近50条记录
store.cleanup(50);
```

### 查看统计

```javascript
// 获取各类型的记录统计
const stats = store.getStats();
// 或通过reader
const stats = reader.getStats();
```

## 集成到Agent

在Agent执行任务时：

1. **任务开始**：调用 `reader.buildContext()` 获取历史记忆
2. **任务评估**：调用 `store.saveEval()` 保存评估结果
3. **发现违规**：调用 `store.saveViolation()` 记录违规
4. **任务收敛**：调用 `store.saveConvergence()` 保存收敛数据

```javascript
// Agent任务执行示例
async function executeTask(taskId, taskType, taskFn) {
  const reader = new MemoryReader('./storage');
  
  // 1. 读取历史记忆
  const context = reader.buildContext(taskType, taskDescription);
  
  // 2. 使用历史数据优化执行
  // ...
  
  // 3. 执行任务并评估
  const result = await taskFn(context);
  store.saveEval(taskId, result.eval, taskType);
  
  // 4. 记录违规（如果有）
  if (result.violations) {
    result.violations.forEach(v => store.saveViolation(taskId, v, taskType));
  }
  
  // 5. 记录收敛数据
  store.saveConvergence(taskId, result.convergence, taskType);
}
```

## License

MIT
