/**
 * AI Agent Guard 性能基准测试
 */

const Integrator = require('./integrator/index.js');

const ITERATIONS = 1000;

function measure(name, fn) {
  const start = process.hrtime.bigint();
  fn();
  const end = process.hrtime.bigint();
  const duration = Number(end - start) / 1e6; // ms
  return { name, duration, avg: duration / ITERATIONS };
}

async function runBenchmark() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║       AI Agent Guard 性能基准测试                     ║
╚══════════════════════════════════════════════════════╝
  `);
  
  console.log(`测试参数: ${ITERATIONS} 次迭代\n`);
  
  const guard = new Integrator({
    evalModel: 'local',
    defaultScenario: 'general'
  });
  
  const testOutput = '这是一个测试AI输出的内容，用于评估系统的性能表现。';
  const testTask = '测试任务描述';
  
  const results = [];
  
  // 1. 约束检查基准
  console.log('🔄 约束检查...');
  const constraintResult = measure('约束检查', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      guard.checkConstraints(testOutput);
    }
  });
  results.push(constraintResult);
  
  // 2. 相似度计算基准
  console.log('🔄 相似度计算...');
  const similarityResult = measure('相似度计算', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      guard.calculateSimilarity('今天天气很好', '今天天气不错');
    }
  });
  results.push(similarityResult);
  
  // 3. 收敛检测基准
  console.log('🔄 收敛检测...');
  const convergenceResult = measure('收敛检测', () => {
    guard.recordAndCheck(85, '测试文本1');
    guard.recordAndCheck(85, '测试文本2');
    guard.recordAndCheck(85, '测试文本3');
    for (let i = 0; i < ITERATIONS; i++) {
      guard.recordAndCheck(85, `测试文本${i}`);
    }
  });
  results.push(convergenceResult);
  
  // 4. 规则加载基准
  console.log('🔄 规则加载...');
  const rulesResult = measure('规则热更新', () => {
    for (let i = 0; i < 100; i++) {
      guard.reloadRules('general');
    }
  });
  results.push(rulesResult);
  
  // 5. 评估引擎基准 (本地模式)
  console.log('🔄 评估引擎 (本地模式)...');
  const evalStart = process.hrtime.bigint();
  for (let i = 0; i < 10; i++) {
    await guard.evaluate(testOutput, testTask);
  }
  const evalEnd = process.hrtime.bigint();
  const evalDuration = Number(evalEnd - evalStart) / 1e6;
  results.push({ name: '本地评估 (10次)', duration: evalDuration, avg: evalDuration / 10 });
  
  // 输出结果
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║                  性能测试结果                         ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  操作                    总耗时      平均耗时        ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  
  for (const r of results) {
    const name = r.name.padEnd(20);
    const total = r.duration.toFixed(2).padStart(10) + 'ms';
    const avg = r.avg.toFixed(4).padStart(10) + 'ms';
    console.log(`║  ${name}  ${total}  ${avg}  ║`);
  }
  
  console.log('╚══════════════════════════════════════════════════════╝');
  
  // 性能评级
  const avgConstraint = results[0].avg;
  const avgSimilarity = results[1].avg;
  
  console.log('\n📊 性能评级:');
  
  if (avgConstraint < 1 && avgSimilarity < 1) {
    console.log('  🟢 优秀 - 所有操作在1ms内完成');
  } else if (avgConstraint < 5 && avgSimilarity < 5) {
    console.log('  🟡 良好 - 操作在5ms内完成');
  } else if (avgConstraint < 20 && avgSimilarity < 20) {
    console.log('  🟠 一般 - 操作在20ms内完成');
  } else {
    console.log('  🔴 需优化 - 部分操作超过20ms');
  }
  
  // 内存使用
  const memUsage = process.memoryUsage();
  console.log('\n💾 内存使用:');
  console.log(`  Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
  
  console.log('\n✅ 基准测试完成\n');
}

runBenchmark().catch(console.error);
