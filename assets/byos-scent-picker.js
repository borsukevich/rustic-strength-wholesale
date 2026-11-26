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

  function getDisplayDescription(option, showDescriptions, descriptionMode = 'meaningful') {
    if (!showDescriptions || descriptionMode === 'none' || !option || !option.description) {
      return '';
    }

    let raw = String(option.description || '').trim();

    if (!raw) {
      return '';
    }

    if (option.isNone) {
      return formatDescription(raw);
    }

    if (descriptionMode === 'blends_only') {
      if (!normalizeKey(option.category).includes('blend')) {
        return '';
      }

      raw = raw.replace(/^\(\s*essential\s+oil\s+blend\s*\)\s*/i, '');

      return formatDescription(raw);
    }

    if (descriptionMode === 'meaningful') {
      raw = raw.replace(/^\(\s*essential\s+oil\s+blend\s*\)\s*/i, '');

      const normDesc = normalizeKey(raw);
      const normCat = normalizeKey(option.category);

      if (normDesc && normCat && normDesc === normCat) {
        return '';
      }
    }

    return formatDescription(raw);
  }

  function createSwatchElement(option, swatchDisplay = 'image') {
    if (swatchDisplay === 'none') {
      return null;
    }

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

    const showImage = swatchDisplay !== 'color' && Boolean(option.swatchUrl);

    if (showImage) {
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

  class ByosScentPicker extends HTMLElement {
    constructor() {
      super();

      this.slots = new Map();
      this.scents = [];
      this.config = {};
      this.variantIds = new Set();
      this._onDocumentClick = this._handleDocumentClick.bind(this);
      this._onFormSubmit = this._handleFormSubmit.bind(this);
      this._onStickySubmit = this._handleStickySubmit.bind(this);
      this._onKeyDown = this._handleKeyDown.bind(this);
      this._onKeyUp = this._handleKeyUp.bind(this);
      this._suppressNextEscapeKeyup = false;
    }

    connectedCallback() {
      if (this._initialized) {
        return;
      }

      const dataScript = this.querySelector('script[data-byos-scents]');

      if (!dataScript) {
        return;
      }

      try {
        const parsed = JSON.parse(dataScript.textContent || '{}');
        const catalog = parsed.catalog || parsed;

        this.config = { ...parsed, source: catalog.source || parsed.source || '' };
        this.scents = Array.isArray(catalog.scents) ? catalog.scents.slice() : [];
      } catch (err) {
        console.error('[BYOS] Failed to parse scent catalog JSON:', err);

        return;
      }

      const categoryOrder = new Map([
        ['essential oil', 1],
        ['essential oil blend', 2],
        ['phthalate-free fragrance oil', 3],
      ]);

      this.scents.sort((a, b) => {
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

      if (Array.isArray(this.config.variantIds)) {
        this.config.variantIds.forEach((id) => this.variantIds.add(String(id)));
      }

      this.formId = this.dataset.formId || this.config.formId || '';
      this.stickyFormId = this.dataset.stickyFormId || '';
      this.noSecondValue = (this.config.noSecondScentValue || 'None').trim() || 'None';
      this.noSecondHelper = (this.config.noSecondScentHelper || 'Single scent blend — full strength Scent 1').trim();
      this.showDescriptions = this.dataset.showDescriptions !== 'false';
      this.descriptionMode = this.dataset.descriptionMode || 'meaningful';
      this.enableSearch = this.dataset.enableSearch !== 'false';
      this.swatchDisplay = this.dataset.swatchDisplay || 'image';

      this._initSlot('1', this.scents);
      this._initSlot('2', [
        {
          name: this.noSecondValue,
          handle: 'none',
          category: '',
          description: this.noSecondHelper,
          swatchUrl: '',
          swatchColor: '#5a6548',
          isNone: true,
        },
        ...this.scents.filter((scent) => !scent.singleScentOnly),
      ]);

      this._applyUrlPrefill();
      this._bindFormListeners();
      document.addEventListener('click', this._onDocumentClick);
      this.addEventListener('keydown', this._onKeyDown);
      this.addEventListener('keyup', this._onKeyUp);

      if (window.RusticByosScentPicker) {
        window.RusticByosScentPicker.register(this);
      }

      this._initialized = true;
      this._emitSelectionEvent('init');
    }

    disconnectedCallback() {
      document.removeEventListener('click', this._onDocumentClick);
      this.removeEventListener('keydown', this._onKeyDown);
      this.removeEventListener('keyup', this._onKeyUp);

      const form = this.getTargetForm();
      form?.removeEventListener('submit', this._onFormSubmit, true);

      if (this.stickyFormId) {
        document.getElementById(this.stickyFormId)?.removeEventListener('submit', this._onStickySubmit, true);
      }

      window.RusticByosScentPicker?.unregister(this);
    }

    getTargetForm() {
      return this.formId ? document.getElementById(this.formId) : this.closest('form');
    }

    _initSlot(slotKey, options) {
      const field = this.querySelector(`[data-scent-field="${slotKey}"]`);

      if (!field) {
        return;
      }

      const slotState = {
        key: slotKey,
        field,
        options,
        filteredOptions: options.slice(),
        selected: null,
        activeIndex: -1,
        trigger: field.querySelector('[data-scent-trigger]'),
        triggerTitle: field.querySelector('[data-scent-trigger-title]'),
        triggerSub: field.querySelector('[data-scent-trigger-sub]'),
        triggerSwatchSlot: field.querySelector('[data-scent-trigger-swatch]'),
        headerValue: field.querySelector('[data-scent-header-value]'),
        popover: field.querySelector('[data-scent-popover]'),
        searchInput: field.querySelector('[data-scent-search]'),
        searchClear: field.querySelector('[data-scent-search-clear]'),
        listbox: field.querySelector('[data-scent-listbox]'),
        emptyEl: field.querySelector('[data-scent-empty]'),
        hiddenInput: field.querySelector('[data-scent-hidden-input]'),
        errorEl: field.querySelector('[data-scent-error]'),
        errorTextEl: field.querySelector('[data-scent-error-text]'),
        placeholder: field.dataset.placeholder || 'Select a scent',
      };

      this._renderOptions(slotState);

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
        slotState.searchClear.addEventListener('click', () => {
          if (slotState.searchInput) {
            slotState.searchInput.value = '';
            this._filterSlot(slotState, '');
            slotState.searchInput.focus();
          }
        });
      }

      slotState.listbox.addEventListener('keydown', (event) => this._handleListKeydown(slotState, event));

      this.slots.set(slotKey, slotState);
    }

    _renderOptions(slotState) {
      const { listbox, filteredOptions, selected, key } = slotState;
      listbox.innerHTML = '';

      if (!filteredOptions.length) {
        if (slotState.emptyEl) {
          slotState.emptyEl.hidden = false;
        }

        slotState.activeIndex = -1;

        return;
      }

      if (slotState.emptyEl) {
        slotState.emptyEl.hidden = true;
      }

      const fragment = document.createDocumentFragment();
      let lastCategory = null;

      filteredOptions.forEach((option, index) => {
        if (!option.isNone && option.category && option.category !== lastCategory) {
          const groupHeader = document.createElement('li');
          groupHeader.className = 'byos-scent-picker__group-header';
          groupHeader.setAttribute('role', 'presentation');
          groupHeader.setAttribute('aria-hidden', 'true');
          groupHeader.textContent = option.category;

          fragment.appendChild(groupHeader);
          lastCategory = option.category;
        }

        const li = document.createElement('li');
        li.setAttribute('role', 'presentation');

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'byos-scent-picker__option';
        btn.id = `${this.id || 'byos'}-slot-${key}-opt-${index}`;
        btn.setAttribute('role', 'option');

        const isSelected = selected && selected.handle === option.handle && selected.name === option.name;
        btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        btn.dataset.optionIndex = String(index);

        const swatchEl = createSwatchElement(option, this.swatchDisplay);

        if (swatchEl) {
          btn.appendChild(swatchEl);
        }

        const body = document.createElement('span');
        body.className = 'byos-scent-picker__option-body';

        const top = document.createElement('span');
        top.className = 'byos-scent-picker__option-top';

        const title = document.createElement('span');
        title.className = 'byos-scent-picker__option-title';
        title.textContent = option.name;

        top.appendChild(title);
        body.appendChild(top);

        const formattedDesc = getDisplayDescription(option, this.showDescriptions, this.descriptionMode);

        if (formattedDesc) {
          const desc = document.createElement('span');
          desc.className = 'byos-scent-picker__option-desc';
          desc.textContent = formattedDesc;

          body.appendChild(desc);
        }

        btn.appendChild(body);

        const check = document.createElement('span');
        check.className = 'byos-scent-picker__option-check';
        check.innerHTML = CHECK_ICON;

        btn.appendChild(check);

        btn.addEventListener('click', () => {
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
      const targetSlot = this.slots.get(slotKey);

      if (!targetSlot || targetSlot.locked) {
        return;
      }

      this.slots.forEach((s, key) => {
        if (key !== slotKey) {
          this.closeSlot(key, { focusTrigger: false });
        }
      });

      const slotState = targetSlot;

      if (!slotState) {
        return;
      }

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
        if (this.enableSearch && slotState.searchInput) {
          slotState.searchInput.focus();
        } else {
          const idx = Math.max(slotState.activeIndex, 0);

          this._setActiveIndex(slotState, idx, { focusButton: true });
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

    closeAll({ focusTrigger = false } = {}) {
      this.slots.forEach((slotState, key) => {
        if (!slotState.popover.hidden) {
          this.closeSlot(key, { focusTrigger });
        }
      });
    }

    selectOption(slotKey, option, { close = true, focusTrigger = false, silent = false } = {}) {
      const slotState = this.slots.get(slotKey);

      if (!slotState) {
        return false;
      }

      slotState.selected = option || null;

      if (slotState.hiddenInput) {
        if (option) {
          slotState.hiddenInput.value = option.name;
          slotState.hiddenInput.disabled = false;
        } else {
          slotState.hiddenInput.value = '';
          slotState.hiddenInput.disabled = true;
        }
      }

      if (slotState.triggerTitle) {
        slotState.triggerTitle.textContent = option ? option.name : slotState.placeholder;
      }

      if (slotState.triggerSub) {
        slotState.triggerSub.textContent = option
          ? getDisplayDescription(option, this.showDescriptions, this.descriptionMode)
          : '';
      }

      if (slotState.headerValue) {
        slotState.headerValue.textContent = option ? `: ${option.name}` : '';
      }

      if (slotState.triggerSwatchSlot) {
        slotState.triggerSwatchSlot.innerHTML = '';

        const swatchEl = option ? createSwatchElement(option, this.swatchDisplay) : null;

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

      if (!silent) {
        this._emitSelectionEvent('user');
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
          this.selectOption('2', noneOption, { close: false, silent: true });

          if (slot2.triggerSub) {
            slot2.triggerSub.textContent = 'Locked to None — single-scent only';
          }
        }
      } else if (slot2.selected && slot2.triggerSub) {
        slot2.triggerSub.textContent = getDisplayDescription(slot2.selected, this.showDescriptions, this.descriptionMode);
      }
    }

    setScentsByName(scent1Name, scent2Name, { silent = false } = {}) {
      const matched1 = scent1Name ? this._matchOption('1', scent1Name) : null;

      if (matched1) {
        this.selectOption('1', matched1, { close: false, silent: true });
      }

      const slot2 = this.slots.get('2');
      const matched2 = scent2Name && !slot2?.locked ? this._matchOption('2', scent2Name) : null;

      if (matched2) {
        this.selectOption('2', matched2, { close: false, silent: true });
      }

      if (!silent && (matched1 || matched2)) {
        this._emitSelectionEvent('api');
      }

      return {
        scent1: this.slots.get('1')?.selected || null,
        scent2: this.slots.get('2')?.selected || null,
      };
    }

    _matchOption(slotKey, rawQuery) {
      const slotState = this.slots.get(slotKey);

      if (!slotState || !rawQuery) {
        return null;
      }

      const trimmed = String(rawQuery).trim();
      const lower = trimmed.toLowerCase();
      const norm = normalizeKey(trimmed);

      if (slotKey === '2' && ['none', 'no', 'single', 'no-second-scent', normalizeKey(this.noSecondValue)].includes(norm)) {
        return slotState.options[0];
      }

      return (
        slotState.options.find(
          (opt) =>
            opt.name.trim().toLowerCase() === lower ||
            normalizeKey(opt.name) === norm ||
            normalizeKey(opt.handle) === norm
        ) || null
      );
    }

    _applyUrlPrefill() {
      const params = new URLSearchParams(window.location.search);
      const raw1 = params.get('scent1') || params.get('scent_1') || '';
      const raw2 = params.get('scent2') || params.get('scent_2') || '';

      if (raw1) {
        const match1 = this._matchOption('1', raw1);

        if (match1) {
          this.selectOption('1', match1, { close: false, silent: true });
        }
      }

      if (raw2 && !this.slots.get('2')?.locked) {
        const match2 = this._matchOption('2', raw2);

        if (match2) {
          this.selectOption('2', match2, { close: false, silent: true });
        }
      }
    }

    getState() {
      const scent1 = this.slots.get('1')?.selected || null;
      const scent2 = this.slots.get('2')?.selected || null;

      return {
        productId: this.config.productId || null,
        productHandle: this.config.productHandle || '',
        productTitle: this.config.productTitle || '',
        source: this.config.source || 'fallback',
        propertyKeys: this.config.propertyKeys || { scent1: 'Scent 1', scent2: 'Scent 2' },
        scent1,
        scent2,
        isSecondScentNone: Boolean(scent2?.isNone),
        isValid: Boolean(scent1 && scent2),
      };
    }

    validate({ report = true, focus = false } = {}) {
      const slot1 = this.slots.get('1');
      const slot2 = this.slots.get('2');
      let firstInvalidSlot = null;

      [slot1, slot2].forEach((slot) => {
        if (!slot) {
          return;
        }

        const valid = Boolean(slot.selected && slot.hiddenInput && !slot.hiddenInput.disabled && slot.hiddenInput.value.trim());

        if (!valid) {
          if (!firstInvalidSlot) {
            firstInvalidSlot = slot;
          }

          if (report) {
            const msg =
              slot.key === '1'
                ? this.dataset.errorScent1 || 'Please select Custom Scent 1 before adding to cart.'
                : this.dataset.errorScent2 || `Please select a second scent or choose "${this.noSecondValue}".`;

            this._showSlotError(slot, msg);
          }
        } else if (report) {
          this._clearSlotError(slot);
        }
      });

      if (firstInvalidSlot) {
        if (focus) {
          firstInvalidSlot.field.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => firstInvalidSlot.trigger?.focus(), 120);
        }

        return false;
      }

      return true;
    }

    _showSlotError(slot, message) {
      slot.field.classList.add('is-invalid');
      slot.trigger.setAttribute('aria-invalid', 'true');

      if (slot.errorEl && slot.errorTextEl) {
        slot.errorTextEl.textContent = message;
        slot.errorEl.hidden = false;
      }
    }

    _clearSlotError(slot) {
      slot.field.classList.remove('is-invalid');
      slot.trigger.setAttribute('aria-invalid', 'false');

      if (slot.errorEl && slot.errorTextEl) {
        slot.errorTextEl.textContent = '';
        slot.errorEl.hidden = true;
      }
    }

    _emitSelectionEvent(origin) {
      const detail = {
        ...this.getState(),
        origin,
        picker: this,
      };

      this.dispatchEvent(new CustomEvent('byos:scent-selected', { bubbles: true, detail }));
      this.dispatchEvent(new CustomEvent('scent:selected', { bubbles: true, detail }));
    }

    _bindFormListeners() {
      const form = this.getTargetForm();

      if (form) {
        form.addEventListener('submit', this._onFormSubmit, true);
      }

      if (this.stickyFormId) {
        const stickyForm = document.getElementById(this.stickyFormId);
        stickyForm?.addEventListener('submit', this._onStickySubmit, true);
      }
    }

    _handleFormSubmit(event) {
      if (!this.validate({ report: true, focus: true })) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    _handleStickySubmit(event) {
      if (!this.validate({ report: true, focus: true })) {
        event.preventDefault();
        event.stopImmediatePropagation();

        return;
      }

      const stickyForm = event.currentTarget;
      const state = this.getState();

      if (!stickyForm || !state.scent1 || !state.scent2) {
        return;
      }

      const pairs = [
        [state.propertyKeys.scent1 || 'Scent 1', state.scent1.name],
        [state.propertyKeys.scent2 || 'Scent 2', state.scent2.name],
      ];

      pairs.forEach(([propKey, propValue]) => {
        const name = `properties[${propKey}]`;
        let hidden = stickyForm.querySelector(`input[name="${CSS.escape(name)}"]`);

        if (!hidden) {
          hidden = document.createElement('input');
          hidden.type = 'hidden';
          hidden.name = name;
          stickyForm.appendChild(hidden);
        }

        hidden.value = propValue;
      });
    }

    _isEscapeKey(event) {
      return event.key === 'Escape' || event.key === 'Esc' || (event.code && event.code.toUpperCase() === 'ESCAPE');
    }

    _hasOpenSlot() {
      for (const slotState of this.slots.values()) {
        if (slotState.popover && !slotState.popover.hidden) {
          return true;
        }
      }

      return false;
    }

    _handleKeyDown(event) {
      if (!this._isEscapeKey(event) || !this._hasOpenSlot()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      this._suppressNextEscapeKeyup = true;
      this.closeAll({ focusTrigger: true });
    }

    _handleKeyUp(event) {
      if (!this._isEscapeKey(event)) {
        return;
      }

      if (this._suppressNextEscapeKeyup || this._hasOpenSlot()) {
        this._suppressNextEscapeKeyup = false;

        event.preventDefault();
        event.stopPropagation();

        if (this._hasOpenSlot()) {
          this.closeAll({ focusTrigger: true });
        }
      }
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

        const idx = slotState.activeIndex >= 0 ? slotState.activeIndex : 0;
        const chosen = slotState.filteredOptions[idx];

        if (chosen) {
          this.selectOption(slotState.key, chosen, { close: true, focusTrigger: true });
        }
      }
    }

    _handleDocumentClick(event) {
      if (!this.contains(event.target)) {
        this.closeAll({ focusTrigger: false });
      }
    }
  }

  class ByosPickerRegistry {
    constructor() {
      this.pickers = new Set();
      this._installCartAddGuard();
    }

    register(picker) {
      this.pickers.add(picker);
    }

    unregister(picker) {
      this.pickers.delete(picker);
    }

    findPickerForForm(form) {
      if (!form) {
        return null;
      }

      for (const picker of this.pickers) {
        if (picker.formId && picker.formId === form.id) {
          return picker;
        }

        if (picker.stickyFormId && picker.stickyFormId === form.id) {
          return picker;
        }

        if (form.contains(picker)) {
          return picker;
        }
      }

      return null;
    }

    validateForm(form) {
      const picker = this.findPickerForForm(form);

      if (!picker) {
        return true;
      }

      return picker.validate({ report: true, focus: true });
    }

    getState(formId) {
      for (const picker of this.pickers) {
        if (!formId || picker.formId === formId) {
          return picker.getState();
        }
      }

      return null;
    }

    setScents(scent1, scent2, formId) {
      for (const picker of this.pickers) {
        if (!formId || picker.formId === formId) {
          return picker.setScentsByName(scent1, scent2);
        }
      }

      return null;
    }

    _installCartAddGuard() {
      if (this._guardInstalled || typeof window.fetch !== 'function') {
        return;
      }

      this._guardInstalled = true;

      const originalFetch = window.fetch.bind(window);

      window.fetch = async (input, init) => {
        try {
          const url = typeof input === 'string' ? input : input?.url || '';
          const method = (init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();

          if (method === 'POST' && /\/cart\/add(\.js)?(\?|$)/.test(url) && this.pickers.size > 0) {
            if (init?.body && window.RusticByosCartHelper?.patchPayloadBody) {
              const patchedBody = window.RusticByosCartHelper.patchPayloadBody(init.body, url);

              if (patchedBody !== init.body) {
                init = { ...init, body: patchedBody };
              }
            }

            const blockedPicker = this._findViolatingCartAdd(init?.body);

            if (blockedPicker) {
              blockedPicker.validate({ report: true, focus: true });

              return new Response(
                JSON.stringify({
                  status: 422,
                  message: 'Missing required scent selections',
                  description: 'Please select Custom Scent 1 and Scent 2 before adding to cart.',
                }),
                { status: 422, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
        } catch (err) {
          console.warn('[BYOS] Cart add guard skipped:', err);
        }

        return originalFetch(input, init);
      };
    }

    _findViolatingCartAdd(body) {
      if (!body) {
        return null;
      }

      let variantId = '';
      const props = {};

      if (body instanceof FormData) {
        variantId = String(body.get('id') || '');

        for (const [k, v] of body.entries()) {
          const match = k.match(/^properties\[(.+)\]$/);

          if (match) {
            props[match[1]] = String(v || '').trim();
          }
        }
      } else if (typeof body === 'string') {
        try {
          const json = JSON.parse(body);

          if (Array.isArray(json.items) && json.items.length) {
            variantId = String(json.items[0].id || '');
            Object.assign(props, json.items[0].properties || {});
          } else {
            variantId = String(json.id || '');
            Object.assign(props, json.properties || {});
          }
        } catch (_) {
          const params = new URLSearchParams(body);
          variantId = String(params.get('id') || '');

          for (const [k, v] of params.entries()) {
            const match = k.match(/^properties\[(.+)\]$/);

            if (match) {
              props[match[1]] = String(v || '').trim();
            }
          }
        }
      }

      if (!variantId) {
        return null;
      }

      for (const picker of this.pickers) {
        if (picker.variantIds.size && !picker.variantIds.has(variantId)) {
          continue;
        }

        const keys = picker.config.propertyKeys || { scent1: 'Scent 1', scent2: 'Scent 2' };
        const has1 = Boolean(props[keys.scent1]);
        const has2 = Boolean(props[keys.scent2]);

        if (!has1 || !has2) {
          return picker;
        }
      }

      return null;
    }
  }

  window.RusticByosScentPicker = window.RusticByosScentPicker || new ByosPickerRegistry();

  if (!customElements.get('byos-scent-picker')) {
    customElements.define('byos-scent-picker', ByosScentPicker);
  }
})();
