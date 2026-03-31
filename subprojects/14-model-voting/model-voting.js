/**
 * AI Agent Guard 多模型投票系统
 * 支持降级策略和健康检查
 */

const EventEmitter = require('events');
const { CircuitBreaker, CircuitBreakerManager, STATES } = require('../13-circuit-breaker/circuit-breaker.js');

// 模型健康检查状态
const MODEL_STATES = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE'
};

/**
 * 模型配置
 */
class ModelConfig {
  constructor(config) {
    this.name = config.name;
    this.type = config.type || 'local'; // local, api, browser
    this.endpoint = config.endpoint || null;
    this.weight = config.weight || 1; // 投票权重
    this.timeout = config.timeout || 30000;
    this.retryCount = config.retryCount || 2;
    this.healthCheckInterval = config.healthCheckInterval || 60000;
    
    // 健康状态
    this.state = MODEL_STATES.HEALTHY;
    this.lastHealthCheck = null;
    this.healthScore = 100; // 0-100
    this.errorCount = 0;
    this.totalRequests = 0;
    this.failedRequests = 0;
  }

  getHealth() {
    if (this.totalRequests === 0) return 1;
    return 1 - (this.failedRequests / this.totalRequests);
  }

  updateHealth(success, latency) {
    this.totalRequests++;
    if (!success) {
      this.failedRequests++;
      this.errorCount++;
      this.healthScore = Math.max(0, this.healthScore - 10);
    } else {
      // 成功且低延迟加分
      if (latency < 1000) {
        this.healthScore = Math.min(100, this.healthScore + 2);
      }
      this.errorCount = Math.max(0, this.errorCount - 1);
    }

    // 更新状态
    if (this.healthScore < 20 || this.errorCount >= 5) {
      this.state = MODEL_STATES.UNAVAILABLE;
    } else if (this.healthScore < 60 || this.errorCount >= 3) {
      this.state = MODEL_STATES.DEGRADED;
    } else {
      this.state = MODEL_STATES.HEALTHY;
    }

    this.lastHealthCheck = Date.now();
  }
}

/**
 * 多模型投票系统
 */
