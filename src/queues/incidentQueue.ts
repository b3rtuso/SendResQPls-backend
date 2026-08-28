import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { runAIAnalysis, isRecognizedIncident } from '../services/aiService';
import { prisma } from '../config/db';
import { messaging } from '../config/firebase';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface IncidentJobData {
  incidentId: string;
  imageUrl: string;
  latitude: number;
  longitude: number;
}

// ─── Queue ─────────────────────────────────────────────────────────────────────

/**
 * incidentQueue — incoming jobs are enqueued here by reportIncident controller.
 * The worker below picks them up and processes AI + notifications asynchronously.
 */
export const incidentQueue = new Queue<IncidentJobData>('incident-processing', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,                                    // Retry up to 3 times on failure
    backoff: { type: 'exponential', delay: 2000 }, // 2s → 4s → 8s between retries
    removeOnComplete: 100,                          // Keep last 100 completed jobs for debugging
    removeOnFail: 50,                               // Keep last 50 failed jobs
  },
});

// ─── Direct Processor (Standalone Fallback) ──────────────────────────────────

/**
 * processIncidentDirectly — runs AI classification, database update, FCM notifications,
 * and SSE broadcasts. Can be called by BullMQ worker OR directly by the controller as a fallback.
 */
export async function processIncidentDirectly(
  incidentId: string,
  imageUrl: string,
  _latitude?: number,
  _longitude?: number
) {
  console.log(`⚙️  Processing incident AI & dispatch directly → incident ${incidentId}`);

  // ── 1. Run AI classification ───────────────────────────────────────────────
  const assessment = await runAIAnalysis(imageUrl);
  const aiRecognized: boolean = assessment.recognized ?? isRecognizedIncident(assessment.incidentType);
  const aiConfidence: string = assessment.confidence || (aiRecognized ? 'medium' : 'low');

  // Map AI suggestion to a valid Department enum value
  let recommended: any = 'RESCUE';
  const aiSuggestion = (assessment.recommendedDept || '').toUpperCase();
  if (aiSuggestion.includes('FIRE') || aiSuggestion.includes('BFP')) recommended = 'BFP';
  else if (aiSuggestion.includes('POLICE') || aiSuggestion.includes('PNP')) recommended = 'PNP';
  else if (aiSuggestion.includes('MEDICAL') || aiSuggestion.includes('AMBULANCE')) recommended = 'MEDICAL';
  else if (aiSuggestion.includes('ENGINEERING') || aiSuggestion.includes('ROAD')) recommended = 'ENGINEERING';

  const finalStatus = aiRecognized ? 'PENDING' : 'REVIEWING';

  // ── 2. Update the incident record with AI results ─────────────────────────
  const incident = await prisma.incident.update({
    where: { id: incidentId },
    data: {
      aiDetectedType: assessment.incidentType,
      aiRecommendedDept: aiRecognized ? recommended : undefined,
      severity: assessment.severity || 'MEDIUM',
      urgencyScore: assessment.urgencyScore || 50,
      status: finalStatus,
      adminNotes: aiRecognized
        ? undefined
        : `⚠️ AI could not recognize this incident (confidence: ${aiConfidence}). Admin review required.`,
    },
  });

  // Log AI analysis completed activity
  try {
    const detectedLabel = (assessment.incidentType || 'Emergency').toUpperCase();
    await prisma.incidentActivity.create({
      data: {
        incidentId,
        title: `AI analysis completed — ${detectedLabel} detected`,
        type: 'AI_ANALYSIS',
      },
    });

    if (aiRecognized && recommended) {
      await prisma.incidentActivity.create({
        data: {
          incidentId,
          title: `Auto-assigned to ${recommended} based on AI recommendation`,
          type: 'ASSIGNED',
        },
      });
    }
  } catch (actErr: any) {
    console.warn(`⚠️ Failed to log AI activity for incident ${incidentId}:`, actErr.message);
  }

  console.log(`✅ Incident ${incidentId} updated | Type: ${assessment.incidentType} | Recognized: ${aiRecognized} | Status: ${finalStatus}`);

  // ── 3. Notify admin devices via FCM ───────────────────────────────────────
  if (messaging) {
    try {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', pushToken: { not: null } },
        select: { pushToken: true },
      });
      const adminTokens = admins.map((a: any) => a.pushToken!).filter(Boolean);
      if (adminTokens.length > 0) {
        await messaging.sendEachForMulticast({
          tokens: adminTokens,
          notification: {
            title: aiRecognized ? '🚨 Bagong Emergency Report!' : '⚠️ Hindi Nakilala ang Incident!',
            body: aiRecognized
              ? `${assessment.incidentType} na na-detect sa Balayan. I-review na agad!`
              : `May bagong report na hindi nakilala ng AI. Kailangan ng admin decision.`,
          },
          data: {
            incidentId: incident.id,
            type: aiRecognized ? 'NEW_INCIDENT' : 'UNRECOGNIZED_INCIDENT',
            dept: recommended,
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'emergency_alerts',
              sound: 'default',
              priority: 'high',
              clickAction: 'FCM_PLUGIN_ACTIVITY',
              defaultSound: true,
              defaultVibrateTimings: true,
            },
          },
        });
        console.log(`📱 Admin push sent to ${adminTokens.length} device(s)`);
      }
    } catch (pushErr: any) {
      console.error(`⚠️ Admin push notification failed: ${pushErr.message}`);
    }
  }

  // ── 3b. Notify the reporter that their report was processed ───────────────
  if (messaging) {
    try {
      const reporter = await prisma.user.findUnique({
        where: { id: incident.reporterId },
        select: { pushToken: true },
      });
      if (reporter?.pushToken) {
        await messaging.send({
          token: reporter.pushToken,
          notification: {
            title: '✅ Report Received',
            body: aiRecognized
              ? `Your ${assessment.incidentType} report has been received. Our team will review it shortly.`
              : 'Your report has been received. Our team needs to manually review it.',
          },
          data: {
            incidentId: incident.id,
            type: 'REPORT_CONFIRMED',
            status: finalStatus,
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'emergency_alerts',
              sound: 'default',
              priority: 'high',
              clickAction: 'FCM_PLUGIN_ACTIVITY',
              defaultSound: true,
              defaultVibrateTimings: true,
            },
          },
        });
        console.log(`📱 Reporter confirmation push sent → incident ${incidentId}`);
      }
    } catch (reporterPushErr: any) {
      console.error(`⚠️ Reporter confirmation push failed: ${reporterPushErr.message}`);
    }
  }

  // ── 4. Broadcast SSE to admin web dashboard ───────────────────────────────
  try {
    const { broadcastSseEvent } = await import('../controllers/incidentController');
    if (aiRecognized) {
      broadcastSseEvent('new_incident', {
        id: incident.id,
        aiDetectedType: assessment.incidentType,
        aiRecommendedDept: recommended,
        severity: assessment.severity || 'MEDIUM',
        urgencyScore: assessment.urgencyScore || 50,
        status: 'PENDING',
        createdAt: incident.createdAt,
      });
    } else {
      broadcastSseEvent('unrecognized_incident', {
        id: incident.id,
        aiDetectedType: assessment.incidentType,
        aiConfidence,
        severity: assessment.severity || 'LOW',
        urgencyScore: assessment.urgencyScore || 20,
        status: 'REVIEWING',
        createdAt: incident.createdAt,
      });
    }
  } catch (sseErr: any) {
    console.error(`⚠️ SSE broadcast failed: ${sseErr.message}`);
  }
}

// ─── Worker ────────────────────────────────────────────────────────────────────

/**
 * incidentWorker — runs in the background.
 * For each job: runs AI, updates the incident, sends FCM push, broadcasts SSE.
 * Polling delays tuned for serverless Redis (Upstash) command quotas.
 */
export const incidentWorker = new Worker<IncidentJobData>(
  'incident-processing',
  async (job: Job<IncidentJobData>) => {
    const { incidentId, imageUrl, latitude, longitude } = job.data;
    await processIncidentDirectly(incidentId, imageUrl, latitude, longitude);
  },
  {
    connection: redis,
    concurrency: 5,
    drainDelay: 30000,        // Wait 30s when queue is empty instead of tight polling
    stalledInterval: 120000,  // Check stalled jobs every 2 min
    lockDuration: 60000,      // 60s lock for long Gemini vision queries
  }
);

// ─── Worker event handlers ─────────────────────────────────────────────────────

incidentWorker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

incidentWorker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`);
});
