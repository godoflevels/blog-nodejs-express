(() => {
  'use strict';

  const app = document.getElementById('app');
  const SAVED_KEY = 'modshub-quiz-code';
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const state = { questions: [], passMark: 7, order: [], i: 0, answers: [], busy: false, done: false };
  const CATS = ['Graphics Mods', 'Real Cars', 'Modpacks', 'Improvements', 'Effects', 'Interface', 'Audio', 'Weapon skins', 'Clothes & Vests'];

  const ICON = {
    check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    cross: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    copy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H16"/></svg>',
  };

  const el = (tag, props = {}, ...kids) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined) node.append(kid);
    return node;
  };
  const show = (screen) => {
    app.replaceChildren(screen);
    window.scrollTo({ top: 0 });
  };
  const shuffle = (list) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const post = async (url, body) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || 'Something went wrong'), { status: res.status });
    return data;
  };
  const saved = () => {
    try { return JSON.parse(localStorage.getItem(SAVED_KEY) || 'null'); } catch (_) { return null; }
  };

  let toastTimer;
  const toast = (text) => {
    let t = document.querySelector('.toast');
    if (!t) { t = el('div', { class: 'toast', role: 'status' }); document.body.append(t); }
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 1900);
  };
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = el('textarea', { readonly: true, style: 'position:fixed;opacity:0' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Promo code copied');
  };

  /* ------------------------------------------------------------ intro -- */
  function intro() {
    state.done = false;
    const prev = saved();
    const text = el('div', { class: 'intro__text' },
      el('h1', {}, 'How well do you know ModsHub?'),
      el('p', { class: 'lead' }, `Ten questions about the mod library, the app and ModsHub+. Get ${state.passMark} or more right and win a 50% promo code.`),
      el('div', { class: 'facts' },
        el('div', {}, el('b', {}, '10'), 'questions'),
        el('div', {}, el('b', {}, '~2 min'), 'to finish'),
        el('div', { class: 'off' }, el('b', {}, '50% off'), `at ${state.passMark} of 10`)),
      el('button', { class: 'btn btn--blue', type: 'button', onclick: start }, 'Start the quiz'));
    if (prev && prev.code) {
      text.append(el('p', { class: 'promo__note' }, 'You already won a code on this device. ',
        el('a', { href: '#', style: 'text-decoration:underline', onclick: (e) => { e.preventDefault(); result({ score: prev.score, total: 10, passed: true, code: prev.code }, [], true); } }, 'Show it again')));
    }
    text.append(el('div', { class: 'cats', 'aria-hidden': 'true' }, CATS.map((c) => el('span', {}, c))));
    show(el('section', { class: 'screen intro' }, text));
  }

  /* --------------------------------------------------------- question -- */
  function start() {
    state.order = state.questions.map((q) => ({ ...q, options: shuffle(q.options) }));
    state.i = 0;
    state.answers = [];
    state.busy = false;
    question();
  }

  function question() {
    const q = state.order[state.i];
    const total = state.order.length;
    const bar = el('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': state.i },
      state.order.map((_, n) => {
        const a = state.answers[n];
        return el('i', { class: a ? (a.correct ? 'is-right' : 'is-wrong') : n === state.i ? 'is-now' : '' });
      }));
    const options = el('div', { class: 'options', role: 'group', 'aria-label': 'Answers' },
      q.options.map((o, n) => el('button', {
        class: 'opt', type: 'button', 'data-id': o.id, 'aria-keyshortcuts': String(n + 1),
        onclick: () => choose(o.id),
      },
      el('span', { class: 'key' }, LETTERS[n]),
      el('span', { class: 'label' }, o.label),
      el('span', { class: 'mark' }))));
    show(el('section', { class: 'screen screen--q' },
      el('div', { class: 'meta' }, el('span', {}, 'Question ', el('b', {}, `${state.i + 1} / ${total}`)), el('span', {}, el('b', {}, String(state.answers.filter((a) => a.correct).length)), ' correct')),
      bar,
      el('h2', { class: 'question' }, q.text),
      options,
      el('div', { id: 'feedback', 'aria-live': 'polite' }),
      el('div', { class: 'nextbar' })));
    options.querySelector('.opt').focus({ preventScroll: true });
  }

  async function choose(choice) {
    if (state.busy) return;
    state.busy = true;
    const q = state.order[state.i];
    const buttons = [...document.querySelectorAll('.opt')];
    const picked = buttons.find((b) => b.dataset.id === choice);
    buttons.forEach((b) => { b.disabled = true; });
    let res;
    try {
      res = await post('/quiz/api/check', { id: q.id, choice });
    } catch (e) {
      buttons.forEach((b) => { b.disabled = false; });
      state.busy = false;
      toast('Connection problem, try again');
      return;
    }
    state.answers.push({ id: q.id, choice, correct: res.correct, answer: res.answer, text: q.text });
    for (const b of buttons) {
      const right = b.dataset.id === res.answer;
      const wrong = b === picked && !res.correct;
      b.classList.toggle('is-right', right);
      b.classList.toggle('is-wrong', wrong);
      b.classList.toggle('is-dim', !right && !wrong);
      if (right) b.querySelector('.mark').innerHTML = ICON.check;
      if (wrong) b.querySelector('.mark').innerHTML = ICON.cross;
    }
    document.querySelectorAll('.bar i')[state.i].className = res.correct ? 'is-right' : 'is-wrong';
    const last = state.i === state.order.length - 1;
    document.getElementById('feedback').replaceChildren(
      el('div', { class: `feedback ${res.correct ? 'is-right' : 'is-wrong'}` },
        el('strong', {}, res.correct ? 'Correct' : 'Not quite'), el('p', {}, res.fact)));
    const btn = el('button', { class: 'btn btn--blue', type: 'button', onclick: advance }, last ? 'See my result' : 'Next question');
    document.querySelector('.nextbar').replaceChildren(btn);
    btn.focus({ preventScroll: true });
    btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function advance() {
    if (state.i < state.order.length - 1) {
      state.i += 1;
      state.busy = false;
      question();
      return;
    }
    const btn = document.querySelector('.nextbar .btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
    try {
      const res = await post('/quiz/api/finish', { answers: state.answers.map(({ id, choice }) => ({ id, choice })) });
      state.busy = false;
      result(res, state.answers, false);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'See my result'; }
      toast(e.status === 429 ? e.message : 'Connection problem, try again');
    }
  }

  /* ----------------------------------------------------------- result -- */
  function titleFor(score, passed) {
    if (score === 10) return 'Perfect score';
    if (passed) return 'You passed';
    return 'Not this time';
  }

  function result(res, answers, again) {
    state.done = true;
    const { score, total, passed, code } = res;
    if (passed && code && !again) {
      try { localStorage.setItem(SAVED_KEY, JSON.stringify({ code, score })); } catch (_) { /* optional */ }
    }
    const screen = el('section', { class: 'screen screen--r result' },
      el('h1', {}, again ? 'Your promo code' : titleFor(score, passed)),
      el('p', { class: 'score', 'aria-label': `Score ${score} out of ${total}` }, 'Your score: ', el('b', {}, `${score} / ${total}`)),
      el('p', { class: 'lead' }, passed
        ? 'Here is your 50% promo code. Copy it and keep it safe.'
        : `You need ${state.passMark} out of ${total} to get the promo code. Have another go.`));

    if (passed && code) {
      screen.append(el('div', { class: 'promo' },
        el('div', { class: 'promo__off' }, '50', el('span', {}, '% off')),
        el('p', { class: 'promo__hint' }, 'ModsHub promo code'),
        el('div', { class: 'code' }, el('code', { id: 'promo' }, code),
          el('button', { class: 'btn btn--blue', type: 'button', onclick: () => copy(code), html: `${ICON.copy} Copy` })),
        el('p', { class: 'promo__note' }, 'Enter the code on modshub.io. The offer terms are set by ModsHub.')));
      screen.append(el('div', { class: 'actions' },
        el('a', { class: 'btn btn--blue', href: 'https://modshub.io/plus/', target: '_blank', rel: 'noopener' }, 'Go to ModsHub+'),
        el('button', { class: 'btn btn--line', type: 'button', onclick: start }, 'Play again')));
    } else {
      screen.append(el('div', { class: 'actions' },
        el('button', { class: 'btn btn--blue', type: 'button', onclick: start }, 'Try again'),
        el('a', { class: 'btn btn--line', href: 'https://modshub.io/library', target: '_blank', rel: 'noopener' }, 'Browse the library')));
    }

    if (answers.length) {
      screen.append(el('div', { class: 'review' }, el('h3', {}, 'Your answers'),
        el('ul', {}, answers.map((a, n) => el('li', {},
          el('span', { class: `dot ${a.correct ? 'ok' : 'no'}`, title: a.correct ? 'Correct' : 'Wrong' }),
          el('span', {}, `${n + 1}. ${a.text}`))))));
    }
    show(screen);
  }

  /* --------------------------------------------------------- keyboard -- */
  document.addEventListener('keydown', (e) => {
    if (state.done || e.metaKey || e.ctrlKey || e.altKey) return;
    const opts = [...document.querySelectorAll('.opt')];
    if (!opts.length) return;
    const k = e.key.toLowerCase();
    const idx = /^[1-4]$/.test(k) ? Number(k) - 1 : ['a', 'b', 'c', 'd'].indexOf(k);
    if (idx >= 0 && idx < opts.length && !opts[idx].disabled) {
      e.preventDefault();
      opts[idx].click();
    } else if ((k === 'enter' || k === 'arrowright') && document.querySelector('.nextbar .btn') && document.activeElement.tagName !== 'BUTTON') {
      e.preventDefault();
      document.querySelector('.nextbar .btn').click();
    }
  });

  /* ------------------------------------------------------------- boot -- */
  (async () => {
    app.replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
    try {
      const res = await fetch('/quiz/api/questions', { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      state.questions = data.questions;
      state.passMark = data.passMark;
      intro();
    } catch (_) {
      show(el('section', { class: 'screen' }, el('h2', {}, 'Could not load the quiz'), el('p', { class: 'lead' }, 'Check your connection and try again.'),
        el('p', {}, el('button', { class: 'btn btn--blue', type: 'button', onclick: () => location.reload() }, 'Reload'))));
    }
  })();
})();
