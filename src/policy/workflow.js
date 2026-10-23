// Load status workflow. The server always computes the next status; the browser never sends one,
// so a load cannot skip a step or move backwards.

const STATUSES = Object.freeze(['Assigned', 'Picked Up', 'Delivered']);

function nextStatus(status) {
  const i = STATUSES.indexOf(status);
  return i >= 0 && i < STATUSES.length - 1 ? STATUSES[i + 1] : null;
}

module.exports = { STATUSES, nextStatus };
