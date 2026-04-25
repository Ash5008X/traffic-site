(() => {
  const ROOT = document.documentElement;
  const BTN = document.getElementById('theme-toggle');
  const ICON = document.getElementById('theme-icon');
  const KEY = 'nt-theme';
  const DARK = 'dark';
  const LIGHT = 'light';

  function setTheme(theme, save = true) {
    ROOT.setAttribute('data-theme', theme);
    ROOT.classList.toggle('dark', theme === DARK);
    if (ICON) ICON.textContent = theme === DARK ? 'light_mode' : 'dark_mode';
    if (save) localStorage.setItem(KEY, theme);
  }

  const savedTheme = localStorage.getItem(KEY);
  if (savedTheme === DARK || savedTheme === LIGHT) {
    setTheme(savedTheme, false);
  } else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? DARK : LIGHT, false);
  }

  if (BTN) {
    BTN.addEventListener('click', () => {
      const current = ROOT.getAttribute('data-theme');
      setTheme(current === DARK ? LIGHT : DARK);
    });
  }
})();
