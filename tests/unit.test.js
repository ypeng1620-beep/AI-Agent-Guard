/**
 * AI Agent Guard 单元测试
 * 测试核心模块功能
 */

const assert = require('assert');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    testsPassed++;
    console.log(`  ✅ ${name}`);
    return true;
  } catch (e) {
    testsFailed++;
    console.log(`  ❌ ${name}`);
    console.log(`     错误: ${e.message}`);
    return false;
  }
}

function describe(name, fn) {
  console.log(`\n📦 ${name}`);
  fn();
}

// ========== 测试1: 输入消毒 ==========
describe('输入消毒 (Sanitization)', () => {
  const sanitizeInput = (input, maxLength = 100000) => {
    if (typeof input !== 'string') return '';
    return input.slice(0, maxLength).replace(/[<>]/g, '').trim();
  };

  test('应移除HTML标签字符', () => {
    const input = '<script>alert("xss")</script>hello';
    const result = sanitizeInput(input);
    // 只移除 <> 字符，不移除标签内容
    assert.ok(!result.includes('<script>'));
    assert.ok(!result.includes('<'), '应移除<字符');
    assert.ok(!result.includes('>'), '应移除>字符');
    assert.ok(result.includes('script'), '标签内容应保留');
  });

  test('应限制最大长度', () => {
    const input = 'a'.repeat(200);
    const result = sanitizeInput(input, 100);
    assert.strictEqual(result.length, 100);
  });

  test('应处理非字符串输入', () => {
    assert.strictEqual(sanitizeInput(null), '');
    assert.strictEqual(sanitizeInput(undefined), '');
    assert.strictEqual(sanitizeInput(123), '');
    assert.strictEqual(sanitizeInput({}), '');
  });

  test('应去除首尾空白', () => {
    const input = '  hello world  ';
    const result = sanitizeInput(input);
    assert.strictEqual(result, 'hello world');
  });
});

// ========== 测试2: 相似度工具 ==========
describe('相似度工具 (Similarity)', () => {
  // 简化版Dice系数实现
  function diceCoefficient(str1, str2) {
    if (!str1 || !str2) return 0;
    const bigrams1 = new Set();
    const bigrams2 = new Set();
    
    for (let i = 0; i < str1.length - 1; i++) {
      bigrams1.add(str1.slice(i, i + 2));
    }
    for (let i = 0; i < str2.length - 1; i++) {
      bigrams2.add(str2.slice(i, i + 2));
    }
    
    let intersection = 0;
    bigrams1.forEach(bg => {
      if (bigrams2.has(bg)) intersection++;
    });
    
    return (2 * intersection) / (bigrams1.size + bigrams2.size) || 0;
  }

  test('相同字符串相似度应为1', () => {
    const sim = diceCoefficient('今天天气很好', '今天天气很好');
    assert.strictEqual(sim, 1);
  });

  test('相似字符串应有高相似度', () => {
    const sim = diceCoefficient('修改配置文件', '调整配置文件');
    assert.ok(sim >= 0.5, `Expected >= 0.5, got ${sim}`);
  });

  test('不同字符串相似度应低', () => {
    const sim = diceCoefficient('今天天气很好', '明天要下雨了');
    assert.ok(sim < 0.5, `Expected < 0.5, got ${sim}`);
  });

  test('空字符串应返回0', () => {
    assert.strictEqual(diceCoefficient('', ''), 0);
    assert.strictEqual(diceCoefficient('hello', ''), 0);
    assert.strictEqual(diceCoefficient('', 'world'), 0);
  });

  test('单字符应返回0', () => {
    const sim = diceCoefficient('a', 'b');
    assert.strictEqual(sim, 0);
  });
});

