// Rightmove Plus on a property page: Gallery, Floorplan and Map buttons under the photos.
// Those buttons, and Rightmove's own photo, floorplan and map links, open the quick-look
// modal (ui.js) instead of Rightmove's full-screen viewers.
(() => {
  'use strict';

  if (window.top !== window) return;
  const id = /^\/properties\/(\d+)/.exec(location.pathname)?.[1];
  if (!id) return;

  const { h, icon, openModal } = RMX;

  let bar = null;

  function buildBar(pd) {
    const photos = pd?.images?.length;
    const plans = pd?.floorplans?.filter(f => f.url).length;
    const button = (open, label, iconName, count) =>
      h('button', { type: 'button', 'data-rmx-open': open }, icon(iconName), label,
        count > 0 && h('span', { class: 'rmx-actions__count' }, String(count)));
    return h('div', { class: 'rmx-actions rmx-actions--property' },
      button('gallery', 'Gallery', 'gallery', photos),
      plans > 0 && button('floorplan', plans > 1 ? 'Floorplans' : 'Floorplan', 'plan', plans),
      button('map', 'Map', 'map'));
  }

  // Rightmove re-renders parts of the page, so put the bar back if it goes.
  function mountBar() {
    const collage = document.querySelector('[data-testid="photo-collage"]');
    if (collage && collage.nextElementSibling !== bar) collage.after(bar);
  }

  // Where a click goes in the modal, as [tab, options]: our buttons, or Rightmove's links to
  // its viewers (#/media?id=media3, #/floorplan?activePlan=2, #/map). Videos, virtual tours,
  // Street View and the rest stay with Rightmove.
  function destination(el) {
    const open = el.dataset.rmxOpen;
    if (open === 'floorplan') return ['gallery', { photo: { set: 'plans' } }];
    if (open) return [open];
    const [, route, query] = /^#\/(\w+)\??(.*)$/.exec(el.getAttribute('href')) || [];
    const q = new URLSearchParams(query);
    if (route === 'media') {
      const n = /^media(\d+)$/.exec(q.get('id') || 'media0')?.[1];
      return n && ['gallery', { photo: { set: 'photos', index: Number(n) } }];
    }
    if (route === 'floorplan') {
      return ['gallery', { photo: { set: 'plans', index: (Number(q.get('activePlan')) || 1) - 1 } }];
    }
    if (route === 'map') return ['map'];
    return null;
  }

  // Modified and middle clicks keep Rightmove's behaviour.
  function onClick(e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const el = e.target.closest('[data-rmx-open], a[href^="#/"]');
    const target = el && destination(el);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    openModal(id, ...target);
  }

  document.addEventListener('click', onClick, true);

  RMX.fetchProperty(id)
    .catch(() => null)
    .then(pd => {
      bar = buildBar(pd);
      mountBar();
      new MutationObserver(mountBar).observe(document.body, { childList: true, subtree: true });
    });
})();
