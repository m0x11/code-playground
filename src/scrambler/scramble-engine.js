const DEFAULT_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';

export class ScrambleEngine {
  constructor({ text, mode = 'wholeWord', pool = DEFAULT_POOL, duration = 30 }) {
    this.targetText = text;
    this.mode = mode;
    this.pool = pool;
    this.duration = duration;
    this.tick = 0;
    this.length = text.length;
    this.resolved = new Array(this.length).fill(false);
    this.currentChars = new Array(this.length).fill('');
    this.done = false;

    // Pre-compute resolve order based on mode
    this.resolveOrder = this._computeResolveOrder();

    // For cascade mode: each char has its own mini-timeline
    if (mode === 'cascade') {
      this._initCascade();
    }

    // For longRandomResolve: pre-assign each char a random tick to resolve
    if (mode === 'longRandomResolve') {
      this._initLongRandomResolve();
    }

    // Initialize with scrambled characters
    this._scrambleAll();
  }

  _randomChar() {
    return this.pool[Math.floor(Math.random() * this.pool.length)];
  }

  _scrambleAll() {
    for (let i = 0; i < this.length; i++) {
      if (this.targetText[i] === ' ') {
        this.currentChars[i] = ' ';
        this.resolved[i] = true;
      } else {
        this.currentChars[i] = this._randomChar();
      }
    }
  }

  _computeResolveOrder() {
    const len = this.length;
    const indices = [];

    // Collect non-space indices
    for (let i = 0; i < len; i++) {
      if (this.targetText[i] !== ' ') {
        indices.push(i);
      }
    }

    switch (this.mode) {
      case 'wholeWord':
        // All resolve at once at the end
        return [indices];

      case 'letterByLetter':
        // One at a time, left to right
        return indices.map(i => [i]);

      case 'wave': {
        // Sine-wave staggered pattern
        const groups = [];
        const numGroups = indices.length;
        const sorted = [...indices].sort((a, b) => {
          const phaseA = Math.sin((a / len) * Math.PI * 2);
          const phaseB = Math.sin((b / len) * Math.PI * 2);
          return phaseA - phaseB;
        });
        for (const idx of sorted) {
          groups.push([idx]);
        }
        return groups;
      }

      case 'randomResolve': {
        // Random order ("popcorn")
        const shuffled = [...indices];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.map(i => [i]);
      }

      case 'outsideIn': {
        // Outermost chars first, converge to center
        const groups = [];
        let left = 0;
        let right = indices.length - 1;
        while (left <= right) {
          const group = [indices[left]];
          if (left !== right) group.push(indices[right]);
          groups.push(group);
          left++;
          right--;
        }
        return groups;
      }

      case 'insideOut': {
        // Center chars first, expand outward
        const groups = [];
        const mid = Math.floor(indices.length / 2);
        let offset = 0;
        while (mid - offset >= 0 || mid + offset < indices.length) {
          const group = [];
          if (mid - offset >= 0) group.push(indices[mid - offset]);
          if (offset !== 0 && mid + offset < indices.length) group.push(indices[mid + offset]);
          groups.push(group);
          offset++;
        }
        return groups;
      }

      case 'bounce':
        // Left to right (same as letterByLetter, but renderer adds bounce animation)
        return indices.map(i => [i]);

      case 'cascade':
        // Each char resolves independently based on its own mini timeline
        return indices.map(i => [i]);

      case 'longRandomResolve':
        // Resolves spread across entire duration — handled in step()
        return [];

      default:
        return [indices];
    }
  }

  _initCascade() {
    // Each character gets its own scramble duration (staggered start)
    this.cascadeTimelines = [];
    for (let i = 0; i < this.length; i++) {
      if (this.targetText[i] === ' ') {
        this.cascadeTimelines.push({ start: 0, end: 0 });
      } else {
        const stagger = Math.floor((i / this.length) * this.duration * 0.6);
        const charDuration = Math.floor(this.duration * 0.4) + Math.floor(Math.random() * 10);
        this.cascadeTimelines.push({
          start: stagger,
          end: stagger + charDuration,
        });
      }
    }
  }

