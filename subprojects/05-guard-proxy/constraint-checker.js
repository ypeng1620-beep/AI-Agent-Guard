/**
 * 强制约束检查模块
 * 5层检查确保输出合规
 */

class ConstraintChecker {
  constructor(rules = {}) {
    this.rules = {
      prohibitedWords: rules.prohibitedWords || [],
      maxLength: rules.maxLength || 50000,
      minLength: rules.minLength || 0,
      requiredFormat: rules.requiredFormat || null,
      maxRounds: rules.maxRounds || 50,
      maxRedundancyScore: rules.maxRedundancyScore || 0.7,
      ...rules
    };
    
    // 历史记录用于冗余检测
    this.history = [];
    this.maxHistorySize = 10;
  }

  /**
   * 执行5层检查
   * @param {string|Object} output - 待检查的输出
   * @param {Object} context - 上下文信息（如当前轮次）
   * @returns {Object} { passed: boolean, violations: Array, scores: Object }
   */
  check(output, context = {}) {
    const violations = [];
    const scores = {};
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

    // 1. 违禁词检查
    const prohibitedResult = this.checkProhibitedWords(outputStr);
    if (!prohibitedResult.passed) {
      violations.push({
        type: 'prohibited_words',
        severity: 'critical',
        message: '输出包含违禁词',
        details: prohibitedResult.matches,
        layer: 1
      });
    }
    scores.prohibitedWords = prohibitedResult.score;

    // 2. 格式合规检查
    const formatResult = this.checkFormat(outputStr);
    if (!formatResult.passed) {
      violations.push({
        type: 'format',
        severity: 'high',
        message: '输出格式不合规',
        details: formatResult.reason,
        layer: 2
      });
    }
    scores.format = formatResult.score;

    // 3. 内容越界检查
    const boundsResult = this.checkBounds(outputStr);
    if (!boundsResult.passed) {
      violations.push({
        type: 'bounds',
        severity: 'high',
        message: '输出内容超出允许范围',
        details: boundsResult.reason,
        layer: 3
      });
    }
    scores.bounds = boundsResult.score;

    // 4. 重复无效修改检查
    const redundancyResult = this.checkRedundancy(outputStr);
    if (!redundancyResult.passed) {
      violations.push({
        type: 'redundancy',
        severity: 'medium',
        message: '输出存在重复或无效修改',
        details: redundancyResult.reason,
        similarity: redundancyResult.similarity,
        layer: 4
      });
    }
    scores.redundancy = redundancyResult.score;

    // 5. 超出最大轮次检查
    const maxRoundsResult = this.checkMaxRounds(context.currentRound || 0);
    if (!maxRoundsResult.passed) {
      violations.push({
        type: 'max_rounds',
        severity: 'high',
        message: '超出最大对话轮次限制',
        details: maxRoundsResult.reason,
        layer: 5
      });
    }
    scores.maxRounds = maxRoundsResult.score;

    return {
      passed: violations.length === 0,
      violations,
      scores,
      totalScore: this.calculateTotalScore(scores)
    };
  }

  /**
   * 第1层：违禁词检查
   */
  checkProhibitedWords(output) {
    if (!this.rules.prohibitedWords || this.rules.prohibitedWords.length === 0) {
      return { passed: true, score: 1, matches: [] };
    }

    const matches = [];
    const lowerOutput = output.toLowerCase();

    for (const word of this.rules.prohibitedWords) {
      const lowerWord = word.toLowerCase();
      if (lowerOutput.includes(lowerWord)) {
        matches.push({
          word,
          position: lowerOutput.indexOf(lowerWord)
        });
      }
    }

    return {
      passed: matches.length === 0,
      score: matches.length === 0 ? 1 : Math.max(0, 1 - matches.length * 0.2),
      matches
    };
  }

