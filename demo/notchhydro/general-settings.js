(() => {
  'use strict';

  const styles = [
    ['full', '倒计时', 'Countdown'],
    ['compact', '百分比', 'Percentage'],
    ['iconOnly', '纯图标', 'Icon only']
  ];
  const websiteURL = 'https://tudou152.github.io/Sipmetra-websites/';
  const termsURL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
  const subscriptionsURL = 'https://apps.apple.com/account/subscriptions';
  const version = 'v1.6 (Build 2026.11)';
  const external = (url, label) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  window.NotchHydroGeneralSettings = class GeneralSettings {
    constructor(owner) {
      this.owner = owner;
      this.root = document.createElement('div');
      this.root.className = 'ns-general';
      this.root.innerHTML = `<div class="ns-g-scroll"><div class="ns-content ns-g-sections"></div></div>
        <section class="ns-g-dialog" role="dialog" aria-modal="true" aria-labelledby="ns-g-dialog-title" hidden></section>`;
      this.sections = this.root.querySelector('.ns-g-sections');
      this.scroller = this.root.querySelector('.ns-g-scroll');
      this.dialog = this.root.querySelector('.ns-g-dialog');
      this.membership = null;
      this.plan = 'lifetime';

      this.root.addEventListener('change', event => {
        const field = event.target;
        if (field.dataset.gToggle) this.owner.setGeneralOption(field.dataset.gToggle, field.checked);
        else if (field.hasAttribute('data-g-language')) {
          const scroll = this.scroller.scrollTop;
          this.owner.setGeneralOption('language', field.value);
          this.sync();
          this.scroller.scrollTop = scroll;
          this.sections.querySelector('[data-g-language]').focus({ preventScroll:true });
        }
        this.sync();
      });
      this.root.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button && !button.disabled) this.click(button);
      });
      this.dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) this.handleEscape();
        } else if (event.key === 'Tab') {
          const items = this.dialog.querySelectorAll('button:not(:disabled), a[href]');
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey && event.target === first || !event.shiftKey && event.target === last) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
          }
        }
      });
    }

    t(zh, en) { return this.owner.text(zh, en); }

    privacyPolicyLink() {
      const page = this.t('privacy.html', 'privacy-en.html');
      return external(websiteURL + page, this.t('隐私政策', 'Privacy policy'));
    }

    renderSections() {
      const t = (zh, en) => this.t(zh, en);
      const website = this.owner.scene === 'website';
      const toggle = (key, zh, en) => `<label class="ns-toggle"><span>${t(zh,en)}</span>
        <input type="checkbox" role="switch" name="${key}" data-g-toggle="${key}"></label>`;
      const h = (id, zh, en) => `<div class="ns-heading"><h2 id="${id}">${t(zh,en)}</h2></div>`;
      this.sections.innerHTML = `
        <section aria-labelledby="ns-g-style-title">
          <div class="ns-heading"><h2 id="ns-g-style-title">${t('菜单栏样式','Menu bar style')}</h2>
            ${toggle('monochromeMenuBar','单色图标','Monochrome')}</div>
          <div class="ns-g-styles" role="group" aria-labelledby="ns-g-style-title">${styles.map(([style,zh,en]) =>
            `<button type="button" data-g-style="${style}" aria-label="${t(zh,en)}" title="${t(zh,en)}">
              <span class="ns-g-preview"><img class="ns-g-badge" alt="" aria-hidden="true">
                ${!website && style === 'iconOnly' ? '<span class="ns-g-pro-tag" aria-hidden="true">PRO</span>' : ''}</span>
              <span class="ns-g-caption">${t(zh,en)}<span class="ns-g-style-check" aria-hidden="true">✓</span></span>
            </button>`).join('')}</div>
          ${toggle('showDockIcon','在 Dock 中显示','Show in Dock')}
          ${toggle('launchAtLogin','开机启动','Launch at login')}
          ${toggle('belowNotchOffset','下移显示','Lower panel')}
        </section>
        <section aria-labelledby="ns-g-interaction-title">${h('ns-g-interaction-title','交互','Interaction')}
          ${toggle('autoResetCountdownOnLogging','注水时自动重置倒计时','Reset countdown after pouring')}
          <button type="button" class="ns-g-disclosure" data-g-open="shortcuts" aria-haspopup="dialog">
            <span>${t('快捷键','Keyboard shortcuts')}</span><i aria-hidden="true"></i></button>
        </section>
        <section aria-labelledby="ns-g-region-title">${h('ns-g-region-title','语言与地区','Language & region')}
          <label class="ns-g-row"><span>${t('界面语言','Language')}</span>
            <select data-g-language><option value="zh">简体中文</option><option value="en">English</option></select></label>
          <div class="ns-g-row"><span id="ns-g-week-title">${t('每周起始日','Week starts on')}</span>
            <div class="ns-g-segments" role="group" aria-labelledby="ns-g-week-title">
              <button type="button" data-g-week="monday">${t('周一','Monday')}</button>
              <button type="button" data-g-week="sunday">${t('周日','Sunday')}</button></div></div>
        </section>
        <section class="ns-g-member-card" aria-labelledby="ns-g-member-title" ${website ? 'hidden' : ''}>
          <div class="ns-heading"><h2 id="ns-g-member-title"></h2>
            <button type="button" class="ns-g-primary" data-g-open="pro" aria-haspopup="dialog"></button></div>
          <p class="ns-g-member-detail"></p>
          <p class="ns-g-renewal" hidden></p>
          <div class="ns-g-links">
            <button type="button" data-g-restore>${t('恢复购买','Restore purchases')}</button>
            ${external(subscriptionsURL,t('管理订阅','Manage subscriptions'))}</div>
          <p class="ns-g-feedback" role="status" hidden></p>
        </section>
        <footer class="ns-g-footer"><div>${this.privacyPolicyLink()}
          ${external(termsURL,t('使用条款','Terms of use'))}</div>
          ${website ? '' : `<button type="button" data-g-open="about" aria-haspopup="dialog">NotchHydro ${version} · ${t('关于','About')}</button>`}</footer>`;
    }

    sync() {
      const options = this.owner.generalOptions;
      const languageChanged = this.english !== this.owner.english;
      if (languageChanged) {
        this.english = this.owner.english;
        this.renderSections();
      }
      if (this.page) {
        const remounted = this.backgroundPanel !== this.root.parentElement;
        if (remounted || languageChanged) this.blockBackground();
        const newAmounts = this.owner.dailyOptions.quickAmounts.join(',');
        if (languageChanged || this.page === 'shortcuts' && this.displayedAmounts !== newAmounts) {
          const scroll = this.dialog.querySelector('.ns-g-dialog-body').scrollTop;
          const focused = this.dialog.contains(this.owner.shadowRoot.activeElement);
          this.renderDialog();
          this.dialog.querySelector('.ns-g-dialog-body').scrollTop = scroll;
          if (focused) this.dialog.querySelector('[data-g-close]').focus({ preventScroll:true });
        }
      }
      for (const toggle of this.sections.querySelectorAll('[data-g-toggle]')) toggle.checked = options[toggle.dataset.gToggle];
      this.sections.querySelector('[data-g-language]').value = this.english ? 'en' : 'zh';
      for (const b of this.sections.querySelectorAll('[data-g-style]')) {
        b.setAttribute('aria-pressed', String(b.dataset.gStyle === options.menuBarStyle));
        const image = b.querySelector('img');
        const preview = window.NotchHydroMenuBarPreviews?.[b.dataset.gStyle]?.[options.monochromeMenuBar ? 'monochrome' : 'color'];
        image.alt = preview ? '' : b.title;
        if (preview && image.getAttribute('src') !== preview.src) {
          image.src = preview.src;
          image.width = preview.width;
          image.height = preview.height;
        }
        const proTag = b.querySelector('.ns-g-pro-tag');
        if (proTag) {
          proTag.hidden = Boolean(this.membership);
          b.setAttribute('aria-label', b.title + (this.membership ? '' : ' · Pro'));
        }
      }
      for (const b of this.sections.querySelectorAll('[data-g-week]')) {
        b.setAttribute('aria-pressed', String((b.dataset.gWeek === 'monday') === options.weekStartsOnMonday));
      }
      const membershipLabels = {
        lifetime:this.t('终身会员','Lifetime membership'),
        trial:this.t('永久会员试用','Lifetime membership trial'),
        annual:this.t('年度会员','Annual membership')
      };
      this.sections.querySelector('#ns-g-member-title').textContent = membershipLabels[this.membership] || 'NotchHydro Pro';
      const detail = this.sections.querySelector('.ns-g-member-detail');
      detail.hidden = !this.membership;
      detail.textContent = this.membership === 'lifetime' ? this.t('永久有效 · 模拟购买','Yours forever · Demo purchase') :
        this.membership === 'trial' ? this.t('7 天体验 · 模拟购买','7-day trial · Demo purchase') : this.t('按年订阅 · 模拟购买','Yearly subscription · Demo purchase');
      const pro = this.sections.querySelector('[data-g-open=pro]');
      pro.hidden = this.membership === 'lifetime';
      pro.textContent = this.membership ? this.t('升级终身','Get lifetime') : this.t('解锁 Pro','Get Pro');
      const renewal = this.sections.querySelector('.ns-g-renewal');
      renewal.hidden = !(this.membership === 'lifetime' && this.annualActive);
      if (!renewal.hidden) renewal.textContent = this.t('此演示中的年度订阅仍在续订。','The demo annual subscription still renews.');
    }

    click(button) {
      const data = button.dataset;
      if (data.gStyle) {
        if (data.gStyle === 'iconOnly' && this.owner.scene !== 'website' && !this.membership) {
          this.requestIconOnly = true;
          this.open('pro', button);
        } else this.owner.setGeneralOption('menuBarStyle', data.gStyle);
      } else if (data.gWeek) this.owner.setGeneralOption('weekStartsOnMonday', data.gWeek === 'monday');
      else if (data.gOpen) this.open(data.gOpen, button);
      else if ('gClose' in data) this.close();
      else if (data.gPlan) {
        if (this.plan === data.gPlan) return;
        this.plan = data.gPlan;
        for (const plan of this.dialog.querySelectorAll('[data-g-plan]')) {
          plan.setAttribute('aria-pressed', String(plan.dataset.gPlan === this.plan));
        }
        this.dialog.querySelector('.ns-p-order').innerHTML = this.purchaseActions();
      } else if (data.gPurchase) {
        if (data.gPurchase === 'annual') this.annualActive = true;
        this.membership = data.gPurchase;
        this.sections.querySelector('.ns-g-feedback').hidden = true;
        if (this.requestIconOnly) this.owner.setGeneralOption('menuBarStyle', 'iconOnly');
        this.close();
      } else if ('gRestore' in data) {
        const message = button.closest('section').querySelector('[role=status]');
        message.textContent = this.membership ? this.t('已恢复本次预览的会员。','Demo membership restored.') :
          this.t('本次预览暂无可恢复的购买。','No demo purchases to restore.');
        message.hidden = false;
      }
      this.sync();
    }

    unblockBackground() {
      for (const node of this.blocked || []) node.inert = false;
      this.blocked = [];
      this.backgroundPanel = null;
    }

    blockBackground() {
      this.unblockBackground();
      this.backgroundPanel = this.root.parentElement;
      for (let child = this.dialog; child.parentElement && !child.matches('.nh-shell'); child = child.parentElement) {
        for (const sibling of child.parentElement.children) {
          if (sibling !== child && !sibling.inert && !sibling.hidden) {
            sibling.inert = true;
            this.blocked.push(sibling);
          }
        }
      }
    }

    open(page, button) {
      if (!this.page) {
        this.triggerSelector = button.dataset.gStyle ? '[data-g-style=iconOnly]' : '[data-g-open=' + page + ']';
        this.blockBackground();
        this.dialog.hidden = false;
        this.plan = 'lifetime';
      }
      this.page = page;
      this.renderDialog();
      this.dialog.querySelector('[data-g-close]').focus({ preventScroll:true });
    }

    purchaseContent() {
      const t = (zh, en) => this.t(zh, en);
      const plans = [
        ['lifetime', t('终身会员', 'Lifetime'), '¥18', t('一次付费', 'Pay once')],
        ['annual', t('年度会员', 'Annual'), '¥12', t('/ 年', '/ year')]
      ];
      return `<div class="ns-p-brand"><img src="assets/pro-app-icon.png" width="41" height="41" alt="">
          <h2 id="ns-g-dialog-title">NotchHydro <span>Pro</span></h2></div>
        <ul class="ns-p-perks" aria-label="${t('会员权益','Pro features')}">
          <li>${t('完整历史与月度、年度趋势','Full history and monthly & yearly trends')}</li>
          <li>${t('无限自定义饮品与 CSV 导出','Unlimited custom drinks and CSV export')}</li>
          <li>${t('会议与专注模式智能静默','Silence reminders in meetings and Focus')}</li>
          <li class="${this.requestIconOnly ? 'ns-p-gated-perk' : ''}">${t('菜单栏纯图标模式','Icon-only menu bar')}</li></ul>
        <h3 id="ns-p-plan-title">${t('选择方案', 'Choose a plan')}</h3>
        <div class="ns-p-plans" role="group" aria-labelledby="ns-p-plan-title">
          ${plans.map(([id, name, price, term]) => `<button type="button" data-g-plan="${id}" aria-pressed="${this.plan === id}">
            <span class="ns-p-plan-name">${name}</span><i aria-hidden="true"></i>
            <span class="ns-p-price"><strong>${price}</strong><span>${term}</span></span>
          </button>`).join('')}</div>
        <div class="ns-p-order">${this.purchaseActions()}</div>`;
    }

    purchaseActions() {
      const t = (zh, en) => this.t(zh, en);
      const lifetime = this.plan === 'lifetime';
      const startTrial = lifetime && !this.membership;
      const manageAnnual = !lifetime && this.membership === 'annual';
      let disclosure;
      if (startTrial) {
        disclosure = t('7 天后恢复免费版，保留记录，不扣费。每个 App Store 账户限试一次。',
          'One trial per App Store account. After 7 days, you return to Free and keep your records. No automatic charge.');
      } else if (manageAnnual) {
        disclosure = t('你正在使用年度会员，可在 App Store 查看续订日期或取消续订。',
          'Your annual membership is active. View the renewal date or cancel in the App Store.');
      } else if (!lifetime) {
        disclosure = t('试用 7 天后自动扣取 ¥12，此后每年续订。可在试用结束前至少 24 小时取消订阅。试用资格以 App Store 为准。',
          'After 7 days, you’ll be charged ¥12 per year until you cancel. Cancel in Manage subscriptions at least 24 hours before the trial ends. The App Store confirms eligibility.');
      } else if (this.annualActive) {
        disclosure = t('买断后永久使用 Pro。已有的年度订阅仍会续订，可在「管理订阅」中关闭。',
          'Buying lifetime gives you permanent access. Your annual subscription keeps renewing until you cancel it in Manage subscriptions.');
      } else {
        disclosure = t('你正在试用 Pro。支付 ¥18 即可永久使用全部会员功能。',
          'Your Pro trial is active. A one-time ¥18 purchase gives you permanent access.');
      }
      const action = startTrial ? t('免费试用 7 天', 'Try free for 7 days') : lifetime ?
        t('买断终身会员 · ¥18', 'Buy lifetime · ¥18') : t('免费试用 7 天并订阅', 'Try 7 days free and subscribe');
      return `<div class="ns-p-checkout"><p id="ns-p-billing">${disclosure}</p>
          ${manageAnnual ? `<a class="ns-g-primary ns-g-buy" href="${subscriptionsURL}" target="_blank" rel="noopener noreferrer" aria-describedby="ns-p-billing">${t('管理年度订阅','Manage annual subscription')}</a>` :
            `<button class="ns-g-primary ns-g-buy" type="button" data-g-purchase="${startTrial ? 'trial' : this.plan}" aria-describedby="ns-p-billing">${action}</button>`}
          ${startTrial ? `<button class="ns-g-buy-alt" type="button" data-g-purchase="lifetime">${t('直接买断 · ¥18','Buy lifetime now · ¥18')}</button>` : ''}
        </div>
        <footer class="ns-p-footer"><div class="ns-g-links">
          <button type="button" data-g-restore>${t('恢复购买','Restore purchases')}</button>
          ${manageAnnual ? '' : external(subscriptionsURL,t('管理订阅','Manage subscriptions'))}</div>
          <div class="ns-g-legal">${this.privacyPolicyLink()}
            ${external(termsURL,t('使用条款','Terms of use'))}</div></footer>
        <p class="ns-g-feedback" role="status" hidden></p>`;
    }

    renderDialog() {
      const t = (zh, en) => this.t(zh, en);
      const titles = { shortcuts:t('快捷键','Keyboard shortcuts'), about:t('关于','About') };
      let content = '';
      if (this.page === 'shortcuts') {
        this.displayedAmounts = this.owner.dailyOptions.quickAmounts.join(',');
        const rows = [
          ['⌥ W', t('展开 / 收起','Open / close panel')],
          ...this.owner.dailyOptions.quickAmounts.map((amount,index) =>
            ['⌥ ' + (index + 1), t('记录 ', 'Record ') + amount + ' ml']),
          ['⌥ → / ⌥ Tab', t('下一个饮品','Next drink')],
          ['⌥ ← / ⌥ ⇧ Tab', t('上一个饮品','Previous drink')],
          ['⌥ ,', t('偏好设置','Preferences')], ['⌥ S',t('统计洞察','Statistics')],
          ['Esc',t('收起面板','Close panel')]
        ];
        content = `<dl class="ns-g-shortcuts">${rows.map(([keys,name]) => `<div><dt><kbd>${keys}</kbd></dt><dd>${name}</dd></div>`).join('')}</dl>
          <p class="ns-g-note">${t('预览页面内可用 ⌥ W，其余按键在记录面板展开时生效。','Use ⌥ W on this preview page. Other shortcuts work while the recording panel is open.')}</p>`;
      } else if (this.page === 'about') {
        content = `<div class="ns-g-about"><strong>NotchHydro</strong><p>${version}</p>
          <p>${t('轻松记录饮水，按时补充水分。','Track your drinks. Stay hydrated.')}</p></div>`;
      } else {
        content = this.purchaseContent();
      }
      const close = t('返回', 'Back');
      const heading = this.page === 'pro' ? `<span class="ns-p-demo">${t('购买预览 · 不会扣款','Purchase preview · No charge')}</span>` :
        `<h2 id="ns-g-dialog-title">${titles[this.page]}</h2>`;
      this.dialog.innerHTML = `<div class="ns-g-dialog-heading"><button type="button" class="nh-tool" data-g-close aria-label="${close}" title="${close}">
          <img src="${window.NotchHydroInsightsSymbols.back.src}" width="12" height="12" alt=""></button>
          ${heading}</div><div class="ns-g-dialog-body" data-page="${this.page}">${content}</div>`;
    }

    close(restoreFocus = true) {
      if (!this.page) return;
      this.page = null;
      this.requestIconOnly = false;
      this.dialog.hidden = true;
      this.dialog.replaceChildren();
      this.unblockBackground();
      if (restoreFocus) {
        this.sync();
        const trigger = this.sections.querySelector(this.triggerSelector);
        const target = trigger && !trigger.hidden ? trigger : this.sections.querySelector('[data-g-restore]');
        target.focus({ preventScroll:true });
      }
      this.triggerSelector = null;
    }

    handleEscape() {
      if (!this.page) return false;
      this.close();
      return true;
    }

    hide() { this.close(false); }
  };
})();
