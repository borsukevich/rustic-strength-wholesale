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
    this.initRebuyObserver();
  }

  initRebuyObserver() {
    const rebuyBlock = this.querySelector('#search-drawer-rebuy-block');
    if (!rebuyBlock || this.hasExtractedRebuy) return;

    // Check periodically without triggering DOM mutation loops
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (this.extractRebuyProducts() || attempts >= 15) {
        clearInterval(interval);
      }
    }, 400);
  }

  extractRebuyProducts() {
    if (this.hasExtractedRebuy) return true;

    const rebuyBlock = this.querySelector('#search-drawer-rebuy-block');
    const rebuyGrid = this.querySelector('#search-drawer-rebuy-grid');
    const staticBlock = this.querySelector('#search-drawer-static-featured');

    if (!rebuyBlock || !rebuyGrid) return false;

    const rebuyProducts = document.querySelectorAll(
      '#rebuy-quick-view-dropdown-search .rebuy-quick-view__product, .rebuy-quick-view-dropdown .rebuy-quick-view__product, .rebuy-quick-view__product-section .rebuy-quick-view__product'
    );

    if (!rebuyProducts || rebuyProducts.length === 0) {
      return false;
    }

    this.hasExtractedRebuy = true;

    const rebuyTitleEl = document.querySelector('#rebuy-quick-view-dropdown-search .rebuy-quick-view__title, .rebuy-quick-view-dropdown__title');
    const headingEl = this.querySelector('#search-drawer-rebuy-heading');
    if (rebuyTitleEl && rebuyTitleEl.textContent.trim() && headingEl) {
      headingEl.textContent = rebuyTitleEl.textContent.trim();
    }

    let itemsHTML = '';
    const extractedHandles = [];

    rebuyProducts.forEach((item, index) => {
      if (index >= 6) return;

      const linkEl = item.querySelector('a.rebuy-quick-view__image-link, a.rebuy-product-title, a[href*="/products/"]');
      const titleEl = item.querySelector('.rebuy-product-title, img[alt]');
      const imgEl = item.querySelector('img.rebuy-quick-view_image, img');
      const priceEl = item.querySelector('.price, .rebuy-money');

      if (!linkEl) return;

      const rawHref = linkEl.getAttribute('href') || '';
      const title = (titleEl ? (titleEl.textContent || titleEl.getAttribute('alt') || '') : '').trim();
      const imgSrc = imgEl ? (imgEl.getAttribute('src') || '') : '';
      const imgSet = imgEl ? (imgEl.getAttribute('srcset') || '') : '';
      const priceText = priceEl ? priceEl.innerText.trim() : '';

      const handleMatch = rawHref.match(/\/products\/([^\/?#]+)/);
      const handle = handleMatch ? handleMatch[1] : '';
      if (handle) extractedHandles.push(handle);

      itemsHTML += `
        <div class="card-wrapper underline-links-hover">
          <div class="card card--standard card--media">
            <div class="card__inner color-scheme-1 gradient ratio" style="--ratio-percent: 100%;">
              <div class="card__media" style="width: 100%; height: 100%;">
                <div class="media media--transparent media--hover-effect" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">
                  <img src="${imgSrc}" srcset="${imgSet}" alt="${title}" loading="lazy" class="motion-reduce" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain;">
                </div>
              </div>
            </div>
            <div class="card__content">
              <div class="card__information">
                <h3 class="card__heading h5" style="font-size: 1.3rem; margin-top: 0.6rem; margin-bottom: 0.4rem; font-weight: 500;">
                  <a href="${rawHref}" class="full-unstyled-link" style="text-decoration: none; color: inherit;">${title}</a>
                </h3>
                <div class="card-information">
                  <div class="price">
                    <div class="price__container">
                      <div class="price__regular">
                        <span class="price-item price-item--regular" style="font-size: 1.3rem; font-weight: 600;">${priceText}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    if (itemsHTML) {
      rebuyGrid.innerHTML = itemsHTML;
      rebuyBlock.classList.remove('hidden');
      if (staticBlock) {
        staticBlock.classList.add('hidden');
      }

      if (extractedHandles.length > 0 && typeof window.updateSearchPrices === 'function') {
        const fakeProducts = extractedHandles.map((h) => ({ handle: h }));
        window.updateSearchPrices(fakeProducts, 'rebuy-ai');
      }

      return true;
    }

    return false;
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

    this.extractRebuyProducts();

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
