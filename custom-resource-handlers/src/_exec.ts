import childProcess = require('child_process');

export = function _exec(command: string): Promise<string> {
  return new Promise<string>((ok, ko) => {
    const child = childProcess.spawn(command, { shell: false, stdio: ['ignore', 'pipe', 'inherit'] });
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
      ko(signal != null ? `Killed by ${signal}` : `Returned ${code}`);
    });
  });
};
