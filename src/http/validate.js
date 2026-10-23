// Input rules. Anything that does not match is a 400 before it reaches the database.
const { z } = require('zod');

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

module.exports = { idParam, loginBody };
