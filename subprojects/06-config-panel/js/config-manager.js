/**
 * Config Manager - Minimal Dark Tech
 */
const configManager = {
  defaultConfig: {
    forbiddenWords: [],
    maxLength: 5000,
    maxTurns: 10,
    scoreThreshold: 3,
    similarityThreshold: 92,
    consecutiveRounds: 3,
    evalModel: 'local',
    defaultScenario: 'general',
    semanticEnhancement: true
  },
  
  currentConfig: {},
  history: [],
  historyIndex: -1,
  maxHistorySize: 5,
  
  init() {
    this.loadConfig();
    this.renderHistory();
  },
  
  loadConfig() {
    const saved = localStorage.getItem('agentGuardConfig');
    if (saved) {
      try {
        this.currentConfig = { ...this.defaultConfig, ...JSON.parse(saved) };
      } catch (e) {
        this.currentConfig = { ...this.defaultConfig };
      }
    } else {
      this.currentConfig = { ...this.defaultConfig };
    }
    this.pushHistory('LOAD');
    this.applyToUI();
  },
  
  saveConfig() {
    this.collectFromUI();
    localStorage.setItem('agentGuardConfig', JSON.stringify(this.currentConfig));
    this.pushHistory('SAVE');
    return true;
  },
  
  resetConfig() {
    this.currentConfig = { ...this.defaultConfig };
    this.applyToUI();
    this.saveConfig();
    this.pushHistory('RESET');
  },
  
  collectFromUI() {
    const fw = document.getElementById('forbiddenWords');
    if (fw) this.currentConfig.forbiddenWords = fw.value.split('\n').map(w => w.trim()).filter(w => w);
    
    const ml = document.getElementById('maxLength');
    if (ml) this.currentConfig.maxLength = parseInt(ml.value) || 5000;
    
    const mt = document.getElementById('maxTurns');
    if (mt) this.currentConfig.maxTurns = parseInt(mt.value) || 10;
    
    const st = document.getElementById('scoreThreshold');
    if (st) this.currentConfig.scoreThreshold = parseFloat(st.value) || 3;
    
    const sim = document.getElementById('similarityThreshold');
    if (sim) this.currentConfig.similarityThreshold = parseInt(sim.value) || 92;
    
    const cr = document.getElementById('consecutiveRounds');
    if (cr) this.currentConfig.consecutiveRounds = parseInt(cr.value) || 3;
    
    const em = document.getElementById('evalModel');
    if (em) this.currentConfig.evalModel = em.value;
    
    const ds = document.getElementById('defaultScenario');
    if (ds) this.currentConfig.defaultScenario = ds.value;
    
    const sem = document.getElementById('semanticToggle');
    if (sem) this.currentConfig.semanticEnhancement = sem.classList.contains('active');
  },
  
  applyToUI() {
    const fw = document.getElementById('forbiddenWords');
    if (fw) fw.value = (this.currentConfig.forbiddenWords || []).join('\n');
    
    const ml = document.getElementById('maxLength');
    if (ml) ml.value = this.currentConfig.maxLength || 5000;
    
    const mt = document.getElementById('maxTurns');
    if (mt) mt.value = this.currentConfig.maxTurns || 10;
    
    const st = document.getElementById('scoreThreshold');
    if (st) {
      st.value = this.currentConfig.scoreThreshold || 3;
      this.updateDisplay('scoreThreshold', (this.currentConfig.scoreThreshold || 3) + '%');
    }
    
    const sim = document.getElementById('similarityThreshold');
    if (sim) {
      sim.value = this.currentConfig.similarityThreshold || 92;
      this.updateDisplay('similarityThreshold', (this.currentConfig.similarityThreshold || 92) + '%');
    }
    
    const cr = document.getElementById('consecutiveRounds');
    if (cr) {
      cr.value = this.currentConfig.consecutiveRounds || 3;
      this.updateDisplay('consecutiveRounds', this.currentConfig.consecutiveRounds || 3);
    }
    
    const em = document.getElementById('evalModel');
    if (em) em.value = this.currentConfig.evalModel || 'local';
    
    const ds = document.getElementById('defaultScenario');
    if (ds) ds.value = this.currentConfig.defaultScenario || 'general';
    
    const sem = document.getElementById('semanticToggle');
    if (sem) {
      sem.classList.toggle('active', this.currentConfig.semanticEnhancement !== false);
    }
  },
  
  updateDisplay(id, value) {
    const el = document.getElementById(id + 'Display');
    if (el) el.textContent = value;
  },
  
  pushHistory(action) {
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push({
      action,
      config: JSON.parse(JSON.stringify(this.currentConfig)),
      timestamp: Date.now()
    });
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
    this.renderHistory();
  },
  
  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.currentConfig = JSON.parse(JSON.stringify(this.history[this.historyIndex].config));
      this.applyToUI();
      this.renderHistory();
      return true;
    }
    return false;
  },
  
  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.currentConfig = JSON.parse(JSON.stringify(this.history[this.historyIndex].config));
      this.applyToUI();
      this.renderHistory();
      return true;
    }
    return false;
  },
  
  renderHistory() {
    const countEl = document.getElementById('historyCount');
    const listEl = document.getElementById('historyList');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    if (countEl) countEl.textContent = this.history.length;
    if (undoBtn) undoBtn.disabled = this.historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = this.historyIndex >= this.history.length - 1;
    
    if (this.history.length === 0) {
      if (listEl) listEl.innerHTML = '<div class="empty-state">暂无操作记录</div>';
      return;
    }
    
    if (listEl) {
      listEl.innerHTML = this.history.slice().reverse().map((r, i, arr) => {
        const idx = arr.length - 1 - i;
        const time = new Date(r.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="history-item ${idx === this.historyIndex ? 'current' : ''}">
            <span class="time">${time}</span>
            <span class="action">${r.action}</span>
          </div>
        `;
      }).join('');
    }
  },
  
  exportConfig() {
    this.collectFromUI();
    const data = { version: '1.0', exportTime: new Date().toISOString(), config: this.currentConfig };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-guard-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  },
  
  importConfig(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.config) throw new Error('Invalid format');
          this.currentConfig = { ...this.defaultConfig, ...data.config };
          this.applyToUI();
          this.saveConfig();
          this.pushHistory('IMPORT');
          resolve({ success: true });
        } catch (err) {
          reject({ error: '导入失败', message: err.message, suggestion: '请上传有效的JSON文件' });
        }
      };
      reader.onerror = () => reject({ error: '读取失败', message: '无法读取文件', suggestion: '请重试' });
      reader.readAsText(file);
    });
  }
};

window.configManager = configManager;
