(() => {
  // A distinct retail shop link is shown throughout the existing static website.
  document.querySelectorAll('nav.links').forEach(nav => {
    if (nav.querySelector('a[href="shop.html"]')) return;
    const services = nav.querySelector('a[href="services.html"]');
    if (services) {
      services.textContent = 'Printing Services';
      const shop = document.createElement('a');
      shop.href = 'shop.html';
      shop.textContent = 'Shop';
      shop.setAttribute('aria-label', 'Shop ready-made products');
      services.insertAdjacentElement('afterend', shop);
    }
  });
  document.querySelectorAll('.footergrid').forEach(grid => {
    const column = grid.children[1];
    if (column && !column.querySelector('a[href="shop.html"]')) {
      const a = document.createElement('a'); a.href = 'shop.html'; a.textContent = 'Shop ready-made products';
      column.appendChild(a);
    }
  });
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
