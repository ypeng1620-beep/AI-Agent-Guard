/**
 * 示例插件：自定义违禁词过滤
 * 
 * 此插件在评估前检查用户定义的敏感词列表
 * 将此文件放入 plugins/ 目录即可自动加载
 */

const customWords = [
  '内部消息',
  '机密文件', 
  '不要外传',
  '绝密',
  '隐私数据'
];

module.exports = {
  name: 'custom-word-filter',
  version: '1.0.0',
  description: '自定义违禁词过滤插件',

  register(loader) {
    // 在评估前检查自定义违禁词
    loader.registerHook('beforeEvaluate', async (context) => {
      const { output } = context;
      
      if (!output) return context;

      const foundWords = customWords.filter(word => output.includes(word));

      if (foundWords.length > 0) {
        console.log(`[custom-word-filter] 发现敏感词: ${foundWords.join(', ')}`);
        
        // 添加警告信息
        context.warnings = context.warnings || [];
        context.warnings.push({
          type: 'sensitive_word',
          words: foundWords,
          message: `内容包含敏感词: ${foundWords.join(', ')}`
        });
      }

      return context;
    });

    // 在约束检查后添加分类标签
    loader.registerHook('afterCheck', async (result) => {
      result.customChecked = true;
      result.checkedAt = new Date().toISOString();
      result.plugin = 'custom-word-filter';
      return result;
    });
  },

  unload() {
    console.log('[custom-word-filter] 插件已卸载');
  }
};