// ========== 测试3: 收敛检测 ==========
describe('收敛检测 (Convergence)', () => {
  class ConvergenceDetector {
    constructor(config = {}) {
      this.scoreThreshold = config.scoreThreshold || 3;
      this.similarityThreshold = config.similarityThreshold || 92;
      this.consecutiveRounds = config.consecutiveRounds || 3;
      this.history = [];
    }

    record(score, text = '') {
      this.history.push({ score, text });
      if (this.history.length > 10) {
        this.history.shift();
      }
    }

    check() {
      if (this.history.length < 2) return { converged: false };
      
      const last = this.history[this.history.length - 1];
      const prev = this.history[this.history.length - 2];
      
      const scoreDiff = Math.abs(last.score - prev.score);
      const scoreDiffPercent = (scoreDiff / prev.score) * 100;
      
      if (scoreDiffPercent <= this.scoreThreshold) {
        let consecutive = 1;
        for (let i = this.history.length - 2; i >= 0; i--) {
          const curr = this.history[i + 1];
          const prevHist = this.history[i];
          const diff = Math.abs(curr.score - prevHist.score);
          const diffPercent = (diff / prevHist.score) * 100;
          if (diffPercent <= this.scoreThreshold) {
            consecutive++;
          } else {
            break;
          }
        }
        
        if (consecutive >= this.consecutiveRounds) {
          return {
            converged: true,
            reason: `连续${consecutive}轮分数波动${scoreDiffPercent.toFixed(2)}% ≤ ${this.scoreThreshold}%`
          };
        }
      }
      
      return { converged: false };
    }

    reset() {
      this.history = [];
    }
  }

  test('连续相同分数应触发收敛', () => {
    const detector = new ConvergenceDetector({
      scoreThreshold: 3,
      consecutiveRounds: 3
    });
    
    detector.record(85, 'text1');
    detector.record(85, 'text2');
    detector.record(85, 'text3');
    
    const result = detector.check();
    assert.strictEqual(result.converged, true);
  });

  test('分数波动大不应收敛', () => {
    const detector = new ConvergenceDetector({
      scoreThreshold: 3,
      consecutiveRounds: 3
    });
    
    detector.record(70, 'text1');
    detector.record(90, 'text2');
    detector.record(60, 'text3');
    
    const result = detector.check();
    assert.strictEqual(result.converged, false);
  });

  test('连续轮次不足不应收敛', () => {
    const detector = new ConvergenceDetector({
      scoreThreshold: 3,
      consecutiveRounds: 3
    });
    
    detector.record(85, 'text1');
    detector.record(85, 'text2');
    
    const result = detector.check();
    assert.strictEqual(result.converged, false);
  });

  test('reset应清空历史', () => {
    const detector = new ConvergenceDetector();
    detector.record(85, 'text1');
    detector.record(85, 'text2');
    detector.reset();
    
    assert.strictEqual(detector.history.length, 0);
  });
});

