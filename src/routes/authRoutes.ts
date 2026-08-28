import { Router } from 'express';
import {
  register, login, sendCode, verifyCode,
  getProfile, updateProfile, changePassword,
  forgotPassword, resetPassword,
  createAdmin, listAdmins, deactivateAdmin
} from '../controllers/authController';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

// ── Public Auth Routes ────────────────────────────────────────────────────────
router.post('/send-code', sendCode);
router.post('/verify-code', verifyCode);
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// ── Protected Profile Routes ──────────────────────────────────────────────────
router.get('/profile/:userId', requireAuth, getProfile);
router.patch('/profile', requireAuth, updateProfile);
router.patch('/password', requireAuth, changePassword);

// ── Admin Management Routes (admin-only) ─────────────────────────────────────
router.post('/admin/create', requireAdmin, createAdmin);
router.get('/admins', requireAdmin, listAdmins);
router.patch('/admin/:id/deactivate', requireAdmin, deactivateAdmin);

export default router;