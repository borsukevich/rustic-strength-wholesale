(() => {
  const CHECK_ICON = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.25 8.5L6.5 11.75L12.75 4.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const NONE_ICON = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/>
      <path d="M3.8 12.2L12.2 3.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
  `;

  const ALERT_ICON = `
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.7"/>
      <path d="M10 6V10.5M10 13.75V13.85" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
    </svg>
  `;

  const BYOS_TITLE_RE = /custom[- ]?made[- ]?scent|build[- ]?your[- ]?own[- ]?scent/i;
  const SCENT_PROPERTY_KEYS = ['Scent 1', 'Scent 2', 'Option-1', 'Option-2'];

  function normalizeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function formatDescription(text) {
    const trimmed = String(text || '').trim();

    if (!trimmed) {
      return '';
    }

    return trimmed.replace(/^([^a-zA-Z]*)([a-z])/, (_, prefix, ch) => `${prefix}${ch.toUpperCase()}`);
  }

  function getDisplayDescription(option) {
    if (!option || !option.description) {
      return '';
    }

    let raw = String(option.description || '').trim();

    if (!raw) {
      return '';
    }

    if (option.isNone) {
      return formatDescription(raw);
    }

    raw = raw.replace(/^\(\s*essential\s+oil\s+blend\s*\)\s*/i, '');

    if (normalizeKey(raw) && normalizeKey(raw) === normalizeKey(option.category)) {
      return '';
    }

    return formatDescription(raw);
  }

  function createSwatchElement(option) {
    const swatch = document.createElement('span');
    swatch.className = 'byos-scent-picker__swatch';

    if (option.isNone) {
      swatch.classList.add('byos-scent-picker__swatch--none');
      swatch.innerHTML = NONE_ICON;

      return swatch;
    }

    const bgColor = option.swatchColor || '#5a6548';

    const appendFallback = () => {
      swatch.style.backgroundColor = bgColor;

      const fallback = document.createElement('span');
      fallback.className = 'byos-scent-picker__swatch-fallback';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = (option.name || '?').trim().slice(0, 1).toUpperCase();
      swatch.appendChild(fallback);
    };

    if (option.swatchUrl) {
      swatch.style.backgroundColor = '#ffffff';

      const img = document.createElement('img');
      img.className = 'byos-scent-picker__swatch-img no-lazy-loading';
      img.src = option.swatchUrl;
      img.alt = '';
      img.width = 40;
      img.height = 40;
      img.loading = 'eager';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        img.remove();
        appendFallback();
      });

      swatch.appendChild(img);
    } else {
      appendFallback();
    }

    return swatch;
  }

  function normalizePropertiesObject(props) {
    if (!props) {
      return {};
    }

    if (Array.isArray(props)) {
      const obj = {};
      props.forEach((pair) => {
        if (Array.isArray(pair) && pair[0] != null) {
          obj[String(pair[0])] = pair[1];
        }
      });

      return obj;
    }

    return typeof props === 'object' ? props : {};
  }

  function hasValidScentProps(rawProps) {
    const props = normalizePropertiesObject(rawProps);
    const s1 = String(props['Scent 1'] || '').trim();
    const opt1 = String(props['Option-1'] || '').trim();

    return Boolean((s1 && s1.toLowerCase() !== 'none') || opt1);
  }

  function sortCatalogScents(list) {
    const categoryOrder = new Map([
      ['essential oil', 1],
      ['essential oil blend', 2],
      ['phthalate-free fragrance oil', 3],
    ]);

    return list.slice().sort((a, b) => {
      const rankA = categoryOrder.get(String(a.category || '').trim().toLowerCase()) || 99;
      const rankB = categoryOrder.get(String(b.category || '').trim().toLowerCase()) || 99;

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      const catA = String(a.category || '').trim();
      const catB = String(b.category || '').trim();

      if (rankA === 99 && catA !== catB) {
        return catA.localeCompare(catB);
      }

      const orderDiff = (Number(a.sortOrder) || 9999) - (Number(b.sortOrder) || 9999);

      if (orderDiff !== 0) {
        return orderDiff;
      }

      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  class ByosCartGuard {
    constructor(data) {
      const rawScents = Array.isArray(data?.catalog?.scents) ? data.catalog.scents : [];
      this.allScents = sortCatalogScents(rawScents);
      this.byosProducts = data?.byosProducts && typeof data.byosProducts === 'object' ? data.byosProducts : {};
      this.byosHandles = new Set();

      Object.values(this.byosProducts).forEach((entry) => {
        if (entry?.handle) {
          this.byosHandles.add(String(entry.handle).toLowerCase());
        }
      });

      this.cartItems = Array.isArray(data?.initialItems) ? data.initialItems : [];
      this.missingItems = [];
      this.totalMissingAtModalStart = 1;
      this.resolvedCountInSession = 0;
      this.currentItem = null;
      this.checkoutAfterSave = false;
      this.checkoutSource = '';
      this.lastOpener = null;
      this.saving = false;
      this.dirtyOnCartPage = false;
      this.suppressNextEscapeKeyup = false;

      this.slots = new Map();
      this._refreshTimer = null;
      this._uiSyncTimer = null;
      this._mutatingDom = false;

      this.modal = document.getElementById('byos-cart-guard-modal');
      this.stepEl = this.modal?.querySelector('[data-byos-cg-step]');
      this.subtitleEl = this.modal?.querySelector('[data-byos-cg-subtitle]');
      this.thumbWrap = this.modal?.querySelector('[data-byos-cg-thumb-wrap]');
      this.thumbImg = this.modal?.querySelector('[data-byos-cg-item-img]');
      this.itemTitleEl = this.modal?.querySelector('[data-byos-cg-item-title]');
      this.itemDetailsEl = this.modal?.querySelector('[data-byos-cg-item-details]');
      this.saveErrorEl = this.modal?.querySelector('[data-byos-cg-save-error]');
      this.saveBtn = this.modal?.querySelector('[data-byos-cg-save]');
      this.saveBtnLabel = this.modal?.querySelector('[data-byos-cg-save-label]');
      this.removeBtn = this.modal?.querySelector('[data-byos-cg-remove]');

      this._initSlots();
      this._recomputeMissing();
      this._bindEvents();
      this._observeCartContainers();
      this.syncCartUi();
    }

    isByosItem(item) {
      if (!item || typeof item !== 'object') {
        return false;
      }

      if (item.properties && normalizePropertiesObject(item.properties)._rebuy_hidden) {
        return false;
      }

      if (item.product_id && this.byosProducts[String(item.product_id)]) {
        return true;
      }

      if (item.handle && this.byosHandles.has(String(item.handle).toLowerCase())) {
        return true;
      }

      if (String(item.sku || '').toLowerCase().includes('byos')) {
        return true;
      }

      const title = String(item.product_title || item.title || '');

      return BYOS_TITLE_RE.test(title);
    }

    isMissingScent(item) {
      return this.isByosItem(item) && !hasValidScentProps(item?.properties);
    }

    _getActiveSourceItems() {
      const rebuyItems = window.Rebuy?.Cart?.cart?.items;

      if (Array.isArray(rebuyItems) && rebuyItems.length) {
        return rebuyItems;
      }

      return this.cartItems;
    }

    _recomputeMissing() {
      const items = Array.isArray(this.cartItems) ? this.cartItems : this._getActiveSourceItems();
      this.missingItems = (items || []).filter((item) => this.isMissingScent(item));
      document.documentElement.classList.toggle('byos-cg-has-missing', this.missingItems.length > 0);
    }

    async refreshCart({ syncUi = true } = {}) {
      try {
        const res = await fetch('/cart.js', { credentials: 'same-origin' });

        if (!res.ok) {
          return null;
        }

        const cart = await res.json();

        if (Array.isArray(cart?.items)) {
          this.cartItems = cart.items;
          window.RusticByosCartHelper?.recordCartItems?.(cart.items);
          this._recomputeMissing();

          if (syncUi) {
            this.syncCartUi();
          }
        }

        return cart;
      } catch (_) {
        return null;
      }
    }

    _scheduleRefresh(delay = 80) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => {
        this.refreshCart({ syncUi: true });
      }, delay);
    }

    _scheduleUiSync(delay = 50) {
      if (this._mutatingDom) {
        return;
      }

      clearTimeout(this._uiSyncTimer);
      this._uiSyncTimer = setTimeout(() => {
        this.syncCartUi();
      }, delay);
    }

    _refreshRebuyCart() {
      try {
        if (typeof window.Rebuy?.SmartCart?.fetchShopifyCart === 'function') {
          window.Rebuy.SmartCart.fetchShopifyCart();
        } else if (typeof window.Rebuy?.Cart?.fetchShopifyCart === 'function') {
          window.Rebuy.Cart.fetchShopifyCart();
        } else if (typeof window.Rebuy?.Cart?.getCart === 'function') {
          window.Rebuy.Cart.getCart();
        }
      } catch (_) {}
    }

    _initSlots() {
      if (!this.modal) {
        return;
      }

      ['1', '2'].forEach((slotKey) => {
        const field = this.modal.querySelector(`[data-cg-slot="${slotKey}"]`);

        if (!field) {
          return;
        }

        const slotState = {
          key: slotKey,
          field,
          options: [],
          filteredOptions: [],
          selected: null,
          locked: false,
          activeIndex: -1,
          trigger: field.querySelector('[data-cg-trigger]'),
          triggerTitle: field.querySelector('[data-cg-trigger-title]'),
          triggerSub: field.querySelector('[data-cg-trigger-sub]'),
          triggerSwatchSlot: field.querySelector('[data-cg-trigger-swatch]'),
          headerValue: field.querySelector('[data-cg-header-value]'),
          popover: field.querySelector('[data-cg-popover]'),
          searchInput: field.querySelector('[data-cg-search]'),
          searchClear: field.querySelector('[data-cg-search-clear]'),
          listbox: field.querySelector('[data-cg-listbox]'),
          emptyEl: field.querySelector('[data-cg-empty]'),
          errorEl: field.querySelector('[data-cg-error]'),
          errorTextEl: field.querySelector('[data-cg-error-text]'),
          placeholder: field.dataset.placeholder || 'Select a scent',
        };

        this.slots.set(slotKey, slotState);

        slotState.trigger.addEventListener('click', (event) => {
          event.stopPropagation();
          this.toggleSlot(slotKey);
        });

        slotState.trigger.addEventListener('keydown', (event) => this._handleTriggerKeydown(slotState, event));

        if (slotState.searchInput) {
          slotState.searchInput.addEventListener('input', () => {
            this._filterSlot(slotState, slotState.searchInput.value);
          });

          slotState.searchInput.addEventListener('keydown', (event) => this._handleListKeydown(slotState, event));
        }

        if (slotState.searchClear) {
          slotState.searchClear.addEventListener('click', (event) => {
            event.stopPropagation();

            if (slotState.searchInput) {
              slotState.searchInput.value = '';
              this._filterSlot(slotState, '');
              slotState.searchInput.focus();
            }
          });
        }

        slotState.listbox.addEventListener('keydown', (event) => this._handleListKeydown(slotState, event));
      });
    }

    _getScentsForProduct(productId) {
      const entry = productId ? this.byosProducts[String(productId)] : null;

      if (!entry) {
        return this.allScents.slice();
      }

      const allowed = Array.isArray(entry.allowedKeys) && entry.allowedKeys.length ? new Set(entry.allowedKeys) : null;
      const excluded = Array.isArray(entry.excludedKeys) && entry.excludedKeys.length ? new Set(entry.excludedKeys) : null;

      if (!allowed && !excluded) {
        return this.allScents.slice();
      }

      return this.allScents.filter((scent) => {
        const handleKey = String(scent.handle || '').toLowerCase();
        const nameKey = String(scent.name || '').trim().toLowerCase();

        if (allowed && !allowed.has(handleKey) && !allowed.has(nameKey)) {
          return false;
        }

        if (excluded && (excluded.has(handleKey) || excluded.has(nameKey))) {
          return false;
        }

        return true;
      });
    }

    _populateSlotsForItem(item) {
      const scents = this._getScentsForProduct(item?.product_id);
      const slot1 = this.slots.get('1');
      const slot2 = this.slots.get('2');

      if (slot1) {
        slot1.options = scents.slice();
        slot1.filteredOptions = scents.slice();
        this.selectOption('1', null, { close: false, silent: true });
      }

      if (slot2) {
        const slot2Options = [
          {
            name: 'None',
            handle: 'none',
            category: '',
            description: 'Single scent blend — full strength Scent 1',
            swatchUrl: '',
            swatchColor: '#5a6548',
            isNone: true,
          },
          ...scents.filter((scent) => !scent.singleScentOnly),
        ];
        slot2.options = slot2Options;
        slot2.filteredOptions = slot2Options.slice();
        this._syncSingleScentLock(null);
        this.selectOption('2', null, { close: false, silent: true });
      }
    }

    _renderOptions(slotState) {
      const { listbox, emptyEl, filteredOptions, selected, key } = slotState;

      listbox.innerHTML = '';

      if (!filteredOptions.length) {
        emptyEl.hidden = false;

        return;
      }

      emptyEl.hidden = true;

      const fragment = document.createDocumentFragment();
      let lastCategory = null;

      filteredOptions.forEach((option, idx) => {
        const optionCategory = option.isNone ? '' : String(option.category || '').trim();

        if (optionCategory && optionCategory !== lastCategory) {
          lastCategory = optionCategory;

          const groupLi = document.createElement('li');
          groupLi.className = 'byos-scent-picker__group-header';
          groupLi.setAttribute('role', 'presentation');
          groupLi.textContent = optionCategory;
          fragment.appendChild(groupLi);
        }

        const li = document.createElement('li');
        li.setAttribute('role', 'presentation');

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = `byos-cg-opt-${key}-${idx}`;
        btn.className = 'byos-scent-picker__option';
        btn.setAttribute('role', 'option');
        btn.dataset.optionIndex = String(idx);

        const isSelected = Boolean(selected && selected.handle === option.handle);
        btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');

        const swatch = createSwatchElement(option);

        if (swatch) {
          btn.appendChild(swatch);
        }

        const textWrap = document.createElement('span');
        textWrap.className = 'byos-scent-picker__option-body';

        const topRow = document.createElement('span');
        topRow.className = 'byos-scent-picker__option-top';

        const title = document.createElement('span');
        title.className = 'byos-scent-picker__option-title';
        title.textContent = option.name;
        topRow.appendChild(title);

        textWrap.appendChild(topRow);

        const descText = getDisplayDescription(option);

        if (descText) {
          const desc = document.createElement('span');
          desc.className = 'byos-scent-picker__option-desc';
          desc.textContent = descText;
          textWrap.appendChild(desc);
        }

        btn.appendChild(textWrap);

        const check = document.createElement('span');
        check.className = 'byos-scent-picker__option-check';
        check.setAttribute('aria-hidden', 'true');
        check.innerHTML = CHECK_ICON;
        btn.appendChild(check);

        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          this.selectOption(key, option, { close: true, focusTrigger: true });
        });

        li.appendChild(btn);
        fragment.appendChild(li);
      });

      listbox.appendChild(fragment);
    }

    _filterSlot(slotState, rawQuery) {
      const q = (rawQuery || '').trim().toLowerCase();

      if (slotState.searchClear) {
        slotState.searchClear.hidden = q.length === 0;
      }

      if (!q) {
        slotState.filteredOptions = slotState.options.slice();
      } else {
        slotState.filteredOptions = slotState.options.filter((opt) => {
          const haystack = `${opt.name} ${opt.description || ''} ${opt.category || ''} ${opt.mood || ''}`.toLowerCase();

          return haystack.includes(q);
        });
      }

      slotState.activeIndex = slotState.filteredOptions.length ? 0 : -1;
      this._renderOptions(slotState);
      this._syncActiveDescendant(slotState);
    }

    _setActiveIndex(slotState, index, { focusButton = false } = {}) {
      const buttons = slotState.listbox.querySelectorAll('[role="option"]');
      buttons.forEach((btn) => btn.classList.remove('is-active'));

      if (!buttons.length || index < 0 || index >= buttons.length) {
        slotState.activeIndex = -1;
        this._syncActiveDescendant(slotState);

        return;
      }

      slotState.activeIndex = index;

      const activeBtn = buttons[index];
      activeBtn.classList.add('is-active');
      activeBtn.scrollIntoView({ block: 'nearest' });

      if (focusButton) {
        activeBtn.focus();
      }

      this._syncActiveDescendant(slotState);
    }

    _syncActiveDescendant(slotState) {
      if (slotState.activeIndex >= 0) {
        const activeBtn = slotState.listbox.querySelector(`[data-option-index="${slotState.activeIndex}"]`);

        if (activeBtn?.id) {
          slotState.trigger.setAttribute('aria-activedescendant', activeBtn.id);

          return;
        }
      }

      slotState.trigger.removeAttribute('aria-activedescendant');
    }

    toggleSlot(slotKey) {
      const slotState = this.slots.get(slotKey);

      if (!slotState || slotState.locked) {
        return;
      }

      const isOpen = slotState.trigger.getAttribute('aria-expanded') === 'true';

      if (isOpen) {
        this.closeSlot(slotKey, { focusTrigger: false });
      } else {
        this.openSlot(slotKey);
      }
    }

    openSlot(slotKey) {
      const slotState = this.slots.get(slotKey);

      if (!slotState || slotState.locked) {
        return;
      }

      this.slots.forEach((s, key) => {
        if (key !== slotKey) {
          this.closeSlot(key, { focusTrigger: false });
        }
      });

      if (slotState.searchInput) {
        slotState.searchInput.value = '';
        this._filterSlot(slotState, '');
      }

      slotState.popover.hidden = false;
      slotState.trigger.setAttribute('aria-expanded', 'true');

      const selectedIndex = slotState.selected
        ? slotState.filteredOptions.findIndex((opt) => opt.handle === slotState.selected.handle)
        : 0;

      this._setActiveIndex(slotState, Math.max(selectedIndex, 0));

      requestAnimationFrame(() => {
        slotState.popover.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });

        if (slotState.searchInput) {
          slotState.searchInput.focus();
        } else {
          this._setActiveIndex(slotState, Math.max(slotState.activeIndex, 0), { focusButton: true });
        }
      });
    }

    closeSlot(slotKey, { focusTrigger = false } = {}) {
      const slotState = this.slots.get(slotKey);

      if (!slotState) {
        return;
      }

      slotState.popover.hidden = true;
      slotState.trigger.setAttribute('aria-expanded', 'false');
      slotState.trigger.removeAttribute('aria-activedescendant');

      if (focusTrigger) {
        slotState.trigger.focus();
      }
    }

    closeAllSlots({ focusTrigger = false } = {}) {
      this.slots.forEach((slotState, key) => {
        if (!slotState.popover.hidden) {
          this.closeSlot(key, { focusTrigger });
        }
      });
    }

    _hasOpenSlot() {
      for (const slotState of this.slots.values()) {
        if (slotState.popover && !slotState.popover.hidden) {
          return true;
        }
      }

      return false;
    }

    selectOption(slotKey, option, { close = true, focusTrigger = false } = {}) {
      const slotState = this.slots.get(slotKey);

      if (!slotState) {
        return false;
      }

      slotState.selected = option || null;

      if (slotState.triggerTitle) {
        slotState.triggerTitle.textContent = option ? option.name : slotState.placeholder;
      }

      if (slotState.triggerSub) {
        slotState.triggerSub.textContent = option ? getDisplayDescription(option) : '';
      }

      if (slotState.headerValue) {
        slotState.headerValue.textContent = option ? `: ${option.name}` : '';
      }

      if (slotState.triggerSwatchSlot) {
        slotState.triggerSwatchSlot.innerHTML = '';

        const swatchEl = option ? createSwatchElement(option) : null;

        if (swatchEl) {
          slotState.triggerSwatchSlot.hidden = false;
          slotState.triggerSwatchSlot.appendChild(swatchEl);
        } else {
          slotState.triggerSwatchSlot.hidden = true;
        }
      }

      slotState.trigger.dataset.hasValue = option ? 'true' : 'false';

      if (slotKey === '1') {
        this._syncSingleScentLock(option);
      }

      this._clearSlotError(slotState);
      this._renderOptions(slotState);

      if (close) {
        this.closeSlot(slotKey, { focusTrigger });
      }

      return true;
    }

    _syncSingleScentLock(scent1Option) {
      const slot2 = this.slots.get('2');

      if (!slot2) {
        return;
      }

      const isSingleOnly = Boolean(scent1Option?.singleScentOnly);
      slot2.locked = isSingleOnly;
      slot2.field.classList.toggle('is-locked-none', isSingleOnly);

      if (slot2.trigger) {
        slot2.trigger.disabled = isSingleOnly;

        if (isSingleOnly) {
          slot2.trigger.setAttribute('aria-disabled', 'true');
        } else {
          slot2.trigger.removeAttribute('aria-disabled');
        }
      }

      if (isSingleOnly) {
        this.closeSlot('2', { focusTrigger: false });
        const noneOption = slot2.options[0];

        if (noneOption) {
          this.selectOption('2', noneOption, { close: false });
        }
      }
    }

    _setSlotError(slotState, message) {
      slotState.field.classList.add('is-invalid');
      slotState.trigger.setAttribute('aria-invalid', 'true');

      if (slotState.errorEl && slotState.errorTextEl) {
        slotState.errorTextEl.textContent = message;
        slotState.errorEl.hidden = false;
      }
    }

    _clearSlotError(slotState) {
      slotState.field.classList.remove('is-invalid');
      slotState.trigger.setAttribute('aria-invalid', 'false');

      if (slotState.errorEl && slotState.errorTextEl) {
        slotState.errorTextEl.textContent = '';
        slotState.errorEl.hidden = true;
      }
    }

    validateModal() {
      const slot1 = this.slots.get('1');
      const slot2 = this.slots.get('2');
      let valid = true;
      let firstInvalid = null;

      if (!slot1?.selected) {
        this._setSlotError(slot1, 'Please select Custom Scent 1 before saving.');
        valid = false;
        firstInvalid = slot1.trigger;
      } else {
        this._clearSlotError(slot1);
      }

      if (!slot2?.selected) {
        this._setSlotError(slot2, 'Please select a second scent or choose "None".');
        valid = false;

        if (!firstInvalid) {
          firstInvalid = slot2.trigger;
        }
      } else {
        this._clearSlotError(slot2);
      }

      if (!valid && firstInvalid) {
        firstInvalid.focus();
      }

      return valid;
    }

    _isModalOpen() {
      return Boolean(this.modal && this.modal.classList.contains('is-visible'));
    }

    openModal(item, { checkoutAfterSave = false, checkoutSource = '', opener = null } = {}) {
      if (!this.modal || !item) {
        return;
      }

      this.checkoutAfterSave = Boolean(checkoutAfterSave);
      this.checkoutSource = checkoutSource || '';
      this.lastOpener = opener || document.activeElement;
      this.totalMissingAtModalStart = Math.max(this.missingItems.length, 1);
      this.resolvedCountInSession = 0;

      this._loadItemIntoModal(item);
      this.modal.classList.add('is-visible');
      this.modal.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('byos-cg-modal-open');

      requestAnimationFrame(() => {
        this.slots.get('1')?.trigger?.focus();
      });
    }

    _loadItemIntoModal(item) {
      this.currentItem = item;
      this._setSaveError('');
      this._setSaving(false);

      const stepNumber = Math.min(this.resolvedCountInSession + 1, this.totalMissingAtModalStart);

      if (this.stepEl) {
        if (this.totalMissingAtModalStart > 1) {
          this.stepEl.textContent = `Item ${stepNumber} of ${this.totalMissingAtModalStart}`;
          this.stepEl.hidden = false;
        } else {
          this.stepEl.textContent = '';
          this.stepEl.hidden = true;
        }
      }

      if (this.thumbWrap && this.thumbImg) {
        if (item.image) {
          this.thumbImg.src = item.image;
          this.thumbImg.alt = item.product_title || item.title || '';
          this.thumbWrap.hidden = false;
        } else {
          this.thumbImg.src = '';
          this.thumbWrap.hidden = true;
        }
      }

      if (this.itemTitleEl) {
        this.itemTitleEl.textContent = item.product_title || item.title || 'Custom Scent Product';
      }

      if (this.itemDetailsEl) {
        const parts = [];

        if (item.variant_title && item.variant_title !== 'Default Title') {
          parts.push(item.variant_title);
        }

        if (item.quantity && Number(item.quantity) > 1) {
          parts.push(`Qty: ${item.quantity}`);
        }

        const planName = item.selling_plan_allocation?.selling_plan?.name || item.selling_plan_name;

        if (planName) {
          parts.push(planName);
        }

        this.itemDetailsEl.textContent = parts.join(' • ');
      }

      if (this.saveBtn) {
        const hasMore = this.missingItems.length > 1;

        if (this.checkoutAfterSave) {
          this._setSaveButtonLabel(hasMore ? 'Save and Next Item' : 'Save and Continue to Checkout');
        } else {
          this._setSaveButtonLabel(hasMore ? 'Save and Next Item' : 'Save Scents');
        }
      }

      this._populateSlotsForItem(item);
      this.closeAllSlots({ focusTrigger: false });
    }

    closeModal({ restoreFocus = true } = {}) {
      if (!this._isModalOpen()) {
        return;
      }

      this.closeAllSlots({ focusTrigger: false });
      this.modal.classList.remove('is-visible');
      this.modal.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('byos-cg-modal-open');
      this.currentItem = null;
      this._setSaveError('');

      if (this.dirtyOnCartPage && document.getElementById('main-cart-items')) {
        this.dirtyOnCartPage = false;
        window.location.reload();

        return;
      }

      if (restoreFocus && this.lastOpener && typeof this.lastOpener.focus === 'function') {
        this.lastOpener.focus();
      }
    }

    _setSaveButtonLabel(label) {
      if (this.saveBtnLabel) {
        this.saveBtnLabel.textContent = label;
      } else if (this.saveBtn) {
        this.saveBtn.textContent = label;
      }
    }

    _setSaving(isSaving, label) {
      this.saving = isSaving;

      if (this.saveBtn) {
        this.saveBtn.disabled = isSaving;

        if (label) {
          this._setSaveButtonLabel(label);
        }
      }

      if (this.removeBtn) {
        this.removeBtn.disabled = isSaving;
      }
    }

    _setSaveError(message) {
      if (!this.saveErrorEl) {
        return;
      }

      if (message) {
        this.saveErrorEl.textContent = message;
        this.saveErrorEl.hidden = false;
      } else {
        this.saveErrorEl.textContent = '';
        this.saveErrorEl.hidden = true;
      }
    }

    _buildNextProperties(existingProps, scent1Name, scent2Name) {
      const normalized = normalizePropertiesObject(existingProps);
      const next = {};

      Object.entries(normalized).forEach(([k, v]) => {
        if (!SCENT_PROPERTY_KEYS.includes(k) && v != null && String(v).trim()) {
          next[k] = v;
        }
      });

      next['Scent 1'] = scent1Name;
      next['Scent 2'] = scent2Name;

      return next;
    }

    async saveCurrentItem() {
      if (this.saving || !this.currentItem) {
        return;
      }

      if (!this.validateModal()) {
        return;
      }

      const item = this.currentItem;
      const scent1Name = this.slots.get('1').selected.name;
      const scent2Name = this.slots.get('2').selected.name;
      const nextProps = this._buildNextProperties(item.properties, scent1Name, scent2Name);
      const sellingPlanId = item.selling_plan_allocation?.selling_plan?.id || item.selling_plan_id || null;

      this._setSaveError('');
      this._setSaving(true, 'Saving...');

      try {
        let updatedCart = null;
        const changePayload = {
          id: item.key,
          quantity: item.quantity,
          properties: nextProps,
        };

        if (sellingPlanId) {
          changePayload.selling_plan = sellingPlanId;
        }

        const changeRes = await fetch('/cart/change.js', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changePayload),
        });

        if (changeRes.ok) {
          updatedCart = await changeRes.json();
        }

        const matchedUpdated = updatedCart?.items?.some(
          (it) =>
            String(it.variant_id) === String(item.variant_id) &&
            String(normalizePropertiesObject(it.properties)['Scent 1'] || '').trim() === scent1Name &&
            (!sellingPlanId || String(it.selling_plan_allocation?.selling_plan?.id || '') === String(sellingPlanId))
        );

        if (!matchedUpdated) {
          await fetch('/cart/change.js', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: item.key, quantity: 0 }),
          });

          const addPayload = {
            id: item.variant_id,
            quantity: item.quantity,
            properties: nextProps,
          };

          if (sellingPlanId) {
            addPayload.selling_plan = sellingPlanId;
          }

          const addRes = await fetch('/cart/add.js', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(addPayload),
          });

          if (!addRes.ok) {
            throw new Error('Could not save scent selection');
          }

          const freshRes = await fetch('/cart.js', { credentials: 'same-origin' });

          if (freshRes.ok) {
            updatedCart = await freshRes.json();
          }
        }

        if (Array.isArray(updatedCart?.items)) {
          this.cartItems = updatedCart.items;
          window.RusticByosCartHelper?.recordCartItems?.(updatedCart.items);
        } else {
          await this.refreshCart({ syncUi: false });
        }

        this.resolvedCountInSession += 1;
        this.dirtyOnCartPage = true;
        this._recomputeMissing();
        this._refreshRebuyCart();
        this.syncCartUi();

        if (this.missingItems.length > 0) {
          this._loadItemIntoModal(this.missingItems[0]);

          requestAnimationFrame(() => {
            this.slots.get('1')?.trigger?.focus();
          });

          return;
        }

        const shouldCheckout = this.checkoutAfterSave;
        const source = this.checkoutSource;

        this.closeAllSlots({ focusTrigger: false });
        this.modal.classList.remove('is-visible');
        this.modal.setAttribute('aria-hidden', 'true');
        document.documentElement.classList.remove('byos-cg-modal-open');
        this.currentItem = null;
        this._setSaving(false);

        if (shouldCheckout) {
          this.dirtyOnCartPage = false;

          setTimeout(() => {
            if (source === 'rebuy') {
              if (typeof window.Rebuy?.SmartCart?.checkout === 'function') {
                window.Rebuy.SmartCart.checkout();

                return;
              }

              if (typeof window.Rebuy?.Cart?.checkout === 'function') {
                window.Rebuy.Cart.checkout();

                return;
              }
            }

            window.location.href = '/checkout';
          }, 220);

          return;
        }

        if (document.getElementById('main-cart-items')) {
          this.dirtyOnCartPage = false;
          window.location.reload();
        }
      } catch (err) {
        this._setSaving(false);

        if (this.saveBtn) {
          const hasMore = this.missingItems.length > 1;
          this._setSaveButtonLabel(
            this.checkoutAfterSave
              ? hasMore
                ? 'Save and Next Item'
                : 'Save and Continue to Checkout'
              : hasMore
                ? 'Save and Next Item'
                : 'Save Scents'
          );
        }

        this._setSaveError('Sorry, we could not update that item right now. Please try again.');
      }
    }

    async removeCurrentItem() {
      if (this.saving || !this.currentItem) {
        return;
      }

      const item = this.currentItem;
      this._setSaveError('');
      this._setSaving(true);

      try {
        const res = await fetch('/cart/change.js', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.key, quantity: 0 }),
        });

        if (!res.ok) {
          throw new Error('Failed to remove item');
        }

        const updatedCart = await res.json();

        if (Array.isArray(updatedCart?.items)) {
          this.cartItems = updatedCart.items;
          window.RusticByosCartHelper?.recordCartItems?.(updatedCart.items);
        } else {
          await this.refreshCart({ syncUi: false });
        }

        this.resolvedCountInSession += 1;
        this.dirtyOnCartPage = true;
        this._recomputeMissing();
        this._refreshRebuyCart();
        this.syncCartUi();

        if (this.missingItems.length > 0) {
          this._loadItemIntoModal(this.missingItems[0]);

          return;
        }

        this.closeModal({ restoreFocus: true });
      } catch (_) {
        this._setSaving(false);
        this._setSaveError('Sorry, we could not remove that item right now. Please try again.');
      }
    }

    _createItemAlert(item) {
      const box = document.createElement('div');
      box.className = 'byos-cg-item-alert';
      box.dataset.byosCgKey = String(item.key || '');

      const textWrap = document.createElement('span');
      textWrap.className = 'byos-cg-item-alert__text';
      textWrap.innerHTML = `<span class="byos-cg-item-alert__icon">${ALERT_ICON}</span><span>Scent selection needed</span>`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'button byos-cg-item-alert__btn';
      btn.dataset.byosCgPick = String(item.key || '');
      btn.textContent = 'Choose scents';

      box.appendChild(textWrap);
      box.appendChild(btn);

      return box;
    }

    _createFooterAlert(count) {
      const box = document.createElement('div');
      box.className = 'byos-cg-footer-alert';
      box.innerHTML = `<span class="byos-cg-footer-alert__icon">${ALERT_ICON}</span><span>Please choose custom scents for ${count} item${count === 1 ? '' : 's'} above before checking out.</span>`;

      return box;
    }

    _matchRebuyRowToItem(row, index, visibleItems) {
      const vueItem = row?.__vue__?.item;

      if (vueItem && vueItem.key) {
        const exact = (visibleItems || []).find((it) => String(it.key) === String(vueItem.key));

        if (exact) {
          return exact;
        }

        return vueItem;
      }

      if (Array.isArray(visibleItems) && visibleItems[index]) {
        return visibleItems[index];
      }

      return null;
    }

    syncCartUi() {
      if (this._mutatingDom) {
        return;
      }

      this._mutatingDom = true;

      try {
        const missingByKey = new Map(this.missingItems.map((it) => [String(it.key), it]));

        const rebuyCartEl = document.getElementById('rebuy-cart');

        if (rebuyCartEl) {
          const rawRebuy = window.Rebuy?.Cart?.cart?.items;
          const visibleItems = (Array.isArray(rawRebuy) && rawRebuy.length ? rawRebuy : this.cartItems).filter(
            (it) => it && !normalizePropertiesObject(it.properties)._rebuy_hidden
          );

          const rows = rebuyCartEl.querySelectorAll('li.rebuy-cart__flyout-item');

          rows.forEach((row, idx) => {
            const infoEl = row.querySelector('.rebuy-cart__flyout-item-info');

            if (!infoEl) {
              return;
            }

            const matched = this._matchRebuyRowToItem(row, idx, visibleItems);
            const matchedKey = matched ? String(matched.key) : '';
            const missingItem = matchedKey ? missingByKey.get(matchedKey) || (this.isMissingScent(matched) ? matched : null) : null;
            const existingAlert = infoEl.querySelector('.byos-cg-item-alert');

            if (missingItem) {
              if (!existingAlert || existingAlert.dataset.byosCgKey !== matchedKey) {
                existingAlert?.remove();
                infoEl.appendChild(this._createItemAlert(missingItem));
              }
            } else if (existingAlert) {
              existingAlert.remove();
            }
          });

          const rebuyCheckoutBtn = rebuyCartEl.querySelector('.rebuy-cart__checkout-button, button[data-smartcart-checkout]');
          const actionsRow =
            rebuyCheckoutBtn?.closest('.rebuy-cart__flyout-actions, [data-rebuy-component="checkout-area"]') ||
            rebuyCheckoutBtn?.parentElement;
          const footerContainer = actionsRow?.parentElement;
          const existingFooterAlert = rebuyCartEl.querySelector('.byos-cg-footer-alert');

          if (this.missingItems.length > 0 && footerContainer && actionsRow) {
            const nextAlert = this._createFooterAlert(this.missingItems.length);

            if (!existingFooterAlert || existingFooterAlert.parentElement !== footerContainer || existingFooterAlert.nextElementSibling !== actionsRow) {
              existingFooterAlert?.remove();
              footerContainer.insertBefore(nextAlert, actionsRow);
            } else {
              existingFooterAlert.replaceWith(nextAlert);
            }
          } else if (existingFooterAlert) {
            existingFooterAlert.remove();
          }
        }

        const mainCartItems = document.getElementById('main-cart-items');
        const mainCartFooter = document.getElementById('main-cart-footer');
        const cartDrawerEl = document.querySelector('cart-drawer');

        const itemContainers = [mainCartItems, cartDrawerEl].filter(Boolean);

        itemContainers.forEach((container) => {
          const itemRows = container.querySelectorAll('.cart-item');

          itemRows.forEach((row, idx) => {
            const detailsWrap = row.querySelector('.cart-item__details');

            if (!detailsWrap) {
              return;
            }

            const item = this.cartItems[idx] || null;
            const missingItem = item && this.isMissingScent(item) ? item : null;
            const existingAlert = detailsWrap.querySelector('.byos-cg-item-alert');

            if (missingItem) {
              const keyStr = String(missingItem.key);

              if (!existingAlert || existingAlert.dataset.byosCgKey !== keyStr) {
                existingAlert?.remove();
                detailsWrap.appendChild(this._createItemAlert(missingItem));
              }
            } else if (existingAlert) {
              existingAlert.remove();
            }
          });
        });

        const footerContainers = [mainCartFooter, cartDrawerEl].filter(Boolean);

        footerContainers.forEach((container) => {
          const checkoutBtn = container.querySelector('.cart__checkout-button, button[name="checkout"]');
          const checkoutWrap = checkoutBtn?.closest('.cart__ctas') || checkoutBtn?.parentElement;
          const parentGroup = checkoutWrap?.parentElement;
          const existingFooterAlert = container.querySelector('.byos-cg-footer-alert');

          if (this.missingItems.length > 0 && parentGroup && checkoutWrap) {
            const nextAlert = this._createFooterAlert(this.missingItems.length);

            if (!existingFooterAlert || existingFooterAlert.parentElement !== parentGroup || existingFooterAlert.nextElementSibling !== checkoutWrap) {
              existingFooterAlert?.remove();
              parentGroup.insertBefore(nextAlert, checkoutWrap);
            } else {
              existingFooterAlert.replaceWith(nextAlert);
            }
          } else if (existingFooterAlert) {
            existingFooterAlert.remove();
          }
        });
      } finally {
        requestAnimationFrame(() => {
          this._mutatingDom = false;
        });
      }
    }

    _observeCartContainers() {
      if (typeof MutationObserver === 'undefined') {
        return;
      }

      const observer = new MutationObserver((mutations) => {
        if (this._mutatingDom) {
          return;
        }

        const touchesCart = mutations.some((mutation) => {
          const target = mutation.target;

          if (!(target instanceof Element)) {
            return false;
          }

          if (target.closest('#byos-cart-guard-modal') || target.closest('.byos-cg-item-alert') || target.closest('.byos-cg-footer-alert')) {
            return false;
          }

          return Boolean(
            target.closest('#rebuy-cart, #main-cart-items, #main-cart-footer, cart-drawer') ||
              target.querySelector?.('#rebuy-cart')
          );
        });

        if (touchesCart) {
          this._recomputeMissing();
          this._scheduleUiSync(60);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    _handleTriggerKeydown(slotState, event) {
      if (slotState.locked) {
        return;
      }

      const isOpen = slotState.trigger.getAttribute('aria-expanded') === 'true';

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();

        if (!isOpen) {
          this.openSlot(slotState.key);
        } else if (event.key === 'ArrowDown') {
          this._setActiveIndex(slotState, Math.min(slotState.activeIndex + 1, slotState.filteredOptions.length - 1), {
            focusButton: true,
          });
        }
      }
    }

    _handleListKeydown(slotState, event) {
      const count = slotState.filteredOptions.length;

      if (event.key === 'Tab') {
        this.closeSlot(slotState.key, { focusTrigger: false });

        return;
      }

      if (!count) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = slotState.activeIndex < count - 1 ? slotState.activeIndex + 1 : 0;
        this._setActiveIndex(slotState, next, { focusButton: event.target !== slotState.searchInput });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const prev = slotState.activeIndex > 0 ? slotState.activeIndex - 1 : count - 1;
        this._setActiveIndex(slotState, prev, { focusButton: event.target !== slotState.searchInput });
      } else if (event.key === 'Home') {
        event.preventDefault();
        this._setActiveIndex(slotState, 0, { focusButton: event.target !== slotState.searchInput });
      } else if (event.key === 'End') {
        event.preventDefault();
        this._setActiveIndex(slotState, count - 1, { focusButton: event.target !== slotState.searchInput });
      } else if (event.key === 'Enter' && event.target === slotState.searchInput) {
        event.preventDefault();
        const chosen = slotState.filteredOptions[slotState.activeIndex >= 0 ? slotState.activeIndex : 0];

        if (chosen) {
          this.selectOption(slotState.key, chosen, { close: true, focusTrigger: true });
        }
      }
    }

    _bindEvents() {
      document.addEventListener(
        'click',
        (event) => {
          const target = event.target instanceof Element ? event.target : null;

          if (!target) {
            return;
          }

          const pickBtn = target.closest('[data-byos-cg-pick]');

          if (pickBtn) {
            event.preventDefault();
            event.stopPropagation();

            const itemKey = pickBtn.getAttribute('data-byos-cg-pick');
            const item =
              this.missingItems.find((it) => String(it.key) === String(itemKey)) || this.missingItems[0];

            if (item) {
              this.openModal(item, { checkoutAfterSave: false, opener: pickBtn });
            }

            return;
          }

          const checkoutTrigger = target.closest(
            '.rebuy-cart__checkout-button, .rebuy-cart__shop-pay-button, button[name="checkout"], input[name="checkout"], a[href*="/checkout"]'
          );

          if (checkoutTrigger && !target.closest('#byos-cart-guard-modal')) {
            this._recomputeMissing();

            if (this.missingItems.length > 0) {
              event.preventDefault();
              event.stopImmediatePropagation();

              const checkoutSource = checkoutTrigger.closest('#rebuy-cart') ? 'rebuy' : 'cart';
              this.openModal(this.missingItems[0], {
                checkoutAfterSave: true,
                checkoutSource,
                opener: checkoutTrigger,
              });

              return;
            }
          }

          if (this._isModalOpen()) {
            if (target.closest('[data-byos-cg-close]')) {
              event.preventDefault();
              this.closeModal({ restoreFocus: true });

              return;
            }

            if (!target.closest('.byos-scent-picker__combobox-wrap')) {
              this.closeAllSlots({ focusTrigger: false });
            }
          }
        },
        true
      );

      document.addEventListener(
        'submit',
        (event) => {
          const form = event.target;

          if (!(form instanceof HTMLFormElement)) {
            return;
          }

          const submitter = event.submitter;
          const isCheckoutSubmit =
            submitter?.getAttribute?.('name') === 'checkout' ||
            String(form.getAttribute('action') || '').includes('/checkout');

          if (isCheckoutSubmit) {
            this._recomputeMissing();

            if (this.missingItems.length > 0) {
              event.preventDefault();
              event.stopImmediatePropagation();

              this.openModal(this.missingItems[0], {
                checkoutAfterSave: true,
                checkoutSource: 'cart',
                opener: submitter || form,
              });
            }
          }
        },
        true
      );

      this.saveBtn?.addEventListener('click', () => {
        this.saveCurrentItem();
      });

      this.removeBtn?.addEventListener('click', () => {
        this.removeCurrentItem();
      });

      window.addEventListener(
        'keydown',
        (event) => {
          if (!this._isModalOpen()) {
            return;
          }

          if (event.key === 'Escape' || event.key === 'Esc') {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            this.suppressNextEscapeKeyup = true;

            if (this._hasOpenSlot()) {
              this.closeAllSlots({ focusTrigger: true });
            } else {
              this.closeModal({ restoreFocus: true });
            }
          }
        },
        true
      );

      window.addEventListener(
        'keyup',
        (event) => {
          if (this.suppressNextEscapeKeyup && (event.key === 'Escape' || event.key === 'Esc')) {
            this.suppressNextEscapeKeyup = false;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
          }
        },
        true
      );

      document.addEventListener('byos:cart-updated', (event) => {
        const cart = event?.detail?.cart;

        if (Array.isArray(cart?.items)) {
          this.cartItems = cart.items;
          this._recomputeMissing();
          this._scheduleUiSync(40);
        } else {
          this._scheduleRefresh(80);
        }
      });

      ['rebuy:cart.ready', 'rebuy:cart.change', 'rebuy:cart.add', 'rebuy:smartcart.show', 'rebuy:smartcart.ready'].forEach(
        (evtName) => {
          document.addEventListener(evtName, () => {
            this._scheduleRefresh(80);
            this._scheduleUiSync(120);
          });
        }
      );

      document.addEventListener('DOMContentLoaded', () => {
        this.refreshCart({ syncUi: true });
      });
    }
  }

  function installCartHelper() {
    if (window.RusticByosCartHelper) {
      return;
    }

    const RECENT_REMOVED_TTL_MS = 15000;
    const REBUY_INTERACTION_TTL_MS = 6000;
    const CART_ENDPOINT_RE = /\/cart(\/add|\/change|\/update|\/clear)?(\.js|\.json)?(\?|$)/;

    const propsByKey = new Map();
    const propsByVariant = new Map();
    const recentRemovedByVariant = new Map();
    let lastRebuySubscriptionInteractionTs = 0;

    function extractCleanScentProps(props) {
      const clean = {};

      if (!props || typeof props !== 'object') {
        return clean;
      }

      SCENT_PROPERTY_KEYS.forEach((key) => {
        const value = props[key];

        if (value != null && String(value).trim()) {
          clean[key] = String(value).trim();
        }
      });

      return clean;
    }

    function mergeScentProps(incoming, cached) {
      const merged = incoming && typeof incoming === 'object' ? { ...incoming } : {};
      const cleanCached = extractCleanScentProps(cached);

      Object.entries(cleanCached).forEach(([key, value]) => {
        const existing = merged[key];

        if (existing == null || !String(existing).trim()) {
          merged[key] = value;
        }
      });

      return merged;
    }

    function recordCartItems(items) {
      if (!Array.isArray(items)) {
        return;
      }

      items.forEach((item) => {
        if (!item || !hasValidScentProps(item.properties)) {
          return;
        }

        const cleanProps = extractCleanScentProps(item.properties);

        if (item.key) {
          propsByKey.set(String(item.key), cleanProps);
        }

        if (item.variant_id) {
          propsByVariant.set(String(item.variant_id), cleanProps);
        }
      });
    }

    function syncFromRebuy() {
      const items = window.Rebuy?.Cart?.cart?.items;

      if (Array.isArray(items)) {
        recordCartItems(items);
      }
    }

    function findCachedProps(payload) {
      if (!payload || typeof payload !== 'object') {
        return null;
      }

      const idStr = String(payload.id || payload.key || '');

      if (idStr && propsByKey.has(idStr)) {
        return propsByKey.get(idStr);
      }

      const variantStr = String(payload.variant_id || (idStr && !idStr.includes(':') ? idStr : idStr.split(':')[0] || ''));

      if (variantStr && recentRemovedByVariant.has(variantStr)) {
        const record = recentRemovedByVariant.get(variantStr);

        if (record && Date.now() - record.ts < RECENT_REMOVED_TTL_MS) {
          return record.props;
        }

        recentRemovedByVariant.delete(variantStr);
      }

      if (variantStr && propsByVariant.has(variantStr)) {
        return propsByVariant.get(variantStr);
      }

      return null;
    }

    function recordRemovedEntry(entry) {
      if (!entry || typeof entry !== 'object') {
        return;
      }

      const idStr = String(entry.id || entry.key || '');
      const rebuyItems = window.Rebuy?.Cart?.cart?.items;
      let matchedItem = null;

      if (idStr && Array.isArray(rebuyItems)) {
        matchedItem =
          rebuyItems.find((it) => String(it?.key || '') === idStr || String(it?.variant_id || '') === idStr) || null;
      }

      const rawProps =
        (matchedItem && hasValidScentProps(matchedItem.properties) ? matchedItem.properties : null) ||
        findCachedProps(entry);

      if (!rawProps || !hasValidScentProps(rawProps)) {
        return;
      }

      const cleanProps = extractCleanScentProps(rawProps);
      const variantId = String(
        entry.variant_id || matchedItem?.variant_id || (idStr && !idStr.includes(':') ? idStr : '')
      );

      if (variantId) {
        recentRemovedByVariant.set(variantId, {
          props: cleanProps,
          ts: Date.now(),
        });
        propsByVariant.set(variantId, cleanProps);
      }

      if (idStr) {
        propsByKey.set(idStr, cleanProps);
      }
    }

    function isRebuyItemSwapping(variantId) {
      const variantStr = String(variantId || '');
      const rebuyItems = window.Rebuy?.Cart?.cart?.items;

      if (Array.isArray(rebuyItems) && variantStr) {
        const swapping = rebuyItems.some(
          (it) =>
            String(it?.variant_id || '') === variantStr &&
            (it?.status === 'downgrading' || it?.status === 'upgrading')
        );

        if (swapping) {
          return true;
        }
      }

      if (variantStr && recentRemovedByVariant.has(variantStr)) {
        const record = recentRemovedByVariant.get(variantStr);

        if (record && Date.now() - record.ts < RECENT_REMOVED_TTL_MS) {
          return true;
        }

        recentRemovedByVariant.delete(variantStr);
      }

      return Date.now() - lastRebuySubscriptionInteractionTs < REBUY_INTERACTION_TTL_MS;
    }

    function emitCartUpdated(data, url) {
      try {
        document.dispatchEvent(
          new CustomEvent('byos:cart-updated', {
            detail: {
              cart: Array.isArray(data?.items) ? data : null,
              url: String(url || ''),
            },
          })
        );
      } catch (_) {}
    }

    function patchPayloadBody(rawBody, url) {
      if (!rawBody || !/\/cart\/(change|add)(\.js|\.json)?(\?|$)/.test(url)) {
        return rawBody;
      }

      const isChange = /\/cart\/change/.test(url);

      if (typeof FormData !== 'undefined' && rawBody instanceof FormData) {
        const id = String(rawBody.get('id') || '');
        const quantityRaw = rawBody.get('quantity');
        const qtyNum = quantityRaw !== null ? Number(quantityRaw) : NaN;

        if (isChange && qtyNum === 0) {
          recordRemovedEntry({ id });

          return rawBody;
        }

        const incomingProps = {};

        for (const [key, val] of rawBody.entries()) {
          const match = key.match(/^properties\[(.+)\]$/);

          if (match && val != null && String(val).trim()) {
            incomingProps[match[1]] = String(val).trim();
          }
        }

        if (hasValidScentProps(incomingProps)) {
          return rawBody;
        }

        const hasSellingPlanKey = rawBody.has('selling_plan');
        const shouldPatch = isChange || hasSellingPlanKey || isRebuyItemSwapping(id);

        if (!shouldPatch || !id) {
          return rawBody;
        }

        const cached = findCachedProps({ id });

        if (!cached) {
          return rawBody;
        }

        const merged = mergeScentProps(incomingProps, cached);
        const nextForm = new FormData();

        for (const [key, val] of rawBody.entries()) {
          nextForm.append(key, val);
        }

        Object.entries(merged).forEach(([key, val]) => {
          if (val != null && String(val).trim() && !nextForm.has(`properties[${key}]`)) {
            nextForm.set(`properties[${key}]`, String(val));
          }
        });

        return nextForm;
      }

      if (typeof rawBody === 'string') {
        const trimmed = rawBody.trim();

        if (trimmed.startsWith('{')) {
          try {
            const obj = JSON.parse(trimmed);
            const targets = Array.isArray(obj.items) ? obj.items : [obj];
            let modified = false;

            targets.forEach((entry) => {
              if (!entry || typeof entry !== 'object') {
                return;
              }

              if (isChange && entry.quantity !== undefined && Number(entry.quantity) === 0) {
                recordRemovedEntry(entry);

                return;
              }

              const idStr = String(entry.id || entry.key || '');
              const variantStr = String(
                entry.variant_id || (idStr && !idStr.includes(':') ? idStr : idStr.split(':')[0] || '')
              );
              const hasSellingPlanKey = Object.prototype.hasOwnProperty.call(entry, 'selling_plan');

              if (!isChange && !hasSellingPlanKey && !isRebuyItemSwapping(variantStr)) {
                return;
              }

              if (!hasValidScentProps(entry.properties)) {
                const cached = findCachedProps(entry);

                if (cached) {
                  entry.properties = mergeScentProps(entry.properties, cached);
                  modified = true;
                }
              }
            });

            return modified ? JSON.stringify(obj) : rawBody;
          } catch (_) {
            return rawBody;
          }
        }

        const params = new URLSearchParams(rawBody);
        const id = params.get('id') || '';
        const quantityRaw = params.get('quantity');

        if (isChange && quantityRaw !== null && Number(quantityRaw) === 0) {
          recordRemovedEntry({ id });

          return rawBody;
        }

        const hasSellingPlanKey = params.has('selling_plan');

        if ((hasSellingPlanKey || isChange || isRebuyItemSwapping(id)) && id) {
          const incomingProps = {};

          for (const [key, val] of params.entries()) {
            const match = key.match(/^properties\[(.+)\]$/);

            if (match && val != null && String(val).trim()) {
              incomingProps[match[1]] = String(val).trim();
            }
          }

          if (!hasValidScentProps(incomingProps)) {
            const cached = findCachedProps({ id });

            if (cached) {
              const merged = mergeScentProps(incomingProps, cached);

              Object.entries(merged).forEach(([k, v]) => {
                if (v != null && String(v).trim() && !params.get(`properties[${k}]`)) {
                  params.set(`properties[${k}]`, String(v));
                }
              });

              return params.toString();
            }
          }
        }
      }

      return rawBody;
    }

    function recordRebuySubscriptionClick(event) {
      if (event.target?.closest?.('.rebuy-cart__flyout-item-subscription')) {
        lastRebuySubscriptionInteractionTs = Date.now();
        syncFromRebuy();
      }
    }

    document.addEventListener('click', recordRebuySubscriptionClick, true);
    document.addEventListener('change', recordRebuySubscriptionClick, true);

    window.RusticByosCartHelper = {
      patchPayloadBody,
      recordCartItems,
      findCachedProps,
      hasScentProps: hasValidScentProps,
      isRebuyItemSwapping,
    };

    if (typeof window.fetch === 'function') {
      const origFetch = window.fetch.bind(window);

      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input?.url || '';
        const method = (init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();

        if (method === 'POST' && init?.body) {
          syncFromRebuy();

          const patchedBody = patchPayloadBody(init.body, url);

          if (patchedBody !== init.body) {
            init = { ...init, body: patchedBody };
          }
        }

        const res = await origFetch(input, init);

        if (CART_ENDPOINT_RE.test(url) && res.ok) {
          res
            .clone()
            .json()
            .then((data) => {
              if (data?.items) {
                recordCartItems(data.items);
              } else if (data?.key && hasValidScentProps(data.properties)) {
                recordCartItems([data]);
              }

              emitCartUpdated(data, url);
            })
            .catch(() => {
              emitCartUpdated(null, url);
            });
        }

        return res;
      };
    }

    const origXhrOpen = XMLHttpRequest.prototype.open;
    const origXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._byosMethod = String(method || 'GET').toUpperCase();
      this._byosUrl = String(url || '');

      return origXhrOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
      if (this._byosMethod === 'POST' && body && this._byosUrl) {
        syncFromRebuy();
        body = patchPayloadBody(body, this._byosUrl);
      }

      if (CART_ENDPOINT_RE.test(this._byosUrl || '')) {
        const targetUrl = this._byosUrl;

        this.addEventListener('load', () => {
          if (this.status < 200 || this.status >= 300) {
            return;
          }

          try {
            const data = JSON.parse(this.responseText || '{}');

            if (data?.items) {
              recordCartItems(data.items);
            } else if (data?.key && hasValidScentProps(data.properties)) {
              recordCartItems([data]);
            }

            emitCartUpdated(data, targetUrl);
          } catch (_) {
            emitCartUpdated(null, targetUrl);
          }
        });
      }

      return origXhrSend.call(this, body);
    };

    document.addEventListener('rebuy:cart.ready', syncFromRebuy);
    document.addEventListener('rebuy:cart.change', syncFromRebuy);
  }

  function initGuard() {
    installCartHelper();

    if (window.RusticByosCartGuard) {
      return;
    }

    const dataEl = document.getElementById('byos-cart-guard-data');

    if (!dataEl) {
      return;
    }

    try {
      const parsed = JSON.parse(dataEl.textContent || '{}');
      window.RusticByosCartGuard = new ByosCartGuard(parsed);
      window.RusticByosCartHelper?.recordCartItems?.(parsed?.initialItems);
    } catch (err) {
      console.error('[BYOS Cart Guard] Failed to initialize:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGuard);
  } else {
    initGuard();
  }
})();
