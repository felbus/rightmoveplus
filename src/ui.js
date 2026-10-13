// Shared by the search and property pages: DOM helpers and the quick-look modal (details,
// gallery, map).
(() => {
  'use strict';

  const MEDIA = 'https://media.rightmove.co.uk/';

  // ---------------------------------------------------------------------------
  // Helpers

  const ICONS = {
    bed: '<path d="M3 18v-6.5A2.5 2.5 0 0 1 5.5 9h13a2.5 2.5 0 0 1 2.5 2.5V18M3 15h18M3 18v2M21 18v2M6 9V6.5A1.5 1.5 0 0 1 7.5 5h9A1.5 1.5 0 0 1 18 6.5V9"/>',
    bath: '<path d="M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3zM6 12V5.5A2.5 2.5 0 0 1 10.5 4M7 20l-1 2M17 20l1 2"/>',
    size: '<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    plan: '<path d="M4 4h16v16H4zM4 12h7M11 4v5M15 12v8M15 16h5"/>',
    video: '<path d="M4 6h11v12H4zM15 10l5-3v10l-5-3"/>',
    details: '<path d="M6 3h9l4 4v14H6zM9 11h7M9 15h7M9 7h3"/>',
    gallery: '<path d="M3 5h18v14H3z"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="9" r="1.5"/>',
    map: '<path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    list: '<path d="M4 5h16M4 12h16M4 19h16"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    prev: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
  };

  const TABS = [
    ['details', 'Details'],
    ['gallery', 'Gallery'],
    ['map', 'Map'],
  ];

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const child of children.flat()) if (child != null && child !== false) el.append(child);
    return el;
  }

  function icon(name) {
    const el = h('span', { class: 'rmx-icon', 'aria-hidden': 'true' });
    el.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`;
    return el;
  }

  function loader() {
    return h('div', { class: 'rmx-loader' }, h('span', { class: 'rmx-spinner' }));
  }

  function notice(text) {
    return h('div', { class: 'rmx-notice' }, text);
  }

  // Segmented control: options are [value, label, icon?].
  function segmented(options, value, onChange) {
    const buttons = options.map(([v, label, iconName]) =>
      h('button', { type: 'button', 'data-value': v, 'aria-pressed': String(v === value) },
        iconName && icon(iconName), label));
    const el = h('div', { class: 'rmx-seg' }, buttons);
    el.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === btn));
      onChange(btn.dataset.value);
    });
    return el;
  }

  const idFromHref = href => /\/properties\/(\d+)/.exec(href || '')?.[1] || null;

  // Search results give media paths like "property-photo/…/hash.jpeg"; the media server
  // serves fixed resized variants at /dir/…/hash_max_WxH.jpeg.
  function mediaUrl(path, size) {
    const full = /^https?:/.test(path) ? path : MEDIA + path;
    if (!size) return full;
    return full.replace(/^(https?:\/\/[^/]+\/)(?:dir\/)?/, '$1dir/').replace(/(\.\w+)$/, `_max_${size}$1`);
  }

  // ---------------------------------------------------------------------------
  // Modal

  const modal = { el: null, id: null, listing: null, tab: null, panes: {}, gallery: null, photo: null };
  const PANES = { details: renderDetails, gallery: renderGallery, map: renderMap };

  function buildModal() {
    modal.title = h('div', { class: 'rmx-modal__title' });
    modal.tabs = TABS.map(([tab, label]) =>
      h('button', { class: 'rmx-tab', type: 'button', role: 'tab', 'data-tab': tab, onclick: () => showTab(tab) },
        icon(tab), label));
    modal.pageLink = h('a', { class: 'rmx-btn', target: '_blank', rel: 'noopener' }, 'Open page', icon('external'));
    modal.body = h('div', { class: 'rmx-modal__body' });
    modal.el = h('div', { class: 'rmx-modal', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Property' },
      h('div', { class: 'rmx-modal__backdrop', onclick: closeModal }),
      h('div', { class: 'rmx-modal__panel', tabindex: '-1' },
        h('header', { class: 'rmx-modal__head' },
          modal.title,
          h('nav', { class: 'rmx-tabs', role: 'tablist' }, modal.tabs),
          h('div', { class: 'rmx-modal__tools' },
            modal.pageLink,
            h('button', { class: 'rmx-iconbtn', type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onclick: closeModal },
              icon('close')))),
        modal.body));
    document.body.append(modal.el);
  }

  // `listing` is the property's search result, if there is one: it fills the title, map and
  // gallery until the property page has been fetched. `photo` ({ set: 'photos' | 'plans',
  // index }) is where the gallery starts.
  function openModal(id, tab, { listing, photo } = {}) {
    if (!modal.el) buildModal();
    if (modal.id !== id) loadModal(id, listing);
    modal.photo = photo || null;
    document.documentElement.classList.add('rmx-modal-open');
    modal.el.hidden = false;
    showTab(tab);
    if (photo) modal.gallery?.go(photo);
    modal.el.querySelector('.rmx-modal__panel').focus();
  }

  function closeModal() {
    modal.el.hidden = true;
    document.documentElement.classList.remove('rmx-modal-open');
    loadModal(null); // drops the iframes so videos and maps stop
  }

  function loadModal(id, listing) {
    modal.id = id;
    modal.listing = listing || null;
    modal.tab = null;
    modal.panes = {};
    modal.gallery = null;
    modal.body.replaceChildren();
    modal.title.replaceChildren();
    if (id == null) return;
    modal.pageLink.href = `/properties/${id}`;
    // On the property's own page, Details and Open page would only show that page again.
    const here = idFromHref(location.pathname) === id;
    modal.pageLink.hidden = here;
    for (const b of modal.tabs) b.hidden = here && b.dataset.tab === 'details';
    if (listing) {
      const [price] = listing.price?.displayPrices || [];
      renderTitle(price?.displayPrice, listing.propertyTypeFullDescription, listing.displayAddress);
    } else {
      RMX.fetchProperty(id).then(pd => {
        if (modal.id === id) renderTitle(pd.prices?.primaryPrice, pd.text?.propertyPhrase, pd.address?.displayAddress);
      }).catch(() => {});
    }
  }

  function renderTitle(price, description, address) {
    modal.title.replaceChildren(
      h('strong', { class: 'rmx-modal__price' }, price || ''),
      h('span', { class: 'rmx-modal__desc' }, [description, address].filter(Boolean).join(' · ')));
  }

  function showTab(tab) {
    modal.tab = tab;
    for (const b of modal.tabs) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    if (!modal.panes[tab]) {
      const pane = h('section', { class: `rmx-pane rmx-pane--${tab}`, role: 'tabpanel' });
      modal.panes[tab] = pane;
      modal.body.append(pane);
      PANES[tab](pane, modal.id);
    }
    for (const [name, pane] of Object.entries(modal.panes)) pane.hidden = name !== tab;
  }

  function onKey(e) {
    if (!modal.el || modal.el.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    } else if (modal.tab === 'gallery' && modal.gallery && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      modal.gallery.step(e.key === 'ArrowRight' ? 1 : -1);
    }
  }

  function renderDetails(pane, id) {
    const spinner = loader();
    const frame = h('iframe', { class: 'rmx-frame', src: `/properties/${id}`, title: 'Property details' });
    frame.addEventListener('load', () => {
      spinner.remove();
      // Same-origin frame: keep Esc working while focus is inside it.
      try {
        frame.contentWindow.addEventListener('keydown', onKey);
      } catch {}
    });
    pane.append(spinner, frame);
  }

  function renderMap(pane, id) {
    const loc = modal.listing?.location;
    if (loc?.latitude) {
      drawMap(pane, loc);
      return;
    }
    pane.append(loader());
    RMX.fetchProperty(id)
      .then(pd => {
        pane.replaceChildren();
        if (pd.location?.latitude) drawMap(pane, pd.location);
        else pane.append(notice('This listing has no map location.'));
      })
      .catch(() => pane.replaceChildren(notice('Couldn’t load the location for this property.')));
  }

  function drawMap(pane, { latitude: lat, longitude: lng }) {
    const src = type => `https://maps.google.com/maps?q=${lat},${lng}&z=16&t=${type}&output=embed`;
    const frame = h('iframe', { class: 'rmx-frame', src: src('m'), title: 'Map', referrerpolicy: 'no-referrer-when-downgrade' });
    const link = (label, href) =>
      h('a', { class: 'rmx-btn', href, target: '_blank', rel: 'noopener' }, label, icon('external'));
    pane.append(frame, h('div', { class: 'rmx-mapbar' },
      segmented([['m', 'Map'], ['k', 'Satellite']], 'm', type => { frame.src = src(type); }),
      link('Street View', `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`),
      link('Google Maps', `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`)));
  }

  function renderGallery(pane, id) {
    pane.append(loader());
    RMX.fetchProperty(id)
      .then(pd => [pd, {
        photos: (pd.images || []).map(i => ({ src: i.url, thumb: mediaUrl(i.url, '296x197'), caption: i.caption })),
        plans: (pd.floorplans || []).filter(f => f.url).map(f => ({ src: f.url, thumb: mediaUrl(f.url, '296x197'), caption: f.caption })),
      }])
      .catch(() => [null, { // fall back to the photos in the search results
        photos: (modal.listing?.images || []).map(i => ({ src: mediaUrl(i.url), thumb: mediaUrl(i.url, '296x197'), caption: i.caption })),
        plans: [],
      }])
      .then(([pd, sets]) => {
        if (modal.id !== id) return;
        pane.replaceChildren();
        const info = galleryInfo(pd, modal.listing);
        if (!sets.photos.length && !sets.plans.length) pane.append(h('div', { class: 'rmx-gallery' }, info, notice('No photos for this property.')));
        else buildGallery(pane, sets, info);
      });
  }

  // Above the photos: the estate agent, the land in acres, and whether the listing says open
  // plan or modern (Style), as on the grid cards.
  function galleryInfo(pd, listing) {
    if (!pd && !listing) return null;
    const field = (label, value) =>
      h('div', { class: 'rmx-gallery__field' }, h('span', { class: 'rmx-gallery__label' }, label), value);
    const agent = agentName(pd?.customer || listing?.customer);
    return h('div', { class: 'rmx-gallery__info' },
      agent && field('Agent', h('strong', null, agent)),
      field('Land', acresBadges(RMX.propertyAcres(pd, listing))),
      field('Style', featureBadges(RMX.propertyFeatures(pd, listing))));
  }

  const agentName = customer => customer?.branchDisplayName || customer?.companyName || customer?.brandTradingName;

  // Elements for the land: highlighted amounts in acres (hover one for the sentence it came
  // from), or a note that there are none. `checking`: the description hasn't been read yet.
  function acresBadges(acres, checking) {
    const amounts = acres.filter(a => a.amount);
    if (amounts.length) return amounts.map(a => h('span', { class: 'rmx-acres', title: a.context }, a.amount));
    if (checking) return [h('span', { class: 'rmx-acres-none' }, 'Checking details…')];
    if (acres.length) return [h('span', { class: 'rmx-acres rmx-acres--mention', title: acres[0].context }, '“Acre” mentioned, no amount')];
    return [h('span', { class: 'rmx-acres-none' }, 'No acres mentioned')];
  }

  // Elements for the style: the features the listing mentions ("Open plan", "Modern"),
  // highlighted (hover one for the sentences), or a note that there are none.
  function featureBadges(features, checking) {
    const found = features.filter(f => f.mentions.length);
    if (found.length) return found.map(f => h('span', { class: 'rmx-acres', title: f.mentions.join('\n\n') }, f.name));
    if (checking) return [h('span', { class: 'rmx-acres-none' }, 'Checking details…')];
    return [h('span', { class: 'rmx-acres-none' }, 'Not mentioned')];
  }

  function buildGallery(pane, sets, info) {
    let items = [];
    let index = 0;
    const img = h('img', { class: 'rmx-gallery__img', alt: '', onclick: () => step(1) });
    const counter = h('div', { class: 'rmx-gallery__counter' });
    const caption = h('div', { class: 'rmx-gallery__caption' });
    const stage = h('div', { class: 'rmx-gallery__stage' },
      img, counter, caption,
      h('button', { class: 'rmx-gallery__nav rmx-gallery__nav--prev', type: 'button', 'aria-label': 'Previous photo', onclick: () => step(-1) }, icon('prev')),
      h('button', { class: 'rmx-gallery__nav rmx-gallery__nav--next', type: 'button', 'aria-label': 'Next photo', onclick: () => step(1) }, icon('next')));
    const thumbs = h('div', { class: 'rmx-gallery__thumbs' });
    thumbs.addEventListener('click', e => {
      const t = e.target.closest('[data-index]');
      if (t) show(Number(t.dataset.index));
    });

    const setOptions = [];
    if (sets.photos.length) setOptions.push(['photos', `Photos ${sets.photos.length}`, 'gallery']);
    if (sets.plans.length) setOptions.push(['plans', `Floorplans ${sets.plans.length}`, 'plan']);
    const switcher = setOptions.length > 1 && segmented(setOptions, setOptions[0][0], name => useSet(name));

    function useSet(name, start = 0) {
      items = sets[name];
      stage.classList.toggle('is-plan', name === 'plans');
      thumbs.replaceChildren(...items.map((item, i) =>
        h('button', { class: 'rmx-thumb', type: 'button', 'data-index': i, 'aria-label': `Photo ${i + 1}` },
          h('img', { src: item.thumb, alt: '', loading: 'lazy' }))));
      show(start);
    }

    function show(i) {
      index = (i + items.length) % items.length;
      const item = items[index];
      img.src = item.src;
      counter.textContent = `${index + 1} / ${items.length}`;
      caption.textContent = item.caption && !/^picture no\.?\s*\d+$/i.test(item.caption) ? item.caption : '';
      caption.hidden = !caption.textContent;
      for (const t of thumbs.children) t.setAttribute('aria-current', String(Number(t.dataset.index) === index));
      thumbs.children[index]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      for (const n of [index + 1, index - 1]) new Image().src = items[(n + items.length) % items.length].src;
    }

    function step(delta) {
      show(index + delta);
    }

    // Jumps to a photo or floorplan, e.g. one clicked on the page behind the modal.
    function go({ set, index: start = 0 } = {}) {
      if (!sets[set]?.length) [set, start] = [setOptions[0][0], 0];
      if (switcher) for (const b of switcher.children) b.setAttribute('aria-pressed', String(b.dataset.value === set));
      useSet(set, start);
    }

    pane.append(h('div', { class: 'rmx-gallery' },
      info,
      stage,
      h('div', { class: 'rmx-gallery__bar' }, switcher, thumbs)));
    modal.gallery = { step, go };
    go(modal.photo || {});
  }

  document.addEventListener('keydown', onKey, true);

  Object.assign(globalThis.RMX, { TABS, h, icon, segmented, idFromHref, mediaUrl, openModal, agentName, acresBadges, featureBadges });
})();
