import { Router } from 'express';
import { getCallLogs, createCallLog, deleteCallLog } from '../controllers/callLogController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// Call logs are accessible to authenticated administrators
router.get('/', authenticate, requireAdmin, getCallLogs);
router.post('/', authenticate, requireAdmin, createCallLog);
router.delete('/:id', authenticate, requireAdmin, deleteCallLog);

export default router;
