import { Router } from 'express';
import { getCallLogs, createCallLog, deleteCallLog } from '../controllers/callLogController';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

// Call logs are accessible to authenticated administrators
router.get('/', requireAuth, requireAdmin, getCallLogs);
router.post('/', requireAuth, requireAdmin, createCallLog);
router.delete('/:id', requireAuth, requireAdmin, deleteCallLog);

export default router;
