// Turns database rows into the JSON the browser gets. Only fields listed here leave the server:
// no company ids, password hashes or stored file names.

function toLoadJson(row) {
  return {
    id: row.id,
    ref: row.ref,
    origin: row.origin,
    destination: row.destination,
    status: row.status,
    driver: row.driver_id ? { id: row.driver_id, name: row.driver_name } : null,
    truck: row.truck_id ? { id: row.truck_id, unit: row.truck_unit } : null,
    hasDocument: row.has_document,
  };
}

function toEventJson(row) {
  return { id: row.id, fromStatus: row.from_status, toStatus: row.to_status, by: row.user_name, at: row.at };
}

function toDocJson(row) {
  return {
    id: row.id,
    filename: row.filename,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by_name,
    uploadedAt: row.uploaded_at,
  };
}

function toUserJson(user) {
  return { id: user.id, name: user.name, role: user.role, company: { id: user.company_id, name: user.company_name } };
}

function toDenialJson(row) {
  return { id: row.id, method: row.method, path: row.path, status: row.status, user: row.user_name, role: row.user_role, at: row.at };
}

module.exports = { toLoadJson, toEventJson, toDocJson, toUserJson, toDenialJson };
