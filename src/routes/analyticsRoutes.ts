import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import {
  getAnalyticsSummary,
  getIncidentDistribution,
  getTopHotspotLocations,
} from '../controllers/analyticsController';

const router = Router();

// KPI Summary (status counts, resolved today, period aggregations)
router.get('/summary', requireAdmin, getAnalyticsSummary);

// Hazard type breakdown for donut/pie charts
router.get('/distribution', requireAdmin, getIncidentDistribution);

// Top hotspot barangays
router.get('/top-locations', requireAdmin, getTopHotspotLocations);

export default router;
