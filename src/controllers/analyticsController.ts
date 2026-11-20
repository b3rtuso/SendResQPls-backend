import { Request, Response } from 'express';
import { prisma } from '../config/db';

/**
 * GET /api/analytics/summary — High-performance SQL aggregations for dashboard & analytics KPIs
 */
export const getAnalyticsSummary = async (_req: Request, res: Response) => {
  try {
    // Compute local calendar day boundaries in Asia/Manila (UTC+8, no DST)
    // so UTC-hosted servers (Render) align with Balayan local midnight.
    const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
    const nowPht = new Date(Date.now() + PHT_OFFSET_MS);
    const todayStartUtc = new Date(
      Date.UTC(nowPht.getUTCFullYear(), nowPht.getUTCMonth(), nowPht.getUTCDate()) - PHT_OFFSET_MS
    );
    const tomorrowStartUtc = new Date(todayStartUtc.getTime() + 24 * 60 * 60 * 1000);

    const firstDayOfMonth = new Date(
      Date.UTC(nowPht.getUTCFullYear(), nowPht.getUTCMonth(), 1) - PHT_OFFSET_MS
    );
    const dayOfWeek = nowPht.getUTCDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const firstDayOfWeek = new Date(todayStartUtc.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);

    const [
      statusCounts,
      pendingToday,
      dispatchedToday,
      resolvedToday,
      createdToday,
      createdThisWeek,
      createdThisMonth,
      departmentCounts,
    ] = await Promise.all([
      prisma.incident.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      prisma.incident.count({
        where: {
          status: 'PENDING',
          createdAt: { gte: todayStartUtc, lt: tomorrowStartUtc },
        },
      }),
      prisma.incident.count({
        where: {
          status: 'DISPATCHED',
          createdAt: { gte: todayStartUtc, lt: tomorrowStartUtc },
        },
      }),
      prisma.incident.count({
        where: {
          status: 'RESOLVED',
          createdAt: { gte: todayStartUtc, lt: tomorrowStartUtc },
        },
      }),
      prisma.incident.count({
        where: {
          createdAt: { gte: todayStartUtc, lt: tomorrowStartUtc },
        },
      }),
      prisma.incident.count({
        where: {
          createdAt: { gte: firstDayOfWeek },
        },
      }),
      prisma.incident.count({
        where: {
          createdAt: { gte: firstDayOfMonth },
        },
      }),
      prisma.incident.groupBy({
        by: ['assignedDepartment'],
        _count: { id: true },
        where: {
          assignedDepartment: { not: null },
        },
      }),
    ]);

    const counts: Record<string, number> = {
      PENDING: 0,
      REVIEWING: 0,
      DISPATCHED: 0,
      RESOLVED: 0,
      REJECTED: 0,
    };

    let total = 0;
    statusCounts.forEach((s) => {
      counts[s.status] = s._count.id;
      total += s._count.id;
    });

    const depts: Record<string, number> = {};
    departmentCounts.forEach((d) => {
      if (d.assignedDepartment) {
        depts[d.assignedDepartment] = d._count.id;
      }
    });

    return res.json({
      total,
      pending: counts.PENDING,
      reviewing: counts.REVIEWING,
      dispatched: counts.DISPATCHED,
      resolved: counts.RESOLVED,
      rejected: counts.REJECTED,
      createdToday,
      pendingToday,
      dispatchedToday,
      resolvedToday,
      createdThisWeek,
      createdThisMonth,
      byDepartment: depts,
    });
  } catch (error: any) {
    console.error('❌ getAnalyticsSummary error:', error.message);
    res.status(500).json({ error: 'Failed to calculate analytics summary' });
  }
};

/**
 * GET /api/analytics/distribution — Hazard type distribution
 */
export const getIncidentDistribution = async (_req: Request, res: Response) => {
  try {
    const rawGroups = await prisma.incident.groupBy({
      by: ['aiDetectedType'],
      _count: { id: true },
      where: {
        aiDetectedType: { not: null },
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    });

    const distribution = rawGroups.map((g) => ({
      name: g.aiDetectedType || 'Other',
      value: g._count.id,
    }));

    return res.json(distribution);
  } catch (error: any) {
    console.error('❌ getIncidentDistribution error:', error.message);
    res.status(500).json({ error: 'Failed to calculate incident distribution' });
  }
};

/**
 * GET /api/analytics/top-locations — Top incident hotspot barangays
 */
export const getTopHotspotLocations = async (_req: Request, res: Response) => {
  try {
    const groups = await prisma.incident.groupBy({
      by: ['barangay'],
      _count: { id: true },
      where: {
        barangay: { not: null },
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 5,
    });

    const topLocations = groups.map((g) => ({
      name: g.barangay || 'Balayan Center',
      count: g._count.id,
    }));

    return res.json(topLocations);
  } catch (error: any) {
    console.error('❌ getTopHotspotLocations error:', error.message);
    res.status(500).json({ error: 'Failed to calculate top locations' });
  }
};
