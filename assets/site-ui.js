(() => {
  const toggle = document.querySelector('.nav-toggle');
  const navigation = document.querySelector('#site-navigation');

  if (toggle && navigation) {
    const closeMenu = () => {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation');
      navigation.classList.remove('is-open');
    };

    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      navigation.classList.toggle('is-open', open);
    });

    navigation.addEventListener('click', event => {
      if (event.target.closest('a')) closeMenu();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 850) closeMenu();
    });
  }

  const product = document.querySelector('#quoteProduct');
  const printFields = document.querySelectorAll('.quote-print-field');

  if (product && printFields.length) {
    const updateQuoteFields = () => {
      const isDigitalService = ['design', 'website'].includes(product.value);
      printFields.forEach(field => { field.hidden = isDigitalService; });
    };

    product.addEventListener('change', updateQuoteFields);
    window.addEventListener('load', updateQuoteFields, { once: true });
    updateQuoteFields();
  }
})();
