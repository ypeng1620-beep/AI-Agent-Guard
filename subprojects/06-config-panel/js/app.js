/**
 * App - Minimal Dark Tech Multi-Page Router
 * with Language Toggle & Theme Toggle
 */
let currentRole = 'admin';
let currentPage = 'dashboard';
let isModified = false;
let currentLang = 'zh';
let currentTheme = 'dark';

// ========== Translation System ==========
const translations = {
  zh: {
    // 页面标题
    '系统概览': '系统概览',
    '评估引擎': '评估引擎',
    '约束规则': '约束规则',
    '操作历史': '操作历史',
    '系统配置': '系统配置',
    
    // 侧边栏
    '概览': '概览',
    '评估': '评估',
    '约束': '约束',
    '历史': '历史',
    '配置': '配置',
    
    // 系统状态
    '系统状态': '系统状态',
    '评估引擎': '评估引擎',
    '约束引擎': '约束引擎',
    '收敛检测': '收敛检测',
    '记忆模块': '记忆模块',
    '就绪': '就绪',
    '运行中': '运行中',
    '监控中': '监控中',
    '正常': '正常',
    
    // 快捷操作
    '快捷操作': '快捷操作',
    '开始评估': '开始评估',
    '查看约束': '查看约束',
    '历史记录': '历史记录',
    
    // 统计
    '今日评估': '今日评估',
    '评估次数': '评估次数',
    '通过': '通过',
    '拦截': '拦截',
    '收敛': '收敛',
    
    // 活动
    '最近活动': '最近活动',
    '暂无活动记录': '暂无活动记录',
    
    // 评估配置
    'EVAL ENGINE': '评估配置',
    '评估配置': '评估配置',
    '评估模式': '评估模式',
    'LOCAL 本地评估器': 'LOCAL 本地评估器',
    'DOUBAO 豆包浏览器': 'DOUBAO 豆包浏览器',
    'ZHIPU 智谱GLM': 'ZHIPU 智谱GLM',
    'KIMI Kimi': 'KIMI Kimi',
    '默认场景': '默认场景',
    'GENERAL 通用场景': 'GENERAL 通用场景',
    'TTS 语音合成': 'TTS 语音合成',
    'CODE 代码编写': 'CODE 代码编写',
    '当前状态': '当前状态',
    '无需网络 快速响应': '无需网络 快速响应',
    '需要浏览器环境': '需要浏览器环境',
    
    // 收敛参数
    'CONVERGENCE': '收敛参数',
    '收敛参数': '收敛参数',
    '分数阈值': '分数阈值',
    '相似度阈值': '相似度阈值',
    '连续轮次': '连续轮次',
    '严格': '严格',
    '宽松': '宽松',
    
    // 相似度工具
    'SIMILARITY': '相似度工具',
    '相似度工具': '相似度工具',
    '语义增强层': '语义增强层',
    '说明': '说明',
    '启用后使用语义相似度算法提升检测精度，支持调用大模型进行二次判定。': '启用后使用语义相似度算法提升检测精度，支持调用大模型进行二次判定。',
    
    // 约束规则
    'CONSTRAINT RULES': '约束规则',
    '违禁词管理': '违禁词管理',
    '违禁词列表': '违禁词列表',
    '(每行一个)': '(每行一个)',
    '输入违禁词，每行一个': '输入违禁词，每行一个',
    '核心': '核心',
    
    // 输出限制
    'OUTPUT LIMITS': '输出限制',
    '输出限制': '输出限制',
    '最大输出长度': '最大输出长度',
    '最大对话轮次': '最大对话轮次',
    
    // 规则预览
    'RULE PREVIEW': '规则预览',
    '规则预览': '规则预览',
    '违禁词': '违禁词',
    '最大长度': '最大长度',
    '最大轮次': '最大轮次',
    
    // 历史
    'HISTORY': '操作历史',
    '操作历史': '操作历史',
    '撤销': '撤销',
    '重做': '重做',
    '清空': '清空',
    '暂无操作记录': '暂无操作记录',
    
    // 配置
    'CONFIG': '系统配置',
    '配置管理': '配置管理',
    'IMPORT/EXPORT': '配置管理',
    '导出配置': '导出配置',
    '导入配置': '导入配置',
    '导入': '导入',
    
    // 保存
    'SAVE CONFIG': '保存配置',
    '保存配置': '保存配置',
    '保存所有配置': '保存所有配置',
    '重置为默认': '重置为默认',
    '保存状态': '保存状态',
    '等待保存...': '等待保存...',
    '已保存': '已保存',
    
    // 错误
    'CONFIG ERROR': '配置错误',
    'IMPORT ERROR': '导入失败',
    '最小长度不能小于100': '最小长度不能小于100',
    '最大长度不能超过100000': '最大长度不能超过100000',
    '请上传有效的JSON文件': '请上传有效的JSON文件',
    
    // Toast
    '权限不足': '权限不足',
    '验证失败': '验证失败',
    '配置已保存': '配置已保存',
    '已重置': '已重置',
    '配置已导出': '配置已导出',
    '导入成功': '导入成功',
    '导入失败': '导入失败',
    '普通用户模式': '普通用户模式',
    
    // 底部
    '系统就绪': '系统就绪',
    '离线': '离线',
    '连接中...': '连接中...',
    '已连接': '已连接',
    '连接': '连接',
    
    // 权限
    'ADMIN': '管理员',
    'USER': '普通用户',
    '权限:': '权限:',
  },
  en: {
    // Page titles
    '系统概览': 'Dashboard',
    '评估引擎': 'Eval Engine',
    '约束规则': 'Constraints',
    '操作历史': 'History',
    '系统配置': 'Settings',
    
    // Sidebar
    '概览': 'Overview',
    '评估': 'Eval',
    '约束': 'Rules',
    '历史': 'History',
    '配置': 'Settings',
    
    // System status
    '系统状态': 'System Status',
    '评估引擎': 'Eval Engine',
    '约束引擎': 'Constraint Engine',
    '收敛检测': 'Convergence',
    '记忆模块': 'Memory',
    '就绪': 'Ready',
    '运行中': 'Running',
    '监控中': 'Monitoring',
    '正常': 'Normal',
    
    // Quick actions
    '快捷操作': 'Quick Actions',
    '开始评估': 'Start Eval',
    '查看约束': 'View Rules',
    '历史记录': 'History',
    
    // Stats
    '今日评估': 'Today Eval',
    '评估次数': 'Eval Count',
    '通过': 'Pass',
    '拦截': 'Block',
    '收敛': 'Converge',
    
    // Activity
    '最近活动': 'Recent Activity',
    '暂无活动记录': 'No activity yet',
    
    // Eval config
    'EVAL ENGINE': 'EVAL ENGINE',
    '评估配置': 'Eval Config',
    '评估模式': 'Eval Mode',
    'LOCAL 本地评估器': 'LOCAL Local Evaluator',
    'DOUBAO 豆包浏览器': 'DOUBAO Browser',
    'ZHIPU 智谱GLM': 'ZHIPU GLM',
    'KIMI Kimi': 'KIMI Kimi',
    '默认场景': 'Default Scene',
    'GENERAL 通用场景': 'GENERAL General',
    'TTS 语音合成': 'TTS Voice',
    'CODE 代码编写': 'CODE Coding',
    '当前状态': 'Status',
    '无需网络 快速响应': 'No network needed, fast',
    '需要浏览器环境': 'Browser required',
    
    // Convergence
    'CONVERGENCE': 'CONVERGENCE',
    '收敛参数': 'Conv. Params',
    '分数阈值': 'Score Thresh.',
    '相似度阈值': 'Similarity',
    '连续轮次': 'Rounds',
    '严格': 'Strict',
    '宽松': 'Loose',
    
    // Similarity
    'SIMILARITY': 'SIMILARITY',
    '相似度工具': 'Similarity',
    '语义增强层': 'Semantic Layer',
    '说明': 'Note',
    '启用后使用语义相似度算法提升检测精度，支持调用大模型进行二次判定。': 'Enable semantic similarity algorithm for better detection, supports LLM二次判定.',
    
    // Constraints
    'CONSTRAINT RULES': 'CONSTRAINTS',
    '违禁词管理': 'Forbidden Words',
    '违禁词列表': 'Word List',
    '(每行一个)': '(one per line)',
    '输入违禁词，每行一个': 'Enter forbidden words, one per line',
    '核心': 'Core',
    
    // Output limits
    'OUTPUT LIMITS': 'LIMITS',
    '输出限制': 'Output Limits',
    '最大输出长度': 'Max Length',
    '最大对话轮次': 'Max Rounds',
    
    // Preview
    'RULE PREVIEW': 'PREVIEW',
    '规则预览': 'Preview',
    '违禁词': 'Words',
    '最大长度': 'Length',
    '最大轮次': 'Rounds',
    
    // History
    'HISTORY': 'HISTORY',
    '操作历史': 'History',
    '撤销': 'Undo',
    '重做': 'Redo',
    '清空': 'Clear',
    '暂无操作记录': 'No records',
    
    // Config
    'CONFIG': 'CONFIG',
    '配置管理': 'Config',
    'IMPORT/EXPORT': 'IMPORT/EXPORT',
    '导出配置': 'Export',
    '导入配置': 'Import',
    '导入': 'Import',
    
    // Save
    'SAVE CONFIG': 'SAVE',
    '保存配置': 'Save',
    '保存所有配置': 'Save All',
    '重置为默认': 'Reset',
    '保存状态': 'Status',
    '等待保存...': 'Waiting...',
    '已保存': 'Saved',
    
    // Errors
    'CONFIG ERROR': 'ERROR',
    'IMPORT ERROR': 'IMPORT ERROR',
    '最小长度不能小于100': 'Min length: 100',
    '最大长度不能超过100000': 'Max length: 100000',
    '请上传有效的JSON文件': 'Upload valid JSON',
    
    // Toast
    '权限不足': 'Permission denied',
    '验证失败': 'Validation failed',
    '配置已保存': 'Saved',
    '已重置': 'Reset',
    '配置已导出': 'Exported',
    '导入成功': 'Imported',
    '导入失败': 'Import failed',
    '普通用户模式': 'User mode',
    
    // Footer
    '系统就绪': 'Ready',
    '离线': 'Offline',
    '连接中...': 'Connecting...',
    '已连接': 'Online',
    '连接': 'Connect',
    
    // Permission
    'ADMIN': 'Admin',
    'USER': 'User',
    '权限:': 'Role:',
  }
};

