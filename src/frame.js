// Runs in every Rightmove frame at document_start. A property page loaded inside the
// Rightmove Plus modal is flagged so site.css can strip the site header and footer.
if (window.top !== window) {
  try {
    if (window.top.location.host === location.host) {
      document.documentElement.classList.add('rmx-embedded');
    }
  } catch {
    // Cross-origin parent: not our modal.
  }
}