  _initLongRandomResolve() {
    // Assign each non-space char a random tick between 1 and duration to resolve
    const indices = [];
    for (let i = 0; i < this.length; i++) {
      if (this.targetText[i] !== ' ') indices.push(i);
    }
    // Shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    // Spread resolve ticks across the full duration
    this.longResolveMap = new Map();
    for (let i = 0; i < indices.length; i++) {
      const tick = Math.floor((i / indices.length) * this.duration) + 1;
      if (!this.longResolveMap.has(tick)) {
        this.longResolveMap.set(tick, []);
      }
      this.longResolveMap.get(tick).push(indices[i]);
    }
  }

  _stepLongRandomResolve() {
    // Scramble unresolved chars
    for (let i = 0; i < this.length; i++) {
      if (!this.resolved[i]) {
        this.currentChars[i] = this._randomChar();
      }
    }

    // Resolve any chars assigned to this tick
    const group = this.longResolveMap.get(this.tick);
    if (group) {
      for (const idx of group) {
        this.resolved[idx] = true;
        this.currentChars[idx] = this.targetText[idx];
      }
    }

    // Done when past duration
    if (this.tick >= this.duration) {
      this._finalize();
    }

    return this.getState();
  }

  step() {
    if (this.done) return this.getState();

    this.tick++;

    if (this.mode === 'cascade') {
      return this._stepCascade();
    }

    if (this.mode === 'longRandomResolve') {
      return this._stepLongRandomResolve();
    }

    // Scramble phase: randomize unresolved characters
    const pastDuration = this.tick > this.duration;

    for (let i = 0; i < this.length; i++) {
      if (!this.resolved[i]) {
        this.currentChars[i] = this._randomChar();
      }
    }

    // Resolve phase: after duration, resolve characters according to order
    if (pastDuration) {
      const resolveIndex = this.tick - this.duration - 1;
      if (resolveIndex < this.resolveOrder.length) {
        const group = this.resolveOrder[resolveIndex];
        for (const idx of group) {
          this.resolved[idx] = true;
          this.currentChars[idx] = this.targetText[idx];
        }
      }

      // Check if all done
      if (resolveIndex >= this.resolveOrder.length - 1) {
        this._finalize();
      }
    }

    return this.getState();
  }

  _stepCascade() {
    let allDone = true;

    for (let i = 0; i < this.length; i++) {
      if (this.targetText[i] === ' ') continue;

      const tl = this.cascadeTimelines[i];
      if (this.tick < tl.start) {
        // Not started yet — show target briefly then scramble
        this.currentChars[i] = this._randomChar();
        allDone = false;
      } else if (this.tick >= tl.end) {
        // Resolved
        this.resolved[i] = true;
        this.currentChars[i] = this.targetText[i];
      } else {
        // Scrambling
        this.currentChars[i] = this._randomChar();
        allDone = false;
      }
    }

    if (allDone) {
      this._finalize();
    }

    return this.getState();
  }

  _finalize() {
    this.done = true;
    for (let i = 0; i < this.length; i++) {
      this.resolved[i] = true;
      this.currentChars[i] = this.targetText[i];
    }
  }

  getState() {
    return {
      chars: [...this.currentChars],
      resolved: [...this.resolved],
      done: this.done,
      tick: this.tick,
    };
  }

  reset() {
    this.tick = 0;
    this.done = false;
    this.resolved = new Array(this.length).fill(false);
    this.resolveOrder = this._computeResolveOrder();
    if (this.mode === 'cascade') {
      this._initCascade();
    }
    if (this.mode === 'longRandomResolve') {
      this._initLongRandomResolve();
    }
    this._scrambleAll();
    return this.getState();
  }
}
