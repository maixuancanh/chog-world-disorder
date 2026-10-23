// Shared generated mascot; Wi-Fi stays vector crisp at menu icon sizes.
const head = new URL('../../assets/chog-hunt-ui/chog-head-icon-v1.png',import.meta.url).href;
export const chogSvgIcon = `<svg class="iw-ico iw-chog" viewBox="0 0 64 64" aria-hidden="true"><image href="${head}" width="64" height="64" preserveAspectRatio="xMidYMid meet"/></svg>`;
export const chogIcon = (online=false) => `<span class="chog-menu-icon${online?' chog-menu-icon--online':''}"><img src="${head}" alt="" decoding="sync">${online?'<svg class="chog-wifi" viewBox="0 0 64 26" aria-hidden="true"><path d="M9 12 Q32 -7 55 12 M19 22 Q32 11 45 22" fill="none" stroke="#191622" stroke-width="9" stroke-linecap="round"/><path d="M9 12 Q32 -7 55 12 M19 22 Q32 11 45 22" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>':''}</span>`;
export function replaceSquidIcons(root){
  root.querySelectorAll('svg.iw-squid').forEach(svg=>{const slot=document.createElement('span');slot.innerHTML=chogIcon();svg.replaceWith(slot.firstChild);});
  root.querySelectorAll('[data-id="online"] .iw-btn__icon').forEach(el=>el.innerHTML=chogIcon(true));
}

// Reference-derived monochrome mask: preserve the approved head, never redraw it.
export const chogMonoIcon = '<span class="iw-ico chog-mark" aria-hidden="true"></span>';

// Elimination markers keep the native fade, bounce and map projection hooks.
export const chogDeathIcon = `<svg class="iw-chog-death" viewBox="0 0 64 64" aria-hidden="true"><image href="${head}" x="4" y="4" width="56" height="56" opacity=".65"/><path d="M21 21L43 43M43 21L21 43" fill="none" stroke="#15121c" stroke-width="12" stroke-linecap="round"/><path d="M21 21L43 43M43 21L21 43" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>`;

// Functional match statistics: currency, cartridges, collectible traits and ammo purchase.
const statSvg=body=>`<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const huntStatIcons=[
 statSvg('<circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="8"/><path d="M19 11h-4a5 5 0 0 0 0 10h4"/>'),
 statSvg('<path d="M5 26V12l4-7 4 7v14zM19 26V12l4-7 4 7v14zM5 21h8M19 21h8"/>'),
 statSvg('<rect x="4" y="4" width="9" height="9" rx="1"/><rect x="19" y="4" width="9" height="9" rx="1"/><rect x="4" y="19" width="9" height="9" rx="1"/><path d="m19 24 3 3 6-8"/>'),
 statSvg('<path d="M3 5h4l3 15h15l3-11H8M12 26h.01M24 26h.01M16 4v10M12 10l4 4 4-4"/>')
];

// Boss combat statistics use a shared outline set: aim, shield, support and power.
export const bossStatIcons=[
 statSvg('<circle cx="16" cy="16" r="9"/><circle cx="16" cy="16" r="3"/><path d="M16 2v6M16 24v6M2 16h6M24 16h6"/>'),
 statSvg('<path d="M16 3 27 7v9c0 7-11 13-11 13S5 23 5 16V7zM11 16l3 3 7-8"/>'),
 statSvg('<path d="M16 27S3 19 3 11a7 7 0 0 1 13-3 7 7 0 0 1 13 3c0 8-13 16-13 16zM16 11v10M11 16h10"/>'),
 statSvg('<path d="m18 2-12 17h9l-1 11 12-17h-9z"/>')
];
