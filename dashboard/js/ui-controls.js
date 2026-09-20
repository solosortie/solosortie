/* solosortie dashboard: custom controls that replace the browser's own:
   select (dropdown list), datetime (calendar), chips (tags). */
(function () {
  'use strict';
  const SS = window.SS;
  const { h, icon } = SS;

  /* ── select ──────────────────────────────────────────── */
  /* options: [{ value, label, hint?, glyph? }]; returns a button with .set(v) and .get() */
  SS.select = ({ options, value, onchange, label = 'Choose', block = true }) => {
    let cur = value, closeList = null;
    const btn = h('button', { class: 'sel' + (block ? ' sel--block' : ''), type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': label });
    const optOf = (v) => options.find((o) => o.value === v) || options[0];
    const paint = () => {
      const o = optOf(cur);
      SS.fill(btn, h('span', { class: 'sel__val' }, o.glyph ? h('i', { class: 'glyph glyph--' + o.glyph }) : null, o.label), icon('chevron', 16));
    };

    function open() {
      if (closeList) return closeList();
      const list = h('div', { class: 'listbox', role: 'listbox', 'aria-label': label });
      const items = options.map((o) => h('button', {
        class: 'listbox__opt', type: 'button', role: 'option', 'aria-selected': String(o.value === cur), onclick: () => choose(o.value)
      }, o.glyph ? h('i', { class: 'glyph glyph--' + o.glyph }) : null,
        h('span', { class: 'listbox__txt' }, h('b', null, o.label), o.hint ? h('small', null, o.hint) : null),
        o.value === cur ? icon('check', 16) : h('span', { class: 'ico', style: { width: '16px' } })));
      list.append(...items);
      document.body.append(list);
      const r = btn.getBoundingClientRect();
      list.style.minWidth = Math.max(r.width, 200) + 'px';
      let top = r.bottom + 6;
      if (top + list.offsetHeight > innerHeight - 8) top = Math.max(8, r.top - list.offsetHeight - 6);
      list.style.top = top + 'px';
      list.style.left = Math.max(8, Math.min(innerWidth - list.offsetWidth - 8, r.left)) + 'px';
      btn.setAttribute('aria-expanded', 'true');

      let idx = Math.max(0, options.findIndex((o) => o.value === cur));
      items[idx].focus();
      const key = (e) => {
        const n = items.length;
        if (e.key === 'ArrowDown') idx = (idx + 1) % n;
        else if (e.key === 'ArrowUp') idx = (idx - 1 + n) % n;
        else if (e.key === 'Home') idx = 0;
        else if (e.key === 'End') idx = n - 1;
        else if (e.key === 'Escape') { e.preventDefault(); closeList(); btn.focus(); return; }
        else if (e.key === 'Tab') { closeList(); return; }
        else return;
        e.preventDefault(); items[idx].focus();
      };
      const outside = (e) => { if (!list.contains(e.target) && !btn.contains(e.target)) closeList(); };
      const away = (e) => { if (e.target !== list && !list.contains(e.target) && moved()) closeList(); };
      const moved = () => { const n = btn.getBoundingClientRect(); return Math.abs(n.top - r.top) > 1 || Math.abs(n.left - r.left) > 1; };
      closeList = () => {
        list.remove(); btn.setAttribute('aria-expanded', 'false'); closeList = null;
        document.removeEventListener('keydown', key, true); document.removeEventListener('mousedown', outside, true);
        window.removeEventListener('scroll', away, true); window.removeEventListener('resize', away);
      };
      document.addEventListener('keydown', key, true); document.addEventListener('mousedown', outside, true);
      window.addEventListener('scroll', away, true); window.addEventListener('resize', away);
    }
    function choose(v) { const changed = v !== cur; cur = v; paint(); if (closeList) closeList(); btn.focus(); if (changed) onchange(v); }
    btn.addEventListener('click', open);
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
    btn.set = (v) => { cur = v; paint(); };
    btn.get = () => cur;
    paint();
    return btn;
  };

  /* ── date and time ───────────────────────────────────── */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const ymd = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  /* value: ISO string or null. onchange(iso|null). Returns a button with .set(iso) and .get() */
  SS.datetime = ({ value, onchange, label = 'Date and time' }) => {
    let cur = value ? new Date(value) : null, closePop = null;
    const btn = h('button', { class: 'sel sel--block', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': label });
    const text = () => cur ? cur.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not set';
    const paint = () => SS.fill(btn, h('span', { class: 'sel__val' + (cur ? '' : ' sel__val--empty') }, icon('calendar', 16), text()), icon('chevron', 16));

    function open() {
      if (closePop) return closePop();
      const base = cur || new Date();
      let view = new Date(base.getFullYear(), base.getMonth(), 1);
      let focus = new Date(base);
      const pop = h('div', { class: 'dt', role: 'dialog', 'aria-label': label });
      document.body.append(pop);

      const commit = (d) => { cur = d; paint(); onchange(d ? d.toISOString() : null); };
      const withTime = (day) => {
        const d = new Date(day);
        const t = cur || (() => { const n = new Date(); n.setMinutes(Math.ceil(n.getMinutes() / 5) * 5, 0, 0); return n; })();
        d.setHours(t.getHours(), t.getMinutes(), 0, 0);
        return d;
      };

      let rendering = false;
      function render() {
        if (rendering) return;                      // a blur/change fired by re-rendering must not render again
        rendering = true;
        try { draw(); } finally { rendering = false; }
      }
      function draw() {
        if (pop.contains(document.activeElement)) document.activeElement.blur();
        SS.clear(pop);
        const first = new Date(view.getFullYear(), view.getMonth(), 1);
        const start = new Date(first); start.setDate(1 - first.getDay());
        const today = new Date();
        const days = [];
        for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
        const grid = h('div', { class: 'dt__grid', role: 'grid' }, days.map((d) => h('button', {
          type: 'button', class: 'dt__day' + (d.getMonth() !== view.getMonth() ? ' is-out' : '') + (sameDay(d, today) ? ' is-today' : '') + (sameDay(d, cur) ? ' is-sel' : ''),
          'data-d': ymd(d), tabindex: sameDay(d, focus) ? '0' : '-1', 'aria-label': d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), 'aria-pressed': String(sameDay(d, cur)),
          onclick: () => { commit(withTime(d)); focus = new Date(d); view = new Date(d.getFullYear(), d.getMonth(), 1); render(); }
        }, d.getDate())));
        grid.addEventListener('keydown', (e) => {
          const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
          if (!step) return;
          e.preventDefault();
          focus = new Date(focus); focus.setDate(focus.getDate() + step);
          view = new Date(focus.getFullYear(), focus.getMonth(), 1); render();
          const t = pop.querySelector(`[data-d="${ymd(focus)}"]`); if (t) t.focus();
        });

        const t = cur || withTime(base);
        const h12 = t.getHours() % 12 || 12, pm = t.getHours() >= 12;
        const setTime = (hh, mm, isPm) => {
          const d = cur ? new Date(cur) : withTime(base);
          d.setHours((hh % 12) + (isPm ? 12 : 0), mm, 0, 0); commit(d); render();
        };
        const hourIn = h('input', { class: 'dt__num', inputmode: 'numeric', maxlength: 2, value: String(h12), 'aria-label': 'Hour' });
        const minIn = h('input', { class: 'dt__num', inputmode: 'numeric', maxlength: 2, value: String(t.getMinutes()).padStart(2, '0'), 'aria-label': 'Minute' });
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v, 10) || 0));
        const applyTime = () => setTime(clamp(hourIn.value, 1, 12), clamp(minIn.value, 0, 59), pm);
        [[hourIn, 1, 12], [minIn, 0, 59]].forEach(([inp, lo, hi]) => {
          inp.addEventListener('change', applyTime);
          inp.addEventListener('focus', () => inp.select());
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const v = clamp(inp.value, lo, hi) + (e.key === 'ArrowUp' ? 1 : -1);
              inp.value = String(v > hi ? lo : v < lo ? hi : v).padStart(inp === minIn ? 2 : 1, '0'); applyTime();
              (inp === hourIn ? pop.querySelector('.dt__num') : pop.querySelectorAll('.dt__num')[1]).focus();
            } else if (e.key === 'Enter') { e.preventDefault(); applyTime(); }
          });
        });

        pop.append(
          h('div', { class: 'dt__head' },
            h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Previous month', onclick: () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); focus = new Date(view); render(); } }, icon('left', 16)),
            h('b', { 'aria-live': 'polite' }, MONTHS[view.getMonth()] + ' ' + view.getFullYear()),
            h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Next month', onclick: () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); focus = new Date(view); render(); } }, icon('right', 16))),
          h('div', { class: 'dt__week', 'aria-hidden': 'true' }, ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => h('span', null, d))),
          grid,
          h('div', { class: 'dt__time' }, h('span', { class: 'muted' }, 'Time'), hourIn, h('b', null, ':'), minIn,
            h('div', { class: 'seg seg--tight' }, ['AM', 'PM'].map((m) => h('button', { type: 'button', role: 'radio', 'aria-checked': String((m === 'PM') === pm), onclick: () => setTime(clamp(hourIn.value, 1, 12), clamp(minIn.value, 0, 59), m === 'PM') }, m)))),
          h('div', { class: 'dt__foot' },
            h('button', { class: 'btn btn--small btn--quiet', type: 'button', onclick: () => { commit(null); closePop(); btn.focus(); } }, 'Clear'),
            h('button', { class: 'btn btn--small btn--quiet', type: 'button', onclick: () => { const n = new Date(); n.setSeconds(0, 0); commit(n); view = new Date(n.getFullYear(), n.getMonth(), 1); focus = new Date(n); render(); } }, 'Now'),
            h('span', { class: 'spacer' }),
            h('button', { class: 'btn btn--small btn--primary', type: 'button', onclick: () => { closePop(); btn.focus(); } }, 'Done')));
      }
      render();

      const r = btn.getBoundingClientRect();
      let top = r.bottom + 6;
      if (top + pop.offsetHeight > innerHeight - 8) top = Math.max(8, r.top - pop.offsetHeight - 6);
      pop.style.top = top + 'px';
      pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + 'px';
      btn.setAttribute('aria-expanded', 'true');
      const sel = pop.querySelector('.dt__day[tabindex="0"]'); if (sel) sel.focus();

      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); btn.focus(); } };
      const outside = (e) => { if (!pop.contains(e.target) && !btn.contains(e.target)) closePop(); };
      const away = (e) => { const n = btn.getBoundingClientRect(); if (!pop.contains(e.target) && (Math.abs(n.top - r.top) > 1 || Math.abs(n.left - r.left) > 1)) closePop(); };
      closePop = () => {
        pop.remove(); btn.setAttribute('aria-expanded', 'false'); closePop = null;
        document.removeEventListener('keydown', key, true); document.removeEventListener('mousedown', outside, true);
        window.removeEventListener('scroll', away, true); window.removeEventListener('resize', away);
      };
      document.addEventListener('keydown', key, true); document.addEventListener('mousedown', outside, true);
      window.addEventListener('scroll', away, true); window.addEventListener('resize', away);
    }
    btn.addEventListener('click', open);
    btn.set = (iso) => { cur = iso ? new Date(iso) : null; paint(); };
    btn.get = () => (cur ? cur.toISOString() : null);
    paint();
    return btn;
  };

  /* ── tag chips ───────────────────────────────────────── */
  SS.chips = ({ value = [], onchange, label = 'Tags', placeholder = 'Type a tag, press Enter' }) => {
    let tags = value.slice();
    const input = h('input', { class: 'chips__in', placeholder, 'aria-label': label, autocomplete: 'off' });
    const wrap = h('div', { class: 'chips' });
    const emit = () => onchange(tags.slice());
    const paint = () => SS.fill(wrap, tags.map((t, i) => h('span', { class: 'chip' }, t,
      h('button', { type: 'button', 'aria-label': 'Remove ' + t, onclick: (e) => { e.stopPropagation(); tags.splice(i, 1); paint(); emit(); input.focus(); } }, icon('x', 12)))), input);
    function add(raw) {
      const fresh = raw.split(',').map((x) => x.trim()).filter((x) => x && !tags.includes(x));
      input.value = '';
      if (!fresh.length) return;
      tags.push(...fresh); paint(); emit();
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input.value); input.focus(); }
      else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); paint(); emit(); input.focus(); }
    });
    input.addEventListener('blur', () => add(input.value));
    wrap.addEventListener('click', () => input.focus());
    paint();
    wrap.set = (v) => { tags = v.slice(); paint(); };
    return wrap;
  };
})();
