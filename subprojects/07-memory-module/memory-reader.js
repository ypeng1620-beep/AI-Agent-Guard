/**
 * 记忆读取模块
 * 让Agent启动新任务时自动读取历史记忆
 */

const MemoryStore = require('./memory-store');

class MemoryReader {
  /**
   * @param {MemoryStore|string} store - MemoryStore实例或存储目录路径
   */
  constructor(store) {
    if (typeof store === 'string') {
      this.store = new MemoryStore(store);
    } else {
      this.store = store;
    }
  }

  /**
   * 获取规避历史违规的建议
   * @param {string} taskType - 任务类型 (general/tts/code)
   * @returns {array} 历史违规操作列表，供Agent参考
   */
  getAvoidanceHints(taskType = 'general') {
    const violations = this.store.getViolations(taskType, 20);
    
    if (!violations || violations.length === 0) {
      return [];
    }

    // 提取违规模式和建议
    const hints = [];
    const seenPatterns = new Set();

    for (const record of violations) {
      const violation = record.data;
      const pattern = violation.type || violation.violationType || 'unknown';
      
      if (seenPatterns.has(pattern)) continue;
      seenPatterns.add(pattern);

      hints.push({
        pattern,
        description: violation.description || violation.message || `历史违规类型: ${pattern}`,
        suggestion: violation.suggestion || violation.fix || this._getDefaultSuggestion(pattern),
        severity: violation.severity || 'unknown',
        timestamp: record.timestamp
      });
    }

    return hints;
  }

  /**
   * 获取默认修复建议
   */
  _getDefaultSuggestion(pattern) {
    const suggestions = {
      'timeout': '考虑增加超时时间或简化任务复杂度',
      'memory_leak': '检查内存使用，确保及时释放资源',
      'infinite_loop': '添加循环终止条件或最大迭代次数限制',
      'file_permission': '检查文件权限设置',
      'api_rate_limit': '实现请求限流和重试机制',
      'invalid_output': '加强输出格式验证',
      'resource_exhaustion': '优化资源使用，添加资源限制',
      'unknown': '仔细审查任务执行过程，确保符合规范'
    };
    return suggestions[pattern] || suggestions['unknown'];
  }

  /**
   * 获取历史收敛数据
   * @param {string} taskType - 任务类型 (general/tts/code)
   * @returns {object} 历史收敛统计
   */
  getConvergenceData(taskType = 'general') {
    const history = this.store.getConvergenceHistory(taskType, 50);
    
    if (!history || history.length === 0) {
      return {
        sampleCount: 0,
        avgLoopCount: null,
        avgConvergenceTime: null,
        minLoopCount: null,
        maxLoopCount: null,
        convergenceRate: null,
        tips: []
      };
    }

    // 计算统计数据
    const loopCounts = [];
    const convergenceTimes = [];
    let convergedCount = 0;

    for (const record of history) {
      const data = record.data;
      if (data.loopCount !== undefined || data.loops !== undefined) {
        loopCounts.push(data.loopCount || data.loops);
      }
      if (data.convergenceTime !== undefined || data.time !== undefined) {
        convergenceTimes.push(data.convergenceTime || data.time);
      }
      if (data.converged !== false) {
        convergedCount++;
      }
    }

    const avgLoopCount = loopCounts.length > 0 
      ? (loopCounts.reduce((a, b) => a + b, 0) / loopCounts.length).toFixed(1)
      : null;
    
    const avgConvergenceTime = convergenceTimes.length > 0
      ? (convergenceTimes.reduce((a, b) => a + b, 0) / convergenceTimes.length).toFixed(0)
      : null;

    // 生成收敛提示
    const tips = [];
    if (avgLoopCount && parseFloat(avgLoopCount) > 10) {
      tips.push(`历史平均循环次数较高(${avgLoopCount}次)，建议优化收敛策略`);
    }
    if (avgConvergenceTime && parseFloat(avgConvergenceTime) > 60000) {
      tips.push(`历史平均收敛时间较长(${Math.round(avgConvergenceTime/1000)}秒)，可能需要简化任务`);
    }

    return {
      sampleCount: history.length,
      avgLoopCount: parseFloat(avgLoopCount),
      avgConvergenceTime: parseFloat(avgConvergenceTime),
      minLoopCount: loopCounts.length > 0 ? Math.min(...loopCounts) : null,
      maxLoopCount: loopCounts.length > 0 ? Math.max(...loopCounts) : null,
      convergenceRate: (convergedCount / history.length * 100).toFixed(1),
      tips
    };
  }

