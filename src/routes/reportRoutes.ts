import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { downloadOfficialReport } from '../controllers/reportController';

const router = Router();

// GET /api/reports/download?range=daily|weekly|monthly&date=YYYY-MM-DD
router.get('/download', requireAdmin, downloadOfficialReport);

export default router;
