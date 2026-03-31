/**
 * 收敛检测核心脚本
 * 监控Agent多轮循环，判断是否收敛
 * 
 * 设计为"事后分析"模式 - Agent执行完后调用check()判断是否收敛
 * 支持两种模式：
 *   1. 被动模式：Agent完成后分析历史
 *   2. 主动模式（未来）：如果OpenClaw提供回调接口
 */

class ConvergenceDetector {
  /**
   * @param {Object} config - 配置对象
   * @param {number} config.scoreThreshold - 分数波动阈值(%)，默认3
   * @param {number} config.similarityThreshold - 相似度阈值(%)，默认92
   * @param {number} config.consecutiveRounds - 连续几轮触发收敛，默认3
   * @param {Object} config.similarityTool - 可选，注入的相似度计算工具
   */
  constructor(config = {}) {
    this.config = {
      scoreThreshold: config.scoreThreshold ?? 3,
      similarityThreshold: config.similarityThreshold ?? 92,
      consecutiveRounds: config.consecutiveRounds ?? 3,
      maxHistorySize: config.maxHistorySize ?? 20,
    };
    
    // 可选注入的相似度工具（子项目4提供）
    // 接口要求：similarityTool.compute(text1, text2) => number (0-100)
    this.similarityTool = config.similarityTool || null;
    
    // 历史记录队列
    // 每条记录格式: { score: number, text: string, timestamp: Date, hasContentChange: boolean }
    this.history = [];
    
    // 收敛状态
    this._converged = false;
    this._convergeReason = null;
  }

  /**
   * 记录一轮输出
   * @param {Object} output - 输出对象
   * @param {number} output.score - 第三方评估分数 (0-100)
   * @param {string} output.text - 输出文本内容
   * @param {boolean} [output.hasContentChange] - 是否有实质内容修改（可选）
   * @param {Object} [output.metadata] - 额外元数据（可选）
   */
  record(output) {
    if (typeof output.score !== 'number' || typeof output.text !== 'string') {
      throw new Error('output must have numeric "score" and string "text" fields');
    }

    const entry = {
      score: output.score,
      text: output.text,
      timestamp: new Date(),
      hasContentChange: output.hasContentChange !== undefined ? output.hasContentChange : null,
      metadata: output.metadata || {},
      // 用于快速去重的文本指纹
      textFingerprint: this._generateFingerprint(output.text),
    };

    this.history.push(entry);

    // 保持历史记录在限制范围内
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }

