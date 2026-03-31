/**
 * 阻断与丢弃机制
 * 违规输出直接丢弃
 */

const fs = require('fs');
const path = require('path');

class Blocker {
  constructor(logPath = null) {
    this.logPath = logPath || path.join(__dirname, 'logs', 'blocked.log');
    this.ensureLogDir();
  }

  ensureLogDir() {
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * 阻断并记录
   * @param {*} output - 被阻断的输出内容
   * @param {string} reason - 阻断原因
   * @param {Object} metadata - 附加元数据
   * @returns {Object} 阻断结果
   */
  block(output, reason, metadata = {}) {
    const blockRecord = {
      timestamp: new Date().toISOString(),
      reason,
      output: this.sanitizeOutput(output),
      metadata,
      blocked: true
    };

    // 记录到日志
    this.log(blockRecord);

    // 返回阻断结果（不返回原始输出）
    return {
      blocked: true,
      reason,
      message: '输出已被阻断，内容不合规',
      referenceId: blockRecord.timestamp
    };
  }

  /**
   * 清理输出中的敏感信息
   */
  sanitizeOutput(output) {
    if (output === null || output === undefined) {
      return null;
    }
    // 如果输出过大，截断处理
    const str = typeof output === 'string' ? output : JSON.stringify(output);
    if (str.length > 1000) {
      return str.substring(0, 1000) + '...[truncated]';
    }
    return str;
  }

  /**
   * 记录阻断日志
   */
  log(record) {
    try {
      const logLine = JSON.stringify(record) + '\n';
      fs.appendFileSync(this.logPath, logLine, 'utf8');
    } catch (err) {
      console.error('[Blocker] Failed to write log:', err.message);
    }
  }

  /**
   * 读取阻断历史
   */
  getHistory(limit = 100) {
    try {
      if (!fs.existsSync(this.logPath)) {
        return [];
      }
      const content = fs.readFileSync(this.logPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      const records = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);

      return records.slice(-limit);
    } catch (err) {
      console.error('[Blocker] Failed to read history:', err.message);
      return [];
    }
  }
}

module.exports = Blocker;
