const STORAGE_KEY = 'custom-themes';

const DEFAULT_COLORS = {
  background: '#1a1a2e',
  text: '#a5b4fc',
  keyword: '#c792ea',
  string: '#c3e88d',
  number: '#f78c6c',
  comment: '#676e95',
  function: '#82aaff',
  operator: '#89ddff'
};

export class ThemeManager {
  constructor() {
    this.themes = {};
    this.loadFromStorage();
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.themes = data.themes || {};
      }
    } catch {
      this.themes = {};
    }
    return this.themes;
  }

  saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ themes: this.themes }));
  }

  saveTheme(name, colors) {
    this.themes[name] = { ...colors };
    this.saveToStorage();
    this.downloadJSON();
  }

  deleteTheme(name) {
    delete this.themes[name];
    this.saveToStorage();
  }

  importFromFile(json) {
    try {
      const data = JSON.parse(json);
      if (data.themes) {
        Object.assign(this.themes, data.themes);
        this.saveToStorage();
        return true;
      }
    } catch {
      // invalid JSON
    }
    return false;
  }

  downloadJSON() {
    const json = JSON.stringify({ themes: this.themes }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'custom-themes.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  applyTheme(element, colors) {
    element.style.setProperty('--custom-bg', colors.background);
    element.style.setProperty('--custom-text', colors.text);
    element.style.setProperty('--custom-keyword', colors.keyword);
    element.style.setProperty('--custom-string', colors.string);
    element.style.setProperty('--custom-number', colors.number);
    element.style.setProperty('--custom-comment', colors.comment);
    element.style.setProperty('--custom-function', colors.function);
    element.style.setProperty('--custom-operator', colors.operator || '#89ddff');
  }

  clearThemeVars(element) {
    element.style.removeProperty('--custom-bg');
    element.style.removeProperty('--custom-text');
    element.style.removeProperty('--custom-keyword');
    element.style.removeProperty('--custom-string');
    element.style.removeProperty('--custom-number');
    element.style.removeProperty('--custom-comment');
    element.style.removeProperty('--custom-function');
    element.style.removeProperty('--custom-operator');
  }

  getThemeNames() {
    return Object.keys(this.themes);
  }

  getTheme(name) {
    return this.themes[name] || null;
  }

  getDefaultColors() {
    return { ...DEFAULT_COLORS };
  }
}
