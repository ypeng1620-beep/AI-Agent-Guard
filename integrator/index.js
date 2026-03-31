/**
 * AI Agent Guard 集成器
 * 
 * 整合子项目1-7的所有模块，提供统一接口
 * 
 * 模块依赖关系：
 * 
 *   用户输入
 *      ↓
 *   [GuardProxy] ─────────────────┐
 *      ↓                          │
 *   [ConstraintChecker] ──→ [SimilarityTool]  (第4层冗余检测)
 *      ↓                          │
 *   [EvalEngine] ──────────→ [SimilarityTool]  (语义增强)
 *      ↓                          │
 *   [ConvergenceDetector] ──→ [SimilarityTool]  (收敛判断)
 *      ↓                          │
 *   [MemoryModule] ←───────────────┘  (记忆存储/读取)
 *      ↓
 *   [Blocker] / [Fuse] / [RetryController]
 *      ↓
 *   用户输出
 */

const path = require('path');

// ========== 动态加载各子模块 ==========

let EvalEngine, RulesLoader, ConvergenceDetector, SimilarityTool, GuardProxy, MemoryStore, MemoryReader;
let EvalEngineClass;

function loadModules() {
  try {
    // 子项目1: 评估引擎
    const evalPath = path.join(__dirname, '..', 'subprojects', '01-eval-engine', 'eval-engine.js');
    const evalModule = require(evalPath);
    EvalEngineClass = evalModule.EvalEngine;
    console.log('[Integrator] ✓ 评估引擎 loaded');
  } catch (e) {
    console.log('[Integrator] ✗ 评估引擎加载失败:', e.message);
    EvalEngineClass = null;
  }

  try {
    // 子项目2: 规则库
    const rulesPath = path.join(__dirname, '..', 'subprojects', '02-rules-library', 'rules-loader.js');
    RulesLoader = require(rulesPath);
    console.log('[Integrator] ✓ 规则库 loaded');
  } catch (e) {
    console.log('[Integrator] ✗ 规则库加载失败:', e.message);
    RulesLoader = null;
  }

  try {
    // 子项目3: 收敛检测
    const convPath = path.join(__dirname, '..', 'subprojects', '03-convergence-detector', 'convergence-detector.js');
    ConvergenceDetector = require(convPath);
    console.log('[Integrator] ✓ 收敛检测 loaded');
  } catch (e) {
    console.log('[Integrator] ✗ 收敛检测加载失败:', e.message);
    ConvergenceDetector = null;
  }

  try {
    // 子项目4: 相似度工具
    const simPath = path.join(__dirname, '..', 'subprojects', '04-similarity-tool', 'similarity.js');
    SimilarityTool = require(simPath);
    console.log('[Integrator] ✓ 相似度工具 loaded');
  } catch (e) {
    console.log('[Integrator] ✗ 相似度工具加载失败:', e.message);
    SimilarityTool = null;
  }

  try {
    // 子项目5: Agent Guard Proxy
    const proxyPath = path.join(__dirname, '..', 'subprojects', '05-guard-proxy', 'guard-proxy.js');
    GuardProxy = require(proxyPath);
    console.log('[Integrator] ✓ Guard Proxy loaded');
  } catch (e) {
    console.log('[Integrator] ✗ Guard Proxy加载失败:', e.message);
    GuardProxy = null;
  }

  try {
    // 子项目7: 记忆模块
    const storePath = path.join(__dirname, '..', 'subprojects', '07-memory-module', 'memory-store.js');
    const readerPath = path.join(__dirname, '..', 'subprojects', '07-memory-module', 'memory-reader.js');
    MemoryStore = require(storePath);
    MemoryReader = require(readerPath);
    console.log('[Integrator] ✓ 记忆模块 loaded');
  } catch (e) {
    console.log('[Integrator] ✗ 记忆模块加载失败:', e.message);
    MemoryStore = null;
    MemoryReader = null;
  }
}

// 立即加载
loadModules();

// ========== 主集成类 ==========

