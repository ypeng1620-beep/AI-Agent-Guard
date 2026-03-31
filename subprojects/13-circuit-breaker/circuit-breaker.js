/**
 * AI Agent Guard 熔断器模式
 * 为外部依赖提供容错能力
 */

const EventEmitter = require('events');

// 熔断器状态
const STATES = {
  CLOSED: 'CLOSED',     // 正常：所有请求通过
  OPEN: 'OPEN',         // 熔断：所有请求失败，快速响应
  HALF_OPEN: 'HALF_OPEN' // 半开：允许一个测试请求
};

/**
 * 熔断器
 * 
 * 用法:
 * const cb = new CircuitBreaker('redis');
 * const result = await cb.execute(async () => {
 *   return await redis.get(key);
 * });
 */
class CircuitBreaker extends EventEmitter {
  constructor(name, config = {}) {
    super();
    
    this.name = name;
    
    // 配置
    this.failureThreshold = config.failureThreshold || 5;  // 失败次数阈值
    this.successThreshold = config.successThreshold || 2;   // 成功后恢复次数
    this.timeout = config.timeout || 30000;                // 超时时间(ms)
    this.halfOpenTimeout = config.halfOpenTimeout || 10000; // 半开等待时间(ms)
    
    // 状态
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    
    // 统计
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalTimeouts: 0,
      totalRejections: 0,
      stateChanges: []
    };
    
    // 降级处理
    this.fallback = config.fallback || null;
    
    // 定时器
    this.halfOpenTimer = null;
    
    // 注册事件
    this.on('stateChange', (from, to) => {
      this.stats.stateChanges.push({ from, to, time: Date.now() });
      console.log(`[CircuitBreaker:${this.name}] State: ${from} -> ${to}`);
    });
  }

  /**
   * 执行带熔断保护的请求
   */
  async execute(operation, fallbackResult = null) {
    this.stats.totalRequests++;
    
    // 检查状态
    if (this.state === STATES.OPEN) {
      this.stats.totalRejections++;
      
      // 检查是否应该尝试半开
      if (this.shouldAttemptReset()) {
        this.toHalfOpen();
      } else {
        // 快速失败，返回降级结果
        if (this.fallback) {
          return this.fallback();
        }
        throw new CircuitBreakerOpenError(this.name, this.state, this.getRemainingOpenTime());
      }
    }
    
    // 执行操作
    try {
      const result = await this.withTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      
      if (this.fallback) {
        return this.fallback();
      }
      throw error;
    }
  }

  /**
   * 带超时的执行
   */
  withTimeout(operation) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stats.totalTimeouts++;
        reject(new CircuitBreakerTimeoutError(this.name, this.timeout));
      }, this.timeout);
      
      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 成功处理
   */
  onSuccess() {
    this.stats.totalSuccesses++;
    this.lastSuccessTime = Date.now();
    this.failureCount = 0;
    
    if (this.state === STATES.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.toClosed();
      }
    }
  }

  /**
   * 失败处理
   */
  onFailure(error) {
    this.stats.totalFailures++;
    this.lastFailureTime = Date.now();
    this.failureCount++;
    this.successCount = 0;
    
    // 判断是否为严重错误
    const isSevere = this.isSevereError(error);
    
    if (isSevere || this.failureCount >= this.failureThreshold) {
      this.toOpen();
    }
  }

  /**
   * 判断是否为严重错误
   */
  isSevereError(error) {
    // 超时、连接拒绝、资源不可用视为严重
    if (error instanceof CircuitBreakerTimeoutError) return true;
    if (error.code === 'ECONNREFUSED') return true;
    if (error.code === 'ENOTFOUND') return true;
    if (error.code === 'ETIMEDOUT') return true;
    if (error.status === 503) return true; // Service Unavailable
    
    return false;
  }

  /**
   * 转换为开启状态
   */
  toOpen() {
    if (this.state !== STATES.OPEN) {
      const previousState = this.state;
      this.state = STATES.OPEN;
      this.emit('stateChange', previousState, STATES.OPEN);
    }
  }

  /**
   * 转换为半开状态
   */
  toHalfOpen() {
    if (this.state !== STATES.HALF_OPEN) {
      const previousState = this.state;
      this.state = STATES.HALF_OPEN;
      this.successCount = 0;
      this.emit('stateChange', previousState, STATES.HALF_OPEN);
    }
  }

  /**
   * 转换为关闭状态
   */
  toClosed() {
    if (this.state !== STATES.CLOSED) {
      const previousState = this.state;
      this.state = STATES.CLOSED;
      this.failureCount = 0;
      this.successCount = 0;
      this.emit('stateChange', previousState, STATES.CLOSED);
    }
    
    if (this.halfOpenTimer) {
      clearTimeout(this.halfOpenTimer);
      this.halfOpenTimer = null;
    }
  }

  /**
   * 检查是否应该尝试重置
   */
  shouldAttemptReset() {
    if (!this.lastFailureTime) return true;
    return Date.now() - this.lastFailureTime >= this.halfOpenTimeout;
  }

  /**
   * 获取剩余开启时间
   */
  getRemainingOpenTime() {
    if (this.state !== STATES.OPEN) return 0;
    if (!this.lastFailureTime) return 0;
    
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.halfOpenTimeout - elapsed);
  }

  /**
   * 获取状态
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      stats: this.stats,
      config: {
        failureThreshold: this.failureThreshold,
        successThreshold: this.successThreshold,
        timeout: this.timeout,
        halfOpenTimeout: this.halfOpenTimeout
      }
    };
  }

  /**
   * 手动重置
   */
  reset() {
    this.toClosed();
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalTimeouts: 0,
      totalRejections: 0,
      stateChanges: []
    };
  }

  /**
   * 获取健康度 (0-1)
   */
  getHealth() {
    const total = this.stats.totalRequests;
    if (total === 0) return 1;
    
    const failureRate = this.stats.totalFailures / total;
    return Math.max(0, 1 - failureRate);
  }
}

