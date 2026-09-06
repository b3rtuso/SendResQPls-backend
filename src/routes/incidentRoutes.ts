import { Router } from 'express';
import { upload } from '../middleware/upload';
import { requireAuth, requireAdmin } from '../middleware/auth';
import {
  getIncidents,
  getIncident,
  getIncidentStats,
  getMyIncidents,
  reportIncident,
  updateIncidentStatus,
  reverseGeocode,
  addSseClient,
  removeSseClient,
  testPushNotification,
  lockIncident,
  heartbeatIncident,
  unlockIncident,
  forceUnlockIncident,
} from '../controllers/incidentController';


const router = Router();

// Stats must come BEFORE /:id to avoid matching "stats" as an id — admin only
router.get('/stats', requireAdmin, getIncidentStats);

// Geocoding reverse lookup — open (no user data exposed)
router.get('/geocode/reverse', reverseGeocode);

// SSE: Admin web panel real-time incident stream — admin only, must be before /:id
router.get('/sse', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  addSseClient(res);
  console.log(`?? SSE client connected`);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeSseClient(res);
    console.log('?? SSE client disconnected');
  });
});

// User's own incidents (mobile history) — auth required; citizen: own only, admin: any userId
router.get('/my/:userId', requireAuth, getMyIncidents);

// Test push notification (debugging) — admin only
router.post('/test-push', requireAdmin, testPushNotification);

// List ALL incidents — admin only
router.get('/', requireAdmin, getIncidents);

// Get single incident — auth required; controller enforces citizen = own only
router.get('/:id', requireAuth, getIncident);

// Submit a new report — any authenticated user
router.post('/report', requireAuth, upload.single('photo'), reportIncident);

// Admin updates the situation
router.patch('/:id/status', requireAdmin, updateIncidentStatus);

// Incident Concurrency Locking Routes (admin only)
router.post('/:id/lock', requireAdmin, lockIncident);
router.post('/:id/heartbeat', requireAdmin, heartbeatIncident);
router.post('/:id/unlock', requireAdmin, unlockIncident);
router.post('/:id/force-unlock', requireAdmin, forceUnlockIncident);

export default router;
