# 🛡️ AI Agent Guard

AI Agent Guard 是一个用于保障 AI Agent 安全、可控、可靠运行的综合解决方案。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

## 📋 功能特性

| 模块 | 功能 | 说明 |
|------|------|------|
| 01-eval-engine | 评估引擎 | 本地规则 + 浏览器大模型评估 |
| 02-rules-library | 规则库 | 多维度评分规则（general/tts/code） |
| 03-convergence-detector | 收敛检测 | 分数波动 + 内容相似度双重检测 |
| 04-similarity-tool | 相似度工具 | Dice系数 + 相似词扩展算法 |
| 05-guard-proxy | 护卫代理 | 5层约束检查 |
| 06-config-panel | 配置面板 | 暗黑科技风UI，多页面路由 |
| 07-memory-module | 记忆模块 | 跨轮记忆存储与读取 |
| 08-logging-module | 日志模块 | 多级别日志 + 告警 + 轮转 |
| 09-monitoring-panel | 监控面板 | 实时状态监控面板 |

## 🚀 快速开始

### 安装依赖

```bash
cd D:\ai-agent-guard\integrator
npm install
```

### 快速接入（3行代码）

```javascript
const Integrator = require('./integrator/index.js');

const guard = new Integrator({ evalModel: 'local', defaultScenario: 'general' });

// 评估输出
const result = await guard.evaluate(output, task);
```

## 📖 详细文档

### 场景化配置示例

#### 通用对话助手

```javascript
const guard = new Integrator({
  evalModel: 'doubao',
  defaultScenario: 'general',
  config: {
    forbiddenWords: ['作弊', '外挂', '暴力'],
    maxLength: 5000,
    maxTurns: 20,
    scoreThreshold: 70,
    similarityThreshold: 85
  }
});
```

#### TTS语音合成

```javascript
const guard = new Integrator({
  evalModel: 'zhipu',
  defaultScenario: 'tts',
  config: {
    forbiddenWords: [],
    maxLength: 2000,
    maxTurns: 5,
    scoreThreshold: 75,
    similarityThreshold: 90
  }
});
```

#### 代码助手

```javascript
const guard = new Integrator({
  evalModel: 'kimi',
  defaultScenario: 'code',
  config: {
    forbiddenWords: ['eval', 'exec', 'system', 'os.system'],
    maxLength: 10000,
    maxTurns: 30,
    scoreThreshold: 80,
    similarityThreshold: 75
  }
});
```

## 🌐 REST API Server

### 启动服务器

```bash
node api-server.js
```

服务器将在 `http://0.0.0.0:18791` 启动。

### API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/evaluate` | 评估输出 |
| POST | `/check` | 约束检查 |
| POST | `/convergence` | 收敛检测 |
| POST | `/similarity` | 相似度计算 |
| POST | `/memory` | 保存记忆 |
| GET | `/memory/:taskId` | 获取最佳实践 |
| GET | `/config` | 获取配置 |
| PUT | `/config` | 更新配置 |
| POST | `/rules/reload` | 热更新规则 |
| GET | `/status` | 系统状态 |

### API 使用示例

```bash
# 健康检查
curl http://localhost:18791/health

# 评估输出
curl -X POST http://localhost:18791/evaluate \
  -H "Content-Type: application/json" \
  -d '{"output": "AI输出内容", "task": "用户任务"}'

# 约束检查
curl -X POST http://localhost:18791/check \
  -H "Content-Type: application/json" \
  -d '{"content": "待检查内容"}'

# 相似度计算
curl -X POST http://localhost:18791/similarity \
  -H "Content-Type: application/json" \
  -d '{"text1": "今天天气很好", "text2": "今天天气不错"}'
```

## 🧪 测试

### 运行所有测试

```bash
# 单元测试
node tests/unit.test.js

# 集成测试
node integrator/full-test.js
```

### 测试结果

```
总测试项: 30
通过: 30 ✅
失败: 0
通过率: 100%
综合评分: A (优秀)
```

## ⚙️ 配置

### 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
cp .env.example .env
```

主要配置项：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 18791 | API服务端口 |
| HOST | 0.0.0.0 | API服务地址 |
| EVAL_MODEL | local | 评估模型 |
| DEFAULT_SCENARIO | general | 默认场景 |
| LOG_LEVEL | info | 日志级别 |

## 📁 项目结构

```
ai-agent-guard/
├── api-server.js           # REST API服务器
├── integrator/             # 模块集成器
│   ├── index.js           # 主集成类
│   ├── full-test.js       # 集成测试
│   └── package.json
├── subprojects/           # 子项目模块
│   ├── 01-eval-engine/    # 评估引擎
│   ├── 02-rules-library/  # 规则库
│   ├── 03-convergence-detector/  # 收敛检测
│   ├── 04-similarity-tool/       # 相似度工具
│   ├── 05-guard-proxy/    # 护卫代理
│   ├── 06-config-panel/   # 配置面板
│   ├── 07-memory-module/  # 记忆模块
│   ├── 08-logging-module/ # 日志模块
│   └── 09-monitoring-panel/ # 监控面板
├── tests/                # 测试
│   └── unit.test.js
├── docs/                 # 文档
│   └── 快速接入教程.md
├── .env.example         # 环境配置示例
├── .gitignore
├── README.md
└── package.json
```

## 🔒 安全特性

- **输入消毒**: 自动移除HTML标签和危险字符
- **请求限流**: 防止API滥用
- **CORS控制**: 可配置跨域访问
- **敏感信息保护**: 日志中自动屏蔽敏感数据

## 📈 性能基准

| 操作 | 平均耗时 |
|------|----------|
| 本地评估 | < 50ms |
| 相似度计算 | < 10ms |
| 约束检查 | < 5ms |
| 收敛检测 | < 5ms |

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT License - 详见 [LICENSE](LICENSE) 文件
