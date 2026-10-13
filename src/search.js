// Rightmove Plus on search pages: grid view for the results, and Details, Gallery and Map
// buttons that open the quick-look modal (ui.js) instead of navigating to the property page.
(() => {
  'use strict';

  // Search pages are a Next.js app; property pages are not (see property.js).
  if (window.top !== window || !document.getElementById('__NEXT_DATA__')) return;

  const { TABS, h, icon, segmented, idFromHref, mediaUrl, openModal, agentName, acresBadges, featureBadges, propertyAcres, propertyFeatures } = RMX;

  const VIEW_KEY = 'rmx:view';
  const LAND_KEY = 'rmx:minAcres';
  // The land slider's stops, in acres; 0 is any.
  const LAND_STEPS = [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10, 20, 50];
  const SEARCH_API = '/api/property-search/listing/search';

  const initialUrl = location.href;
  const initialData = readNextData();

  const state = {
    view: localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid',
    minAcres: LAND_STEPS.find(a => a > 0 && a === Number(localStorage.getItem(LAND_KEY))) || 0,
    url: null,          // URL the current results were requested for
    status: 'idle',     // idle | loading | ready | error
    props: [],          // results shown in the grid, in page order
    byId: new Map(),    // every property on the page, by id
    channel: initialData?.searchParameters?.channel || null,
    request: null,
    next: null,         // index of the next page of results, if there is one
    total: 0,           // results Rightmove says the search has
    more: null,         // request for the next page, while it loads
    moreFailed: false,
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
  // URL's query string, so we do too. The API insists on a channel. The grid scrolls on from
  // the first page whichever page the URL is on; `index` asks for a later one.
  function apiQuery(index) {
    const q = new URLSearchParams(location.search);
    q.delete('index');
    if (!q.has('channel')) {
      const channel = state.channel || (/to-rent/.test(location.pathname) ? 'RENT' : 'BUY');
      q.set('channel', channel);
      if (!q.has('transactionType')) q.set('transactionType', channel === 'RENT' ? 'LETTING' : 'BUY');
    }
    if (index != null) q.set('index', index);
    return `?${q}`;
  }

  async function load() {
    const url = (state.url = location.href);
    state.request?.abort();
    state.more?.abort();
    state.more = null;
    renderMore();
    if (url === initialUrl && initialData && !Number(initialData.searchParameters?.index)) {
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
    state.next = data.pagination?.next ?? null;
    state.total = Number(String(data.resultCount || 0).replace(/,/g, '')) || 0;
    state.moreFailed = false;
    state.status = 'ready';
    renderGrid();
    sync();
    watchMore();
  }

  // Infinite scroll: when the end of the grid comes near, the next page of results is added
  // to it. The URL stays on the page it was on.
  async function loadMore() {
    if (state.status !== 'ready' || state.next == null || state.more || state.moreFailed) return;
    if (filtering() && landPending()) return; // until the cards so far have been checked
    const url = state.url;
    const request = (state.more = new AbortController());
    renderMore();
    try {
      const res = await fetch(SEARCH_API + apiQuery(state.next), {
        signal: request.signal,
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (state.url !== url) return;
      const all = data.properties || [];
      const shown = new Set(state.props.map(p => String(p.id)));
      // Listings added since the last page can push ones already shown onto this one.
      const added = all.filter(p => !p.featuredProperty && !shown.has(String(p.id)));
      for (const p of all) state.byId.set(String(p.id), p);
      state.props.push(...added);
      state.next = data.pagination?.next ?? null;
      more.before(...added.map(card));
      checkAllLand();
    } catch (err) {
      if (err.name === 'AbortError' || state.url !== url) return;
      console.warn('[Rightmove Plus] Could not load more results.', err);
      state.moreFailed = true;
    } finally {
      if (state.more === request) {
        state.more = null;
        renderMore();
        watchMore();
      }
    }
  }

  // The end of the grid: loading, a retry button, or the end of the results.
  const more = h('div', { class: 'rmx-more' });
  const moreObserver = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) loadMore();
  }, { rootMargin: '1500px 0px' });
  moreObserver.observe(more);

  // Checks again whether the end is near: the observer only reports changes, and it may
  // still be in view after a page has been added.
  function watchMore() {
    moreObserver.unobserve(more);
    moreObserver.observe(more);
  }

  function renderMore() {
    const n = count => count.toLocaleString('en-GB');
    if (state.more) {
      more.replaceChildren(h('span', { class: 'rmx-spinner' }), 'Loading more properties…');
    } else if (state.moreFailed) {
      more.replaceChildren('Couldn’t load more properties.',
        h('button', { class: 'rmx-btn', type: 'button', onclick: () => { state.moreFailed = false; loadMore(); } }, 'Try again'));
    } else if (filtering() && landPending()) {
      more.replaceChildren(h('span', { class: 'rmx-spinner' }), 'Checking listings for land…');
    } else if (state.next != null) {
      more.replaceChildren();
    } else {
      const matches = filtering() && ` ${n(matchCount())} with ${acresText(state.minAcres)}.`;
      const shown = state.props.length;
      if (state.total > 1008 && shown < state.total) { // Rightmove stops after 42 pages of 24
        more.replaceChildren(`That’s the first ${n(shown)} of ${n(state.total)} properties, as many as Rightmove lists for one search.${matches || ''} Narrow the search to see the rest.`);
      } else if (shown < state.total - 1) {
        more.replaceChildren(`That’s all Rightmove returned: ${n(shown)} different properties of the ${n(state.total)} it counts, because its pages repeat some listings.${matches || ''} Sorting by Newest instead of Keyword Match lists them all.`);
      } else {
        more.replaceChildren(`That’s all ${n(shown)} properties.${matches || ''}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Land filter: a slider that hides cards with less land than it's set to. The acres are
  // mostly in the full description, so while it's set every card's property page is fetched,
  // not just those near the screen, and the next page waits until they have been.

  const filtering = () => state.view === 'grid' && state.minAcres > 0;
  const acresText = a => `${a === 1 ? '1 acre' : `${a} acres`} or more`;
  const matchCount = () => gridEl().querySelectorAll('.rmx-card:not([hidden])').length;

  const landFilter = {};
  landFilter.value = h('span', { class: 'rmx-landfilter__value' });
  landFilter.count = h('span', { class: 'rmx-landfilter__count' });
  landFilter.input = h('input', {
    type: 'range', min: 0, max: LAND_STEPS.length - 1, step: 1,
    value: LAND_STEPS.indexOf(state.minAcres), 'aria-label': 'Least land, in acres',
    oninput: e => setMinAcres(LAND_STEPS[e.target.value]),
  });
  landFilter.el = h('div', { class: 'rmx-landfilter' },
    h('span', { class: 'rmx-landfilter__label' }, 'Land'), landFilter.input, landFilter.value, landFilter.count);

  function setMinAcres(acres) {
    state.minAcres = acres;
    localStorage.setItem(LAND_KEY, String(acres));
    for (const el of gridEl().querySelectorAll('.rmx-card')) filterCard(el);
    checkAllLand();
    showFilterCount();
    renderMore();
    watchMore();
  }

  // A card's land is its largest amount in acres; until its description has been read, that
  // is from the search result alone.
  function filterCard(el) {
    el.hidden = filtering() && !(el.rmxAcres >= state.minAcres);
  }

  // Text is only set when it changes: setting it at all is a mutation, and mutations sync().
  let countQueued = false;
  function showFilterCount() {
    if (countQueued) return;
    countQueued = true;
    requestAnimationFrame(() => {
      countQueued = false;
      const loaded = state.props.length;
      const set = (el, text) => { if (el.textContent !== text) el.textContent = text; };
      set(landFilter.value, state.minAcres ? acresText(state.minAcres) : 'Any');
      const unread = filtering() ? [...gridEl().querySelectorAll('.rmx-card')].filter(c => c.rmxFailed).length : 0;
      set(landFilter.count, filtering() && loaded
        ? `${matchCount().toLocaleString('en-GB')} of ${loaded.toLocaleString('en-GB')} loaded${landPending() ? ', checking…' : ''}${unread ? ` (${unread.toLocaleString('en-GB')} couldn’t be read)` : ''}`
        : '');
    });
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
        setMinAcres(state.minAcres); // the filter only applies to the grid
      }),
      landFilter.el);
    landFilter.el.hidden = state.view !== 'grid';
    showFilterCount();
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
      el.replaceChildren(...state.props.map(card), more);
      el.rendered = state.props;
      checkAllLand();
      renderMore();
      showFilterCount();
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
    const showLand = (pd, checking, failed) => {
      const acres = propertyAcres(pd, p);
      land.replaceChildren(h('span', { class: 'rmx-card__label' }, 'Land'), ...acresBadges(acres, checking, failed));
      style.replaceChildren(h('span', { class: 'rmx-card__label' }, 'Style'), ...featureBadges(propertyFeatures(pd, p), checking, failed));
      el.rmxAcres = Math.max(0, ...acres.map(a => a.value));
      el.rmxFailed = Boolean(failed);
      filterCard(el);
      showFilterCount();
    };

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
    showLand(null, true);
    landChecks.set(el, () => RMX.fetchProperty(id).then(pd => showLand(pd), err => {
      warnUnread(id, err);
      showLand(null, false, err.message || String(err));
    }));
    landObserver.observe(el);
    return el;
  }

  // Acres and style on the cards. The search result's key features and summary are read
  // straight away; the full description is on the property page, fetched a few at a time as
  // cards come near the screen (or all of them, while the land filter is set).
  const landChecks = new WeakMap(); // card → fetches its property page and shows the acres and style
  const landQueue = []; // { cardEl, check }
  let landFetches = 0;
  const landObserver = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) if (isIntersecting) queueLand(target);
    checkLand();
  }, { rootMargin: '600px 0px' });

  const landPending = () => landQueue.length + landFetches > 0;

  let warnedUnread = false;
  function warnUnread(id, err) {
    if (warnedUnread) return;
    warnedUnread = true;
    console.warn(`[Rightmove Plus] Couldn’t read property ${id}’s page, so its land and style come from the search summary only.`, err);
  }

  function queueLand(cardEl) {
    const check = landChecks.get(cardEl);
    if (!check) return; // queued already
    landChecks.delete(cardEl);
    landObserver.unobserve(cardEl);
    landQueue.push({ cardEl, check });
  }

  // While filtering, every card; otherwise the cards not near the screen go back to waiting.
  function checkAllLand() {
    if (filtering()) {
      for (const cardEl of gridEl().querySelectorAll('.rmx-card')) queueLand(cardEl);
    } else {
      for (const { cardEl, check } of landQueue.splice(0)) {
        landChecks.set(cardEl, check);
        landObserver.observe(cardEl);
      }
    }
    checkLand();
  }

  function checkLand() {
    while (landFetches < 4 && landQueue.length) {
      const { cardEl, check } = landQueue.shift();
      if (!gridEl().contains(cardEl)) continue; // results have changed since
      landFetches++;
      check().finally(() => {
        landFetches--;
        checkLand();
      });
    }
    if (filtering()) {
      showFilterCount();
      renderMore();
      if (!landPending()) watchMore(); // the next page, if the end is near
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
