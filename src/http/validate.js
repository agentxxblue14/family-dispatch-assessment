// Input rules. Anything that does not match is a 400 before it reaches the database.
const { z } = require('zod');
const { STATUSES } = require('../policy/workflow');

// A record id must be a plain positive whole number (1 to 999999999). "1 OR 1=1", "-1",
// "1.5" and "abc" all fail here. The database still only ever sees it as a bound parameter.
const idParam = z
  .string()
  .regex(/^[1-9][0-9]{0,8}$/)
  .transform(Number);

const loginBody = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});

// Advance sends the status the user is looking at, never the status to move to. The server
// refuses the move if the load has changed since (double click, or a colleague moved it).
const advanceBody = z.object({ from: z.enum(STATUSES) });

module.exports = { idParam, loginBody, advanceBody };
