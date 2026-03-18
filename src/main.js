import './styles/base.css';
import './styles/tabs.css';
import './styles/code-animator.css';
import './styles/scrambler.css';

import { initCodeAnimator } from './code-animator/code-animator.js';
import { initScrambler } from './scrambler/scrambler.js';

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

// Initialize both tabs
initCodeAnimator();
initScrambler();