// ========== Toast ==========
function showToast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const icons = { success: '✓', warning: '⚠', error: '✕' };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type]}</div>
    <div class="toast-message">${message}</div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 150);
  }, duration);
}

// ========== Language Toggle ==========
function toggleLanguage() {
  currentLang = currentLang === 'zh' ? 'en' : 'zh';
  
  const btn = document.getElementById('langToggle');
  if (btn) btn.textContent = currentLang === 'zh' ? 'EN' : '中';
  
  // 翻译所有界面UI元素（不翻译任务输出内容）
  translatePage();
  
  // 保存偏好
  localStorage.setItem('agentGuardLang', currentLang);
}

function translatePage() {
  // 翻译所有界面元素，但排除 .output-content 类（任务输出内容不做翻译）
  const selector = [
    '.card-title',
    '.card-badge', 
    '.btn:not(.output-content .btn)',
    '.form-label',
    '.tab-btn',
    '.page-title',
    '.status-label',
    '.status-value',
    '.stat-label',
    '.stat-mini .txt',
    '.preview-label',
    '.preview-item span:first-child',
    '.empty-state',
    '.error-title',
    '.error-message',
    '.log-indicator span:last-child',
    '.permission-toggle ~ span',
    '.form-hint',
    '.slider-label',
    '.slider-range span',
    '.toggle-label',
    '.history-count',
    '[data-i18n]'
  ].join(', ');
  
  document.querySelectorAll(selector).forEach(el => {
    // 跳过包含任务输出的容器
    if (el.closest('.output-content')) return;
    
    const text = el.textContent.trim();
    if (translations[currentLang][text]) {
      el.textContent = translations[currentLang][text];
    }
  });
  
  // 翻译页面标题
  const titles = {
    dashboard: currentLang === 'zh' ? '系统概览' : 'Dashboard',
    evaluate: currentLang === 'zh' ? '评估引擎' : 'Eval Engine',
    constraint: currentLang === 'zh' ? '约束规则' : 'Constraints',
    history: currentLang === 'zh' ? '操作历史' : 'History',
    config: currentLang === 'zh' ? '系统配置' : 'Settings'
  };
  
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) {
    titleEl.textContent = titles[currentPage] || currentPage;
  }
}

