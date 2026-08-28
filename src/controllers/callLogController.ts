import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { AuthRequest } from '../middleware/auth';

/**
 * GET /api/call-logs
 * Retrieves call logs with optional search, status filter, and summary metrics.
 */
export const getCallLogs = async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;

    const where: any = {};

    if (status && status !== 'ALL') {
      where.status = String(status);
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim();
      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { requestId: { contains: q, mode: 'insensitive' } },
        { callerName: { contains: q, mode: 'insensitive' } },
        { department: { contains: q, mode: 'insensitive' } },
        { contact: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [logs, total, accepted, noResponse, declined] = await Promise.all([
      prisma.callLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
      }),
      prisma.callLog.count(),
      prisma.callLog.count({ where: { status: 'Accepted' } }),
      prisma.callLog.count({ where: { status: 'No Response' } }),
      prisma.callLog.count({ where: { status: 'Declined' } }),
    ]);

    res.json({
      logs,
      metrics: {
        total,
        accepted,
        noResponse,
        declined,
      },
    });
  } catch (error: any) {
    console.error('❌ GET call logs error:', error.message);
    res.status(500).json({ error: 'Failed to fetch call logs' });
  }
};

/**
 * POST /api/call-logs
 * Creates a new call log entry when a call is initiated or logged.
 */
export const createCallLog = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId, callerName, department, contact, duration, status } = req.body;

    if (!department || !contact) {
      return res.status(400).json({ error: 'Department and contact phone number are required' });
    }

    const caller = callerName || req.user?.name || 'MDRRMO Dispatcher';

    const log = await prisma.callLog.create({
      data: {
        requestId: requestId || null,
        callerName: caller,
        department: String(department),
        contact: String(contact),
        duration: duration || '0:45',
        status: status || 'Accepted',
        timestamp: new Date(),
      },
    });

    console.log(`📞 Call log created: ${log.department} (${log.contact}) by ${log.callerName}`);

    res.status(201).json(log);
  } catch (error: any) {
    console.error('❌ Create call log error:', error.message);
    res.status(500).json({ error: 'Failed to create call log' });
  }
};

/**
 * DELETE /api/call-logs/:id
 * Removes a specific call log entry.
 */
export const deleteCallLog = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.callLog.delete({ where: { id } });
    res.json({ message: 'Call log deleted successfully' });
  } catch (error: any) {
    console.error('❌ Delete call log error:', error.message);
    res.status(500).json({ error: 'Failed to delete call log' });
  }
};
