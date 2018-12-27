import fs = require('fs');
import path = require('path');
import util = require('util');

const readdir = util.promisify(fs.readdir);
const rmdir = util.promisify(fs.rmdir);
const stat = util.promisify(fs.stat);
const unlink = util.promisify(fs.unlink);

export = async function _rmrf(filePath: string): Promise<void> {
  const fstat = await stat(filePath);
  if (fstat.isDirectory()) {
    for (const child of await readdir(filePath)) {
      await _rmrf(path.join(filePath, child));
    }
    await rmdir(filePath);
  } else {
    await unlink(filePath);
  }
};
