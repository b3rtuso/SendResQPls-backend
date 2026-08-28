import { Request, Response } from 'express';
import { prisma } from '../config/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService';
import { AuthRequest } from '../middleware/auth';
import { redis } from '../config/redis';

// ── JWT Secret — crash immediately on startup if not configured ───────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start.');
}

// ── In-memory store for email verification codes ──────────────────────────────
// (verification codes are short-lived and low-risk — in-memory is fine here)
const verificationCodes = new Map<string, { code: string; expiresAt: number }>();

// POST /api/auth/send-code — Send verification code to email
export const sendCode = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Check if email is already registered
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email is already registered' });

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store it
    verificationCodes.set(email, { code, expiresAt });

    // Send email
    await sendVerificationEmail(email, code);
    console.log(`📧 Verification code sent to ${email}`);
    res.json({ message: 'Verification code sent to your email' });
  } catch (error: any) {
    console.error('❌ Send code error:', error.message);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
};

// POST /api/auth/verify-code — Verify the code (called before registration)
export const verifyCode = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

    const stored = verificationCodes.get(email);
    if (!stored) return res.status(400).json({ error: 'No verification code found. Please request a new one.' });

    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(email);
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    if (stored.code !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Code is valid — remove it
    verificationCodes.delete(email);
    console.log(`✅ Email verified: ${email}`);
    res.json({ message: 'Email verified successfully', verified: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Verification failed' });
  }
};

// POST /api/auth/register
export const register = async (req: Request, res: Response) => {
  try {
    // Note: 'role' is intentionally excluded — users always register as CITIZEN.
    // Admin accounts must be created by an existing admin via POST /api/auth/admin/create.
    const { name, email, password, phoneNumber } = req.body;
    const hashedPassword = await bcrypt.hash(password, 8); // 8 rounds = ~80ms, still secure
    const newUser = await prisma.user.create({
      data: { name, email, passwordHash: hashedPassword, phoneNumber: phoneNumber || null, role: 'CITIZEN' }
    });
    res.status(201).json(newUser);
  } catch (error: any) {
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

// POST /api/auth/login
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Block deactivated admin accounts
    if (!user.isActive) {
      return res.status(403).json({ error: 'This account has been deactivated. Please contact your administrator.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ message: 'Login successful', token, role: user.role, user: { id: user.id, name: user.name, email: user.email, phoneNumber: user.phoneNumber, role: user.role } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong during login.' });
  }
};

// GET /api/auth/profile/:userId
// Protected: Citizen can only view their own profile; Admin can view any profile
export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Citizens can only view their own profile
    if (req.user!.role === 'CITIZEN' && req.user!.userId !== userId) {
      return res.status(403).json({ error: 'Access denied. You can only view your own profile.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        role: true,
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error: any) {
    console.error('❌ Get profile error:', error.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

// PATCH /api/auth/profile
// Protected: Uses verified userId from JWT token
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    // Always use the user ID from the verified JWT token
    const userId = req.user!.userId;
    const { name, email, phoneNumber, pushToken } = req.body;

    // If email is changing, check that it isn't already taken by another user
    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email,
          NOT: { id: userId },
        },
      });
      if (existingUser) {
        return res.status(400).json({ error: 'Email address is already in use by another account.' });
      }
    }

    const data: any = {};
    if (name) data.name = name;
    if (email) data.email = email;
    if (phoneNumber !== undefined) data.phoneNumber = phoneNumber;
    if (pushToken !== undefined) data.pushToken = pushToken;

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        role: true,
      },
    });

    console.log(`✅ Profile updated in database for user ${userId} (${updated.email})`);
    res.json({ message: 'Profile updated in database', user: updated });
  } catch (error: any) {
    console.error('❌ Profile update error:', error.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// PATCH /api/auth/password
// Protected: Uses verified userId from JWT token
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    // Always use the user ID from the verified JWT token
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) return res.status(400).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    console.log(`🔒 Password updated in database for user ${userId}`);
    res.json({ message: 'Password updated successfully in database' });
  } catch (error: any) {
    console.error('❌ Password change error:', error.message);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// ── Password Reset — tokens stored in Redis (survives server restarts) ────────

// POST /api/auth/forgot-password — Send password reset link to email
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const cleanEmail = email.trim();
    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: cleanEmail,
          mode: 'insensitive',
        },
      },
    });

    if (!user || !user.email) {
      console.log(`⚠️ Password reset attempted for unregistered email: ${cleanEmail}`);
      return res.status(404).json({ error: 'This email is not registered in our database.' });
    }

    // Generate a secure random token
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    // Store in Redis with 30-minute TTL — survives server restarts unlike in-memory Map
    await redis.set(`pwd_reset:${token}`, user.email, 'EX', 30 * 60);

    // Build reset URL — uses the app's frontend URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/mobile/reset-password?token=${token}`;

    await sendPasswordResetEmail(user.email, user.name, resetUrl);
    console.log(`📧 Password reset link sent to ${user.email}`);
    res.json({ message: 'Password reset link has been sent to your email.' });
  } catch (error: any) {
    console.error('❌ Forgot password error:', error.message);
    res.status(500).json({ error: 'Failed to send reset email' });
  }
};

// POST /api/auth/reset-password — Apply new password using token
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });

    // Fetch email from Redis (auto-expires after 30 min)
    const email = await redis.get(`pwd_reset:${token}`);
    if (!email) return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: { passwordHash: newHash },
    });

    // Delete the token immediately — one-time use
    await redis.del(`pwd_reset:${token}`);
    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (error: any) {
    console.error('❌ Reset password error:', error.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

// ── Admin Management ──────────────────────────────────────────────────────────

// POST /api/auth/admin/create — Create a new admin account (admin only)
export const createAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, phoneNumber } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Admin password must be at least 8 characters.' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: hashedPassword,
        phoneNumber: phoneNumber || null,
        role: 'ADMIN',
        isActive: true,
      },
      select: { id: true, name: true, email: true, phoneNumber: true, role: true, isActive: true, createdAt: true },
    });

    console.log(`✅ New admin account created: ${newAdmin.email} by admin ${req.user!.userId}`);
    res.status(201).json({ message: 'Admin account created successfully', admin: newAdmin });
  } catch (error: any) {
    console.error('❌ Create admin error:', error.message);
    res.status(500).json({ error: 'Failed to create admin account' });
  }
};

// GET /api/auth/admins — List all admin accounts (admin only)
export const listAdmins = async (req: AuthRequest, res: Response) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, name: true, email: true, phoneNumber: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(admins);
  } catch (error: any) {
    console.error('❌ List admins error:', error.message);
    res.status(500).json({ error: 'Failed to fetch admin accounts' });
  }
};

// PATCH /api/auth/admin/:id/deactivate — Soft-deactivate an admin account (admin only)
export const deactivateAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Prevent self-deactivation
    if (id === req.user!.userId) {
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'Admin account not found.' });
    if (target.role !== 'ADMIN') return res.status(400).json({ error: 'Only admin accounts can be deactivated here.' });

    // Toggle isActive
    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: !target.isActive },
      select: { id: true, name: true, email: true, isActive: true },
    });

    const action = updated.isActive ? 'reactivated' : 'deactivated';
    console.log(`🔒 Admin ${updated.email} ${action} by ${req.user!.userId}`);
    res.json({ message: `Admin account ${action} successfully.`, admin: updated });
  } catch (error: any) {
    console.error('❌ Deactivate admin error:', error.message);
    res.status(500).json({ error: 'Failed to update admin account status' });
  }
};