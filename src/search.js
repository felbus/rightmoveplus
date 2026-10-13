// Rightmove Plus on search pages: grid view for the results, and Details, Gallery and Map
// buttons that open the quick-look modal (ui.js) instead of navigating to the property page.
(() => {
  'use strict';

  // Search pages are a Next.js app; property pages are not (see property.js).
  if (window.top !== window || !document.getElementById('__NEXT_DATA__')) return;

  const { TABS, h, icon, segmented, idFromHref, mediaUrl, openModal, agentName, acresBadges, featureBadges, propertyAcres, propertyFeatures } = RMX;

  const VIEW_KEY = 'rmx:view';
  const SEARCH_API = '/api/property-search/listing/search';

  const initialUrl = location.href;
  const initialData = readNextData();

  const state = {
    view: localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid',
    url: null,          // URL the current results were requested for
    status: 'idle',     // idle | loading | ready | error
    props: [],          // results shown in the grid, in page order
    byId: new Map(),    // every property on the page, by id
    channel: initialData?.searchParameters?.channel || null,
    request: null,
  };

  // ---------------------------------------------------------------------------
  // Search results data

  function readNextData() {
    try {
      const data = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
      return data.props.pageProps.searchResults || null;
    } catch {
      return null;
    }
  }

  // Pagination and filters are client-side: the page fetches the same JSON API with the
  // URL's query string, so we do too. The API insists on a channel.
  function apiQuery() {
    const q = new URLSearchParams(location.search);
    if (!q.has('channel')) {
      const channel = state.channel || (/to-rent/.test(location.pathname) ? 'RENT' : 'BUY');
      q.set('channel', channel);
      if (!q.has('transactionType')) q.set('transactionType', channel === 'RENT' ? 'LETTING' : 'BUY');
    }
    return `?${q}`;
  }

  async function load() {
    const url = (state.url = location.href);
    state.request?.abort();
    if (url === initialUrl && initialData) {
      setResults(initialData);
      return;
    }
    state.status = 'loading';
    renderGrid();
    const request = (state.request = new AbortController());
    try {
      const res = await fetch(SEARCH_API + apiQuery(), {
        signal: request.signal,
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (state.url === url) setResults(data);
    } catch (err) {
      if (err.name === 'AbortError' || state.url !== url) return;
      console.warn('[Rightmove Plus] Could not load results for the grid; showing the list.', err);
      state.status = 'error';
      state.props = [];
      sync();
    }
  }

  function setResults(data) {
    const all = data.properties || [];
    state.byId = new Map(all.map(p => [String(p.id), p]));
    state.props = all.filter(p => !p.featuredProperty);
    state.channel = data.searchParameters?.channel || state.channel;
    state.status = 'ready';
    renderGrid();
    sync();
  }

  // ---------------------------------------------------------------------------
  // Page integration

  let grid = null;
  let toolbar = null;

  function sync() {
    const root = document.documentElement;
    const list = document.getElementById('l-searchResults');
    if (!list) {
      root.classList.remove('rmx-grid-on');
      grid?.remove();
      return;
    }
    if (location.href !== state.url) load();

    mountToolbar(list);
    const showGrid = state.view === 'grid' && state.status !== 'error' && state.props.length > 0;
    root.classList.toggle('rmx-grid-on', showGrid);
    if (showGrid) {
      if (list.nextElementSibling !== gridEl()) list.after(gridEl());
    } else {
      decorateNativeCards(list);
    }
  }

  function mountToolbar(list) {
    toolbar ||= h('div', { class: 'rmx-toolbar' },
      segmented([['list', 'List', 'list'], ['grid', 'Grid', 'grid']], state.view, view => {
        state.view = view;
        localStorage.setItem(VIEW_KEY, view);
        sync();
      }));
    const header = list.parentElement.querySelector('[class*="ResultsHeader_resultsHeader"]');
    if (header) {
      if (toolbar.parentElement !== header) header.append(toolbar);
    } else if (toolbar.nextElementSibling !== list) {
      list.before(toolbar);
    }
  }

  function gridEl() {
    return (grid ||= h('div', { id: 'rmx-grid', class: 'rmx-grid' }));
  }

  function renderGrid() {
    const el = gridEl();
    el.classList.toggle('is-loading', state.status === 'loading');
    if (state.status === 'ready' && el.rendered !== state.props) {
      for (const old of el.children) landObserver.unobserve(old);
      el.replaceChildren(...state.props.map(card));
      el.rendered = state.props;
    }
  }

  function card(p) {
    const id = String(p.id);
    const href = p.propertyUrl || `/properties/${id}`;
    const image = p.images?.[0];
    const [price, altPrice] = p.price?.displayPrices || [];
    const update = p.addedOrReduced || '';
    const reduced = /^reduced/i.test(update);
    const isNew = !reduced && /today|yesterday/i.test(update);
    const title = (p.propertyTypeFullDescription || 'Property').replace(/\s+(for sale|to rent)$/i, '');
    const tenure = p.tenure?.tenureType && p.tenure.tenureType !== 'NOT_SPECIFIED'
      ? p.tenure.tenureType.charAt(0) + p.tenure.tenureType.slice(1).toLowerCase().replace(/_/g, ' ')
      : null;
    const agent = agentName(p.customer);
    const land = h('div', { class: 'rmx-card__row' });
    const style = h('div', { class: 'rmx-card__row' });
    const showLand = (pd, checking) => {
      land.replaceChildren(h('span', { class: 'rmx-card__label' }, 'Land'), ...acresBadges(propertyAcres(pd, p), checking));
      style.replaceChildren(h('span', { class: 'rmx-card__label' }, 'Style'), ...featureBadges(propertyFeatures(pd, p), checking));
    };
    showLand(null, true);

    let prefetch;
    const el = h('article', {
      class: 'rmx-card',
      'data-rmx-id': id,
      onpointerenter: () => { prefetch = setTimeout(() => RMX.fetchProperty(id).catch(() => {}), 250); },
      onpointerleave: () => clearTimeout(prefetch),
    },
      h('a', { class: 'rmx-card__media', href, 'data-rmx-open': 'details' },
        image
          ? h('img', { src: mediaUrl(image.url, '656x437'), alt: '', loading: 'lazy', decoding: 'async' })
          : h('span', { class: 'rmx-card__noimg' }, 'No photo'),
        h('span', { class: 'rmx-badges' },
          p.displayStatus && h('span', { class: 'rmx-badge rmx-badge--status' }, p.displayStatus),
          reduced && h('span', { class: 'rmx-badge rmx-badge--reduced' }, 'Reduced'),
          isNew && h('span', { class: 'rmx-badge rmx-badge--new' }, 'New')),
        h('span', { class: 'rmx-pills' },
          p.numberOfImages > 0 && h('span', { class: 'rmx-pill' }, icon('camera'), String(p.numberOfImages)),
          p.numberOfFloorplans > 0 && h('span', { class: 'rmx-pill', title: 'Floorplan' }, icon('plan')),
          p.numberOfVirtualTours > 0 && h('span', { class: 'rmx-pill', title: 'Virtual tour' }, icon('video')))),
      h('div', { class: 'rmx-card__body' },
        h('div', { class: 'rmx-card__price' },
          price?.displayPrice || 'POA',
          price?.displayPriceQualifier && h('span', { class: 'rmx-card__qualifier' }, price.displayPriceQualifier),
          altPrice?.displayPrice && h('span', { class: 'rmx-card__qualifier' }, altPrice.displayPrice)),
        h('a', { class: 'rmx-card__title', href, 'data-rmx-open': 'details', title }, title),
        h('div', { class: 'rmx-card__address', title: p.displayAddress }, p.displayAddress),
        h('ul', { class: 'rmx-facts' },
          p.bedrooms > 0 && h('li', null, icon('bed'), `${p.bedrooms} bed`),
          p.bathrooms > 0 && h('li', null, icon('bath'), `${p.bathrooms} bath`),
          p.displaySize && h('li', null, icon('size'), p.displaySize),
          tenure && h('li', { class: 'rmx-facts__tenure' }, tenure)),
        land,
        style,
        agent && h('div', { class: 'rmx-card__row rmx-card__agent', title: agent },
          h('span', { class: 'rmx-card__label' }, 'Agent'), h('span', null, agent)),
        h('div', { class: 'rmx-card__meta' }, update)),
      actionBar());
    landChecks.set(el, () => RMX.fetchProperty(id).then(pd => showLand(pd), () => showLand(null)));
    landObserver.observe(el);
    return el;
  }

  // Acres and style on the cards. The search result's key features and summary are read
  // straight away; the full description is on the property page, fetched a few at a time as
  // cards come near the screen.
  const landChecks = new WeakMap(); // card → fetches its property page and shows the acres and style
  const landQueue = [];
  let landFetches = 0;
  const landObserver = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      landObserver.unobserve(target);
      landQueue.push(target);
    }
    checkLand();
  }, { rootMargin: '600px 0px' });

  function checkLand() {
    while (landFetches < 4 && landQueue.length) {
      const cardEl = landQueue.shift();
      if (!gridEl().contains(cardEl)) continue; // results have changed since
      landFetches++;
      landChecks.get(cardEl)().finally(() => {
        landFetches--;
        checkLand();
      });
    }
  }

  function actionBar(id, extraClass) {
    return h('div', { class: `rmx-actions ${extraClass || ''}`, 'data-rmx-id': id },
      TABS.map(([tab, label]) =>
        h('button', { type: 'button', 'data-rmx-open': tab }, icon(tab), label)));
  }

  // List view: give Rightmove's own cards the same three buttons.
  function decorateNativeCards(list) {
    for (const nativeCard of list.querySelectorAll('[data-testid^="propertyCard-vrt-"]')) {
      const id = idFromHref(nativeCard.querySelector('a[href*="/properties/"]')?.getAttribute('href'));
      if (!id) continue;
      const existing = nativeCard.querySelector('.rmx-actions');
      if (existing?.dataset.rmxId === id) continue; // React may reuse a card for another property
      existing?.remove();
      // Below the card: its own columns are fixed-height and clip anything added inside.
      const inner = nativeCard.querySelector('[data-testid^="propertyCard-"]:not([data-testid^="propertyCard-vrt-"])');
      if (inner) inner.after(actionBar(id, 'rmx-actions--native'));
      else nativeCard.append(actionBar(id, 'rmx-actions--native'));
    }
  }

  // Plain clicks on a property open the modal; modified and middle clicks still open the
  // real page in a new tab.
  function onClick(e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const trigger = e.target.closest('[data-rmx-open]');
    let id;
    let tab = 'details';
    if (trigger) {
      id = trigger.closest('[data-rmx-id]')?.dataset.rmxId;
      tab = trigger.dataset.rmxOpen;
    } else {
      const nativeCard = e.target.closest('#l-searchResults [data-testid^="propertyCard-vrt-"]');
      if (!nativeCard || e.target.closest('button, input, select, a:not([href*="/properties/"])')) return;
      id = idFromHref(nativeCard.querySelector('a[href*="/properties/"]')?.getAttribute('href'));
    }
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    openModal(id, tab, { listing: state.byId.get(id) });
  }

  // ---------------------------------------------------------------------------
  // Boot

  document.addEventListener('click', onClick, true);

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  setInterval(() => { if (location.href !== state.url) schedule(); }, 500);
  sync();
})();
