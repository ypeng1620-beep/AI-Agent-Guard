# AI Agent Guard - 可视化配置面板

> 纯前端实现的配置管理系统，无需后端即可独立运行

## 功能特性

- 🖥️ **纯前端实现** - 原生 HTML/CSS/JS，无任何框架依赖
- 💾 **本地存储优先** - 配置自动保存到 localStorage
- 📥📤 **导入导出** - 支持 JSON 文件导入导出
- ⚡ **实时预览** - 修改配置时即时显示预览
- 🎨 **现代UI** - 卡片式布局，响应式设计
- ⌨️ **快捷键支持** - Ctrl+S 保存，Ctrl+E 导出，Ctrl+R 重置

## 文件结构

```
06-config-panel/
├── index.html          # 主页面
├── css/
│   └── style.css       # 样式表
├── js/
│   ├── app.js          # 主应用逻辑
│   ├── config-manager.js  # 配置管理
│   └── api.js          # 后端通信
└── README.md           # 本文档
```

## 配置项说明

### 约束规则配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| 违禁词列表 | 文本 | 作弊, 作弊方法... | 每行一个，支持批量编辑 |
| 格式规范 | 文本 | 回答必须包含序号和详细说明 | 自定义输出格式要求 |
| 最大长度 | 数字 | 5000 | 回答最大字符数 |
| 最大轮次 | 数字 | 10 | 对话最大轮数限制 |

### 收敛阈值配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| 分数波动阈值 | 滑块 | 5% | 1-10%，判断收敛的分数变化幅度 |
| 相似度阈值 | 滑块 | 90% | 80-100%，判断回答相似度 |
| 连续轮次 | 数字 | 3 | 触发收敛的最小连续次数 |

### 评估模型配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| 评估模型 | 下拉 | Claude 3.5 Sonnet | 支持 Claude/GPT 系列 |
| API Key | 密码 | 空 | 第三方API密钥 |
| 合格分数线 | 滑块 | 70 | 0-100，评判合格标准 |

## 使用方式

### 直接打开

```bash
# 在浏览器中直接打开
open index.html
# 或
start index.html   # Windows
xdg-open index.html  # Linux
```

### 本地服务器

```bash
# Python
python -m http.server 8080

# Node.js
npx serve .

# PHP
php -S localhost:8080
```

然后访问 `http://localhost:8080`

## 与后端通信

配置面板默认尝试连接 `http://localhost:18790` 的后端服务。

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/status` | GET | 获取运行状态 |
| `/api/config` | GET | 获取配置 |
| `/api/config/sync` | POST | 同步配置 |
| `/api/validate` | POST | 验证 API Key |

### 配置后端地址

在 `js/api.js` 中修改 `baseUrl`:

```javascript
const api = new API('http://your-backend-url:port');
```

## 数据存储

### localStorage

配置优先存储在浏览器 localStorage，键名: `agent-guard-config`

### 文件导出

导出的 JSON 文件包含完整配置和元数据:

```json
{
  "forbiddenWords": ["作弊", "作弊方法"],
  "formatRules": "回答必须包含序号",
  "maxLength": 5000,
  "scoreThreshold": 5,
  ...
  "_meta": {
    "version": "1.0",
    "exportedAt": "2024-01-01T00:00:00.000Z",
    "exportedBy": "agent-guard-config-panel"
  }
}
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl/Cmd + S | 保存配置 |
| Ctrl/Cmd + E | 导出配置 |
| Ctrl/Cmd + R | 重置配置 |

## 浏览器兼容性

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## License

MIT
