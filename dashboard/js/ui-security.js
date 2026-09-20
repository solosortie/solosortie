/* solosortie dashboard: Security: password, two-factor, idle lock, sign out everywhere */
(function () {
  'use strict';
  const SS = window.SS;
  const { h, clear } = SS;
  SS.routes = SS.routes || {};

  SS.routes.security = async (view) => {
    const DB = SS.DB;

    /* password */
    const pw1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
    const pw2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
    const pwBtn = h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
      if (pw1.value.length < 12) return SS.toast('Use at least 12 characters. A few random words works well.', 'error');
      if (pw1.value !== pw2.value) return SS.toast('The two passwords do not match.', 'error');
      pwBtn.disabled = true;
      try { await DB.auth.updatePassword(pw1.value); DB.activity.log('password', 'changed'); pw1.value = pw2.value = ''; SS.toast('Password changed'); }
      catch (e) { SS.fail(e); } finally { pwBtn.disabled = false; }
    } }, 'Change password');

    /* two-factor */
    const mfaBox = h('div');
    async function paintMfa() {
      clear(mfaBox);
      const factors = await DB.auth.mfa.factors();
      if (factors.length) {
        mfaBox.append(h('p', null, 'Two-factor sign-in is on. Signing in needs a code from your authenticator app, and the database refuses a password-only session.'),
          h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
            if (!(await SS.confirm({ title: 'Turn off two-factor?', text: 'Signing in will need only your password.', ok: 'Turn off', danger: true }))) return;
            try { await DB.auth.mfa.remove(factors[0].id); DB.activity.log('2fa', 'off'); SS.toast('Two-factor is off'); await paintMfa(); } catch (e) { SS.fail(e, 'Could not turn it off. Sign out, sign in with your code, and try again'); }
          } }, 'Turn off'));
        return;
      }
      mfaBox.append(h('p', null, 'Add a second step with an authenticator app (1Password, Authy, Google Authenticator and others).'),
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          try {
            const en = await DB.auth.mfa.enroll();
            const code = h('input', { class: 'input', inputmode: 'numeric', maxlength: 8, placeholder: '123456', autocomplete: 'one-time-code', style: { maxWidth: '180px' } });
            clear(mfaBox).append(
              h('p', null, 'Scan this with your authenticator app, then enter the six-digit code it shows.'),
              h('img', { class: 'qr', src: en.qr, alt: 'QR code for your authenticator app' }),
              h('p', { class: 'field__hint' }, 'Cannot scan? Enter this key by hand: ', h('span', { class: 'code' }, en.secret)),
              h('div', { class: 'inline' }, code, h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
                try { await DB.auth.mfa.confirm(en.id, code.value); DB.activity.log('2fa', 'on'); SS.toast('Two-factor is on'); await paintMfa(); } catch (e) { SS.fail(e); }
              } }, 'Turn on'), h('button', { class: 'btn btn--quiet', type: 'button', onclick: paintMfa }, 'Cancel')));
            code.focus();
          } catch (e) { SS.fail(e); }
        } }, 'Set up two-factor'));
    }

    /* idle lock */
    const idle = SS.select({
      label: 'Sign out automatically', value: localStorage.getItem('ss:idle') || '0',
      options: [['0', 'Never'], ['15', 'After 15 minutes'], ['30', 'After 30 minutes'], ['60', 'After 1 hour'], ['240', 'After 4 hours']].map(([value, label]) => ({ value, label })),
      onchange: (v) => { localStorage.setItem('ss:idle', v); SS.armIdle(); SS.toast('Saved'); }
    });
    idle.style.maxWidth = '260px';

    view.append(
      h('div', { class: 'head' }, h('h1', null, 'Security'), h('p', { class: 'head__note' }, SS.state.user.email)),
      h('section', { class: 'section' }, h('h2', null, 'Password'), SS.field('New password', pw1, 'At least 12 characters.'), SS.field('Repeat it', pw2), pwBtn),
      h('hr', { class: 'hr' }),
      h('section', { class: 'section' }, h('h2', null, 'Two-factor sign-in'), mfaBox),
      h('hr', { class: 'hr' }),
      h('section', { class: 'section' }, h('h2', null, 'Sign out automatically'), h('p', null, 'When this screen sits unused. Applies to this browser.'), idle),
      h('hr', { class: 'hr' }),
      h('section', { class: 'section' }, h('h2', null, 'Sessions'), h('p', null, 'Signs you out here and on every other device.'),
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          if (!(await SS.confirm({ title: 'Sign out everywhere?', ok: 'Sign out everywhere' }))) return;
          DB.activity.log('signout', 'everywhere'); await DB.auth.signOut(true); location.reload();
        } }, 'Sign out of all devices')));
    await paintMfa();
  };
})();
