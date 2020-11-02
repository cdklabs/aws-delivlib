import _exec = require('../../custom-resource-handlers/src/_exec');

test('forwards stdout (single-line)', () =>
  expect(_exec('node', '-e', 'process.stdout.write("OKAY")')).resolves.toBe('OKAY'),
);

test('forwards stdout (multi-line)', () =>
  expect(_exec('node', '-e', 'process.stdout.write("OKAY\\nGREAT")')).resolves.toBe('OKAY\nGREAT'),
);

test('fails if the command exits with non-zero status', () =>
  expect(_exec('node', '-e', 'process.exit(10)')).rejects.toThrow('Exited with status 10'),
);

test('fails if the command is killed by a signal', () =>
  expect(_exec('node', '-e', 'process.kill(process.pid, "SIGKILL")')).rejects.toThrow('Killed by SIGKILL'),
);
