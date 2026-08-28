import { Router } from 'express';
import { getCallLogs, createCallLog, deleteCallLog } from '../controllers/callLogController';
import { requireAdmin } from '../middleware/auth';

const router = Router();

// Call logs are accessible to authenticated administrators
router.get('/', requireAdmin, getCallLogs);
router.post('/', requireAdmin, createCallLog);
router.delete('/:id', requireAdmin, deleteCallLog);

export default router;
