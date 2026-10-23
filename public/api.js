// Tiny wrapper around fetch. Always returns { status, data } and never throws on 4xx/5xx,
// so the screens (and the Security check tab) can show exactly what the server answered.
export async function api(method, path, body) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) {
    options.body = body; // the browser sets the multipart Content-Type itself
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(path, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}
