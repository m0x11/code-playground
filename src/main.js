import './styles/base.css';
import './styles/tabs.css';
import './styles/code-animator.css';
import './styles/latex-animator.css';
import './styles/image-morph.css';
import './styles/scrambler.css';
import './styles/snowflake-scramble.css';

import { initCodeAnimator } from './code-animator/code-animator.js';
import { initLatexAnimator } from './latex-animator/latex-animator.js';
import { initImageMorph } from './image-morph/image-morph.js';
import { initScrambler } from './scrambler/scrambler.js';
import { initSnowflakeScramble } from './snowflake-scramble/snowflake-scramble.js';
import { restoreAppState, initAppStatePersistence } from './persist.js';

// Tab switching
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;

    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
  });
});

// Initialize tabs — control state is restored around init (raw values first
// so initial renders read them, listener replay after; see persist.js).
const savedState = restoreAppState();
initCodeAnimator();
initLatexAnimator();
initImageMorph();
initScrambler();
initSnowflakeScramble();
initAppStatePersistence(savedState);
