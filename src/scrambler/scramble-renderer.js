export class ScrambleRenderer {
  constructor(container) {
    this.container = container;
    this.spans = [];
    this.prevResolved = [];
    this.scrambleCharSize = null;
    this.resolvedFontSize = null;
    this.letterSpacing = 0;
  }

  init(length) {
    this.container.innerHTML = '';
    this.spans = [];
    this.prevResolved = new Array(length).fill(false);

    for (let i = 0; i < length; i++) {
      const span = document.createElement('span');
      span.className = 'char scrambling';
      this.spans.push(span);
      this.container.appendChild(span);
    }
  }

  render(state, mode) {
    const { chars, resolved } = state;

    for (let i = 0; i < chars.length; i++) {
      const span = this.spans[i];
      if (!span) continue;

      span.textContent = chars[i];

      if (resolved[i] && !this.prevResolved[i]) {
        span.className = 'char resolved';
        if (mode === 'bounce') {
          span.classList.add('bounce');
        }
        span.style.fontSize = this.resolvedFontSize ? this.resolvedFontSize + 'px' : '';
        span.style.letterSpacing = '';
      } else if (resolved[i]) {
        span.className = 'char resolved';
        span.style.fontSize = this.resolvedFontSize ? this.resolvedFontSize + 'px' : '';
        span.style.letterSpacing = '';
      } else {
        span.className = 'char scrambling';
        span.style.fontSize = this.scrambleCharSize ? this.scrambleCharSize + 'px' : '';
        span.style.letterSpacing = this.letterSpacing + 'px';
      }
    }

    this.prevResolved = [...resolved];
  }

  clear() {
    this.container.innerHTML = '';
    this.spans = [];
    this.prevResolved = [];
  }

  setStyle({ fontFamily, fontSize, color, scrambleCharSize, letterSpacing }) {
    if (fontFamily) this.container.style.fontFamily = fontFamily;
    if (fontSize) this.container.style.fontSize = fontSize + 'px';
    if (color) this.container.style.color = color;
    this.resolvedFontSize = fontSize || null;
    this.scrambleCharSize = scrambleCharSize || fontSize || null;
    this.letterSpacing = letterSpacing || 0;
  }
}