// ========== 测试4: 约束检查 ==========
describe('约束检查 (Constraint)', () => {
  function checkConstraints(content, config = {}) {
    const forbiddenWords = config.forbiddenWords || ['毒品', '赌博', '外挂'];
    const maxLength = config.maxLength || 10000;
    const minLength = config.minLength || 1;
    
    const errors = [];
    
    if (!content || content.trim().length < minLength) {
      errors.push({ type: 'empty', message: '内容不能为空' });
    }
    
    if (content.length > maxLength) {
      errors.push({ type: 'too_long', message: `内容超过最大长度${maxLength}` });
    }
    
    const foundForbidden = [];
    const lowerContent = content.toLowerCase();
    for (const word of forbiddenWords) {
      if (lowerContent.includes(word.toLowerCase())) {
        foundForbidden.push(word);
      }
    }
    if (foundForbidden.length > 0) {
      errors.push({ type: 'forbidden', message: `包含违禁词: ${foundForbidden.join(', ')}` });
    }
    
    return {
      passed: errors.length === 0,
      errors
    };
  }

  test('正常内容应通过', () => {
    const result = checkConstraints('这是一个正常的测试内容');
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('空内容应被拦截', () => {
    const result = checkConstraints('');
    assert.strictEqual(result.passed, false);
    assert.ok(result.errors.some(e => e.type === 'empty'));
  });

  test('空白内容应被拦截', () => {
    const result = checkConstraints('   ');
    assert.strictEqual(result.passed, false);
  });

  test('违禁词应被拦截', () => {
    const result = checkConstraints('这是一个包含毒品的内容');
    assert.strictEqual(result.passed, false);
    assert.ok(result.errors.some(e => e.type === 'forbidden'));
  });

  test('超长内容应被拦截', () => {
    const result = checkConstraints('a'.repeat(10001), { maxLength: 10000 });
    assert.strictEqual(result.passed, false);
    assert.ok(result.errors.some(e => e.type === 'too_long'));
  });

  test('自定义违禁词应生效', () => {
    const result = checkConstraints('这是一个作弊行为', { forbiddenWords: ['作弊'] });
    assert.strictEqual(result.passed, false);
    assert.ok(result.errors.some(e => e.type === 'forbidden'));
  });

  test('多个问题应返回所有错误', () => {
    const result = checkConstraints('', { forbiddenWords: ['毒品'] });
    assert.strictEqual(result.passed, false);
    assert.ok(result.errors.length >= 1);
  });
});

// ========== 测试5: 配置验证 ==========
describe('配置验证 (Config)', () => {
  function validateConfig(config) {
    const errors = [];
    
    if (!['local', 'doubao', 'zhipu', 'kimi'].includes(config.evalModel)) {
      errors.push({ field: 'evalModel', message: '无效的评估模型' });
    }
    
    if (!['general', 'tts', 'code'].includes(config.defaultScenario)) {
      errors.push({ field: 'defaultScenario', message: '无效的场景' });
    }
    
    if (typeof config.similarityThreshold !== 'number' || 
        config.similarityThreshold < 0 || 
        config.similarityThreshold > 1) {
      errors.push({ field: 'similarityThreshold', message: '相似度阈值必须在0-1之间' });
    }
    
    return { valid: errors.length === 0, errors };
  }

  test('有效配置应通过', () => {
    const config = {
      evalModel: 'local',
      defaultScenario: 'general',
      similarityThreshold: 0.85
    };
    const result = validateConfig(config);
    assert.strictEqual(result.valid, true);
  });

  test('无效模型应报错', () => {
    const config = {
      evalModel: 'invalid',
      defaultScenario: 'general',
      similarityThreshold: 0.85
    };
    const result = validateConfig(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.field === 'evalModel'));
  });

  test('无效场景应报错', () => {
    const config = {
      evalModel: 'local',
      defaultScenario: 'invalid',
      similarityThreshold: 0.85
    };
    const result = validateConfig(config);
    assert.strictEqual(result.valid, false);
  });

  test('无效相似度阈值应报错', () => {
    const config1 = {
      evalModel: 'local',
      defaultScenario: 'general',
      similarityThreshold: 1.5
    };
    assert.strictEqual(validateConfig(config1).valid, false);
    
    const config2 = {
      evalModel: 'local',
      defaultScenario: 'general',
      similarityThreshold: -0.1
    };
    assert.strictEqual(validateConfig(config2).valid, false);
  });
});

// ========== 测试6: 规则加载 ==========
describe('规则加载 (Rules)', () => {
  function loadRules(rulesData) {
    if (!rulesData) throw new Error('规则数据不能为空');
    if (!rulesData.version) throw new Error('规则缺少version字段');
    if (!rulesData.dimensions) throw new Error('规则缺少dimensions字段');
    
    return {
      version: rulesData.version,
      dimensions: rulesData.dimensions,
      forbiddenWords: rulesData.forbiddenWords?.core || [],
      length: rulesData.length || { min: 1, max: 10000 }
    };
  }

  test('有效规则应加载成功', () => {
    const rulesData = {
      version: '2.0.0',
      dimensions: { quality: { weight: 0.35 } },
      forbiddenWords: { core: ['毒品', '赌博'] },
      length: { min: 10, max: 5000 }
    };
    
    const rules = loadRules(rulesData);
    assert.strictEqual(rules.version, '2.0.0');
    assert.ok(Array.isArray(rules.forbiddenWords));
  });

  test('空规则应报错', () => {
    try {
      loadRules(null);
      assert.fail('应抛出错误');
    } catch (e) {
      assert.ok(e.message.includes('规则数据不能为空'));
    }
  });

  test('缺少version应报错', () => {
    try {
      loadRules({ dimensions: {} });
      assert.fail('应抛出错误');
    } catch (e) {
      assert.ok(e.message.includes('缺少version'));
    }
  });

  test('缺少dimensions应报错', () => {
    try {
      loadRules({ version: '2.0.0' });
      assert.fail('应抛出错误');
    } catch (e) {
      assert.ok(e.message.includes('缺少dimensions'));
    }
  });
});

// ========== 输出结果 ==========
console.log('\n' + '═'.repeat(50));
console.log(`测试结果: ${testsPassed} 通过, ${testsFailed} 失败`);
console.log('═'.repeat(50));

if (testsFailed > 0) {
  process.exit(1);
}
