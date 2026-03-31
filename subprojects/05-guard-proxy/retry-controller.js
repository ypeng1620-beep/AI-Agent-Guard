/**
 * 自动修正与强制重试
 * 根据违规类型生成修正指令
 */

class RetryController {
  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
  }

  /**
   * 生成修正指令
   * @param {string} originalTask - 原始任务描述
   * @param {Array} violations - 违规列表
   * @param {number} retryCount - 当前重试次数
   * @returns {Object} { instruction: string, context: Object }
   */
  generateRetryInstruction(originalTask, violations, retryCount = 0) {
    const violationSummary = this.summarizeViolations(violations);
    const correctionRequirements = this.generateCorrectionRequirements(violations);
    
    const instruction = `【自动修正请求】

## 原始任务
${originalTask}

## 当前问题 (第${retryCount + 1}次重试)
${violationSummary}

## 修正要求
${correctionRequirements}

## 重要提示
- 请严格按照上述修正要求重新执行任务
- 确保输出内容符合合规标准
- 避免重复之前的问题`;

    return {
      instruction,
      context: {
        originalTask,
        violations,
        retryCount,
        timestamp: new Date().toISOString(),
        violationTypes: violations.map(v => v.type)
      }
    };
  }

  /**
   * 总结违规情况
   */
  summarizeViolations(violations) {
    if (!violations || violations.length === 0) {
      return '未知问题';
    }

    const summary = violations.map((v, i) => {
      const severity = this.getSeverityEmoji(v.severity);
      return `${i + 1}. ${severity} [${v.type}] ${v.message || v.reason || 'N/A'}`;
    }).join('\n');

    return summary;
  }

  /**
   * 获取严重程度emoji
   */
  getSeverityEmoji(severity) {
    const map = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢'
    };
    return map[severity] || '⚪';
  }

  /**
   * 根据违规类型生成具体修正要求
   */
  generateCorrectionRequirements(violations) {
    const requirements = [];

    for (const violation of violations) {
      switch (violation.type) {
        case 'prohibited_words':
          requirements.push('- ⚠️ **违禁词违规**：移除或替换所有违禁词');
          if (violation.details && violation.details.length > 0) {
            const words = violation.details.map(d => d.word).join(', ');
            requirements.push(`  涉及的违禁词: ${words}`);
          }
          break;

        case 'format':
          requirements.push('- 📝 **格式违规**：按照规定的格式重新组织输出');
          if (violation.details) {
            requirements.push(`  格式要求: ${violation.details}`);
          }
          break;

        case 'bounds':
          requirements.push('- 📏 **范围违规**：调整输出内容的范围');
          if (violation.details) {
            requirements.push(`  具体问题: ${violation.details}`);
          }
          break;

        case 'redundancy':
          requirements.push('- 🔄 **冗余违规**：生成与之前不同的内容');
          if (violation.details) {
            requirements.push(`  问题描述: ${violation.details}`);
          }
          break;

        case 'max_rounds':
          requirements.push('- ⏱️ **轮次超限**：简洁地完成当前任务');
          break;

        default:
          requirements.push(`- ❓ **其他问题**：${violation.message || '请重新检查输出'}`);
      }
    }

    // 添加通用要求
    requirements.push('');
    requirements.push('## 通用修正标准');
    requirements.push('1. 输出的总长度应在合理范围内');
    requirements.push('2. 避免与之前的输出重复');
    requirements.push('3. 确保内容准确、有价值、符合规范');

    return requirements.join('\n');
  }

  /**
   * 检查是否可重试
   */
  canRetry(retryCount) {
    return retryCount < this.maxRetries;
  }

  /**
   * 获取最大重试次数
   */
  getMaxRetries() {
    return this.maxRetries;
  }

  /**
   * 评估重试成功的可能性
   */
  assessRetryLikelihood(violations) {
    // 根据违规类型评估重试成功率
    const untreatableTypes = ['max_rounds'];
    const difficultTypes = ['redundancy', 'bounds'];
    const treatableTypes = ['prohibited_words', 'format'];

    const types = violations.map(v => v.type);
    
    if (types.some(t => untreatableTypes.includes(t))) {
      return { likelihood: 'none', message: '该类问题无法通过重试解决' };
    }
    
    if (types.some(t => difficultTypes.includes(t))) {
      return { likelihood: 'low', message: '重试成功率较低' };
    }

    return { likelihood: 'high', message: '重试很可能成功' };
  }

  /**
   * 获取重试统计信息
   */
  getStats() {
    return {
      maxRetries: this.maxRetries,
      description: `最多允许重试${this.maxRetries}次`
    };
  }
}

module.exports = RetryController;
