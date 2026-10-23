// DOM helpers shared by the page scripts. Text is always inserted as text nodes, never as HTML,
// so data from the server can never inject markup or scripts.

// Creates an HTML element. Strings and numbers become text nodes.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  setAttrs(node, attrs);
  append(node, children);
  return node;
}

// Same as el(), for SVG elements (charts).
export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  setAttrs(node, attrs);
  append(node, children);
  return node;
}

function setAttrs(node, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.setAttribute('class', value);
    else node.setAttribute(key, value === true ? '' : value);
  }
}

function append(node, children) {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// Motion is decoration only: users who ask their device for less motion get none.
export function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Counts a number up from 0 over about 0.6 s (or shows it at once with reduced motion).
export function countUp(node, target) {
  if (reducedMotion() || target === 0) {
    node.textContent = String(target);
    return;
  }
  node.dataset.counting = 'true';
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 600);
    node.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3)))); // ease-out
    if (t < 1) requestAnimationFrame(step);
    else delete node.dataset.counting;
  };
  requestAnimationFrame(step);
}
