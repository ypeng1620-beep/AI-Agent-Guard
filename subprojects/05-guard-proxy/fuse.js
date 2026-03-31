/**
 * 熔断机制
 * 连续违规≥threshold次终止任务
 */

class Fuse {
  constructor(threshold = 3) {
    this.threshold = threshold;
    this.violationCount = 0;
    this.state = 'closed'; // closed | open | half-open
  }

  /**
   * 记录一次违规
   */
  recordViolation() {
    this.violationCount++;
    if (this.isBlown()) {
      this.state = 'open';
    }
  }

  /**
   * 检查是否熔断（连续违规达到阈值）
   */
  isBlown() {
    return this.violationCount >= this.threshold;
  }

  /**
   * 获取当前熔断状态
   */
  getState() {
    return this.state;
  }

  /**
   * 半开状态 - 允许一次测试请求
   */
  halfOpen() {
    this.state = 'half-open';
    this.violationCount = 0;
  }

  /**
   * 重置熔断器
   */
  reset() {
    this.violationCount = 0;
    this.state = 'closed';
  }

  /**
   * 获取违规统计
   */
  getStats() {
    return {
      violationCount: this.violationCount,
      threshold: this.threshold,
      state: this.state
    };
  }
}

module.exports = Fuse;