// ========== Theme Toggle ==========
function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = currentTheme === 'dark' ? '☀' : '☾';
  
  document.body.classList.toggle('light-theme', currentTheme === 'light');
  
  // 保存偏好
  localStorage.setItem('agentGuardTheme', currentTheme);
}

function loadPreferences() {
  // 加载语言偏好，默认中文
  const savedLang = localStorage.getItem('agentGuardLang');
  
  // 默认为中文
  currentLang = savedLang || 'zh';
  
  const btn = document.getElementById('langToggle');
  if (btn) btn.textContent = currentLang === 'zh' ? 'EN' : '中';
  
  // 如果是英文则翻译界面
  if (currentLang === 'en') {
    translatePage();
  }
  
  // 加载主题偏好
  const savedTheme = localStorage.getItem('agentGuardTheme');
  if (savedTheme) {
    currentTheme = savedTheme;
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = currentTheme === 'dark' ? '☀' : '☾';
    document.body.classList.toggle('light-theme', currentTheme === 'light');
  }
}

// ========== Page Router ==========
function switchPage(page) {
  if (page === currentPage) return;
  
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  
  document.querySelectorAll('.tab-btn').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  
  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('active', el.id === `page-${page}`);
  });
  
  // 根据当前语言设置页面标题
  const titles = {
    dashboard: currentLang === 'zh' ? '系统概览' : 'Dashboard',
    evaluate: currentLang === 'zh' ? '评估引擎' : 'Eval Engine',
    constraint: currentLang === 'zh' ? '约束规则' : 'Constraints',
    history: currentLang === 'zh' ? '操作历史' : 'History',
    config: currentLang === 'zh' ? '系统配置' : 'Settings'
  };
  
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = titles[page] || page;
  
  currentPage = page;
}

