import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

const readdir = util.promisify(fs.readdir);
const rmdir = util.promisify(fs.rmdir);
const stat = util.promisify(fs.stat);
const unlink = util.promisify(fs.unlink);

export = async function _rmrf(filePath: string): Promise<void> {
  // All of this is best-effort
  try {
    const fstat = await stat(filePath);
    if (fstat.isDirectory()) {
      for (const child of await readdir(filePath)) {
        await _rmrf(path.join(filePath, child));
      }
      await rmdir(filePath);
    } else {
      await unlink(filePath);
    }
  } catch (e: any) {
    // If deleting fails, too bad.
  }
};