class ModelVotingSystem extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.models = new Map();
    this.circuitBreakers = new CircuitBreakerManager();
    
    // 配置
    this.config = {
      minHealthyModels: config.minHealthyModels || 1,
      degradationThreshold: config.degradationThreshold || 2, // 可用模型 < 2 时降级
      localFallbackScore: config.localFallbackScore || 70,
      enableHealthCheck: config.enableHealthCheck !== false,
      ...config
    };
    
    // 当前模式
    this.mode = 'NORMAL'; // NORMAL, DEGRADED, FALLBACK
    this.lastModeChange = Date.now();
    
    // 统计
    this.stats = {
      totalVotes: 0,
      successfulVotes: 0,
      failedVotes: 0,
      degradedVotes: 0,
      fallbackVotes: 0
    };
  }

  /**
   * 注册模型
   */
  registerModel(config) {
    const model = new ModelConfig(config);
    this.models.set(config.name, model);
    
    // 创建熔断器
    this.circuitBreakers.get(config.name, {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: config.timeout || 30000,
      halfOpenTimeout: 10000,
      fallback: () => null
    });
    
    console.log(`[ModelVoting] Registered model: ${config.name} (${config.type})`);
    return model;
  }

  /**
   * 批量注册模型
   */
  registerModels(modelConfigs) {
    modelConfigs.forEach(config => this.registerModel(config));
  }

  /**
   * 评估输出
   */
  async evaluate(output, task, options = {}) {
    this.stats.totalVotes++;
    const startTime = Date.now();
    
    try {
      // 获取可用模型
      const availableModels = this.getAvailableModels();
      
      // 决策模式
      if (availableModels.length === 0) {
        // 无可用模型，降级到本地规则
        return await this.fallbackEvaluate(output, task);
      }
      
      if (availableModels.length < this.config.degradationThreshold) {
        // 可用模型不足，启用降级模式
        this.setMode('DEGRADED');
        this.stats.degradedVotes++;
      }
      
      // 并行执行所有模型的评估
      const results = await Promise.all(
        availableModels.map(model => this.evaluateWithModel(model, output, task))
      );
      
      // 过滤失败结果
      const validResults = results.filter(r => r !== null && !r.error);
      
      if (validResults.length === 0) {
        // 所有模型都失败，降级
        return await this.fallbackEvaluate(output, task);
      }
      
      // 加权投票
      const finalResult = this.weightedVoting(validResults);
      
      // 更新模型健康状态
      results.forEach((result, i) => {
        if (result) {
          const latency = Date.now() - startTime;
          availableModels[i].updateHealth(!result.error, latency);
        }
      });
      
      this.stats.successfulVotes++;
      finalResult.mode = this.mode;
      finalResult.modelsUsed = availableModels.length;
      finalResult.modelsAvailable = this.models.size;
      
      return finalResult;
      
    } catch (error) {
      this.stats.failedVotes++;
      console.error('[ModelVoting] Vote failed:', error.message);
      return await this.fallbackEvaluate(output, task);
    }
  }

  /**
   * 使用单个模型评估
   */
  async evaluateWithModel(model, output, task) {
    // 检查熔断器
    const cb = this.circuitBreakers.get(model.name);
    if (cb.state === STATES.OPEN) {
      return { error: 'Circuit open', model: model.name };
    }

    try {
      const result = await cb.execute(async () => {
        switch (model.type) {
          case 'local':
            return this.localEvaluate(output, task);
          case 'api':
            return this.apiEvaluate(model, output, task);
          case 'browser':
            return this.browserEvaluate(model, output, task);
          default:
            throw new Error(`Unknown model type: ${model.type}`);
        }
      });

      return { ...result, model: model.name };
    } catch (error) {
      console.error(`[ModelVoting] Model ${model.name} failed:`, error.message);
      return { error: error.message, model: model.name };
    }
  }

  /**
   * 本地评估
   */
  localEvaluate(output, task) {
    // 简化本地评分逻辑
    const baseScore = 70;
    const lengthBonus = Math.min(10, output.length / 100);
    const qualityBonus = output.includes('。') ? 5 : 0;
    
    return {
      score: Math.min(100, baseScore + lengthBonus + qualityBonus),
      quality: 70,
      compliance: 85,
      safety: 90
    };
  }

  /**
   * API评估 (模拟)
   */
  async apiEvaluate(model, output, task) {
    // 模拟API调用
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.1) { // 90% 成功率
          resolve({
            score: 70 + Math.random() * 20,
            quality: 70 + Math.random() * 20,
            compliance: 75 + Math.random() * 20,
            safety: 80 + Math.random() * 15
          });
        } else {
          reject(new Error('API timeout'));
        }
      }, 100 + Math.random() * 200);
    });
  }

  /**
   * 浏览器评估 (模拟)
   */
  async browserEvaluate(model, output, task) {
    // 模拟浏览器调用
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.05) { // 95% 成功率
          resolve({
            score: 75 + Math.random() * 20,
            quality: 75 + Math.random() * 15,
            compliance: 80 + Math.random() * 15,
            safety: 85 + Math.random() * 10
          });
        } else {
          reject(new Error('Browser error'));
        }
      }, 200 + Math.random() * 300);
    });
  }

  /**
   * 加权投票
   */
  weightedVoting(results) {
    let totalWeight = 0;
    let weightedScore = 0;
    let weightedQuality = 0;
    let weightedCompliance = 0;
    let weightedSafety = 0;

    results.forEach(result => {
      const model = Array.from(this.models.values()).find(m => m.name === result.model);
      const weight = model ? model.weight : 1;

      weightedScore += result.score * weight;
      weightedQuality += result.quality * weight;
      weightedCompliance += result.compliance * weight;
      weightedSafety += result.safety * weight;
      totalWeight += weight;
    });

    return {
      score: weightedScore / totalWeight,
      quality: weightedQuality / totalWeight,
      compliance: weightedCompliance / totalWeight,
      safety: weightedSafety / totalWeight,
      consensus: results.length,
      consensusRate: this.calculateConsensusRate(results)
    };
  }

  /**
   * 计算共识率
   */
  calculateConsensusRate(results) {
    if (results.length <= 1) return 1;

    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const variance = results.reduce((sum, r) => sum + Math.pow(r.score - avgScore, 2), 0) / results.length;
    
    // 共识率 = 1 - (标准差 / 平均值)
    const stdDev = Math.sqrt(variance);
    return Math.max(0, 1 - stdDev / 100);
  }

  /**
   * 获取可用模型
   */
  getAvailableModels() {
    return Array.from(this.models.values())
      .filter(m => m.state !== MODEL_STATES.UNAVAILABLE)
      .sort((a, b) => b.healthScore - a.healthScore);
  }

  /**
   * 降级评估 (本地规则)
   */
  async fallbackEvaluate(output, task) {
    this.stats.fallbackVotes++;
    this.setMode('FALLBACK');

    console.log('[ModelVoting] Using fallback evaluation');

    // 本地规则评分
    const localResult = this.localEvaluate(output, task);

    return {
      ...localResult,
      mode: 'FALLBACK',
      isFallback: true,
      warning: 'External models unavailable, using local rules'
    };
  }

  /**
   * 设置模式
   */
  setMode(mode) {
    if (this.mode !== mode) {
      this.mode = mode;
      this.lastModeChange = Date.now();
      this.emit('modeChange', mode);
      console.log(`[ModelVoting] Mode changed to: ${mode}`);
    }
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    if (!this.config.enableHealthCheck) return;

    console.log('[ModelVoting] Running health check...');

    for (const model of this.models.values()) {
      try {
        const testResult = await Promise.race([
          this.evaluateWithModel(model, 'test', 'health check'),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ]);

        model.updateHealth(!testResult.error, 100);
      } catch (e) {
        model.updateHealth(false, 5000);
      }
    }
  }

  /**
   * 获取系统状态
   */
  getStatus() {
    const models = {};
    for (const [name, model] of this.models) {
      models[name] = {
        state: model.state,
        healthScore: model.healthScore,
        totalRequests: model.totalRequests,
        failedRequests: model.failedRequests
      };
    }

    return {
      mode: this.mode,
      modelsAvailable: this.getAvailableModels().length,
      modelsTotal: this.models.size,
      models: models,
      circuitBreakers: this.circuitBreakers.getAllState(),
      stats: this.stats
    };
  }
}

module.exports = {
  ModelVotingSystem,
  ModelConfig,
  MODEL_STATES
};
