describe('Environment Validation', () => {
    it('should validate correct environment variables', () => {
        process.env.NODE_ENV = 'production';
        process.env.PORT = '8080';
        process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
        process.env.REDIS_HOST = 'redis-server';
        process.env.REDIS_PORT = '6380';
        process.env.APIFY_TOKEN = 'test-token-123';
        process.env.OPENAI_API_KEY = 'test-key-456';

        // Import fresh to get new validation
        jest.isolateModules(() => {
            const { validateEnv } = require('../config/env');
            const env = validateEnv();

            expect(env.NODE_ENV).toBe('production');
            expect(env.PORT).toBe(8080);
            expect(env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
            expect(env.REDIS_HOST).toBe('redis-server');
            expect(env.REDIS_PORT).toBe(6380);
            expect(env.APIFY_TOKEN).toBe('test-token-123');
            expect(env.OPENAI_API_KEY).toBe('test-key-456');
        });
    });

    it('should use default values for optional fields', () => {
        // Set NODE_ENV explicitly
        process.env.NODE_ENV = 'test';
        process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
        process.env.APIFY_TOKEN = 'test-token';
        process.env.OPENAI_API_KEY = 'test-key';
        delete process.env.PORT;
        delete process.env.REDIS_HOST;
        delete process.env.REDIS_PORT;

        jest.isolateModules(() => {
            const { validateEnv } = require('../config/env');
            const env = validateEnv();

            expect(env.NODE_ENV).toBe('test'); // Jest sets this
            expect(env.PORT).toBe(3000);
            expect(env.REDIS_HOST).toBe('localhost');
            expect(env.REDIS_PORT).toBe(6379);
        });
    });

    it('should validate DATABASE_URL is a valid URL', () => {
        process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
        process.env.APIFY_TOKEN = 'test-token';
        process.env.OPENAI_API_KEY = 'test-key';

        jest.isolateModules(() => {
            const { validateEnv } = require('../config/env');
            expect(() => validateEnv()).not.toThrow();
        });
    });

    it('should validate required string fields are not empty', () => {
        process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
        process.env.APIFY_TOKEN = 'valid-token';
        process.env.OPENAI_API_KEY = 'valid-key';

        jest.isolateModules(() => {
            const { validateEnv } = require('../config/env');
            const env = validateEnv();

            expect(env.APIFY_TOKEN.length).toBeGreaterThan(0);
            expect(env.OPENAI_API_KEY.length).toBeGreaterThan(0);
        });
    });
});