class AgentGuardIntegrator {
  constructor(config = {}) {
    this.config = {
      // 评估配置
      evalModel: config.evalModel || 'local',  // local/browser
      evalBrowserPort: config.evalBrowserPort || 18790,
      
      // Proxy配置
      proxyPort: config.proxyPort || 18790,
      openclawUrl: config.openclawUrl || 'http://127.0.0.1:18789',
      
      // 规则配置
      rulesPath: config.rulesPath || path.join(__dirname, '..', 'subprojects', '02-rules-library'),
      defaultScenario: config.defaultScenario || 'general',
      
      // 记忆配置
      memoryPath: config.memoryPath || path.join(__dirname, '..', 'subprojects', '07-memory-module'),
      testStoragePath: config.testStoragePath || path.join(__dirname, '..', 'subprojects', '07-memory-module', 'test_storage'),
      
      // 相似度配置
      similarityThreshold: config.similarityThreshold || 0.8,
      
      ...config
    };
    
    // 初始化各子模块
    this._initSubModules();
  }

  _initSubModules() {
    // 1. 相似度工具（最先初始化，其他模块可能依赖它）
    if (SimilarityTool) {
      this.similarityTool = new SimilarityTool({
        enableSynonymDB: true,
        enableSemanticEnhancement: true,
        browserPort: this.config.evalBrowserPort,
        browserModel: 'zhipu'
      });
      
      // 适配层：添加compute()方法以兼容convergence-detector
      if (!this.similarityTool.compute) {
        this.similarityTool.compute = (text1, text2) => {
          return this.similarityTool.semanticSimilarity(text1, text2);
        };
      }
    } else {
      this.similarityTool = null;
    }
    
    // 2. 规则加载器
    if (RulesLoader) {
      this.rulesLoader = new RulesLoader(this.config.rulesPath);
      this.rules = this.rulesLoader.load(this.config.defaultScenario);
    } else {
      this.rules = {
        prohibitedWords: [],
        maxLength: 50000,
        minLength: 0,
        maxRounds: 50,
        maxRedundancyScore: 0.7
      };
    }
    
    // 3. 收敛检测器（注入相似度工具）
    if (ConvergenceDetector) {
      this.convergenceDetector = new ConvergenceDetector({
        similarityTool: this.similarityTool,  // 注入优化后的相似度工具
        scoreThreshold: 3,
        similarityThreshold: 92,
        consecutiveRounds: 3
      });
    } else {
      this.convergenceDetector = null;
    }
    
    // 4. 记忆模块
    if (MemoryStore && MemoryReader) {
      this.memoryStore = new MemoryStore(this.config.testStoragePath);
      this.memoryReader = new MemoryReader(this.config.testStoragePath);
    } else {
      this.memoryStore = null;
      this.memoryReader = null;
    }
    
    // 5. 评估引擎
    if (EvalEngineClass) {
      this.evalEngine = new EvalEngineClass({
        model: this.config.evalModel,
        browserPort: this.config.evalBrowserPort,
        rules: this.rules
      });
    } else {
      this.evalEngine = null;
    }
    
    // 6. Guard Proxy（注入约束检查器需要的配置）
    if (GuardProxy) {
      this.guardProxy = new GuardProxy({
        port: this.config.proxyPort,
        openclawUrl: this.config.openclawUrl,
        rules: this.rules,
        similarityTool: this.similarityTool  // 可选注入
      });
    } else {
      this.guardProxy = null;
    }
  }

  /**
   * 评估输出质量
   * @param {string} output - 待评估的输出文本
   * @param {string} task - 任务描述
   * @param {Object} context - 额外上下文
   */
  async evaluate(output, task, context = {}) {
    if (!this.evalEngine) {
      return { error: '评估引擎未加载', score: 0 };
    }
    
    try {
      // evaluate方法接受 {task, output, rules} 格式
      const result = await this.evalEngine.evaluate({ task, output, rules: this.rules, ...context });
      return result;
    } catch (e) {
      return { error: e.message, score: 0 };
    }
  }

  /**
   * 约束检查
   */
  checkConstraints(output, context = {}) {
    // 这个方法现在需要手动实现，因为Proxy的constraint-checker是内部模块
    // 如果Proxy已加载，可以通过API调用
    const violations = [];
    
    // 基础检查
    if (!output || output.trim().length === 0) {
      violations.push({ type: 'empty_output', severity: 'high' });
    }
    
    if (output && output.length > (this.rules.maxLength || 50000)) {
      violations.push({ type: 'max_length', severity: 'medium' });
    }
    
    // 违禁词检查
    if (this.rules.prohibitedWords && this.rules.prohibitedWords.length > 0) {
      const lowerOutput = output.toLowerCase();
      const matches = this.rules.prohibitedWords.filter(w => lowerOutput.includes(w.toLowerCase()));
      if (matches.length > 0) {
        violations.push({ type: 'prohibited_words', matches, severity: 'critical' });
      }
    }
    
    return {
      passed: violations.length === 0,
      violations
    };
  }

