(() => {
  const ready = () => {
    const hamburger = document.getElementById('hamburger');
    const menu = document.getElementById('menu');

    if (!hamburger || !menu) return;

    const closeMenu = () => {
      menu.classList.remove('active');
      document.body.classList.remove('menu-open');
      hamburger.setAttribute('aria-expanded', 'false');
    };

    const toggleMenu = () => {
      const isActive = !menu.classList.contains('active');
      if (isActive) {
        menu.classList.add('active');
        document.body.classList.add('menu-open');
      } else {
        menu.classList.remove('active');
        document.body.classList.remove('menu-open');
      }
      hamburger.setAttribute('aria-expanded', isActive ? 'true' : 'false');
    };

    hamburger.setAttribute('aria-label', 'Toggle navigation');
    hamburger.setAttribute('aria-controls', 'menu');
    hamburger.setAttribute('aria-expanded', 'false');

    hamburger.addEventListener('click', toggleMenu);

    document.addEventListener('click', event => {
      if (menu.classList.contains('active')) {
        const clickedHamburger = hamburger.contains(event.target);
        const clickedMenu = menu.contains(event.target);
        if (!clickedHamburger && !clickedMenu) {
          closeMenu();
        }
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.classList.contains('active')) {
        closeMenu();
      }
    });

    menu.addEventListener('click', event => {
      const targetLink = event.target.closest('a');
      if (targetLink) {
        closeMenu();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 1024 && menu.classList.contains('active')) {
        closeMenu();
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
