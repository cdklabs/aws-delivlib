import fs = require('fs');
import path = require('path');
import util = require('util');

export = async function _rmrf(filePath: string): Promise<void> {
  const stat = await util.promisify(fs.stat)(filePath);
  if (stat.isDirectory()) {
    for (const child of await util.promisify(fs.readdir)(filePath)) {
      await _rmrf(path.join(filePath, child));
    }
    await util.promisify(fs.rmdir)(filePath);
  } else {
    await util.promisify(fs.unlink)(filePath);
  }
};
