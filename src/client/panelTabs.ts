// Switches between the Activity and Chat tabs in the side panel. Lives outside
// the full-innerHTML re-render (see chat.ts) so switching tabs never races a
// game-state broadcast; the markup already defaults to the Activity tab active,
// so this only has to handle clicks, not initial state.

export function initPanelTabs() {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.panel-tab');
  const contents = document.querySelectorAll<HTMLElement>('.panel-tab-content');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.panelTab;
      tabs.forEach((t) => t.classList.toggle('panel-tab-active', t === tab));
      contents.forEach((c) => c.classList.toggle('panel-tab-content-active', c.dataset.panelTab === target));
    });
  });
}
