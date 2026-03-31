/**
 * 第三方独立评估引擎 v3
 * 
 * 功能：
 * 1. 内置浏览器自动化（无头浏览器）
 * 2. 用户可选择模型（大模型选择器）
 * 3. 国内/海外用户智能路由
 * 
 * 优先级策略：
 * - 国内用户: 豆包 → 智谱GLM → Kimi → minimax → 通义千问 → Groq/Mistral → API
 * - 海外用户: Gemini → Mistral → Groq → Poe → 豆包(国际) → API
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// ========== 模型配置 ==========

// ========== 本地评估器（无需API/浏览器）==========
const LOCAL_EVALUATOR = {
  name: '本地评估器',
  type: 'local',
  priority: 0,
  description: '基于规则的本地评估，无需网络'
};

// ========== 模型配置 ==========
const MODEL_CONFIGS = {
  // ========== 本地评估器 ==========
  local: {
    name: '本地评估器',
    type: 'local',
    priority: 0,
    region: 'global',
    description: '基于规则的本地评估，无需网络'
  },
  // ========== 国内用户模型 ==========
  doubao: {
    name: '字节豆包',
    url: 'https://www.doubao.com/',
    type: 'browser',
    priority: 1,
    region: 'cn',
    modelId: 'doubao-pro-32k'
  },
  zhipu: {
    name: '智谱 GLM-4-Flash',
    url: 'https://chatglm.cn/',
    type: 'browser',
    priority: 2,
    region: 'cn',
    modelId: 'glm-4-flash'
  },
  kimi: {
    name: 'Kimi',
    url: 'https://kimi.moonshot.cn/',
    type: 'browser',
    priority: 3,
    region: 'cn',
    modelId: 'moonshot-v1-32k'
  },
  minimax: {
    name: 'MiniMax 2.7',
    url: 'https://minimax.chat/',
    type: 'browser',
    priority: 4,
    region: 'cn',
    modelId: 'abab6.5s-chat'
  },
  qianwen: {
    name: '通义千问',
    url: 'https://qianwen.aliyun.com/',
    type: 'browser',
    priority: 5,
    region: 'cn',
    modelId: 'qwen-turbo'
  },
  
  // ========== 海外用户模型 ==========
  gemini: {
    name: 'Google Gemini',
    url: 'https://gemini.google.com/',
    type: 'browser',
    priority: 1,
    region: ' overseas',
    modelId: 'gemini-pro'
  },
  mistral: {
    name: 'Mistral',
    url: 'https://mistral.ai/chat/',
    type: 'browser',
    priority: 2,
    region: 'overseas',
    modelId: 'mistral-large'
  },
  groq: {
    name: 'Groq (Llama 3.3)',
    url: 'https://console.groq.com/',
    type: 'browser',
    priority: 3,
    region: 'overseas',
    modelId: 'llama-3.3-70b-versatile'
  },
  poe: {
    name: 'Poe 聚合平台',
    url: 'https://poe.com/',
    type: 'browser',
    priority: 4,
    region: 'overseas',
    modelId: 'claude-3-5-sonnet'
  },
  
  // ========== API 兜底 ==========
  claude_api: {
    name: 'Claude API',
    url: 'https://api.anthropic.com',
    type: 'api',
    priority: 99,
    region: 'global',
    modelId: 'claude-3-5-sonnet-20241022'
  },
  gpt4_api: {
    name: 'GPT-4 API',
    url: 'https://api.openai.com',
    type: 'api',
    priority: 99,
    region: 'global',
    modelId: 'gpt-4o'
  },
  openrouter: {
    name: 'OpenRouter (免费额度)',
    url: 'https://openrouter.ai',
    type: 'api',
    priority: 98,
    region: 'global',
    modelId: 'openai/gpt-3.5-turbo'
  }
};

// ========== 用户地区路由 ==========

const PRIORITY_CHAINS = {
  cn: ['local', 'doubao', 'zhipu', 'kimi', 'minimax', 'qianwen', 'groq', 'mistral', 'openrouter', 'claude_api', 'gpt4_api'],
  overseas: ['local', 'gemini', 'mistral', 'groq', 'poe', 'doubao', 'zhipu', 'openrouter', 'claude_api', 'gpt4_api']
};

// ========== 核心类 ==========

class EvalEngine {
  constructor(config = {}) {
    this.model = config.model || 'doubao';
    this.apiKey = config.apiKey || '';
    this.minScore = config.minScore || 60;
    this.timeout = config.timeout || 60000; // 浏览器模式60秒
    this.region = config.region || 'auto'; // 'cn', 'overseas', 'auto'
    this.selectedModel = config.selectedModel || 'doubao';
    this.browserMode = config.browserMode || true; // 默认使用浏览器模式
    
    // 自动检测地区
    if (this.region === 'auto') {
      this.region = this.detectRegion();
    }
    
    this.priorityChain = PRIORITY_CHAINS[this.region] || PRIORITY_CHAINS.cn;
  }

  /**
   * 检测用户地区
   */
  detectRegion() {
    // 通过时区简单判断
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const cnTimezones = ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Macau'];
    
    if (cnTimezones.some(tz => timezone.includes(tz))) {
      return 'cn';
    }
    return 'overseas';
  }

  /**
   * 评估 - 智能路由
   */
  async evaluate(input) {
    const { task, output, rules, selectedModel } = input;

    if (!task || typeof task !== 'string') {
      throw new EvalEngineError('INVALID_INPUT', 'task 参数无效');
    }
    if (!output || typeof output !== 'string') {
      throw new EvalEngineError('INVALID_INPUT', 'output 参数无效');
    }

    // 优先使用传入的模型，否则使用配置的默认模型
    const effectiveModel = selectedModel || this.selectedModel;
    
    const prompt = this.buildPrompt(task, output, rules);
    const errors = [];

    // 优先尝试用户选择的模型
    if (effectiveModel && effectiveModel !== 'auto') {
      try {
        console.log(`[EvalEngine] 使用用户选择: ${effectiveModel}`);
        const result = await this.callModel(effectiveModel, prompt);
        return this.parseResult(result, rules);
      } catch (err) {
        console.log(`[EvalEngine] ${effectiveModel} 失败:`, err.message);
        errors.push({ model: effectiveModel, error: err.message });
      }
    }

    // 遍历优先级链
    for (const modelId of this.priorityChain) {
      if (modelId === effectiveModel) continue; // 已尝试过
      
      try {
        console.log(`[EvalEngine] 尝试: ${MODEL_CONFIGS[modelId]?.name || modelId}`);
        const result = await this.callModel(modelId, prompt);
        return this.parseResult(result, rules);
      } catch (err) {
        console.log(`[EvalEngine] ${modelId} 失败:`, err.message);
        errors.push({ model: modelId, error: err.message });
      }
    }

    // 所有策略都失败
    throw new EvalEngineError(
      'ALL_STRATEGIES_FAILED',
      `所有模型均失败:\n${errors.map(e => `- ${e.model}: ${e.error}`).join('\n')}`
    );
  }

  /**
   * 调用指定模型
   */
  async callModel(modelId, prompt) {
    const config = MODEL_CONFIGS[modelId];
    
    if (!config) {
      throw new EvalEngineError('INVALID_MODEL', `未知模型: ${modelId}`);
    }

    if (modelId === 'local' || config.type === 'local') {
      return await this.callLocalEvaluator(prompt);
    } else if (config.type === 'browser') {
      return await this.callBrowserModel(config, prompt);
    } else if (config.type === 'api') {
      return await this.callApiModel(config, prompt);
    }
    
    throw new EvalEngineError('INVALID_MODEL', `不支持的模型类型: ${config.type}`);
  }

  /**
   * 本地评估器（基于规则，无需网络）
   */
  async callLocalEvaluator(prompt) {
    // 从 prompt 中提取输出内容进行本地分析
    const analysis = this.localAnalyze(prompt);
    
    return JSON.stringify({
      score: analysis.score,
      dimensions: {
        compliance: analysis.compliance,
        quality: analysis.quality,
        efficiency: analysis.efficiency,
        constraint: analysis.constraint
      },
      reasoning: analysis.reasoning,
      passed: analysis.score >= 60
    });
  }

  /**
   * 本地分析（基于规则的简单评估）
   */
  localAnalyze(prompt) {
    // 提取关键信息
    const outputLength = (prompt.match(/Agent 输出\n([^#]+)/)?.[1] || '').length;
    const hasStructure = prompt.includes('##') ? 20 : 0;
    const hasNumbers = (prompt.match(/\d+/g) || []).length * 2;
    const isComplete = outputLength > 10 ? 30 : 0;
    
    // 计算各维度分数
    const quality = Math.min(100, hasStructure + isComplete + 20);
    const compliance = 85; // 默认合规
    const efficiency = Math.min(100, outputLength > 50 ? 80 : 60);
    const constraint = 75; // 默认
    
    // 综合分数
    const score = Math.round(quality * 0.3 + compliance * 0.25 + efficiency * 0.2 + constraint * 0.25);
    
    let reasoning = '本地评估：';
    if (outputLength < 20) reasoning += '输出过短; ';
    if (hasStructure > 0) reasoning += '结构清晰; ';
    reasoning += `长度${outputLength}字`;
    
    return {
      score: Math.min(100, score),
      compliance: Math.min(100, compliance),
      quality: Math.min(100, quality),
      efficiency: Math.min(100, efficiency),
      constraint: Math.min(100, constraint),
      reasoning
    };
  }

  /**
   * 浏览器模式调用
   * 使用 Playwright 无头浏览器
   */
  async callBrowserModel(config, prompt) {
    try {
      const { chromium } = require('playwright');
      
      console.log(`[EvalEngine] 启动 ${config.name} 浏览器...`);
      
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      
      try {
        // 访问目标网站
        await page.goto(config.url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
        
        // 查找输入框
        const selectors = this.getInputSelectors(config.url);
        let inputElement = null;
        
        for (const selector of selectors) {
          try {
            inputElement = await page.waitForSelector(selector, { timeout: 5000 });
            if (inputElement) break;
          } catch (e) {
            continue;
          }
        }
        
        if (!inputElement) {
          throw new EvalEngineError('BROWSER_NO_INPUT', `未找到输入框: ${config.url}`);
        }
        
        // 填写内容
        const evaluationPrompt = `你是一个专业的 AI 评估专家。请评估以下 Agent 输出的质量。

## 评估任务
分析 Agent 输出，给出 0-100 的评分。

## Agent 输出
${prompt.substring(0, 2000)}

## 输出格式（严格 JSON）
{
  "score": 评分(0-100整数),
  "reasoning": "评分理由(50字内)"
}

只需输出 JSON。`;

        await inputElement.fill(evaluationPrompt);
        await page.waitForTimeout(500);
        
        // 点击发送
        const sendSelectors = [
          'button[type="submit"]',
          'button:has-text("发送")',
          'button:has-text("Send")',
          '[aria-label="发送"]',
          '[data-testid="send-button"]'
        ];
        
        for (const selector of sendSelectors) {
          try {
            await page.click(selector, { timeout: 3000 });
            break;
          } catch (e) {
            continue;
          }
        }
        
        // 等待回复（最多60秒）
        await page.waitForTimeout(5000);
        
        // 尝试获取回复内容
        const result = await this.extractBrowserResult(page, config.url);
        
        if (!result || result.length < 10) {
          throw new EvalEngineError('BROWSER_TIMEOUT', '浏览器模式超时，未获取到回复');
        }
        
        return result;
        
      } finally {
        await browser.close();
      }
      
    } catch (err) {
      if (err instanceof EvalEngineError) throw err;
      throw new EvalEngineError('BROWSER_ERROR', `${config.name} 浏览器调用失败: ${err.message}`);
    }
  }

  /**
   * 从浏览器页面提取结果
   */
  async extractBrowserResult(page, url) {
    // 根据不同网站选择对应的选择器
    const resultSelectors = {
      'doubao.com': '.chat-message-content, .message-content, div[class*="content"]',
      'chatglm.cn': '.message-content, .markdown-body, .chat-content',
      'kimi.moonshot.cn': '.message-content, .markdown-body, .msg-content',
      'minimax.chat': '.message-content, .markdown-body',
      'qianwen.aliyun.com': '.message-content, .md-content',
      'gemini.google.com': '.message-content, .markdown, [class*="response"]',
      'mistral.ai': '.message-content, .markdown-body',
      'console.groq.com': '.message-content, .markdown-body',
      'poe.com': '.message-content, .markdown-body'
    };
    
    const selector = this.getResultSelector(url, resultSelectors);
    
    try {
      // 尝试多种方式获取结果
      const messages = await page.$$(selector);
      if (messages && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const text = await lastMessage.textContent();
        if (text && text.length > 10) {
          return text;
        }
      }
    } catch (e) {
      // 继续尝试其他方式
    }
    
    // 备用：直接获取页面文本
    const bodyText = await page.textContent('body');
    if (bodyText && bodyText.length > 50) {
      // 提取 JSON
      const jsonMatch = bodyText.match(/\{[\s\S]*?"score"[\s\S]*?\}/);
      if (jsonMatch) {
        return jsonMatch[0];
      }
    }
    
    return '';
  }

  /**
   * 获取输入框选择器
   */
  getInputSelectors(url) {
    const selectors = {
      'doubao.com': ['textarea', 'div[contenteditable="true"]', '.chat-input textarea'],
      'chatglm.cn': ['textarea', '.input-area textarea', 'div[contenteditable="true"]'],
      'kimi.moonshot.cn': ['textarea', '.chat-input textarea', 'div[contenteditable="true"]'],
      'minimax.chat': ['textarea', '.input-area textarea'],
      'qianwen.aliyun.com': ['textarea', '#chat-input', 'div[contenteditable="true"]'],
      'gemini.google.com': ['textarea', 'div[contenteditable="true"]', '.input-area textarea'],
      'mistral.ai': ['textarea', 'div[contenteditable="true"]'],
      'console.groq.com': ['textarea', '.chat-input textarea'],
      'poe.com': ['textarea', 'div[contenteditable="true"]']
    };
    
    for (const [domain, selectorList] of Object.entries(selectors)) {
      if (url.includes(domain)) {
        return selectorList;
      }
    }
    return ['textarea', 'div[contenteditable="true"]'];
  }

  /**
   * 获取结果选择器
   */
  getResultSelector(url, selectorsMap) {
    for (const [domain, selector] of Object.entries(selectorsMap)) {
      if (url.includes(domain)) {
        return selector;
      }
    }
    return '.message-content, .markdown-body';
  }

  /**
   * 获取 URL 对应的选择器
   */
  getSelectorForUrl(url, selectors) {
    for (const [domain, selector] of Object.entries(selectors)) {
      if (url.includes(domain)) {
        return selector;
      }
    }
    return 'textarea';
  }

  /**
   * API 模式调用
   */
  async callApiModel(config, prompt) {
    if (config.modelId.includes('anthropic') || config.modelId.includes('claude')) {
      return await this.callClaude(config, prompt);
    } else if (config.modelId.includes('gpt') || config.modelId.includes('openai')) {
      return await this.callGPT(config, prompt);
    } else if (config.modelId.includes('openrouter')) {
      return await this.callOpenRouter(config, prompt);
    }
    
    throw new EvalEngineError('INVALID_API_MODEL', `不支持的API模型: ${config.modelId}`);
  }

  /**
   * 调用 Claude API
   */
  async callClaude(config, prompt) {
    const apiKey = this.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new EvalEngineError('MISSING_API_KEY', 'Claude API Key 未设置');
    }

    const body = JSON.stringify({
      model: config.modelId,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const result = await this.httpRequest({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    });

    return result;
  }

  /**
   * 调用 GPT API
   */
  async callGPT(config, prompt) {
    const apiKey = this.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new EvalEngineError('MISSING_API_KEY', 'GPT API Key 未设置');
    }

    const body = JSON.stringify({
      model: config.modelId,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.3
    });

    const result = await this.httpRequest({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      },
      body
    });

    return result;
  }

  /**
   * 调用 OpenRouter
   */
  async callOpenRouter(config, prompt) {
    const apiKey = this.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new EvalEngineError('MISSING_API_KEY', 'OpenRouter API Key 未设置');
    }

    const body = JSON.stringify({
      model: config.modelId,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024
    });

    const result = await this.httpRequest({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      },
      body
    });

    return result;
  }

  /**
   * HTTP 请求
   */
  httpRequest(options) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new EvalEngineError('TIMEOUT', `API 请求超时 (${this.timeout}ms)`));
      }, this.timeout);

      const urlObj = new URL(`https://${options.hostname}${options.path}`);
      const reqOptions = {
        hostname: options.hostname,
        port: urlObj.port || 443,
        path: options.path,
        method: options.method,
        headers: options.headers
      };

      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearTimeout(timeoutId);
          if (res.statusCode >= 400) {
            reject(new EvalEngineError('API_ERROR', `HTTP ${res.statusCode}`, data));
          } else {
            resolve(data);
          }
        });
      });

      req.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(new EvalEngineError('NETWORK_ERROR', err.message));
      });

      if (options.body) req.write(options.body);
      req.end();
    });
  }

  /**
   * 构建评估 Prompt
   */
  buildPrompt(task, output, rules) {
    return `## 评估任务\n${task}\n\n## Agent 输出\n${output}\n\n## 评分要求\n请对以上输出给出 0-100 的综合评分，0-59不合格，60-79合格，80-89良好，90-100优秀。\n\n## 输出格式\n{\n  "score": 综合分数(0-100整数),\n  "dimensions": {\n    "compliance": 合规分数,\n    "quality": 质量分数,\n    "efficiency": 效率分数,\n    "constraint": 约束分数\n  },\n  "reasoning": "评分理由",\n  "passed": 是否通过(>=60)\n}\n\n只需输出JSON。`;
  }

  /**
   * 解析结果
   */
  parseResult(rawResult, rules) {
    try {
      let content = rawResult;
      
      // 处理不同格式
      if (typeof rawResult === 'string') {
        const parsed = JSON.parse(rawResult);
        if (parsed.content?.[0]?.text) content = parsed.content[0].text;
        else if (parsed.choices?.[0]?.message?.content) content = parsed.choices[0].message.content;
        else content = rawResult;
      }

      // 提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new EvalEngineError('PARSE_ERROR', '无法提取JSON');
      }

      const result = JSON.parse(jsonMatch[0]);
      
      // 确保字段
      result.score = Math.max(0, Math.min(100, Math.round(result.score || 0)));
      result.dimensions = {
        compliance: Math.max(0, Math.min(100, Math.round(result.dimensions?.compliance || result.score))),
        quality: Math.max(0, Math.min(100, Math.round(result.dimensions?.quality || result.score))),
        efficiency: Math.max(0, Math.min(100, Math.round(result.dimensions?.efficiency || result.score))),
        constraint: Math.max(0, Math.min(100, Math.round(result.dimensions?.constraint || result.score)))
      };
      result.passed = result.score >= this.minScore;
      result.timestamp = new Date().toISOString();
      result.reasoning = result.reasoning || '无详细理由';

      return result;
    } catch (err) {
      if (err instanceof EvalEngineError) throw err;
      throw new EvalEngineError('PARSE_ERROR', `解析失败: ${err.message}`, rawResult);
    }
  }

  /**
   * 批量评估
   */
  async evaluateBatch(inputs) {
    const results = [];
    for (const input of inputs) {
      try {
        const result = await this.evaluate(input);
        results.push({ success: true, result });
      } catch (err) {
        results.push({ success: false, error: err.message });
      }
    }
    return results;
  }

  /**
   * 获取可用模型列表
   */
  static getAvailableModels(region = 'auto') {
    const engine = new EvalEngine({ region });
    const chain = engine.priorityChain;
    
    return chain.map(id => ({
      id,
      ...MODEL_CONFIGS[id]
    }));
  }
}

// ========== 错误类 ==========

class EvalEngineError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'EvalEngineError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message, details: this.details };
  }
}

// 导出
module.exports = { EvalEngine, EvalEngineError, MODEL_CONFIGS, PRIORITY_CHAINS };
