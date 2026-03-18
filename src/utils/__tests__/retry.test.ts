import { withRetry } from '../retry';
import { logger } from '../logger';

jest.mock('../logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

describe('withRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return result if fn succeeds on first try', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry and succeed', async () => {
    const fn = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

    // Low delay for tests
    const result = await withRetry(fn, { attempts: 3, delay: 10, factor: 1 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Attempt 1 failed'));
  });

  it('should fail after max attempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('permanent fail'));
    await expect(withRetry(fn, { attempts: 2, delay: 10, factor: 1 })).rejects.toThrow(
      'permanent fail',
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry if NoRetryError is thrown', async () => {
    const fn = jest.fn().mockRejectedValue({ name: 'NoRetryError', message: 'fatal' });
    await expect(withRetry(fn, { attempts: 3, delay: 10, factor: 1 })).rejects.toEqual(
      expect.objectContaining({ name: 'NoRetryError' }),
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
