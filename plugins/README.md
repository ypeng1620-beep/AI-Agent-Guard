# AI Agent Guard 插件目录

本目录用于存放自定义插件。插件会在系统启动时自动加载。

## 插件格式

```javascript
/**
 * 示例插件
 */
const myPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  description: '我的自定义插件',
  
  // 插件初始化时被调用
  register(loader) {
    // 注册评估前钩子
    loader.registerHook('beforeEvaluate', async (context) => {
      console.log('评估前执行');
      return context;
    });
    
    // 注册评估后钩子
    loader.registerHook('afterEvaluate', async (result) => {
      console.log('评估后执行');
      return result;
    });
  },
  
  // 插件卸载时被调用（可选）
  unload() {
    console.log('插件卸载');
  }
};

module.exports = myPlugin;
```

## 可用钩子

| 钩子名称 | 参数 | 说明 |
|---------|------|------|
| `beforeEvaluate` | `{output, task, context}` | 评估前执行 |
| `afterEvaluate` | `{score, result}` | 评估后执行 |
| `beforeCheck` | `{content}` | 约束检查前执行 |
| `afterCheck` | `{passed, violations}` | 约束检查后执行 |
| `onError` | `{hook, error}` | 任意钩子出错时执行 |

## 示例插件

### 1. 自定义违禁词过滤
查看 `subprojects/10-plugin-system/plugin-loader.js` 中的 `customWordFilterPlugin`

### 2. 性能日志
查看 `subprojects/10-plugin-system/plugin-loader.js` 中的 `performanceLoggerPlugin`

## 启用插件

将插件文件放入本目录，系统启动时会自动加载：

```
plugins/
├── my-plugin.js      # 你的插件
├── another-plugin.js  # 另一个插件
└── README.md         # 本文件
```
