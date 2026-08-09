class SearchDrawer extends HTMLElement {
  constructor() {
    super();

    this.input = this.querySelector('input[type="search"]');
    this.clearBtn = this.querySelector('[data-clear-button]');
    this.resultsContainer = this.querySelector('#predictive-search-results-container');
    this.defaultContent = this.querySelector('#search-drawer-default-content');
    this.overlay = this.querySelector('#SearchDrawer-Overlay');
    this.closeBtn = this.querySelector('.drawer__close');

    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());

    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      });
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      });
    }

    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', this.clearInput.bind(this));
    }

    if (this.input) {
      this.input.addEventListener('focus', (e) => {
        e.stopPropagation();
      });

      this.input.addEventListener(
        'input',
        this.debounce((event) => {
          this.onChange(event);
        }, 300).bind(this)
      );
    }

    this.setupPopularTerms();
  }

  setupPopularTerms() {
    const termBtns = this.querySelectorAll('[data-term]');
    termBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (this.input) {
          this.input.value = btn.dataset.term;
          this.input.dispatchEvent(new Event('input'));
        }
      });
    });
  }

  open(triggeredBy) {
    if (triggeredBy) this.activeElement = triggeredBy;

    setTimeout(() => {
      this.classList.add('animate', 'active', 'open');
    });

    if (this.input) {
      setTimeout(() => {
        this.input.focus();
      }, 150);
    }

    document.body.classList.add('overflow-hidden');
  }

  close() {
    this.classList.remove('active', 'open', 'animate');

    document.body.classList.remove('overflow-hidden');
  }

  clearInput() {
    if (this.input) {
      this.input.value = '';
      this.input.focus();
    }

    if (this.clearBtn) {
      this.clearBtn.classList.add('hidden');
    }

    if (this.resultsContainer) {
      this.resultsContainer.innerHTML = '';
      this.resultsContainer.classList.add('hidden');
    }

    if (this.defaultContent) {
      this.defaultContent.classList.remove('hidden');
    }
  }

  onChange() {
    const searchTerm = this.input ? this.input.value.trim() : '';

    if (!searchTerm.length) {
      this.clearInput();

      return;
    }

    if (this.clearBtn) {
      this.clearBtn.classList.remove('hidden');
    }

    this.getSearchResults(searchTerm);
  }

  getSearchResults(searchTerm) {
    const queryKey = encodeURIComponent(searchTerm);

    fetch(
      `${window.Shopify.routes.root}search/suggest?q=${queryKey}&resources[options][fields]=title,tag,vendor,product_type,variants.title,variants.sku&resources[options][prefix]=last&resources[options][unavailable_products]=last&resources[type]=query,product,collection,page,article&section_id=search-predictive-grid`
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(response.status);
        }

        return response.text();
      })
      .then((text) => {
        const parsed = new DOMParser().parseFromString(text, 'text/html');
        const resultsEl = parsed.querySelector('#shopify-section-search-predictive-grid');

        if (resultsEl && this.resultsContainer) {
          this.resultsContainer.innerHTML = resultsEl.innerHTML;
          this.resultsContainer.classList.remove('hidden');

          if (this.defaultContent) {
            this.defaultContent.classList.add('hidden');
          }
        }
      })
      .catch((error) => {
        console.error('Predictive search error:', error);
      });
  }

  debounce(fn, wait) {
    let timeout;

    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), wait);
    };
  }
}

if (!customElements.get('search-drawer')) {
  customElements.define('search-drawer', SearchDrawer);
}

class SearchTabs extends HTMLElement {
  constructor() {
    super();

    this.tabs = this.querySelectorAll('.search-tabs__tab');
    this.panels = this.querySelectorAll('.search-tabs__panel');

    this.init();
  }

  init() {
    this.tabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const targetTab = tab.dataset.tab;

        this.tabs.forEach((t) => t.classList.remove('active'));
        this.panels.forEach((p) => p.classList.remove('active'));

        tab.classList.add('active');

        const activePanel = this.querySelector(`#tab-panel-${targetTab}`);

        if (activePanel) {
          activePanel.classList.add('active');
        }
      });
    });
  }
}

if (!customElements.get('search-tabs')) {
  customElements.define('search-tabs', SearchTabs);
}

window.openSearchDrawer = function (trigger) {
  const drawer = document.querySelector('search-drawer');
  if (drawer) {
    drawer.open(trigger);
  }
};
