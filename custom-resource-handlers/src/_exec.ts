import childProcess = require('child_process');
import process = require('process');

export = function _exec(command: string, ...args: string[]): Promise<string> {
  return new Promise<string>((ok, ko) => {
    const child = childProcess.spawn(command, args, { env: process.env, shell: false, stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks = new Array<Buffer>();

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      chunks.push(chunk);
    });

    child.once('error', ko);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        return ok(Buffer.concat(chunks).toString('utf8'));
      }
      ko(new Error(signal != null ? `Killed by ${signal}` : `Exited with status ${code}`));
    });
  });
};
