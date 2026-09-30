import rateLimit from 'express-rate-limit';

// 1. Global limiter — applies to general API routes
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,                  // 200 requests per IP per window
  standardHeaders: true,     // Return RateLimit-* headers
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// 2. Auth limiter — strict, prevents brute-force on public login/register/reset endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,                   // Only 10 attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true, // Don't count successful logins against the limit
});

// 3. Report submission limiter — prevent spam reports from mobile app
export const reportLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute window
  max: 5,                    // Max 5 new reports per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reports submitted. Please wait a moment before sending another.' },
});
