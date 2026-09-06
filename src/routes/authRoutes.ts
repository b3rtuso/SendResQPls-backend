import { Router } from 'express';
import {
  register, login, sendCode, verifyCode,
  getProfile, updateProfile, changePassword,
  forgotPassword, resetPassword,
  createAdmin, listAdmins, deactivateAdmin, deleteAdmin
} from '../controllers/authController';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiters';

const router = Router();

// ── Public Auth Routes (protected against brute-force) ────────────────────────
router.post('/send-code', authLimiter, sendCode);
router.post('/verify-code', authLimiter, verifyCode);
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);

// ── Protected Profile Routes ──────────────────────────────────────────────────
router.get('/profile/:userId', requireAuth, getProfile);
router.patch('/profile', requireAuth, updateProfile);
router.patch('/password', requireAuth, changePassword);

// ── Admin Management Routes (admin-only) ─────────────────────────────────────
router.post('/admin/create', requireAdmin, createAdmin);
router.get('/admins', requireAdmin, listAdmins);
router.patch('/admin/:id/deactivate', requireAdmin, deactivateAdmin);
router.patch('/admins/:id/deactivate', requireAdmin, deactivateAdmin);
router.delete('/admin/:id', requireAdmin, deleteAdmin);
router.delete('/admins/:id', requireAdmin, deleteAdmin);

export default router;