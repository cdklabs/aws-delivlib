import { Hello } from '..';

test('hello', () => {
  expect(new Hello().sayHello()).toBe('hello, world!');
});