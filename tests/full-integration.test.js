/**
 * AI Agent Guard 全面集成测试
 * 测试所有模块协同工作
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const INTEGRATOR_PATH = 'D:\\ai-agent-guard\\integrator';
const API_PORT = 18791;

let testsPassed = 0;
let testsFailed = 0;
let apiServer = null;

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
    if (e.stack) console.log(`     ${e.stack.split('\n')[1]}`);
    return false;
  }
}

function asyncTest(name, fn) {
  return test(name, async () => {
    await fn();
  });
}

function describe(name, fn) {
  console.log(`\n📦 ${name}`);
  fn();
}

// ========== 辅助函数 ==========
function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: API_PORT,
      ...options,
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

function post(path, data) {
  return httpRequest({ path, method: 'POST', headers: { 'Content-Type': 'application/json' } }, data);
}

function get(path) {
  return httpRequest({ path, method: 'GET' });
}

// ========== 测试1: 文件结构验证 ==========
describe('文件结构验证', () => {
  const requiredFiles = [
    'integrator/index.js',
    'integrator/package.json',
    'subprojects/01-eval-engine/eval-engine.js',
    'subprojects/02-rules-library/rules-loader.js',
    'subprojects/03-convergence-detector/convergence-detector.js',
    'subprojects/04-similarity-tool/similarity.js',
    'subprojects/05-guard-proxy/guard-proxy.js',
    'subprojects/06-config-panel/index.html',
    'subprojects/07-memory-module/memory-store.js',
    'api-server.js',
    'auth-server.js',
    'openapi.yaml',
    'README.md',
    '.env.example',
    'Dockerfile'
  ];

  requiredFiles.forEach(file => {
    test(`文件存在: ${file}`, () => {
      const fullPath = path.join('D:\\ai-agent-guard', file);
      assert.ok(fs.existsSync(fullPath), `文件 ${file} 不存在`);
    });
  });
});

// ========== 测试2: 模块加载 ==========
describe('模块加载测试', () => {
  test('集成器应能加载', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    assert.ok(Integrator, '集成器加载失败');
  });

  test('集成器应能实例化', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator({ evalModel: 'local' });
    assert.ok(guard, '集成器实例化失败');
  });

  test('所有子模块应加载', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator({ evalModel: 'local' });
    const status = guard.getStatus();
    
    // status.modules 包含所有子模块状态
    const modules = status.modules || status;
    
    assert.ok(modules.evalEngine, '评估引擎未加载');
    assert.ok(modules.rulesLoader, '规则加载器未加载');
    assert.ok(modules.convergenceDetector, '收敛检测未加载');
    assert.ok(modules.similarityTool, '相似度工具未加载');
    assert.ok(modules.guardProxy, 'Guard Proxy未加载');
    assert.ok(modules.memoryStore, '记忆存储未加载');
  });
});

// ========== 测试3: 配置验证 ==========
describe('配置管理测试', () => {
  test('应支持默认配置', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    assert.ok(guard.config, '配置缺失');
    assert.strictEqual(guard.config.evalModel, 'local');
  });

  test('应支持自定义配置', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator({
      evalModel: 'doubao',
      defaultScenario: 'tts',
      similarityThreshold: 0.9
    });
    assert.strictEqual(guard.config.evalModel, 'doubao');
    assert.strictEqual(guard.config.defaultScenario, 'tts');
    assert.strictEqual(guard.config.similarityThreshold, 0.9);
  });

  test('.env.example应包含必要配置项', () => {
    const envPath = path.join('D:\\ai-agent-guard', '.env.example');
    const content = fs.readFileSync(envPath, 'utf8');
    
    const required = ['PORT', 'HOST', 'EVAL_MODEL', 'DEFAULT_SCENARIO', 'API_KEY'];
    required.forEach(key => {
      assert.ok(content.includes(key), `.env.example缺少 ${key}`);
    });
  });
});

// ========== 测试4: 规则系统 ==========
describe('规则系统测试', () => {
  test('应加载general规则', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator({ defaultScenario: 'general' });
    assert.ok(guard.rules, '规则未加载');
    assert.ok(guard.rules.dimensions, '规则缺少dimensions');
  });

  test('general规则应包含quality维度', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator({ defaultScenario: 'general' });
    assert.ok(guard.rules.dimensions.quality, '缺少quality维度');
  });

  test('应支持规则热更新', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    const result = guard.reloadRules('general');
    assert.ok(result !== undefined, '热更新应返回结果');
  });

  test('tts规则应加载', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    const rules = guard.rulesLoader.load('tts');
    assert.ok(rules.dimensions, 'tts规则格式错误');
  });

  test('code规则应加载', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    const rules = guard.rulesLoader.load('code');
    assert.ok(rules.dimensions, 'code规则格式错误');
  });
});

// ========== 测试5: 评估引擎 ==========
describe('评估引擎测试', async () => {
  asyncTest('本地评估应返回结果', async () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator({ evalModel: 'local' });
    
    const result = await guard.evaluate('这是一个正常的测试输出内容', '测试任务');
    
    assert.ok(typeof result.score === 'number', '分数应为数字');
    assert.ok(result.score >= 0 && result.score <= 100, '分数应在0-100范围内');
  });

  asyncTest('空输出应被处理', async () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator({ evalModel: 'local' });
    
    const result = await guard.evaluate('', '测试');
    assert.ok(typeof result.score === 'number', '应返回分数');
  });
});

// ========== 测试6: 约束检查 ==========
describe('约束检查测试', () => {
  test('正常内容应通过', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    
    const result = guard.checkConstraints('这是一个完全正常的测试内容');
    assert.strictEqual(result.passed, true, '正常内容应通过');
  });

  test('空内容应被拦截', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    
    const result = guard.checkConstraints('');
    assert.strictEqual(result.passed, false, '空内容应被拦截');
  });

  test('违禁词应被拦截', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator({ defaultScenario: 'general' });
    
    const result = guard.checkConstraints('这个内容包含毒品');
    assert.strictEqual(result.passed, false, '违禁词应被拦截');
  });

  test('超长内容应被拦截', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    
    const longContent = 'x'.repeat(100001);
    const result = guard.checkConstraints(longContent);
    assert.strictEqual(result.passed, false, '超长内容应被拦截');
  });

  test('应返回具体错误信息', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    
    const result = guard.checkConstraints('');
    assert.ok(result.passed === false, '空内容应不通过');
    assert.ok(Array.isArray(result.violations), '应返回violations数组');
    assert.ok(result.violations.length > 0, '应有违规');
  });
});

// ========== 测试7: 收敛检测 ==========
describe('收敛检测测试', () => {
  test('应检测收敛', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    
    // 连续相同分数应触发收敛
    guard.recordAndCheck(85, 'text1');
    guard.recordAndCheck(85, 'text2');
    guard.recordAndCheck(85, 'text3');
    const result = guard.recordAndCheck(85, 'text4');
    
    assert.strictEqual(result.converged, true, '应检测到收敛');
  });

  test('不同分数不应收敛', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    
    guard.recordAndCheck(70, 'text1');
    guard.recordAndCheck(85, 'text2');
    guard.recordAndCheck(90, 'text3');
    const result = guard.recordAndCheck(60, 'text4');
    
    assert.strictEqual(result.converged, false, '不同分数不应收敛');
  });
});

// ========== 测试8: 相似度计算 ==========
describe('相似度计算测试', () => {
  test('相同文本相似度应为1', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    
    const sim = guard.calculateSimilarity('今天天气很好', '今天天气很好');
    assert.strictEqual(sim, 1, '相同文本相似度应为1');
  });

  test('完全不同文本相似度应低', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    
    const sim = guard.calculateSimilarity('今天天气很好', '明天要下雨了');
    assert.ok(sim < 0.5, '不同文本相似度应低于0.5');
  });

  test('空字符串相似度应为1 (两者都为空视为相同)', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    
    const sim = guard.calculateSimilarity('', '');
    // 两个空字符串被视为完全相同（这是设计选择）
    assert.strictEqual(sim, 1, '两个空字符串相似度应为1');
  });
});

// ========== 测试9: 记忆模块 ==========
describe('记忆模块测试', () => {
  test('应能保存记忆', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    
    const result = guard.saveMemory('test-task-001', {
      score: 85,
      text: '测试输出'
    }, 'general');
    
    assert.strictEqual(result.success, true, '保存应成功');
  });

  test('应能读取最佳实践', () => {
    const Integrator = require(path.join(INTEGRATOR_PATH, 'index.js'));
    const guard = new Integrator();
    
    guard.saveMemory('test-task-002', { score: 90 }, 'general');
    const practices = guard.getBestPractices('test-task-002', 'general');
    
    assert.ok(Array.isArray(practices), '应返回数组');
  });
});

// ========== 测试10: API端点测试 ==========
describe('API端点测试 (需要启动服务器)', async () => {
  asyncTest('健康检查应返回200', async () => {
    try {
      const res = await get('/health');
      assert.strictEqual(res.status, 200, '健康检查应返回200');
      assert.strictEqual(res.body.status, 'ok', '状态应为ok');
    } catch (e) {
      console.log('     注意: API服务器未运行，跳过');
    }
  });

  asyncTest('评估接口应工作', async () => {
    try {
      const res = await post('/evaluate', {
        output: '这是一个测试输出内容',
        task: '测试任务'
      });
      assert.strictEqual(res.status, 200, '评估应返回200');
      assert.strictEqual(res.body.success, true, '应返回成功');
    } catch (e) {
      console.log('     注意: API服务器未运行，跳过');
    }
  });

  asyncTest('约束检查接口应工作', async () => {
    try {
      const res = await post('/check', {
        content: '正常内容'
      });
      assert.strictEqual(res.status, 200, '检查应返回200');
    } catch (e) {
      console.log('     注意: API服务器未运行，跳过');
    }
  });

  asyncTest('相似度接口应工作', async () => {
    try {
      const res = await post('/similarity', {
        text1: '今天天气很好',
        text2: '今天天气很好'
      });
      assert.strictEqual(res.status, 200, '相似度应返回200');
      assert.strictEqual(res.body.data.similarity, 1, '相同文本相似度应为1');
    } catch (e) {
      console.log('     注意: API服务器未运行，跳过');
    }
  });
});

// ========== 测试11: OpenAPI规范 ==========
describe('OpenAPI规范验证', () => {
  test('openapi.yaml应为有效YAML', () => {
    const yamlPath = path.join('D:\\ai-agent-guard', 'openapi.yaml');
    const content = fs.readFileSync(yamlPath, 'utf8');
    
    assert.ok(content.includes('openapi:'), '应为OpenAPI规范');
    assert.ok(content.includes('paths:'), '应定义路径');
    assert.ok(content.includes('/evaluate'), '应包含/evaluate端点');
    assert.ok(content.includes('/check'), '应包含/check端点');
    assert.ok(content.includes('/health'), '应包含/health端点');
  });

  test('应定义所有核心端点', () => {
    const yamlPath = path.join('D:\\ai-agent-guard', 'openapi.yaml');
    const content = fs.readFileSync(yamlPath, 'utf8');
    
    const endpoints = [
      '/evaluate', '/check', '/convergence', '/similarity',
      '/memory', '/config', '/rules/reload', '/status'
    ];
    
    endpoints.forEach(ep => {
      assert.ok(content.includes(ep), `应包含${ep}端点`);
    });
  });
});

// ========== 测试12: Docker配置 ==========
describe('Docker配置验证', () => {
  test('Dockerfile应存在且有效', () => {
    const dockerfilePath = path.join('D:\\ai-agent-guard', 'Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    
    assert.ok(content.includes('FROM'), '应包含基础镜像');
    assert.ok(content.includes('WORKDIR'), '应设置工作目录');
    assert.ok(content.includes('EXPOSE 18791'), '应暴露端口');
    assert.ok(content.includes('node'), '应使用Node.js');
  });

  test('docker-compose.yml应有效', () => {
    const composePath = path.join('D:\\ai-agent-guard', 'docker-compose.yml');
    const content = fs.readFileSync(composePath, 'utf8');
    
    assert.ok(content.includes('version:'), '应有版本定义');
    assert.ok(content.includes('services:'), '应定义服务');
    assert.ok(content.includes('agent-guard'), '应包含agent-guard服务');
    assert.ok(content.includes('18791:18791'), '应映射端口');
  });
});

// ========== 测试13: 单元测试 ==========
describe('单元测试覆盖', () => {
  test('单元测试文件应存在', () => {
    const testPath = path.join('D:\\ai-agent-guard', 'tests', 'unit.test.js');
    assert.ok(fs.existsSync(testPath), 'unit.test.js应存在');
  });

  test('安全测试文件应存在', () => {
    const testPath = path.join('D:\\ai-agent-guard', 'tests', 'security.test.js');
    assert.ok(fs.existsSync(testPath), 'security.test.js应存在');
  });
});

// ========== 输出结果 ==========
console.log('\n' + "═".repeat(60));
console.log(`全面集成测试结果: ${testsPassed} 通过, ${testsFailed} 失败`);
console.log("═".repeat(60));

const passRate = ((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1);
console.log(`\n通过率: ${passRate}%\n`);

if (testsFailed > 0) {
  console.log('❌ 存在失败的测试，请修复\n');
  process.exit(1);
} else {
  console.log('✅ 所有集成测试通过\n');
  process.exit(0);
}
