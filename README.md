# AI Agent Guard

🛡️ AI Agent Guard 是一个用于保障 AI Agent 安全、可控、可靠运行的综合解决方案。

## 核心模块

| 模块 | 功能 |
|------|------|
| 01-eval-engine | 第三方评估引擎，支持本地/浏览器/API多种模式 |
| 02-rules-library | 多维度评分规则库（通用/TTS/代码场景） |
| 03-convergence-detector | 多轮对话收敛检测 |
| 04-similarity-tool | 中文语义相似度计算工具 |
| 05-guard-proxy | Agent Guard Proxy 护卫代理 |
| 06-config-panel | 可视化配置面板（暗黑科技风格） |
| 07-memory-module | 跨轮记忆模块 |

## 技术特性

- 🎯 **评估引擎**: 本地规则评估 + 浏览器大模型评估
- 🔍 **语义相似度**: Dice系数 + 相似词扩展算法
- 📊 **收敛检测**: 分数波动 + 内容相似度双重检测
- 🛡️ **约束引擎**: 5层约束检查（违禁词/格式/越界/冗余/轮次）
- 💾 **记忆模块**: 跨轮记忆存储与读取
- 🎨 **配置面板**: 暗黑科技风UI，支持多页面路由

## 快速开始

```bash
# 安装依赖
cd integrator
npm install

# 运行测试
node full-test.js

# 启动配置面板
cd ../subprojects/06-config-panel
# 直接打开 index.html
```

## 项目结构

```
ai-agent-guard/
├── subprojects/          # 子项目模块
│   ├── 01-eval-engine/
│   ├── 02-rules-library/
│   ├── 03-convergence-detector/
│   ├── 04-similarity-tool/
│   ├── 05-guard-proxy/
│   ├── 06-config-panel/
│   └── 07-memory-module/
├── integrator/          # 模块集成器
└── docs/               # 文档
```

## 技术栈

- Node.js
- Playwright (浏览器自动化)
- 原生JavaScript/CSS
- 本地存储 (localStorage/JSON文件)

## License

MIT
