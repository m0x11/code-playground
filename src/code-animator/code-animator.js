import { populateFontSelect } from '../shared/fonts.js';

export function initCodeAnimator() {
  // State
  let animationId = null;
  let isPaused = false;
  let currentIndex = 0;
  let displayedText = '';
  let codeToType = '';
  let randomOrder = [];

  // Elements
  const codeInput = document.getElementById('codeInput');
  const codeOutput = document.getElementById('codeOutput').querySelector('code');
  const codeDisplay = document.getElementById('codeDisplay');
  const windowControls = document.getElementById('windowControls');

  // Controls
  const fontFamily = document.getElementById('fontFamily');
  const fontSize = document.getElementById('fontSize');
  const theme = document.getElementById('theme');
  const cursorStyle = document.getElementById('cursorStyle');
  const typingEffect = document.getElementById('typingEffect');
  const charAnimation = document.getElementById('charAnimation');
  const syntaxStyle = document.getElementById('syntaxStyle');
  const speed = document.getElementById('speed');
  const charsPerTick = document.getElementById('charsPerTick');
  const showLineNumbers = document.getElementById('showLineNumbers');
  const showWindowControls = document.getElementById('showWindowControls');
  const cursorBlink = document.getElementById('cursorBlink');

  // Buttons
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const instantBtn = document.getElementById('instantBtn');

  // Stats
  const charCount = document.getElementById('charCount');
  const lineCount = document.getElementById('lineCount');

  // Populate font selector
  populateFontSelect(fontFamily);

  // Tokenizer-based syntax highlighting
  function highlightSyntax(code) {
    const tokens = [];
    let i = 0;

    while (i < code.length) {
      // Single-line comment
      if (code[i] === '/' && code[i + 1] === '/') {
        let end = i;
        while (end < code.length && code[end] !== '\n') end++;
        tokens.push({ type: 'comment', value: code.slice(i, end) });
        i = end;
        continue;
      }

      // Multi-line comment
      if (code[i] === '/' && code[i + 1] === '*') {
        let end = i + 2;
        while (end < code.length && !(code[end] === '*' && code[end + 1] === '/')) end++;
        end += 2;
        tokens.push({ type: 'comment', value: code.slice(i, end) });
        i = end;
        continue;
      }

      // String
      if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
        const quote = code[i];
        let end = i + 1;
        while (end < code.length && code[end] !== quote) {
          if (code[end] === '\\') end++;
          end++;
        }
        end++;
        tokens.push({ type: 'string', value: code.slice(i, end) });
        i = end;
        continue;
      }

      // Number
      if (/[0-9]/.test(code[i]) || (code[i] === '.' && /[0-9]/.test(code[i + 1]))) {
        let end = i;
        while (end < code.length && /[0-9.xXa-fA-F]/.test(code[end])) end++;
        tokens.push({ type: 'number', value: code.slice(i, end) });
        i = end;
        continue;
      }

      // Identifier or keyword
      if (/[a-zA-Z_$]/.test(code[i])) {
        let end = i;
        while (end < code.length && /[a-zA-Z0-9_$]/.test(code[end])) end++;
        const word = code.slice(i, end);
        const keywords = ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch', 'new', 'this', 'typeof', 'instanceof', 'true', 'false', 'null', 'undefined'];

        // Check if it's a function call
        let nextNonSpace = end;
        while (nextNonSpace < code.length && code[nextNonSpace] === ' ') nextNonSpace++;

        if (keywords.includes(word)) {
          tokens.push({ type: 'keyword', value: word });
        } else if (code[nextNonSpace] === '(') {
          tokens.push({ type: 'function', value: word });
        } else {
          tokens.push({ type: 'identifier', value: word });
        }
        i = end;
        continue;
      }

      // Default: single character
      tokens.push({ type: 'plain', value: code[i] });
      i++;
    }

    // Convert tokens to HTML
    return tokens.map(token => {
      const escaped = token.value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      switch (token.type) {
        case 'comment': return `<span class="syntax-comment">${escaped}</span>`;
        case 'string': return `<span class="syntax-string">${escaped}</span>`;
        case 'number': return `<span class="syntax-number">${escaped}</span>`;
        case 'keyword': return `<span class="syntax-keyword">${escaped}</span>`;
        case 'function': return `<span class="syntax-function">${escaped}</span>`;
        default: return escaped;
      }
    }).join('');
  }

  // Wrap characters for animation
  function wrapCharsForAnimation(text, animation) {
    if (animation === 'none') return text;
    return text.replace(/(<[^>]+>)|(.)/g, (match, tag, char) => {
      if (tag) return tag;
      if (char === '\n') return char;
      return `<span class="char">${char}</span>`;
    });
  }

  // Create cursor element
  function createCursor() {
    const style = cursorStyle.value;
    if (style === 'none') return '';

    const blinkClass = cursorBlink.checked ? '' : 'style="animation: none;"';
    return `<span class="cursor cursor-${style}" ${blinkClass}></span>`;
  }

  // Format with line numbers
  function formatWithLineNumbers(text) {
    if (!showLineNumbers.checked) return text;

    const lines = text.split('\n');
    return lines.map(line => `<span class="line">${line}</span>`).join('\n');
  }

  // Update display
  function updateDisplay(text, showCursor = true) {
    let output = text;

    if (syntaxStyle.value !== 'none') {
      output = highlightSyntax(output);
    }

    if (charAnimation.value !== 'none') {
      output = wrapCharsForAnimation(output, charAnimation.value);
    }

    output = formatWithLineNumbers(output);

    if (showCursor) {
      output += createCursor();
    }

    codeOutput.innerHTML = output;

    // Update stats
    charCount.textContent = `${text.length} / ${codeToType.length} chars`;
    lineCount.textContent = `${(text.match(/\n/g) || []).length + 1} lines`;
  }

  // Generate random order for random typing effect
  function generateRandomOrder(length) {
    const indices = Array.from({ length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }

  // Natural typing state
  let naturalNextDelay = null;

  // Get next characters based on typing effect
  function getNextChars() {
    const effect = typingEffect.value;
    const count = parseInt(charsPerTick.value);

    switch (effect) {
      case 'normal':
        return codeToType.substring(currentIndex, currentIndex + count);

      case 'natural': {
        const char = codeToType[currentIndex];

        let numChars;
        const rand = Math.random();
        if (rand < 0.5) numChars = 1;
        else if (rand < 0.8) numChars = 2;
        else if (rand < 0.95) numChars = 3;
        else numChars = 4;

        const baseSpeed = parseInt(speed.value);
        let nextDelay = baseSpeed * (0.5 + Math.random());

        if (/[.!?;:]/.test(char)) {
          nextDelay = baseSpeed * (2 + Math.random() * 2);
        } else if (char === ',') {
          nextDelay = baseSpeed * (1.2 + Math.random());
        } else if (char === '\n') {
          nextDelay = baseSpeed * (1.5 + Math.random() * 2);
        } else if (Math.random() < 0.03) {
          nextDelay = baseSpeed * (3 + Math.random() * 3);
        } else if (Math.random() < 0.1) {
          nextDelay = baseSpeed * 0.3;
          numChars = Math.min(numChars + 2, 5);
        }

        naturalNextDelay = Math.round(nextDelay);
        return codeToType.substring(currentIndex, currentIndex + numChars);
      }

      case 'word': {
        let endIndex = currentIndex;
        let wordCount = 0;
        while (endIndex < codeToType.length && wordCount < count) {
          if (/\s/.test(codeToType[endIndex])) wordCount++;
          endIndex++;
        }
        return codeToType.substring(currentIndex, endIndex);
      }

      case 'token': {
        let endIndex = currentIndex;

        while (endIndex < codeToType.length && /\s/.test(codeToType[endIndex])) {
          endIndex++;
        }

        const startChar = codeToType[endIndex];

        if (/[a-zA-Z_$]/.test(startChar)) {
          while (endIndex < codeToType.length && /[a-zA-Z0-9_$]/.test(codeToType[endIndex])) {
            endIndex++;
          }
        } else if (/[0-9]/.test(startChar)) {
          while (endIndex < codeToType.length && /[0-9.]/.test(codeToType[endIndex])) {
            endIndex++;
          }
        } else if (/['"`]/.test(startChar)) {
          const quote = startChar;
          endIndex++;
          while (endIndex < codeToType.length && codeToType[endIndex] !== quote) {
            if (codeToType[endIndex] === '\\') endIndex++;
            endIndex++;
          }
          if (endIndex < codeToType.length) endIndex++;
        } else if (startChar === '/' && codeToType[endIndex + 1] === '/') {
          while (endIndex < codeToType.length && codeToType[endIndex] !== '\n') {
            endIndex++;
          }
        } else if (/[+\-*/%=<>!&|^~?:]/.test(startChar)) {
          while (endIndex < codeToType.length && /[+\-*/%=<>!&|^~?:]/.test(codeToType[endIndex])) {
            endIndex++;
          }
        } else {
          endIndex++;
        }

        if (endIndex === currentIndex) endIndex++;

        return codeToType.substring(currentIndex, endIndex);
      }

      case 'line': {
        let endIndex = codeToType.indexOf('\n', currentIndex);
        if (endIndex === -1) endIndex = codeToType.length;
        else endIndex++;
        return codeToType.substring(currentIndex, endIndex);
      }

      case 'random': {
        let chars = '';
        for (let i = 0; i < count && currentIndex + i < randomOrder.length; i++) {
          const idx = randomOrder[currentIndex + i];
          chars += codeToType[idx];
        }
        return chars;
      }

      case 'reverse':
        return codeToType.substring(codeToType.length - currentIndex - count, codeToType.length - currentIndex);

      case 'middle-out': {
        const mid = Math.floor(codeToType.length / 2);
        const offset = Math.floor(currentIndex / 2);
        let chars = '';
        if (mid + offset < codeToType.length) chars += codeToType[mid + offset];
        if (mid - offset - 1 >= 0) chars += codeToType[mid - offset - 1];
        return chars;
      }

      case 'ends-in': {
        let chars = '';
        if (currentIndex < codeToType.length) chars += codeToType[currentIndex];
        if (codeToType.length - 1 - currentIndex >= 0 && codeToType.length - 1 - currentIndex !== currentIndex) {
          chars += codeToType[codeToType.length - 1 - currentIndex];
        }
        return chars;
      }

      case 'typewriter': {
        if (Math.random() < 0.05 && displayedText.length > 0) {
          displayedText = displayedText.slice(0, -1);
          return '';
        }
        return codeToType.substring(currentIndex, currentIndex + count);
      }

      default:
        return codeToType.substring(currentIndex, currentIndex + count);
    }
  }

  // Build displayed text based on effect
  function buildDisplayedText(chars) {
    const effect = typingEffect.value;

    switch (effect) {
      case 'reverse':
        displayedText = chars + displayedText;
        break;

      case 'random': {
        const charArray = displayedText.split('');
        for (let i = 0; i < chars.length; i++) {
          const idx = randomOrder[currentIndex + i];
          charArray[idx] = codeToType[idx];
        }
        displayedText = charArray.join('');
        break;
      }

      case 'middle-out':
      case 'ends-in': {
        const charArray = displayedText.split('');
        const mid = Math.floor(codeToType.length / 2);
        const offset = Math.floor(currentIndex / 2);

        if (effect === 'middle-out') {
          if (mid + offset < codeToType.length) charArray[mid + offset] = codeToType[mid + offset];
          if (mid - offset - 1 >= 0) charArray[mid - offset - 1] = codeToType[mid - offset - 1];
        } else {
          if (currentIndex < codeToType.length) charArray[currentIndex] = codeToType[currentIndex];
          if (codeToType.length - 1 - currentIndex >= 0) {
            charArray[codeToType.length - 1 - currentIndex] = codeToType[codeToType.length - 1 - currentIndex];
          }
        }
        displayedText = charArray.join('');
        break;
      }

      default:
        displayedText += chars;
    }
  }

  // Animation step
  function animationStep() {
    if (isPaused) return;

    const chars = getNextChars();

    if (chars.length === 0 || currentIndex >= codeToType.length) {
      stopAnimation();
      updateDisplay(codeToType, false);
      return;
    }

    buildDisplayedText(chars);
    currentIndex += chars.length;

    updateDisplay(displayedText, true);

    const delay = (typingEffect.value === 'natural' && naturalNextDelay !== null)
      ? naturalNextDelay
      : parseInt(speed.value);

    animationId = setTimeout(animationStep, delay);
  }

  // Start animation
  function startAnimation() {
    if (animationId) clearTimeout(animationId);

    codeToType = codeInput.value;
    currentIndex = 0;
    isPaused = false;
    naturalNextDelay = null;

    const effect = typingEffect.value;

    if (effect === 'random') {
      randomOrder = generateRandomOrder(codeToType.length);
      displayedText = ' '.repeat(codeToType.length);
    } else if (effect === 'middle-out' || effect === 'ends-in') {
      displayedText = ' '.repeat(codeToType.length);
    } else {
      displayedText = '';
    }

    pauseBtn.textContent = 'Pause';
    animationStep();
  }

  // Stop animation
  function stopAnimation() {
    if (animationId) {
      clearTimeout(animationId);
      animationId = null;
    }
  }

  // Reset
  function reset() {
    stopAnimation();
    currentIndex = 0;
    displayedText = '';
    isPaused = false;
    pauseBtn.textContent = 'Pause';
    updateDisplay('', true);
  }

  // Toggle pause
  function togglePause() {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';

    if (!isPaused && animationId === null) {
      animationStep();
    }
  }

  // Instant complete
  function instantComplete() {
    stopAnimation();
    codeToType = codeInput.value;
    displayedText = codeToType;
    currentIndex = codeToType.length;
    updateDisplay(displayedText, false);
  }

  // Update styles
  function updateStyles() {
    codeDisplay.style.fontFamily = fontFamily.value;
    codeDisplay.style.fontSize = fontSize.value + 'px';

    // Remove old theme
    codeDisplay.className = 'code-display';
    codeDisplay.classList.add(`theme-${theme.value}`);

    // Add syntax style class
    if (syntaxStyle.value !== 'none' && syntaxStyle.value !== 'static') {
      codeDisplay.classList.add(`syntax-${syntaxStyle.value}`);
    }

    // Add char animation class
    if (charAnimation.value !== 'none') {
      codeDisplay.classList.add(`char-${charAnimation.value}`);
    }

    // Line numbers
    codeOutput.parentElement.classList.toggle('line-numbers', showLineNumbers.checked);

    // Window controls
    windowControls.style.display = showWindowControls.checked ? 'flex' : 'none';
    codeDisplay.style.paddingTop = showWindowControls.checked ? '50px' : '30px';
  }

  // Event listeners
  startBtn.addEventListener('click', startAnimation);
  resetBtn.addEventListener('click', reset);
  pauseBtn.addEventListener('click', togglePause);
  instantBtn.addEventListener('click', instantComplete);

  fontSize.addEventListener('input', () => {
    document.getElementById('fontSizeValue').textContent = fontSize.value + 'px';
    updateStyles();
  });

  speed.addEventListener('input', () => {
    document.getElementById('speedValue').textContent = speed.value + 'ms';
  });

  charsPerTick.addEventListener('input', () => {
    document.getElementById('charsPerTickValue').textContent = charsPerTick.value;
  });

  [fontFamily, theme, cursorStyle, syntaxStyle, charAnimation, showLineNumbers, showWindowControls, cursorBlink].forEach(el => {
    el.addEventListener('change', () => {
      updateStyles();
      if (displayedText) updateDisplay(displayedText, animationId !== null);
    });
  });

  // Initialize
  updateStyles();
  updateDisplay('', true);
}
