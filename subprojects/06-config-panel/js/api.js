/**
 * API - Minimal Dark Tech
 */
const api = {
  baseUrl: 'http://127.0.0.1:18790',
  timeout: 8000,
  
  testConnection() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    
    if (dot) dot.className = 'status-dot loading';
    if (text) text.textContent = '连接中...';
    
    // 模拟连接（实际环境需要真实API）
    setTimeout(() => {
      if (dot) dot.className = 'status-dot offline';
      if (text) text.textContent = '离线';
    }, 1500);
    
    return { success: false, error: 'API不可用' };
  }
};

window.api = api;
