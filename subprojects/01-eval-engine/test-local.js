const { EvalEngine } = require('./eval-engine.js');

(async () => {
  console.log('=== 评估引擎本地测试 ===\n');
  
  const engine = new EvalEngine({ selectedModel: 'local' });
  
  const tests = [
    { name: '正常输出', output: '今天天气晴朗，温度25度，适合外出活动。' },
    { name: '过短输出', output: '天气好。' },
    { name: '长输出（结构化）', output: '## 天气总结\n- 今天：晴，25度\n- 明天：多云，20度\n- 建议：外出带伞' },
    { name: '空输出', output: '' },
  ];
  
  for (const t of tests) {
    try {
      const result = await engine.evaluate({ task: '天气播报', output: t.output, rules: {} });
      console.log(`${t.name}: 分数=${result.score} ${result.passed ? '✓ 通过' : '✗ 未通过'}`);
      console.log(`  维度: 合规=${result.dimensions.compliance} 质量=${result.dimensions.quality} 效率=${result.dimensions.efficiency} 约束=${result.dimensions.constraint}`);
    } catch (err) {
      console.log(`${t.name}: 错误 - ${err.message}`);
    }
  }
  
  console.log('\n=== 测试完成 ===');
})();