    return this;
  }

  /**
   * 检查是否收敛
   * 收敛判定条件（满足任一即触发）：
   *   1. 连续N轮第三方评估分数波动≤阈值
   *   2. 连续2轮输出内容相似度≥阈值
   *   3. 单轮循环无实质内容修改
   * 
   * @returns {Object} { converged: boolean, reason: string, details: Object }
   */
  check() {
    // 需要至少2轮才能判断收敛
    if (this.history.length < 2) {
      return {
        converged: false,
        reason: '历史记录不足，需要至少2轮数据',
        details: { historyLength: this.history.length }
      };
    }

    const results = [];

    // 条件1: 连续N轮分数波动稳定
    const scoreStableResult = this._checkScoreStability();
    if (scoreStableResult.triggered) {
      results.push({
        condition: 'score_stability',
        triggered: true,
        reason: scoreStableResult.reason,
        details: scoreStableResult.details
      });
    }

    // 条件2: 连续2轮内容高度相似
    const similarityResult = this._checkTextSimilarity();
    if (similarityResult.triggered) {
      results.push({
        condition: 'text_similarity',
        triggered: true,
        reason: similarityResult.reason,
        details: similarityResult.details
      });
    }

    // 条件3: 无实质内容修改
    const noChangeResult = this._checkNoContentChange();
    if (noChangeResult.triggered) {
      results.push({
        condition: 'no_content_change',
        triggered: true,
        reason: noChangeResult.reason,
        details: noChangeResult.details
      });
    }

    // 任一条件触发即判定为收敛
    if (results.length > 0) {
      const primaryResult = results[0];
      this._converged = true;
      this._convergeReason = primaryResult.reason;
      
      return {
        converged: true,
        reason: primaryResult.reason,
        details: {
          triggeredBy: primaryResult.condition,
          allResults: results,
          historyLength: this.history.length
        }
      };
    }

    return {
      converged: false,
      reason: '未满足任何收敛条件',
      details: {
        historyLength: this.history.length,
        scoreVolatility: this._calculateScoreVolatility(),
        latestSimilarity: this._calculateLatestSimilarity()
      }
    };
  }

  /**
   * 检查分数稳定性 - 连续N轮波动在阈值内
   * @private
   */
  _checkScoreStability() {
    const { scoreThreshold, consecutiveRounds } = this.config;
    const requiredRounds = consecutiveRounds;

    if (this.history.length < requiredRounds) {
      return { triggered: false, reason: null, details: null };
    }

    // 取最近N轮
    const recentScores = this.history.slice(-requiredRounds).map(h => h.score);
    
    // 计算最大波动
    const maxScore = Math.max(...recentScores);
    const minScore = Math.min(...recentScores);
    const volatility = maxScore - minScore;

    if (volatility <= scoreThreshold) {
      return {
        triggered: true,
        reason: `连续${requiredRounds}轮分数波动${volatility.toFixed(2)}% ≤ ${scoreThreshold}%`,
        details: {
          scores: recentScores,
          volatility,
          threshold: scoreThreshold
        }
      };
    }

    return { triggered: false, reason: null, details: null };
  }

  /**
   * 检查文本相似度 - 连续2轮相似度达标
   * @private
   */
  _checkTextSimilarity() {
    const { similarityThreshold } = this.config;

    if (this.history.length < 2) {
      return { triggered: false, reason: null, details: null };
    }

    // 取最近2轮
    const lastEntry = this.history[this.history.length - 1];
    const prevEntry = this.history[this.history.length - 2];

    let similarity;
    
    if (this.similarityTool) {
      // 使用注入的相似度工具
      similarity = this.similarityTool.compute(lastEntry.text, prevEntry.text);
    } else {
      // 使用内置的简单相似度计算（基于文本指纹）
      similarity = this._computeBuiltinSimilarity(lastEntry.text, prevEntry.text);
    }

    if (similarity >= similarityThreshold) {
      return {
        triggered: true,
        reason: `连续2轮内容相似度${similarity.toFixed(2)}% ≥ ${similarityThreshold}%`,
        details: {
          similarity,
          threshold: similarityThreshold,
          fingerprints: [lastEntry.textFingerprint, prevEntry.textFingerprint]
        }
      };
    }

    return { triggered: false, reason: null, details: null };
  }

  /**
   * 检查是否无实质内容修改
   * @private
   */
  _checkNoContentChange() {
    if (this.history.length < 2) {
      return { triggered: false, reason: null, details: null };
    }

    const lastEntry = this.history[this.history.length - 1];

    // 如果明确标记了hasContentChange
    if (lastEntry.hasContentChange === false) {
      return {
        triggered: true,
        reason: '单轮循环无实质内容修改（显式标记）',
        details: { hasContentChange: false }
      };
    }

    // 如果有相似度工具且相似度极高（>98%），认为是无实质修改
    if (this.similarityTool && this.history.length >= 2) {
      const lastEntry = this.history[this.history.length - 1];
      const prevEntry = this.history[this.history.length - 2];
      const similarity = this.similarityTool.compute(lastEntry.text, prevEntry.text);
      
      if (similarity > 98) {
        return {
          triggered: true,
          reason: `单轮循环无实质内容修改（相似度${similarity.toFixed(2)}% > 98%）`,
          details: { similarity }
        };
      }
    }

    return { triggered: false, reason: null, details: null };
  }

  /**
   * 内置简单相似度计算（基于字符级Jaccard相似度）
   * @private
   */
  _computeBuiltinSimilarity(text1, text2) {
    if (!text1 && !text2) return 100;
    if (!text1 || !text2) return 0;

    // 使用字符级n-gram Jaccard相似度
    const n = 3; // trigram
    const set1 = new Set(this._getNGrams(text1, n));
    const set2 = new Set(this._getNGrams(text2, n));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? (intersection.size / union.size) * 100 : 100;
  }

  /**
   * 获取n-gram集合
   * @private
   */
  _getNGrams(text, n) {
    const ngrams = [];
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.push(text.substring(i, i + n));
    }
    return ngrams;
  }

  /**
   * 生成文本指纹（用于快速去重/比较）
   * @private
   */
  _generateFingerprint(text) {
    // 简单实现：规范化后取hash
    const normalized = text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
    
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * 计算当前分数波动幅度
   * @private
   */
  _calculateScoreVolatility() {
    if (this.history.length < 2) return 0;
    const scores = this.history.map(h => h.score);
    return Math.max(...scores) - Math.min(...scores);
  }

  /**
   * 计算最新两轮相似度
   * @private
   */
  _calculateLatestSimilarity() {
    if (this.history.length < 2) return null;
    const last = this.history[this.history.length - 1];
    const prev = this.history[this.history.length - 2];
    return this.similarityTool 
      ? this.similarityTool.compute(last.text, prev.text)
      : this._computeBuiltinSimilarity(last.text, prev.text);
  }

  /**
   * 重置历史记录
   */
  reset() {
    this.history = [];
    this._converged = false;
    this._convergeReason = null;
    return this;
  }

  /**
   * 注入相似度工具
   * @param {Object} tool - 相似度工具，需实现 compute(text1, text2) => number
   */
  setSimilarityTool(tool) {
    if (typeof tool.compute !== 'function') {
      throw new Error('similarityTool must implement compute(text1, text2) method');
    }
    this.similarityTool = tool;
    return this;
  }

  /**
   * 获取当前历史记录
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * 获取收敛状态
   */
  isConverged() {
    return this._converged;
  }

  /**
   * 获取收敛原因
   */
  getConvergeReason() {
    return this._convergeReason;
  }

  /**
   * 从配置加载
   * @param {Object} config - 配置对象
   */
  static fromConfig(config) {
    return new ConvergenceDetector({
      scoreThreshold: config.scoreThreshold,
      similarityThreshold: config.similarityThreshold,
      consecutiveRounds: config.consecutiveRounds,
      maxHistorySize: config.maxHistorySize,
      similarityTool: config.similarityTool,
    });
  }

  /**
   * 从JSON文件加载配置并创建实例
   * @param {string|Object} configSource - 配置文件路径或配置对象
   */
  static load(configSource) {
    let config;
    
    if (typeof configSource === 'string') {
      const fs = require('fs');
      const path = require('path');
      const configPath = configSource;
      const resolvedPath = path.isAbsolute(configPath) 
        ? configPath 
        : path.resolve(process.cwd(), configPath);
      config = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
    } else {
      config = configSource;
    }

    return ConvergenceDetector.fromConfig(config);
  }
}

