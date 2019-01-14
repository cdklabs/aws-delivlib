import assert = require('@aws-cdk/assert');
import cdk = require('@aws-cdk/cdk');

import { Superchain } from '../lib/superchain';

test('correctly creates', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'stack');
  new Superchain(stack);

  expect(() => stack.findChild('ED3906BE-3B2E-4990-A6A9-3B3409FCB2C2')).not.toThrow();
});

test('is a singleton construct', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'stack');
  expect(new Superchain(stack).buildImage.imageId).toBe(new Superchain(stack).buildImage.imageId);
  assert.expect(stack).to(assert.countResources('Custom::ECRAdoptedRepository', 1));
});
