// Tutorial diagrams use the original rule cards' 120 × 80 canvas and bold outlines.
const K = '#191622';
const svg = body => `<svg viewBox="0 0 120 80" aria-hidden="true"><g stroke="${K}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
const gem = (x, y, color = 'var(--a)') => `<path d="M${x} ${y-7} l7 7 -7 7 -7 -7z" fill="${color}"/>`;
const chest = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-20 0 v22 h40 V0" fill="#f4ecdc"/><path d="M-20 0 v-8 q20 -16 40 0 V0z" fill="var(--a)"/><path d="M-20 5 h40" fill="none"/><rect x="-4" y="-3" width="8" height="12" rx="2" fill="var(--b)"/></g>`;
const head = (x, y) => `<g transform="translate(${x} ${y})"><path d="M0 -20 l9 12 13 -5 -3 13 10 6 -12 6 -1 10 H-16 l-1 -10 -12 -6 10 -6 -3 -13 13 5z" fill="var(--b)"/><ellipse cy="6" rx="17" ry="13" fill="#fff5dc"/><ellipse cx="-6" cy="4" rx="2" ry="3" fill="${K}"/><ellipse cx="6" cy="4" rx="2" ry="3" fill="${K}"/><path d="M-5 12 q5 4 10 0" fill="none"/></g>`;
export const HUNT_RULE_ART = [
  svg(`<path d="M10 62 l50 -19 50 19 -50 15z" fill="#f4ecdc"/>${chest(60,43)}${[25,48,71,94].map(x=>gem(x,15)).join('')}<path d="M60 25 v8" stroke="#fff" stroke-dasharray="2 4"/>`),
  svg(`${head(27,39)}${head(94,39)}<path d="M49 32 h21 l-5 -6 m5 6 -5 6" stroke="#fff" stroke-width="4" fill="none"/><path d="M11 66 h32 M78 66 h32" stroke="#fff"/><path d="M83 12 l3 -9 8 6 8 -6 3 9z" fill="var(--a)"/>${gem(57,58)}${gem(70,58,'var(--b)')}`),
  svg(`<path d="M10 31 h40 v13 H31 l-4 14 H16 l4 -14 H10z" fill="var(--b)"/><path d="M51 37 h13" stroke="#fff" stroke-dasharray="3 4"/><circle cx="91" cy="36" r="20" fill="#fff5dc"/><circle cx="91" cy="36" r="10" fill="var(--a)"/><path d="M85 36 l4 4 9 -10" fill="none"/>${[24,42,60,78,96].map(x=>`<path d="M${x-4} 74 v-9 q4 -9 8 0 v9z" fill="var(--a)"/>`).join('')}`),
  svg(`<circle cx="37" cy="36" r="24" fill="#fff5dc"/><path d="M37 20 v17 l11 6" fill="none"/><rect x="29" y="5" width="16" height="7" rx="2" fill="var(--b)"/><path d="M57 15 l5 -5" fill="none"/>${[81,101].map(x=>[25,47].map(y=>gem(x,y)).join('')).join('')}<path d="M27 71 h67" stroke="#fff" stroke-width="4"/>`),
];