// 如果直接运行此文件，执行简单测试
if (require.main === module) {
  console.log('=== 收敛检测器测试 ===\n');

  const detector = new ConvergenceDetector({
    scoreThreshold: 3,
    similarityThreshold: 92,
    consecutiveRounds: 3,
  });

  // 模拟场景1: 分数稳定收敛
  console.log('--- 场景1: 分数稳定收敛测试 ---');
  detector.reset();
  detector.record({ score: 85, text: '解决方案A：优化算法' });
  detector.record({ score: 84, text: '解决方案B：改进策略' });
  detector.record({ score: 85.5, text: '解决方案C：调整参数' });
  console.log('3轮分数: 85, 84, 85.5 (波动1.5%)');
  console.log('收敛判定:', JSON.stringify(detector.check(), null, 2));
  console.log();

  // 模拟场景2: 内容高度相似收敛
  console.log('--- 场景2: 内容高度相似收敛测试 ---');
  detector.reset();
  detector.record({ score: 80, text: '这是第一个解决方案，包含详细的分析和实施步骤。' });
  detector.record({ score: 82, text: '这是第一个解决方案，包含详细的分析和实施步骤。' });
  console.log('2轮内容完全相同');
  console.log('收敛判定:', JSON.stringify(detector.check(), null, 2));
  console.log();

  // 模拟场景3: 无实质修改
  console.log('--- 场景3: 无实质内容修改测试 ---');
  detector.reset();
  detector.record({ score: 80, text: '原方案' });
  detector.record({ score: 81, text: '原方案', hasContentChange: false });
  console.log('第二轮标记为无实质修改');
  console.log('收敛判定:', JSON.stringify(detector.check(), null, 2));
  console.log();

  // 模拟场景4: 未收敛
  console.log('--- 场景4: 未收敛测试 ---');
  detector.reset();
  detector.record({ score: 70, text: '方案A：使用传统方法' });
  detector.record({ score: 85, text: '方案B：采用机器学习方法' });
  detector.record({ score: 92, text: '方案C：使用深度学习网络' });
  console.log('3轮分数变化大: 70, 85, 92');
  console.log('收敛判定:', JSON.stringify(detector.check(), null, 2));
}

module.exports = ConvergenceDetector;