// 熔断器错误
class CircuitBreakerOpenError extends Error {
  constructor(name, state, remainingTime) {
    super(`CircuitBreaker [${name}] is ${state}. Remaining open time: ${remainingTime}ms`);
    this.name = 'CircuitBreakerOpenError';
    this.circuitBreakerName = name;
    this.state = state;
    this.remainingTime = remainingTime;
  }
}

class CircuitBreakerTimeoutError extends Error {
  constructor(name, timeout) {
    super(`CircuitBreaker [${name}] operation timed out after ${timeout}ms`);
    this.name = 'CircuitBreakerTimeoutError';
    this.circuitBreakerName = name;
    this.timeout = timeout;
  }
}

// 熔断器管理器
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * 获取或创建熔断器
   */
  get(name, config) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name);
  }

  /**
   * 执行带熔断保护的操作
   */
  async execute(name, operation, config = {}, fallbackResult = null) {
    const cb = this.get(name, config);
    return cb.execute(operation, fallbackResult);
  }

  /**
   * 获取所有熔断器状态
   */
  getAllState() {
    const state = {};
    for (const [name, cb] of this.breakers) {
      state[name] = cb.getState();
    }
    return state;
  }

  /**
   * 获取系统健康度
   */
  getSystemHealth() {
    const breakers = Array.from(this.breakers.values());
    if (breakers.length === 0) return 1;
    
    const totalHealth = breakers.reduce((sum, cb) => sum + cb.getHealth(), 0);
    return totalHealth / breakers.length;
  }

  /**
   * 重置所有熔断器
   */
  resetAll() {
    for (const cb of this.breakers.values()) {
      cb.reset();
    }
  }
}

module.exports = {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitBreakerTimeoutError,
  CircuitBreakerManager,
  STATES
};