  /**
   * 第2层：格式合规检查
   */
  checkFormat(output) {
    const { requiredFormat } = this.rules;
    
    // 如果没有格式要求，默认通过
    if (!requiredFormat) {
      return { passed: true, score: 1, reason: null };
    }

    // 支持多种格式验证
    const formatRules = {
      json: () => {
        try {
          JSON.parse(output);
          return { valid: true, reason: null };
        } catch (e) {
          return { valid: false, reason: `JSON格式错误: ${e.message}` };
        }
      },
      xml: () => {
        const xmlRegex = /^<\?xml.*?\?>[\s\S]*$/;
        return {
          valid: xmlRegex.test(output),
          reason: xmlRegex.test(output) ? null : 'XML格式不正确'
        };
      },
      markdown: () => {
        // 检查是否包含markdown特征
        const mdPatterns = [/^#{1,6}\s/m, /\*\*.*\*\*/, /\[\]\(.*\)/, /```[\s\S]*```/];
        const hasMdPattern = mdPatterns.some(p => p.test(output));
        return {
          valid: hasMdPattern,
          reason: hasMdPattern ? null : '不是有效的Markdown格式'
        };
      },
      html: () => {
        const htmlRegex = /<html[\s\S]*>/i;
        return {
          valid: htmlRegex.test(output),
          reason: htmlRegex.test(output) ? null : '不是有效的HTML格式'
        };
      }
    };

    const validator = formatRules[requiredFormat];
    if (!validator) {
      return { passed: true, score: 1, reason: null };
    }

    const result = validator();
    return {
      passed: result.valid,
      score: result.valid ? 1 : 0,
      reason: result.reason
    };
  }

  /**
   * 第3层：内容越界检查
   */
  checkBounds(output) {
    const { maxLength, minLength } = this.rules;
    const issues = [];
    
    // 检查最大长度
    if (maxLength && output.length > maxLength) {
      issues.push(`输出长度${output.length}超过限制${maxLength}`);
    }
    
    // 检查最小长度
    if (minLength && output.length < minLength) {
      issues.push(`输出长度${output.length}低于最低要求${minLength}`);
    }

    // 检查是否为空
    if (output.trim().length === 0) {
      issues.push('输出内容为空');
    }

    return {
      passed: issues.length === 0,
      score: issues.length === 0 ? 1 : Math.max(0, 1 - issues.length * 0.3),
      reason: issues.length > 0 ? issues.join('; ') : null
    };
  }

  /**
   * 第4层：重复无效修改检查（使用简单相似度算法）
   */
  checkRedundancy(output) {
    // 添加到历史
    this.addToHistory(output);
    
    if (this.history.length < 2) {
      return { passed: true, score: 1, reason: null, similarity: 0 };
    }

    // 计算与最近历史的相似度
    const recentHistory = this.history.slice(-this.maxHistorySize - 1, -1);
    let maxSimilarity = 0;
    
    for (const historical of recentHistory) {
      const similarity = this.calculateSimilarity(output, historical);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    const similarityThreshold = this.rules.maxRedundancyScore;
    const isRedundant = maxSimilarity >= similarityThreshold;

    return {
      passed: !isRedundant,
      score: 1 - maxSimilarity,
      reason: isRedundant ? `与历史输出相似度达到${(maxSimilarity * 100).toFixed(1)}%` : null,
      similarity: maxSimilarity
    };
  }

  /**
   * 计算两个字符串的相似度（简单Jaccard系数）
   */
  calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const tokens1 = new Set(str1.split(/\s+/).filter(t => t.length > 2));
    const tokens2 = new Set(str2.split(/\s+/).filter(t => t.length > 2));
    
    if (tokens1.size === 0 || tokens2.size === 0) return 0;
    
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return intersection.size / union.size;
  }

  /**
   * 添加到历史记录
   */
  addToHistory(output) {
    this.history.push(output);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * 第5层：超出最大轮次检查
   */
  checkMaxRounds(currentRound) {
    const { maxRounds } = this.rules;
    
    if (!maxRounds) {
      return { passed: true, score: 1, reason: null };
    }

    const isExceeded = currentRound >= maxRounds;

    return {
      passed: !isExceeded,
      score: isExceeded ? 0 : Math.max(0, 1 - currentRound / maxRounds),
      reason: isExceeded ? `当前轮次${currentRound}已达到上限${maxRounds}` : null
    };
  }

  /**
   * 计算总分
   */
  calculateTotalScore(scores) {
    const values = Object.values(scores);
    if (values.length === 0) return 1;
    return values.reduce((sum, s) => sum + s, 0) / values.length;
  }

  /**
   * 获取当前规则
   */
  getRules() {
    return { ...this.rules };
  }

  /**
   * 更新规则
   */
  updateRules(newRules) {
    this.rules = { ...this.rules, ...newRules };
  }

  /**
   * 清空历史（用于新会话）
   */
  clearHistory() {
    this.history = [];
  }
}

module.exports = ConstraintChecker;
