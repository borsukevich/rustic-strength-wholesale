(function() {
  class LabDrawer extends HTMLElement {
    constructor() {
      super();

      if (this.parentElement !== document.body) {
        this.moveOutsideSection();
      }

      this.tabs = this.querySelectorAll("[data-pdp-lab-tab]");
      this.panels = this.querySelectorAll("[data-pdp-lab-panel]");
      this.overlay = this.querySelector(".lab-drawer__overlay");
      this.closeBtns = this.querySelectorAll("[data-close]");
      this.activeTrigger = null;

      this.initTabs();
      this.initEvents();
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
      if (this.overlay) {
        this.overlay.addEventListener("click", () => this.close());
      }

      this.closeBtns.forEach((btn) => {
        btn.addEventListener("click", () => this.close());
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && (this.classList.contains("is-open") || this.classList.contains("open"))) {
          this.close();
        }
      });
    }

    open(trigger) {
      this.activeTrigger = trigger;
      this.classList.add("is-open", "open");
      document.body.style.overflow = "hidden";

      const firstTab = this.querySelector("[data-pdp-lab-tab].is-active") || this.tabs[0];
      if (firstTab) {
        firstTab.focus();
      }
    }

    close() {
      this.classList.remove("is-open", "open");
      document.body.style.overflow = "";

      if (this.activeTrigger && typeof this.activeTrigger.focus === "function") {
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
        drawer.classList.add("is-open", "open");
        document.body.style.overflow = "hidden";
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
