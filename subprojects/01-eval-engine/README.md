# 第三方独立评估引擎 v3

调用各大 AI 模型对 Agent 输出进行客观评分的评估引擎，支持用户自定义选择模型。

## 🆕 v3 新功能

### 1. 内置浏览器自动化（无需额外安装）
- ✅ Playwright 已内置到本项目 `node_modules/`
- ✅ 无需依赖外部 Agent Browser 技能
- ✅ 支持 Chromium 无头浏览器

### 2. 用户可选择的模型选择器
直接打开 `index.html`，即可通过图形界面：
- 选择地区（🇨🇳 国内 / 🌍 海外）
- 选择优先使用的模型
- 测试评估效果
- 自动保存配置

### 3. 智能优先级路由

**🇨🇳 国内用户优先级：**
```
本地评估器 → 豆包 → 智谱GLM → Kimi → MiniMax → 通义千问 → Groq → Mistral → OpenRouter → Claude API → GPT-4 API
```

**🌍 海外用户优先级：**
```
本地评估器 → Gemini → Mistral → Groq → Poe → 豆包(国际) → 智谱(国际) → OpenRouter → Claude API → GPT-4 API
```

## 📁 文件说明

| 文件 | 说明 |
|------|------|
| index.html | 模型选择器（浏览器打开即可使用）|
| eval-engine.js | 核心评估引擎（含浏览器自动化）|
| config.json | 配置文件 |
| package.json | npm 依赖配置 |
| node_modules/ | Playwright 等依赖（已内置）|

## 🚀 快速开始

### 方式一：图形界面（推荐）

直接双击打开 `index.html`，选择模型后点击测试。

### 方式二：代码调用

```javascript
const { EvalEngine } = require('./eval-engine.js');

// 自动检测 + 本地优先
const engine = new EvalEngine({
  region: 'auto',       // 自动检测，或指定 'cn' / 'overseas'
  selectedModel: 'local', // 默认本地评估器
  timeout: 60000
});

const result = await engine.evaluate({
  task: '总结今天天气',
  output: '今天天气晴朗，温度25度，适合外出活动。'
});

console.log(result);
// { score: 73, passed: true, dimensions: {...}, ... }
```

## 🔧 API

### EvalEngine(config)

| 参数 | 默认值 | 说明 |
|------|--------|------|
| region | 'auto' | 地区：'auto' / 'cn' / 'overseas' |
| selectedModel | 'local' | 优先模型：'local' / 'doubao' / 'gemini' 等 |
| apiKey | '' | API Key（可选）|
| minScore | 60 | 合格分数线 |
| timeout | 60000 | 超时（毫秒）|
| browserMode | true | 是否启用浏览器模式 |

## 📋 可用模型 ID

### 本地评估（零成本）
| ID | 名称 | 说明 |
|----|------|------|
| local | 本地评估器 | 基于规则，无需网络 |

### 浏览器模式（免费网页版）
| ID | 名称 | 地区 |
|----|------|------|
| doubao | 字节豆包 | 🇨🇳 |
| zhipu | 智谱 GLM-4 | 🇨🇳 |
| kimi | Kimi | 🇨🇳 |
| minimax | MiniMax 2.7 | 🇨🇳 |
| qianwen | 通义千问 | 🇨🇳 |
| gemini | Google Gemini | 🌍 |
| mistral | Mistral | 🌍 |
| groq | Groq (Llama 3.3) | 🌍 |
| poe | Poe 聚合 | 🌍 |

### API 模式（需要 Key）
| ID | 名称 |
|----|------|
| openrouter | OpenRouter (部分免费) |
| claude_api | Claude API |
| gpt4_api | GPT-4 API |

## ⚠️ 注意事项

1. **本地评估器**：零成本，适合快速测试
2. **浏览器模式**：首次会自动下载 Chromium（约150MB）
3. **地区自动检测**：会根据时区自动判断国内/海外用户
4. **优先级链**：如果首选模型不可用，会自动尝试下一个

## 📦 依赖

已内置，无需额外安装：
- playwright@1.58.2

## 🎯 使用场景

- 评估 Agent 输出质量
- 批量测试多条输出
- 监控系统稳定性
- 自动化评分报告
