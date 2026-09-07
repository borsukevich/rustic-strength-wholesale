class RetailCrossoverModal extends HTMLElement {
  constructor() {
    super();

    this.dialog = this.querySelector('.retail-crossover-modal__dialog');
    this.overlay = this.querySelector('.retail-crossover-modal__overlay');
    this.closeButtons = this.querySelectorAll('[data-action="close"]');
    this.continueButton = this.querySelector('[data-action="continue"]');

    this.triggerParam = this.getAttribute('data-url-trigger') || 'ref=wholesale';
    this.suppressSession = this.getAttribute('data-suppress-session') === 'true';
    this.sessionStorageKey = 'ws_retail_crossover_allowed';

    this.targetUrl = null;
    this.activeElement = null;

    this.initEvents();
    this.initThemeEditor();
    this.initPreviewTriggers();
  }

  initEvents() {
    this.closeButtons.forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        this.close();
      });
    });

    if (this.overlay) {
      this.overlay.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        this.close();
      });
    }

    if (this.continueButton) {
      this.continueButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        this.continueNavigation();
      });
    }

    this.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || event.code === 'Escape') {
        event.preventDefault();

        this.close();
      }
    });

    document.addEventListener('click', this.handleDocumentClick.bind(this), true);
  }

  initThemeEditor() {
    document.addEventListener('shopify:section:select', (event) => {
      const section = this.closest('.shopify-section');

      if (!section) {
        return;
      }

      if (section === event.target || (event.detail && section.id.includes(event.detail.sectionId))) {
        this.open();
      }
    });

    document.addEventListener('shopify:section:deselect', (event) => {
      const section = this.closest('.shopify-section');

      if (!section) {
        return;
      }

      if (section === event.target || (event.detail && section.id.includes(event.detail.sectionId))) {
        this.close();
      }
    });

    document.addEventListener('shopify:section:load', (event) => {
      const section = this.closest('.shopify-section');

      if (!section) {
        return;
      }

      if (section === event.target || (event.detail && section.id.includes(event.detail.sectionId))) {
        this.open();
      }
    });

    if (window.Shopify && window.Shopify.designMode) {
      const section = this.closest('.shopify-section');

      if (
        section &&
        (section.classList.contains('shopify-section--selected') ||
          section.classList.contains('shopify-section-selected'))
      ) {
        this.open();
      }
    }
  }

  initPreviewTriggers() {
    if (
      window.location.hash === '#preview-retail-modal' ||
      window.location.search.includes('preview_retail_modal=1')
    ) {
      this.open();
    }

    window.addEventListener('hashchange', () => {
      if (window.location.hash === '#preview-retail-modal') {
        this.open();
      }
    });
  }

  isCrossoverLink(link) {
    if (!link || !link.getAttribute('href')) {
      return false;
    }

    const rawHref = link.getAttribute('href').trim();

    if (
      rawHref.startsWith('#') ||
      rawHref.startsWith('javascript:') ||
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('tel:')
    ) {
      return false;
    }

    if (link.hasAttribute('data-retail-crossover')) {
      return true;
    }

    try {
      const url = new URL(link.href, window.location.origin);

      const paramParts = this.triggerParam.split('=');

      if (paramParts.length === 2) {
        const [key, val] = paramParts;

        if (url.searchParams.get(key) === val) {
          return true;
        }
      }

      if (url.search.includes(this.triggerParam) || rawHref.includes(this.triggerParam)) {
        return true;
      }
    } catch (e) {
      if (rawHref.includes(this.triggerParam)) {
        return true;
      }
    }

    return false;
  }

  handleDocumentClick(event) {
    const link = event.target.closest('a[href]');

    if (!link) {
      return;
    }

    if (!this.isCrossoverLink(link)) {
      return;
    }

    const destination = link.href;

    if (this.suppressSession && this.isSessionSuppressed()) {
      event.preventDefault();
      event.stopPropagation();

      window.open(destination, '_blank', 'noopener,noreferrer');

      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.targetUrl = destination;
    this.activeElement = link;

    this.open();
  }

  isSessionSuppressed() {
    try {
      return window.sessionStorage.getItem(this.sessionStorageKey) === 'true';
    } catch (e) {
      return false;
    }
  }

  open() {
    this.classList.add('open');

    document.body.classList.add('overflow-hidden');

    if (typeof trapFocus === 'function' && this.dialog) {
      trapFocus(this.dialog, this.continueButton || this.dialog);
    } else if (this.continueButton) {
      this.continueButton.focus();
    }
  }

  close() {
    this.classList.remove('open');

    document.body.classList.remove('overflow-hidden');

    if (typeof removeTrapFocus === 'function') {
      removeTrapFocus(this.activeElement);
    } else if (this.activeElement && typeof this.activeElement.focus === 'function') {
      this.activeElement.focus();
    }

    this.targetUrl = null;
  }

  continueNavigation() {
    const destination = this.targetUrl;

    if (this.suppressSession) {
      try {
        window.sessionStorage.setItem(this.sessionStorageKey, 'true');
      } catch (e) {}
    }

    this.close();

    if (destination) {
      window.open(destination, '_blank', 'noopener,noreferrer');
    }
  }
}

if (!customElements.get('retail-crossover-modal')) {
  customElements.define('retail-crossover-modal', RetailCrossoverModal);
}

window.openRetailCrossoverModal = () => {
  const modal = document.querySelector('retail-crossover-modal');

  if (modal) {
    modal.open();
  }
};
