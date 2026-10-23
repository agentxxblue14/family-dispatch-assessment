// Pure unit tests for the role rules and the status workflow. No database, no server.
require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS, can } = require('../src/policy/permissions');
const { STATUSES, nextStatus } = require('../src/policy/workflow');

const owner = { id: 1, role: 'owner' };
const dispatcher = { id: 2, role: 'dispatcher' };
const driver = { id: 3, role: 'driver' };
const ownLoad = { id: 10, driver_id: 3 };
const otherDriversLoad = { id: 11, driver_id: 4 };

test('driver cannot view the fleet (drivers and trucks)', () => {
  assert.equal(can(driver, 'fleet:view'), false);
});

test('driver can view a load assigned to them', () => {
  assert.equal(can(driver, 'load:view', ownLoad), true);
});

test("driver cannot view, advance or upload to another driver's load", () => {
  assert.equal(can(driver, 'load:view', otherDriversLoad), false);
  assert.equal(can(driver, 'load:advance', otherDriversLoad), false);
  assert.equal(can(driver, 'doc:upload', otherDriversLoad), false);
  assert.equal(can(driver, 'doc:view', otherDriversLoad), false);
});

test('dispatcher can run loads and fleet but cannot see the blocked log', () => {
  assert.equal(can(dispatcher, 'fleet:view'), true);
  assert.equal(can(dispatcher, 'load:advance', otherDriversLoad), true);
  assert.equal(can(dispatcher, 'audit:view'), false);
});

test('owner can do every action in the table', () => {
  for (const action of Object.keys(PERMISSIONS)) {
    assert.equal(can(owner, action, ownLoad), true, action);
  }
});

test('unknown action or unknown role is refused (deny by default)', () => {
  assert.equal(can(owner, 'load:delete', ownLoad), false);
  assert.equal(can({ id: 9, role: 'admin' }, 'load:view', ownLoad), false);
  assert.equal(can({ id: 9 }, 'load:view'), false);
});

test('nextStatus: Assigned moves to Picked Up', () => {
  assert.equal(nextStatus('Assigned'), 'Picked Up');
});

test('nextStatus: Picked Up moves to Delivered', () => {
  assert.equal(nextStatus('Picked Up'), 'Delivered');
});

test('nextStatus: Delivered is the end, unknown statuses go nowhere', () => {
  assert.equal(nextStatus('Delivered'), null);
  assert.equal(nextStatus('Bogus'), null);
  assert.deepEqual(STATUSES, ['Assigned', 'Picked Up', 'Delivered']);
});

test('PERMISSIONS table cannot be changed at runtime', () => {
  assert.throws(() => PERMISSIONS['audit:view'].push('driver'), TypeError);
  assert.equal(can(driver, 'audit:view'), false);
});