  /**
   * 生成记忆上下文（供Agent参考）
   * @param {string} taskType - 任务类型 (general/tts/code)
   * @param {string} taskDescription - 当前任务描述（可选）
   * @returns {object} 包含历史记忆的上下文对象
   */
  buildContext(taskType = 'general', taskDescription = '') {
    // 获取历史评估
    const history = this.store.getHistory(taskType, 5);
    
    // 获取违规提示
    const avoidanceHints = this.getAvoidanceHints(taskType);
    
    // 获取收敛数据
    const convergenceStats = this.getConvergenceData(taskType);

    // 构建上下文
    const context = {
      taskType,
      taskDescription,
      timestamp: new Date().toISOString(),
      
      // 历史评估摘要
      recentEvaluations: history.map(r => ({
        taskId: r.taskId,
        timestamp: r.timestamp,
        score: r.data.score || r.data.totalScore || 'N/A'
      })),
      
      // 违规规避建议
      avoidanceHints: avoidanceHints.slice(0, 5), // 最多5条
      
      // 收敛统计
      convergence: convergenceStats,
      
      // 格式化文本版本（供直接使用）
      textSummary: this._buildTextSummary(taskType, history, avoidanceHints, convergenceStats)
    };

    return context;
  }

  /**
   * 构建文本摘要
   */
  _buildTextSummary(taskType, history, avoidanceHints, convergenceStats) {
    const lines = [];
    lines.push(`【跨轮记忆 - ${taskType.toUpperCase()}】`);
    lines.push('');

    // 收敛统计
    if (convergenceStats.sampleCount > 0) {
      lines.push('📊 收敛统计:');
      if (convergenceStats.avgLoopCount) {
        lines.push(`  - 平均循环次数: ${convergenceStats.avgLoopCount}次`);
      }
      if (convergenceStats.avgConvergenceTime) {
        lines.push(`  - 平均收敛时间: ${Math.round(convergenceStats.avgConvergenceTime/1000)}秒`);
      }
      if (convergenceStats.convergenceRate) {
        lines.push(`  - 收敛率: ${convergenceStats.convergenceRate}%`);
      }
      lines.push('');
    }

    // 规避提示
    if (avoidanceHints.length > 0) {
      lines.push('⚠️ 历史违规规避:');
      for (const hint of avoidanceHints.slice(0, 3)) {
        lines.push(`  - [${hint.pattern}] ${hint.description}`);
        lines.push(`    → ${hint.suggestion}`);
      }
      lines.push('');
    }

    // 最近评估
    if (history.length > 0) {
      lines.push('📝 最近评估:');
      for (const item of history.slice(0, 3)) {
        lines.push(`  - ${item.taskId}: 分数 ${item.data.score || item.data.totalScore || 'N/A'}`);
      }
      lines.push('');
    }

    // 收敛建议
    if (convergenceStats.tips && convergenceStats.tips.length > 0) {
      lines.push('💡 收敛优化建议:');
      for (const tip of convergenceStats.tips) {
        lines.push(`  - ${tip}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 获取相似任务的最佳实践
   * @param {string} taskType - 任务类型
   * @param {number} topN - 返回前N条最佳记录
   * @returns {array} 最佳实践列表
   */
  getBestPractices(taskType = 'general', topN = 3) {
    const history = this.store.getHistory(taskType, 50);
    
    // 按分数排序
    const scored = history
      .filter(r => r.data.score !== undefined || r.data.totalScore !== undefined)
      .map(r => ({
        ...r,
        effectiveScore: r.data.score || r.data.totalScore || 0
      }))
      .sort((a, b) => b.effectiveScore - a.effectiveScore);

    return scored.slice(0, topN).map(r => ({
      taskId: r.taskId,
      timestamp: r.timestamp,
      score: r.effectiveScore,
      successfulActions: r.data.successfulActions || r.data.actions || [],
      strategies: r.data.strategies || r.data.approach || []
    }));
  }

  /**
   * 获取任务类型统计
   * @returns {object} 各任务类型的统计信息
   */
  getStats() {
    return this.store.getStats();
  }
}

module.exports = MemoryReader;