// ========== Input Handlers ==========
function handleSlider() {
  isModified = true;
  
  const st = document.getElementById('scoreThreshold');
  const sim = document.getElementById('similarityThreshold');
  const cr = document.getElementById('consecutiveRounds');
  
  if (st) document.getElementById('scoreThresholdDisplay').textContent = st.value + '%';
  if (sim) document.getElementById('similarityThresholdDisplay').textContent = sim.value + '%';
  if (cr) document.getElementById('consecutiveRoundsDisplay').textContent = cr.value;
}

function handleInput() {
  isModified = true;
  validateInput();
  updatePreview();
}

function handleModelChange() {
  const model = document.getElementById('evalModel')?.value;
  const tag = document.getElementById('modelTag');
  const desc = document.getElementById('modelDesc');
  
  const info = {
    local: { tag: 'LOCAL', desc: currentLang === 'zh' ? '无需网络 快速响应' : 'No network needed' },
    doubao: { tag: 'DOUBAO', desc: currentLang === 'zh' ? '需要浏览器环境' : 'Browser required' },
    zhipu: { tag: 'ZHIPU', desc: currentLang === 'zh' ? '需要浏览器环境' : 'Browser required' },
    kimi: { tag: 'KIMI', desc: currentLang === 'zh' ? '需要浏览器环境' : 'Browser required' }
  };
  
  const data = info[model] || info.local;
  if (tag) tag.textContent = data.tag;
  if (desc) desc.textContent = data.desc;
}

function validateInput() {
  const ml = document.getElementById('maxLength');
  const errBox = document.getElementById('constraintsError');
  const errMsg = document.getElementById('constraintsErrorMsg');
  
  if (!ml) return true;
  const val = parseInt(ml.value);
  
  if (isNaN(val) || val < 100) {
    if (errBox) { errBox.classList.remove('hidden'); errMsg.textContent = currentLang === 'zh' ? '最小长度不能小于100' : 'Min: 100'; }
    return false;
  }
  if (val > 100000) {
    if (errBox) { errBox.classList.remove('hidden'); errMsg.textContent = currentLang === 'zh' ? '最大长度不能超过100000' : 'Max: 100000'; }
    return false;
  }
  if (errBox) errBox.classList.add('hidden');
  return true;
}

function updatePreview() {
  const fw = document.getElementById('forbiddenWords');
  const ml = document.getElementById('maxLength');
  const mt = document.getElementById('maxTurns');
  
  if (fw) {
    const count = fw.value.split('\n').filter(w => w.trim()).length;
    const el = document.getElementById('previewForbidden');
    if (el) el.textContent = count + (currentLang === 'zh' ? '个' : ' words');
  }
  
  if (ml) {
    const el = document.getElementById('previewLength');
    if (el) el.textContent = ml.value;
  }
  
  if (mt) {
    const el = document.getElementById('previewTurns');
    if (el) el.textContent = mt.value;
  }
}

function toggleSwitch(el) {
  if (currentRole !== 'admin') { showToast(currentLang === 'zh' ? '权限不足' : 'Permission denied', 'warning'); return; }
  el.classList.toggle('active');
  isModified = true;
}

// ========== Permission ==========
function switchRole(role) {
  currentRole = role;
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.role === role);
  });
  applyPermissions();
  if (role !== 'admin') showToast(currentLang === 'zh' ? '普通用户模式' : 'User mode', 'warning');
}

