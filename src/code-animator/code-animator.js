import { populateFontSelect } from '../shared/fonts.js';
import { ThemeManager } from './theme-manager.js';
import { CodeAnimatorRecorder } from './code-animator-recorder.js';

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

  // Controls
  const fontFamily = document.getElementById('fontFamily');
  const fontSize = document.getElementById('fontSize');
  const theme = document.getElementById('theme');
  const cursorStyle = document.getElementById('cursorStyle');
  const typingEffect = document.getElementById('typingEffect');
  const syntaxStyle = document.getElementById('syntaxStyle');
  const speed = document.getElementById('speed');
  const charsPerTick = document.getElementById('charsPerTick');
  const displayHeight = document.getElementById('displayHeight');
  const displayPadding = document.getElementById('displayPadding');
  const showLineNumbers = document.getElementById('showLineNumbers');
  const cursorBlink = document.getElementById('cursorBlink');

  // Buttons
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const instantBtn = document.getElementById('instantBtn');

  // Stats
  const charCount = document.getElementById('charCount');
  const lineCount = document.getElementById('lineCount');

  // Custom theme elements
  const customThemeEditor = document.getElementById('customThemeEditor');
  const customThemeName = document.getElementById('customThemeName');
  const colorBg = document.getElementById('colorBg');
  const colorText = document.getElementById('colorText');
  const colorKeyword = document.getElementById('colorKeyword');
  const colorString = document.getElementById('colorString');
  const colorNumber = document.getElementById('colorNumber');
  const colorComment = document.getElementById('colorComment');
  const colorFunction = document.getElementById('colorFunction');
  const colorOperator = document.getElementById('colorOperator');
  const saveThemeBtn = document.getElementById('saveThemeBtn');
  const loadThemesBtn = document.getElementById('loadThemesBtn');
  const themeFileInput = document.getElementById('themeFileInput');
  const savedThemesSelect = document.getElementById('savedThemesSelect');
  const deleteThemeBtn = document.getElementById('deleteThemeBtn');

  // Theme manager
  const themeManager = new ThemeManager();

  // Populate font selector
  populateFontSelect(fontFamily);

  // Populate custom themes into dropdown
  function populateCustomThemes() {
    // Remove existing custom theme options (all after "custom")
    const options = Array.from(theme.options);
    options.forEach(opt => {
      if (opt.dataset.custom) opt.remove();
    });

    // Add saved custom themes before the "+ Custom Theme" option
    const customOption = theme.querySelector('option[value="custom"]');
    themeManager.getThemeNames().forEach(name => {
      const opt = document.createElement('option');
      opt.value = `custom-${name}`;
      opt.textContent = name;
      opt.dataset.custom = 'true';
      theme.insertBefore(opt, customOption);
    });

    // Update saved themes list in editor
    savedThemesSelect.innerHTML = '';
    themeManager.getThemeNames().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      savedThemesSelect.appendChild(opt);
    });
  }

  function getEditorColors() {
    return {
      background: colorBg.value,
      text: colorText.value,
      keyword: colorKeyword.value,
      string: colorString.value,
      number: colorNumber.value,
      comment: colorComment.value,
      function: colorFunction.value,
      operator: colorOperator.value
    };
  }

  function setEditorColors(colors) {
    colorBg.value = colors.background;
    colorText.value = colors.text;
    colorKeyword.value = colors.keyword;
    colorString.value = colors.string;
    colorNumber.value = colors.number;
    colorComment.value = colors.comment;
    colorFunction.value = colors.function;
    colorOperator.value = colors.operator || '#89ddff';
  }

  function applyLivePreview() {
    const val = theme.value;
    if (val === 'custom' || val.startsWith('custom-')) {
      const colors = val === 'custom' ? getEditorColors() : themeManager.getTheme(val.replace('custom-', ''));
      if (colors) {
        themeManager.applyTheme(codeDisplay, colors);
      }
    }
  }

  // Wire up color pickers for live preview
  [colorBg, colorText, colorKeyword, colorString, colorNumber, colorComment, colorFunction, colorOperator].forEach(input => {
    input.addEventListener('input', applyLivePreview);
  });

  // Save theme
  saveThemeBtn.addEventListener('click', () => {
    const name = customThemeName.value.trim();
    if (!name) {
      customThemeName.focus();
      return;
    }
    themeManager.saveTheme(name, getEditorColors());
    populateCustomThemes();
    // Switch dropdown to the newly saved theme
    theme.value = `custom-${name}`;
    updateStyles();
  });

  // Load themes button
  loadThemesBtn.addEventListener('click', () => themeFileInput.click());

  themeFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (themeManager.importFromFile(ev.target.result)) {
        populateCustomThemes();
      }
    };
    reader.readAsText(file);
    themeFileInput.value = '';
  });

  // Delete theme
  deleteThemeBtn.addEventListener('click', () => {
    const selected = savedThemesSelect.value;
    if (!selected) return;
    themeManager.deleteTheme(selected);
    populateCustomThemes();
    // If current theme was the deleted one, switch to midnight
    if (theme.value === `custom-${selected}`) {
      theme.value = 'midnight';
      updateStyles();
    }
  });

  // Load saved theme colors into editor when selecting from saved list
  savedThemesSelect.addEventListener('dblclick', () => {
    const selected = savedThemesSelect.value;
    if (!selected) return;
    const colors = themeManager.getTheme(selected);
    if (colors) {
      setEditorColors(colors);
      customThemeName.value = selected;
      applyLivePreview();
    }
  });

  // Initialize custom themes on load
  populateCustomThemes();

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
      if (/[a-zA-Z_$#]/.test(code[i])) {
        let end = i;
        // Allow # as first char for preprocessor directives
        if (code[i] === '#') end++;
        while (end < code.length && /[a-zA-Z0-9_$]/.test(code[end])) end++;
        const word = code.slice(i, end);
        const keywords = [
          // JS
          'function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return',
          'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch',
          'new', 'this', 'typeof', 'instanceof', 'true', 'false', 'null', 'undefined',
          'switch', 'case', 'default', 'break', 'continue', 'do', 'throw', 'finally',
          'yield', 'of', 'in', 'delete', 'void',
          // GLSL
          'uniform', 'varying', 'attribute', 'precision', 'highp', 'mediump', 'lowp',
          'struct', 'discard', 'flat', 'smooth', 'layout', 'centroid',
          'invariant', 'inout', 'out',
          // GLSL types
          'float', 'int', 'uint', 'bool', 'double',
          'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4',
          'uvec2', 'uvec3', 'uvec4', 'bvec2', 'bvec3', 'bvec4',
          'dvec2', 'dvec3', 'dvec4',
          'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4',
          'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
          'sampler2D', 'sampler3D', 'samplerCube', 'sampler2DShadow',
          // GLSL preprocessor
          '#define', '#undef', '#if', '#ifdef', '#ifndef', '#else', '#elif',
          '#endif', '#error', '#pragma', '#extension', '#version', '#line',
          // C/C++ common
          'auto', 'register', 'static', 'extern', 'inline',
          'char', 'short', 'long', 'signed', 'unsigned', 'sizeof',
          'enum', 'typedef', 'union', 'volatile', 'goto',
          // Python
          'def', 'lambda', 'and', 'or', 'not', 'is', 'None', 'True', 'False',
          'with', 'as', 'pass', 'raise', 'except', 'global', 'nonlocal',
          'elif', 'print', 'self', 'cls',
          // Rust
          'fn', 'pub', 'mod', 'use', 'impl', 'trait', 'where', 'mut', 'ref',
          'match', 'loop', 'move', 'type', 'super', 'crate',
        ];

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

      // Operators and brackets/braces/parens
      if (/[+\-*/%=<>!&|^~?:(){}[\]]/.test(code[i])) {
        let end = i + 1;
        // Consume multi-char operators like !=, ==, <=, >=, &&, ||, ++, --, +=, etc.
        if (/[+\-*/%=<>!&|^~?:]/.test(code[i])) {
          while (end < code.length && /[+\-*/%=<>!&|^~?:]/.test(code[end])) end++;
        }
        tokens.push({ type: 'operator', value: code.slice(i, end) });
        i = end;
        continue;
      }

      // Default: single character (whitespace, etc.)
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
        case 'operator': return `<span class="syntax-operator">${escaped}</span>`;
        default: return escaped;
      }
    }).join('');
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

    output = formatWithLineNumbers(output);

    if (showCursor) {
      output += createCursor();
    }

    codeOutput.innerHTML = output;

    // Auto-scroll to keep cursor visible
    codeOutput.parentElement.scrollTop = codeOutput.parentElement.scrollHeight;

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
    codeDisplay.style.height = displayHeight.value + 'px';
    codeDisplay.style.padding = displayPadding.value + 'px';
    const val = theme.value;
    const isCustom = val === 'custom' || val.startsWith('custom-');

    // Remove old theme
    codeDisplay.className = 'code-display';

    if (isCustom) {
      codeDisplay.classList.add('theme-custom');
      // Show/hide editor
      customThemeEditor.style.display = val === 'custom' ? '' : 'none';

      if (val === 'custom') {
        // Live editing mode — apply editor colors
        themeManager.applyTheme(codeDisplay, getEditorColors());
        setEditorColors(getEditorColors());
      } else {
        // Saved custom theme
        const colors = themeManager.getTheme(val.replace('custom-', ''));
        if (colors) {
          themeManager.applyTheme(codeDisplay, colors);
        }
      }
    } else {
      codeDisplay.classList.add(`theme-${val}`);
      customThemeEditor.style.display = 'none';
      themeManager.clearThemeVars(codeDisplay);
    }

    // Add syntax style class
    if (syntaxStyle.value !== 'none' && syntaxStyle.value !== 'static') {
      codeDisplay.classList.add(`syntax-${syntaxStyle.value}`);
    }

    // Line numbers
    codeOutput.parentElement.classList.toggle('line-numbers', showLineNumbers.checked);
  }

  // Scene save/load
  const saveSceneBtn = document.getElementById('saveSceneBtn');
  const loadSceneBtn = document.getElementById('loadSceneBtn');
  const sceneFileInput = document.getElementById('sceneFileInput');
  function saveScene() {
    const sceneName = prompt('Scene name:');
    if (!sceneName) return;
    const scene = {
      name: sceneName,
      codeInput: codeInput.value,
      fontFamily: fontFamily.value,
      fontSize: fontSize.value,
      theme: theme.value,
      cursorStyle: cursorStyle.value,
      typingEffect: typingEffect.value,
      syntaxStyle: syntaxStyle.value,
      speed: speed.value,
      charsPerTick: charsPerTick.value,
      displayHeight: displayHeight.value,
      displayPadding: displayPadding.value,
      showLineNumbers: showLineNumbers.checked,
      cursorBlink: cursorBlink.checked
    };

    // If using custom theme editor, include the colors
    const val = theme.value;
    if (val === 'custom') {
      scene.customColors = getEditorColors();
      scene.customThemeName = customThemeName.value;
    }

    const filename = sceneName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const json = JSON.stringify(scene, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadScene(json) {
    try {
      const scene = JSON.parse(json);

      if (scene.codeInput !== undefined) codeInput.value = scene.codeInput;
      if (scene.fontFamily !== undefined) fontFamily.value = scene.fontFamily;
      if (scene.fontSize !== undefined) {
        fontSize.value = scene.fontSize;
        document.getElementById('fontSizeValue').textContent = scene.fontSize + 'px';
      }
      if (scene.theme !== undefined) theme.value = scene.theme;
      if (scene.cursorStyle !== undefined) cursorStyle.value = scene.cursorStyle;
      if (scene.typingEffect !== undefined) typingEffect.value = scene.typingEffect;
      if (scene.syntaxStyle !== undefined) syntaxStyle.value = scene.syntaxStyle;
      if (scene.speed !== undefined) {
        speed.value = scene.speed;
        document.getElementById('speedValue').textContent = scene.speed + 'ms';
      }
      if (scene.charsPerTick !== undefined) {
        charsPerTick.value = scene.charsPerTick;
        document.getElementById('charsPerTickValue').textContent = scene.charsPerTick;
      }
      if (scene.displayHeight !== undefined) {
        displayHeight.value = scene.displayHeight;
        document.getElementById('displayHeightValue').textContent = scene.displayHeight + 'px';
      }
      if (scene.displayPadding !== undefined) {
        displayPadding.value = scene.displayPadding;
        document.getElementById('displayPaddingValue').textContent = scene.displayPadding + 'px';
      }
      if (scene.showLineNumbers !== undefined) showLineNumbers.checked = scene.showLineNumbers;
      if (scene.cursorBlink !== undefined) cursorBlink.checked = scene.cursorBlink;

      // Restore custom theme editor state
      if (scene.customColors) {
        setEditorColors(scene.customColors);
      }
      if (scene.customThemeName !== undefined) {
        customThemeName.value = scene.customThemeName;
      }

      updateStyles();
      updateDisplay('', true);
    } catch {
      // invalid scene JSON
    }
  }

  saveSceneBtn.addEventListener('click', saveScene);
  loadSceneBtn.addEventListener('click', () => sceneFileInput.click());
  sceneFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadScene(ev.target.result);
    reader.readAsText(file);
    sceneFileInput.value = '';
  });

  // Step once — advances animation by one tick, returns { done, delay }
  function stepOnce() {
    const chars = getNextChars();

    if (chars.length === 0 || currentIndex >= codeToType.length) {
      updateDisplay(codeToType, false);
      return { done: true, delay: 0 };
    }

    buildDisplayedText(chars);
    currentIndex += chars.length;
    updateDisplay(displayedText, true);

    const delay = (typingEffect.value === 'natural' && naturalNextDelay !== null)
      ? naturalNextDelay
      : parseInt(speed.value);

    return { done: false, delay };
  }

  // Record feature
  const codeRecordBtn = document.getElementById('codeRecordBtn');
  const codeRecordStatus = document.getElementById('codeRecordStatus');
  const recorder = new CodeAnimatorRecorder();

  codeRecordBtn.addEventListener('click', async () => {
    codeRecordBtn.disabled = true;
    codeRecordStatus.textContent = 'Preparing...';

    // Reset animation state
    stopAnimation();
    codeToType = codeInput.value;
    currentIndex = 0;
    naturalNextDelay = null;
    isPaused = false;

    const effect = typingEffect.value;
    if (effect === 'random') {
      randomOrder = generateRandomOrder(codeToType.length);
      displayedText = ' '.repeat(codeToType.length);
    } else if (effect === 'middle-out' || effect === 'ends-in') {
      displayedText = ' '.repeat(codeToType.length);
    } else {
      displayedText = '';
    }

    updateDisplay(displayedText, true);

    try {
      await recorder.record({
        codeDisplay,
        totalLength: codeToType.length,
        stepAnimation: stepOnce,
        onProgress: (p) => {
          codeRecordStatus.textContent = `Recording... ${Math.round(p * 100)}%`;
        }
      });
      codeRecordStatus.textContent = 'Done!';
    } catch (err) {
      codeRecordStatus.textContent = 'Recording failed: ' + err.message;
    }

    setTimeout(() => { codeRecordStatus.textContent = ''; }, 3000);
    codeRecordBtn.disabled = false;
  });

  // Event listeners
  startBtn.addEventListener('click', startAnimation);
  resetBtn.addEventListener('click', reset);
  pauseBtn.addEventListener('click', togglePause);
  instantBtn.addEventListener('click', instantComplete);

  fontSize.addEventListener('input', () => {
    document.getElementById('fontSizeValue').textContent = fontSize.value + 'px';
    updateStyles();
  });

  displayHeight.addEventListener('input', () => {
    document.getElementById('displayHeightValue').textContent = displayHeight.value + 'px';
    updateStyles();
  });

  displayPadding.addEventListener('input', () => {
    document.getElementById('displayPaddingValue').textContent = displayPadding.value + 'px';
    updateStyles();
  });

  speed.addEventListener('input', () => {
    document.getElementById('speedValue').textContent = speed.value + 'ms';
  });

  charsPerTick.addEventListener('input', () => {
    document.getElementById('charsPerTickValue').textContent = charsPerTick.value;
  });

  [fontFamily, theme, cursorStyle, syntaxStyle, showLineNumbers, cursorBlink].forEach(el => {
    el.addEventListener('change', () => {
      updateStyles();
      if (displayedText) updateDisplay(displayedText, animationId !== null);
    });
  });

  // Initialize
  updateStyles();
  updateDisplay('', true);
}
