/**
 * 示例插件：性能日志记录器
 * 
 * 此插件记录所有评估操作的耗时
 * 将此文件放入 plugins/ 目录即可自动加载
 */

const metrics = {
  evaluate: [],
  check: [],
  similarity: [],
  convergence: []
};

module.exports = {
  name: 'performance-logger',
  version: '1.0.0',
  description: '性能日志记录插件',

  register(loader) {
    // 评估前记录时间戳
    loader.registerHook('beforeEvaluate', async (context) => {
      context._startTime = Date.now();
      return context;
    });

    // 评估后计算耗时
    loader.registerHook('afterEvaluate', async (result) => {
      const duration = Date.now() - (result._startTime || Date.now());
      
      metrics.evaluate.push({
        duration,
        timestamp: new Date().toISOString(),
        score: result.score
      });

      // 保持最近100条记录
      if (metrics.evaluate.length > 100) {
        metrics.evaluate.shift();
      }

      console.log(`[performance-logger] 评估耗时: ${duration}ms, 分数: ${result.score}`);
      return result;
    });

    // 约束检查耗时
    loader.registerHook('afterCheck', async (result) => {
      const duration = Date.now() - (result._startTime || Date.now());
      
      metrics.check.push({
        duration,
        timestamp: new Date().toISOString(),
        passed: result.passed
      });

      if (metrics.check.length > 100) {
        metrics.check.shift();
      }

      return result;
    });

    // 相似度计算耗时
    loader.registerHook('afterEvaluate', async (result) => {
      if (result.similarity !== undefined) {
        const duration = Date.now() - (result._startTime || Date.now());
        metrics.similarity.push({ duration, timestamp: new Date().toISOString() });
      }
      return result;
    });
  },

  // 获取性能统计
  getStats() {
    const getStatsFor = (arr) => {
      if (arr.length === 0) return null;
      const durations = arr.map(m => m.duration);
      return {
        count: durations.length,
        avg: (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2),
        min: Math.min(...durations),
        max: Math.max(...durations)
      };
    };

    return {
      evaluate: getStatsFor(metrics.evaluate),
      check: getStatsFor(metrics.check),
      similarity: getStatsFor(metrics.similarity),
      convergence: getStatsFor(metrics.convergence)
    };
  },

  unload() {
    console.log('[performance-logger] 插件已卸载');
  }
};
