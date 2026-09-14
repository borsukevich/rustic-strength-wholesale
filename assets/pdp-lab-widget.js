(function() {
  class LabDrawer extends HTMLElement {
    constructor() {
      super();

      this.tabs = this.querySelectorAll("[data-pdp-lab-tab]");
      this.panels = this.querySelectorAll("[data-pdp-lab-panel]");
      this.overlay = this.querySelector(".lab-drawer__overlay, .cart-drawer__overlay, .drawer__overlay");
      this.closeBtns = this.querySelectorAll(".drawer__close, [data-close]");
      this.activeTrigger = null;

      this.initTabs();
      this.initEvents();
    }

    connectedCallback() {
      if (this.parentElement !== document.body) {
        this.moveOutsideSection();
      }
    }

    moveOutsideSection() {
      if (this.parentElement === document.body) return;

      const existingDrawer = document.body.querySelector(`:scope > #${this.id}`);
      if (existingDrawer && existingDrawer !== this) {
        existingDrawer.remove();
      }

      document.body.appendChild(this);
    }

    initEvents() {
      this.addEventListener("keyup", (evt) => {
        if (evt.code === "Escape" && (this.classList.contains("active") || this.classList.contains("open"))) {
          this.close();
        }
      });

      this.addEventListener("click", (evt) => {
        if (evt.target === this || evt.target === this.overlay) {
          this.close();
        }
      });

      if (this.overlay) {
        this.overlay.addEventListener("click", () => this.close());
      }

      this.closeBtns.forEach((btn) => {
        btn.addEventListener("click", () => this.close());
      });
    }

    open(trigger) {
      if (trigger) this.activeTrigger = trigger;
      if (this.parentElement !== document.body) {
        this.moveOutsideSection();
      }
      const tabsWrapper = this.querySelector(".lab-drawer__tabs-wrapper");
      if (tabsWrapper) tabsWrapper.scrollLeft = 0;

      setTimeout(() => {
        this.classList.add("animate", "active", "open");
      });
      document.body.classList.add("overflow-hidden");

      this.addEventListener(
        "transitionend",
        () => {
          const containerToTrapFocusOn = this.querySelector(".drawer__inner");
          const focusElement = this.querySelector(".drawer__close") || this.querySelector(".drawer__inner");
          if (typeof trapFocus === "function" && containerToTrapFocusOn && focusElement) {
            trapFocus(containerToTrapFocusOn, focusElement);
          } else if (focusElement) {
            focusElement.focus();
          }
        },
        { once: true }
      );
    }

    close() {
      this.classList.remove("active", "open", "animate");
      document.body.classList.remove("overflow-hidden");

      if (typeof removeTrapFocus === "function" && this.activeTrigger) {
        removeTrapFocus(this.activeTrigger);
      } else if (this.activeTrigger && typeof this.activeTrigger.focus === "function") {
        this.activeTrigger.focus();
      }
    }

    initTabs() {
      this.tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          this.switchTab(tab);
        });

        tab.addEventListener("keydown", (e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const tabArray = Array.from(this.tabs);
            const currentIndex = tabArray.indexOf(tab);
            const nextIndex = e.key === "ArrowRight"
              ? (currentIndex + 1) % tabArray.length
              : (currentIndex - 1 + tabArray.length) % tabArray.length;

            tabArray[nextIndex].focus();
            this.switchTab(tabArray[nextIndex]);
          }
        });
      });
    }

    switchTab(selectedTab) {
      const targetCategory = selectedTab.dataset.targetTab;

      this.tabs.forEach((tab) => {
        const isSelected = tab === selectedTab;
        tab.setAttribute("aria-selected", isSelected ? "true" : "false");
        tab.setAttribute("tabindex", isSelected ? "0" : "-1");
        if (isSelected) {
          tab.classList.add("is-active");
        } else {
          tab.classList.remove("is-active");
        }
      });

      if (selectedTab && typeof selectedTab.scrollIntoView === "function") {
        selectedTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }

      let activeCoaUrl = "";
      this.panels.forEach((panel) => {
        if (panel.dataset.tabCategory === targetCategory) {
          panel.classList.add("is-active");
          panel.removeAttribute("hidden");
          activeCoaUrl = panel.dataset.coaUrl || "";
        } else {
          panel.classList.remove("is-active");
          panel.setAttribute("hidden", "");
        }
      });

      const ctaBtn = this.querySelector("[data-lab-drawer-cta]");
      if (ctaBtn) {
        if (activeCoaUrl) {
          ctaBtn.setAttribute("href", activeCoaUrl);
          ctaBtn.dataset.category = targetCategory;
          ctaBtn.removeAttribute("disabled");
          ctaBtn.style.pointerEvents = "auto";
          ctaBtn.style.opacity = "1";
        } else {
          ctaBtn.setAttribute("href", "#");
          ctaBtn.setAttribute("disabled", "disabled");
          ctaBtn.style.pointerEvents = "none";
          ctaBtn.style.opacity = "0.5";
        }
      }

      if (window.dataLayer) {
        window.dataLayer.push({
          event: "pdp_lab_tab_switch",
          category: targetCategory,
          product_title: this.dataset.productTitle || ""
        });
      }

      if (window.triplePixel) {
        window.triplePixel("pdp_lab_tab_switch", {
          category: targetCategory,
          product_title: this.dataset.productTitle || ""
        });
      }
    }
  }

  if (!window.customElements.get("lab-drawer")) {
    customElements.define("lab-drawer", LabDrawer);
  }

  document.addEventListener("click", function(e) {
    const trigger = e.target.closest("[data-pdp-lab-trigger]");
    if (trigger) {
      e.preventDefault();
      const drawerId = trigger.getAttribute("drawer-id") || trigger.getAttribute("aria-controls");
      const drawer = document.getElementById(drawerId);
      if (drawer && typeof drawer.open === "function") {
        drawer.open(trigger);
      } else if (drawer) {
        drawer.classList.add("animate", "active", "open");
        document.body.classList.add("overflow-hidden");
      }

      const productTitle = drawer?.dataset.productTitle || "";
      if (window.dataLayer) {
        window.dataLayer.push({
          event: "pdp_lab_badge_open",
          product_title: productTitle
        });
      }
      if (window.triplePixel) {
        window.triplePixel("pdp_lab_badge_open", {
          product_title: productTitle
        });
      }
    }

    const coaLink = e.target.closest("[data-coa-link]");
    if (coaLink) {
      const category = coaLink.dataset.category || "";
      const drawer = coaLink.closest("lab-drawer");
      const productTitle = drawer?.dataset.productTitle || "";
      if (window.dataLayer) {
        window.dataLayer.push({
          event: "pdp_lab_coa_click",
          category: category,
          product_title: productTitle,
          pdf_url: coaLink.getAttribute("href") || ""
        });
      }
      if (window.triplePixel) {
        window.triplePixel("pdp_lab_coa_click", {
          category: category,
          product_title: productTitle
        });
      }
    }
  });
})();
