# Convergence Detector - 收敛检测器

监控 Agent 多轮循环，判断是否收敛。

## 核心功能

- **分数稳定性检测**: 连续 N 轮评估分数波动在阈值内
- **文本相似度检测**: 连续 2 轮输出内容高度相似
- **无实质修改检测**: 单轮循环无实质内容变化

## 收敛判定条件

满足任一条件即触发收敛：

| 条件 | 阈值 | 触发 |
|------|------|------|
| 分数波动稳定 | 连续 3 轮波动 ≤ 3% | ✓ |
| 内容高度相似 | 连续 2 轮相似度 ≥ 92% | ✓ |
| 无实质修改 | 相似度 > 98% 或显式标记 | ✓ |

## 安装

```bash
# 依赖无，直接引入
const ConvergenceDetector = require('./convergence-detector');
```

## 使用示例

### 基础用法

```javascript
const ConvergenceDetector = require('./convergence-detector');

const detector = new ConvergenceDetector({
  scoreThreshold: 3,        // 分数波动阈值(%)
  similarityThreshold: 92,  // 相似度阈值(%)
  consecutiveRounds: 3,    // 连续轮数
});

// 记录每一轮输出
detector.record({ score: 85, text: '解决方案A' });
detector.record({ score: 84, text: '解决方案B' });
detector.record({ score: 85.5, text: '解决方案C' });

// 检查收敛状态
const result = detector.check();
console.log(result);
// {
//   converged: true,
//   reason: '连续3轮分数波动1.5% ≤ 3%',
//   details: { ... }
// }
```

### 注入相似度工具

```javascript
// 配合子项目4（相似度工具）使用
const SimilarityTool = require('../04-similarity-tool/similarity-tool');

const similarityTool = new SimilarityTool();
const detector = new ConvergenceDetector();

// 注入相似度工具
detector.setSimilarityTool(similarityTool);

// 或在构造函数中注入
const detector2 = new ConvergenceDetector({
  similarityTool: similarityTool
});
```

### 显式标记无实质修改

```javascript
detector.record({ 
  score: 81, 
  text: '原方案',
  hasContentChange: false  // 显式标记为无实质修改
});
```

### 从配置文件加载

```javascript
const detector = ConvergenceDetector.load('./config.json');

// 或传入配置对象
const detector2 = ConvergenceDetector.load({
  scoreThreshold: 5,
  similarityThreshold: 90,
  consecutiveRounds: 4
});
```

### 重置状态

```javascript
detector.reset();
```

## API

### `new ConvergenceDetector(config)`

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| scoreThreshold | number | 3 | 分数波动阈值(%) |
| similarityThreshold | number | 92 | 相似度阈值(%) |
| consecutiveRounds | number | 3 | 连续触发轮数 |
| maxHistorySize | number | 20 | 最大历史记录数 |
| similarityTool | object | null | 相似度工具实例 |

### `record(output)`

记录一轮输出。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| score | number | ✓ | 评估分数 (0-100) |
| text | string | ✓ | 输出文本 |
| hasContentChange | boolean | - | 是否有实质修改 |
| metadata | object | - | 额外元数据 |

### `check()`

检查收敛状态，返回：

```javascript
{
  converged: boolean,      // 是否收敛
  reason: string,         // 收敛原因
  details: {
    triggeredBy: string,  // 触发的条件
    historyLength: number // 历史记录长度
  }
}
```

### `reset()`

清空历史记录，重置收敛状态。

### `getHistory()`

获取当前历史记录数组。

## OpenClaw 集成

由于 OpenClaw 没有运行时监控 API，本检测器设计为**事后分析**模式：

### 被动模式（当前）

```javascript
// Agent 完成后分析历史
const detector = new ConvergenceDetector();
agent.on('complete', () => {
  const result = detector.check();
  if (result.converged) {
    console.log('收敛已触发:', result.reason);
  }
});
```

### 主动模式（未来）

如果 OpenClaw 提供回调接口，可实现：

```javascript
// 未来可能的主动监控
const detector = new ConvergenceDetector();
agent.on('roundComplete', (output) => {
  detector.record(output);
  if (detector.check().converged) {
    agent.stop();
  }
});
```

## 配合短 Timeout 使用

建议配合短 timeout 使用，实现"尽快收敛"：

```javascript
// 设定较短的超时时间
agent.setTimeout(30000); // 30秒

agent.on('timeout', () => {
  const result = detector.check();
  console.log('超时时的收敛状态:', result);
});
```

## 注意事项

1. **历史记录限制**: 默认保留最近 20 轮，超出后自动清理最早的记录
2. **内置相似度**: 未注入工具时使用字符级 n-gram Jaccard 相似度
3. **分数范围**: 假设评估分数范围为 0-100
4. **线程安全**: 单线程使用场景，无需考虑并发

## 项目结构

```
ai-agent-guard/
├── subprojects/
│   ├── 01-th-party-evaluator/     # 第三方评估器
│   ├── 02-loop-detector/          # 循环检测器
│   ├── 03-convergence-detector/   # 本项目
│   └── 04-similarity-tool/         # 相似度工具（依赖）
│       └── similarity-tool.js
├── convergence-detector.js         # 主检测器
├── config.json                     # 配置文件
└── README.md                       # 说明文档
```

## License

MIT
