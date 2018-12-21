import fs = require('fs');
import os = require('os');
import path = require('path');

import _rmrf = require('../../custom-resource-handlers/src/_rmrf');

test('resmoves a full directory', () => {
  const dir = fs.mkdtempSync(os.tmpdir());
  fs.writeFileSync(path.join(dir, 'exhibit-A'), 'Exhibit A');
  return expect(_rmrf(dir).then(() => fs.existsSync(dir))).resolves.toBeFalsy();
});
