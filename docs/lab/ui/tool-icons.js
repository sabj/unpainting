// Small outlined instruments inherit the button colour in either theme.
const drawings = {
  round: '<path d="m14 11 5-7c1-2-1-3-2-1l-6 6m0 0 3 3-2 2-3-3zM9 12c-4-1-2 6-6 7 4 2 10-1 9-5"/>',
  flat: '<path d="m13 10 5-7c1-1 3 1 2 2l-5 7M7 10l4-3 6 6-4 4zM7 10l6 7-6 4-4-4zM6 17l2 2m0-4 2 2"/>',
  pen: '<path d="m13 3 8 8-7 8-11 2L5 10zM3 21l8-8m2-6 4 4"/><circle cx="12" cy="12" r="1.5"/>',
  pencil: '<path d="m15 3 6 6-11 11-7 1 1-7zM4 14l6 6M13 5l6 6M7 17l9-9"/>',
  water: '<path d="M12 3C10 7 5 11 5 15a7 7 0 0 0 14 0c0-4-5-8-7-12ZM8 15c0 2 1 3 3 3"/>',
  dryer: '<path d="M3 5h9l5 3v5l-5 2H3zM7 15v6h5l-1-6M17 8h3v5h-3M5 8v4m3-4v4"/>',
  mask: '<path d="M9 3h6v4H9zM9 7l-3 5v8h12v-8l-3-5M6 14h12M10 17h4"/>',
  lift: '<path d="m14 4 7 7-10 10H7l-5-5zM7 11l7 7M11 21h10"/>',
  blot: '<path d="m4 5 7-2 9 3-1 13-8 2-8-4zM4 5l7 5 9-4M11 10v11M6 13l2 2m7-3 2-1"/>'
};
export function addToolIcons(root=document) {
  for (const button of root.querySelectorAll('[data-tool]')) {
    const drawing=drawings[button.dataset.tool];
    if (!drawing || button.querySelector('svg')) continue;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    for (const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'20',height:'20',fill:'none',stroke:'currentColor','stroke-width':'1.5','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'})) svg.setAttribute(key,value);
    svg.innerHTML=drawing;
    const label=document.createElement('span');label.textContent=button.textContent;
    button.replaceChildren(svg,label);
  }
}
