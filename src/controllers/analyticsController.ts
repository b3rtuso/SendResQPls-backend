import { Request, Response } from 'express';
import { prisma } from '../config/db';

/**
 * GET /api/analytics/summary — High-performance SQL aggregations for dashboard & analytics KPIs
 */
export const getAnalyticsSummary = async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayOfWeek = new Date(today);
    const day = today.getDay();
    firstDayOfWeek.setDate(today.getDate() - (day === 0 ? 6 : day - 1));

    const [
      statusCounts,
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
          status: 'RESOLVED',
          updatedAt: { gte: today },
        },
      }),
      prisma.incident.count({
        where: {
          createdAt: { gte: today },
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
      resolvedToday,
      createdToday,
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
