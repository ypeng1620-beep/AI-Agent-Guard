# Agent Guard Proxy - 护卫代理

所有指令和输出经过 Proxy 过滤的中间层服务。

## 核心功能

- **指令转发**: 将用户指令转发给 OpenClaw Agent
- **5层约束检查**: 违禁词、格式、范围、冗余、轮次
- **阻断机制**: 违规输出直接丢弃并记录
- **重试控制**: 自动生成修正指令并重试
- **熔断保护**: 连续违规达到阈值时终止任务

## 架构

```
用户 → Guard Proxy:18790
            ↓
    ┌───────┴───────┐
    ↓               ↓
约束检查通过     约束检查失败
    ↓               ↓
  放行给用户     阻断 + 生成修正指令
                      ↓
              ┌───────┴───────┐
              ↓               ↓
          可重试          熔断终止
              ↓
          重试Agent
```

## 目录结构

```
05-guard-proxy/
├── guard-proxy.js        # 主服务（入口）
├── dispatcher.js         # 指令转发模块
├── constraint-checker.js # 约束检查（5层）
├── blocker.js           # 阻断模块
├── retry-controller.js  # 重试控制器
├── fuse.js              # 熔断机制
├── config.json          # 配置文件
├── logs/                # 阻断日志目录
│   └── blocked.log     # 被阻断的输出记录
└── README.md
```

## 安装

```bash
npm install
```

## 配置

编辑 `config.json`:

```json
{
  "port": 18790,
  "openclawUrl": "http://127.0.0.1:18789",
  "maxRetries": 3,
  "fuseThreshold": 3,
  "rules": {
    "prohibitedWords": ["违禁词1", "违禁词2"],
    "maxLength": 50000,
    "minLength": 1,
    "requiredFormat": null,
    "maxRounds": 50,
    "maxRedundancyScore": 0.7
  }
}
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| port | number | 18790 | 服务端口 |
| openclawUrl | string | http://127.0.0.1:18789 | OpenClaw Agent 地址 |
| maxRetries | number | 3 | 最大重试次数 |
| fuseThreshold | number | 3 | 熔断阈值（连续违规次数） |
| rules.prohibitedWords | array | [] | 违禁词列表 |
| rules.maxLength | number | 50000 | 最大输出长度 |
| rules.minLength | number | 1 | 最小输出长度 |
| rules.requiredFormat | string | null | 要求的格式（json/xml/markdown/html） |
| rules.maxRounds | number | 50 | 最大对话轮次 |
| rules.maxRedundancyScore | number | 0.7 | 冗余相似度阈值 |

## 使用

### 启动服务

```bash
node guard-proxy.js
```

### API 端点

#### POST / - 处理任务

请求体:
```json
{
  "instruction": "用户指令内容",
  "sessionId": "可选的会话ID",
  "context": {}
}
```

响应:
```json
{
  "success": true,
  "output": "Agent输出内容",
  "passed": true,
  "stats": {
    "round": 1,
    "checkDuration": 50,
    "scores": {...}
  }
}
```

#### GET /health - 健康检查

响应:
```json
{
  "status": "running",
  "port": 18790,
  "agent": {"healthy": true, "statusCode": 200},
  "fuse": {"violationCount": 0, "threshold": 3, "state": "closed"},
  "uptime": 3600
}
```

#### GET /stats - 统计信息

响应:
```json
{
  "requestCount": 100,
  "blockedCount": 5,
  "blockRate": "5.00%",
  "activeSessions": 3,
  "fuse": {...}
}
```

### 作为模块使用

```javascript
const GuardProxy = require('./guard-proxy');

const proxy = new GuardProxy({
  port: 18790,
  openclawUrl: 'http://127.0.0.1:18789',
  maxRetries: 3,
  rules: {
    prohibitedWords: ['违禁词1', '违禁词2'],
    maxLength: 10000
  }
});

proxy.start();

// 或者直接处理单个任务
const result = await proxy.processTask({
  instruction: '你的指令',
  sessionId: 'session-123'
});

console.log(result);
```

## 5层约束检查

### 第1层: 违禁词检查
检测输出中是否包含违禁词列表中的词汇。

### 第2层: 格式合规检查
验证输出是否符合指定格式（JSON/XML/Markdown/HTML）。

### 第3层: 内容越界检查
检查输出长度是否在允许范围内。

### 第4层: 重复无效修改检查
通过相似度算法检测输出是否与历史输出重复。

### 第5层: 最大轮次检查
确保对话轮次在允许范围内。

## 熔断机制

当连续违规次数达到 `fuseThreshold`（默认3次）时：
- 熔断器打开
- 拒绝所有新请求
- 返回 `retryAfter` 建议等待时间

熔断后需要手动重置或等待超时后自动进入半开状态。

## 日志

阻断日志保存在 `logs/blocked.log`，包含：
- 阻断时间戳
- 违规原因
- 被阻断的输出内容
- 关联的会话信息

## 与 OpenClaw 集成

Guard Proxy 通过 HTTP API 与 OpenClaw 通信：

1. **sessions/send**: 发送消息到指定会话
2. **sessions/spawn**: 创建新的 isolated 会话

确保 OpenClaw Gateway 运行在配置的 `openclawUrl` 地址。