  /**
   * 记录并检测收敛
   */
  recordAndCheck(score, text, metadata = {}) {
    if (!this.convergenceDetector) {
      return { converged: false, reason: '收敛检测器未加载' };
    }
    
    this.convergenceDetector.record({ score, text, metadata });
    return this.convergenceDetector.check();
  }

  /**
   * 保存记忆
   */
  saveMemory(task, result, type = 'general') {
    if (!this.memoryStore) {
      return { error: '记忆模块未加载' };
    }
    
    try {
      // 确保result是有效对象
      if (!result || typeof result !== 'object') {
        return { error: '无效的结果对象' };
      }
      
      const evalResult = result.score !== undefined ? result : null;
      const violationResult = result.violations ? result : null;
      
      if (evalResult) {
        this.memoryStore.saveEval(task, evalResult);
      }
      if (violationResult && !violationResult.passed) {
        this.memoryStore.saveViolation(task, violationResult);
      }
      
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  }

  /**
   * 获取最佳实践
   */
  getBestPractices(task, type = 'general') {
    if (!this.memoryReader) {
      return [];
    }
    
    try {
      return this.memoryReader.getBestPractices(task, type) || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * 计算相似度
   */
  calculateSimilarity(text1, text2) {
    if (!this.similarityTool) {
      return 0;
    }
    return this.similarityTool.semanticSimilarity(text1, text2);
  }

  /**
   * 启动Proxy服务器
   */
  startProxy() {
    if (!this.guardProxy) {
      return { error: 'Guard Proxy未加载' };
    }
    
    try {
      this.guardProxy.start();
      return { success: true, port: this.config.proxyPort };
    } catch (e) {
      return { error: e.message };
    }
  }

  /**
   * 获取系统状态
   */
  getStatus() {
    return {
      modules: {
        evalEngine: !!this.evalEngine,
        rulesLoader: !!this.rulesLoader,
        convergenceDetector: !!this.convergenceDetector,
        similarityTool: !!this.similarityTool,
        guardProxy: !!this.guardProxy,
        memoryStore: !!this.memoryStore,
        memoryReader: !!this.memoryReader
      },
      config: {
        evalModel: this.config.evalModel,
        proxyPort: this.config.proxyPort,
        defaultScenario: this.config.defaultScenario
      },
      similarityVersion: this.similarityTool?.constructor?.getVersion?.() || null,
      rulesCount: this.rules?.prohibitedWords?.length || 0
    };
  }

  /**
   * 重新加载规则
   */
  reloadRules(scenario = null) {
    if (this.rulesLoader) {
      const scenarioToLoad = scenario || this.config.defaultScenario;
      this.rules = this.rulesLoader.load(scenarioToLoad);
      return { success: true, scenario: scenarioToLoad, rules: this.rules };
    }
    return { error: '规则加载器未加载' };
  }

  /**
   * 重新加载相似度数据库
   */
  reloadSimilarityDB() {
    if (this.similarityTool?.reloadSynonymDB) {
      this.similarityTool.reloadSynonymDB();
      return { success: true };
    }
    return { error: '相似度工具未加载' };
  }
}

module.exports = AgentGuardIntegrator;

// ========== 测试 ==========
if (require.main === module) {
  console.log('\n=== AI Agent Guard 集成器测试 ===\n');
  
  const integrator = new AgentGuardIntegrator({
    evalModel: 'local',
    defaultScenario: 'general'
  });
  
  console.log('\n[状态]', JSON.stringify(integrator.getStatus(), null, 2));
  
  // 测试相似度
  if (integrator.similarityTool) {
    console.log('\n[相似度测试]');
    const tests = [
      ['今天天气很好', '今天天气很好'],
      ['修改文本格式', '调整文本排版'],
      ['部署服务器', '布署服务器'],
    ];
    
    for (const [t1, t2] of tests) {
      const sim = integrator.calculateSimilarity(t1, t2);
      console.log(`  "${t1}" vs "${t2}": ${Math.round(sim * 100)}%`);
    }
  }
  
  // 测试收敛检测
  if (integrator.convergenceDetector) {
    console.log('\n[收敛检测测试]');
    integrator.recordAndCheck(85, '这是一个测试输出');
    integrator.recordAndCheck(85, '这是一个测试输出');
    const result = integrator.recordAndCheck(85, '这是一个测试输出');
    console.log('  连续3轮85分:', JSON.stringify(result));
  }
  
  console.log('\n=== 测试完成 ===\n');
}