function applyPermissions() {
  const isAdmin = currentRole === 'admin';
  document.querySelectorAll('.form-input, .form-select, .form-textarea').forEach(el => el.disabled = !isAdmin);
  document.getElementById('saveBtn')?.toggleAttribute('disabled', !isAdmin);
  document.querySelectorAll('.import-export .btn').forEach(el => el.disabled = !isAdmin);
}

// ========== Config Operations ==========
function saveConfig() {
  if (currentRole !== 'admin') { showToast(currentLang === 'zh' ? '权限不足' : 'Permission denied', 'error'); return; }
  if (!validateInput()) { showToast(currentLang === 'zh' ? '验证失败' : 'Validation failed', 'error'); return; }
  
  if (typeof configManager !== 'undefined') configManager.saveConfig();
  isModified = false;
  showToast(currentLang === 'zh' ? '配置已保存' : 'Saved', 'success');
  
  const status = document.getElementById('saveStatus');
  if (status) status.textContent = `${currentLang === 'zh' ? '已保存' : 'Saved'} ${new Date().toLocaleTimeString('zh-CN')}`;
}

function resetConfig() {
  if (currentRole !== 'admin') { showToast(currentLang === 'zh' ? '权限不足' : 'Permission denied', 'error'); return; }
  if (!confirm(currentLang === 'zh' ? '确定要重置配置吗？' : 'Reset all config?')) return;
  
  if (typeof configManager !== 'undefined') configManager.resetConfig();
  isModified = false;
  showToast(currentLang === 'zh' ? '已重置' : 'Reset', 'success');
  updatePreview();
}

function exportConfig() {
  if (typeof configManager !== 'undefined') configManager.exportConfig();
  showToast(currentLang === 'zh' ? '配置已导出' : 'Exported', 'success');
}

function importConfig(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (currentRole !== 'admin') { showToast(currentLang === 'zh' ? '权限不足' : 'Permission denied', 'error'); event.target.value = ''; return; }
  
  const errBox = document.getElementById('importError');
  
  if (typeof configManager !== 'undefined') {
    configManager.importConfig(file)
      .then(() => {
        if (errBox) errBox.classList.add('hidden');
        showToast(currentLang === 'zh' ? '导入成功' : 'Imported', 'success');
        event.target.value = '';
        updatePreview();
      })
      .catch(err => {
        if (errBox) {
          errBox.classList.remove('hidden');
          document.getElementById('importErrorMsg').textContent = err.message;
        }
        showToast(currentLang === 'zh' ? '导入失败' : 'Import failed', 'error');
        event.target.value = '';
      });
  }
}

// ========== History ==========
function undo() {
  if (typeof configManager !== 'undefined' && configManager.undo()) showToast(currentLang === 'zh' ? '已撤销' : 'Undone', 'success');
}

function redo() {
  if (typeof configManager !== 'undefined' && configManager.redo()) showToast(currentLang === 'zh' ? '已重做' : 'Redone', 'success');
}

function clearHistory() {
  if (!confirm(currentLang === 'zh' ? '确定要清空历史记录吗？' : 'Clear all history?')) return;
  if (typeof configManager !== 'undefined') configManager.clearHistory();
  showToast(currentLang === 'zh' ? '历史已清空' : 'Cleared', 'success');
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.getElementById('sidebarToggle');
  if (sidebar) {
    sidebar.classList.toggle('collapsed');
    const icon = toggle?.querySelector('.icon');
    if (icon) icon.textContent = sidebar.classList.contains('collapsed') ? '▶' : '◀';
  }
}

function updateTime() {
  const el = document.getElementById('currentTime');
  if (el) el.textContent = new Date().toLocaleTimeString('zh-CN');
}

// ========== Init ==========
document.addEventListener('DOMContentLoaded', () => {
  // 加载偏好
  loadPreferences();
  
  // 初始化配置
  if (typeof configManager !== 'undefined') configManager.init();
  
  // 侧边栏导航
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => switchPage(el.dataset.page));
  });
  
  // 页签导航
  document.querySelectorAll('.tab-btn').forEach(el => {
    el.addEventListener('click', () => switchPage(el.dataset.page));
  });
  
  // 权限切换
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => switchRole(btn.dataset.role));
  });
  
  // 侧边栏折叠
  document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebar);
  
  // 应用权限
  applyPermissions();
  
  // 更新时间
  setInterval(updateTime, 1000);
  updateTime();
  
  // 页面离开提示
  window.addEventListener('beforeunload', (e) => {
    if (isModified) { e.preventDefault(); e.returnValue = ''; }
  });
});
