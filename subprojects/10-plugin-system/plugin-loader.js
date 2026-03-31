/**
 * AI Agent Guard 插件系统
 * 支持从 plugins/ 目录加载 JavaScript 插件
 */

const fs = require('fs');
const path = require('path');

class PluginLoader {
  constructor(pluginsDir = './plugins') {
    this.pluginsDir = pluginsDir;
    this.plugins = new Map();
    this.hooks = {
      beforeEvaluate: [],
      afterEvaluate: [],
      beforeCheck: [],
      afterCheck: [],
      onError: []
    };
  }

  /**
   * 加载所有插件
   */
  loadAll() {
    const pluginsPath = path.resolve(this.pluginsDir);
    
    if (!fs.existsSync(pluginsPath)) {
      fs.mkdirSync(pluginsPath, { recursive: true });
      console.log('[PluginLoader] Created plugins directory:', pluginsPath);
      return;
    }

    const files = fs.readdirSync(pluginsPath);
    
    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      
      const pluginPath = path.join(pluginsPath, file);
      this.loadPlugin(file.replace('.js', ''), pluginPath);
    }
    
    console.log(`[PluginLoader] Loaded ${this.plugins.size} plugins`);
  }

  /**
   * 加载单个插件
   */
  loadPlugin(name, pluginPath) {
    try {
      const plugin = require(pluginPath);
      
      if (!plugin.name) {
        plugin.name = name;
      }
      
      if (!plugin.version) {
        plugin.version = '1.0.0';
      }
      
      // 注册钩子
      if (plugin.register && typeof plugin.register === 'function') {
        plugin.register(this);
      }
      
      this.plugins.set(name, plugin);
      console.log(`[PluginLoader] Loaded plugin: ${name} v${plugin.version}`);
      
      return plugin;
    } catch (e) {
      console.error(`[PluginLoader] Failed to load plugin ${name}:`, e.message);
      return null;
    }
  }

  /**
   * 注册钩子
   */
  registerHook(hookName, callback) {
    if (this.hooks[hookName]) {
      this.hooks[hookName].push(callback);
    }
  }

  /**
   * 触发钩子
   */
  async triggerHook(hookName, data) {
    const callbacks = this.hooks[hookName] || [];
    let result = data;
    
    for (const callback of callbacks) {
      try {
        if (callback.constructor.name === 'AsyncFunction') {
          result = await callback(result);
        } else {
          result = callback(result);
        }
      } catch (e) {
        console.error(`[PluginLoader] Hook ${hookName} error:`, e.message);
        // 触发错误钩子
        this.triggerHook('onError', { hook: hookName, error: e });
      }
    }
    
    return result;
  }

  /**
   * 执行评估前钩子
   */
  async beforeEvaluate(context) {
    return this.triggerHook('beforeEvaluate', context);
  }

  /**
   * 执行评估后钩子
   */
  async afterEvaluate(result) {
    return this.triggerHook('afterEvaluate', result);
  }

  /**
   * 检查前钩子
   */
  async beforeCheck(content) {
    return this.triggerHook('beforeCheck', { content });
  }

  /**
   * 检查后钩子
   */
  async afterCheck(result) {
    return this.triggerHook('afterCheck', result);
  }

  /**
   * 获取已加载插件列表
   */
  getPlugins() {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      version: p.version,
      description: p.description || ''
    }));
  }

  /**
   * 卸载插件
   */
  unloadPlugin(name) {
    const plugin = this.plugins.get(name);
    if (plugin && plugin.unload) {
      plugin.unload();
    }
    this.plugins.delete(name);
    console.log(`[PluginLoader] Unloaded plugin: ${name}`);
  }

  /**
   * 重新加载插件
   */
  reloadPlugin(name) {
    this.unloadPlugin(name);
    const pluginPath = path.join(this.pluginsDir, `${name}.js`);
    if (fs.existsSync(pluginPath)) {
      this.loadPlugin(name, pluginPath);
    }
  }
}

// 示例插件: 自定义违禁词检测
const customWordFilterPlugin = {
  name: 'custom-word-filter',
  version: '1.0.0',
  description: '自定义违禁词过滤插件',
  
  // 自定义违禁词列表
  customWords: ['内部消息', '机密文件', '不要外传'],
  
  register(loader) {
    // 在评估前检查自定义违禁词
    loader.registerHook('beforeEvaluate', async (context) => {
      const { output } = context;
      const foundWords = this.customWords.filter(word => 
        output && output.includes(word)
      );
      
      if (foundWords.length > 0) {
        console.log(`[custom-word-filter] Found restricted words: ${foundWords.join(', ')}`);
        // 可以修改context添加警告
        context.warnings = context.warnings || [];
        context.warnings.push(`包含敏感词: ${foundWords.join(', ')}`);
      }
      
      return context;
    });
    
    // 在检查后添加自定义分类
    loader.registerHook('afterCheck', async (result) => {
      result.customChecked = true;
      result.customTimestamp = Date.now();
      return result;
    });
  }
};

// 示例插件: 性能日志
const performanceLoggerPlugin = {
  name: 'performance-logger',
  version: '1.0.0',
  description: '性能日志记录插件',
  
  metrics: [],
  
  register(loader) {
    loader.registerHook('beforeEvaluate', async (context) => {
      context._startTime = Date.now();
      return context;
    });
    
    loader.registerHook('afterEvaluate', async (result) => {
      const duration = Date.now() - (result._startTime || Date.now());
      this.metrics.push({
        type: 'evaluate',
        duration,
        timestamp: Date.now()
      });
      
      // 只保留最近100条
      if (this.metrics.length > 100) {
        this.metrics.shift();
      }
      
      console.log(`[performance-logger] Evaluate took ${duration}ms`);
      return result;
    });
    
    // 获取性能统计
    this.getStats = () => {
      if (this.metrics.length === 0) return null;
      
      const durations = this.metrics.map(m => m.duration);
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      
      return { avg: avg.toFixed(2), min, max, count: durations.length };
    };
  }
};

module.exports = {
  PluginLoader,
  plugins: {
    customWordFilterPlugin,
    performanceLoggerPlugin
  }
};
