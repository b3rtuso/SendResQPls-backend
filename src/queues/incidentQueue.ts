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
export const incidentQueue = redis
  ? new Queue<IncidentJobData>('incident-processing', {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,                                    // Retry up to 3 times on failure
        backoff: { type: 'exponential', delay: 2000 }, // 2s → 4s → 8s between retries
        removeOnComplete: 100,                          // Keep last 100 completed jobs for debugging
        removeOnFail: 50,                               // Keep last 50 failed jobs
      },
    })
  : null;

/**
 * Maps an AI vision assessment into a clear, standardized plain-language adminNote
 * for non-recognized or recaptured photos (used by both live ingest and re-analysis).
 */
export function buildAdminNoteFromAssessment(
  assessment: any,
  isRecapture: boolean,
  aiRecognized: boolean,
  isLowConfidence: boolean
): string | undefined {
  const sceneCategory = String(assessment?.sceneCategory || '').toUpperCase().trim();
  const recaptureType = String(assessment?.recaptureType || '').toUpperCase().trim();
  const reasonText = `${assessment?.reasoning || ''} ${assessment?.authenticityReasoning || ''}`.toLowerCase();

  // 1. Print recapture
  if (
    sceneCategory === 'PRINT_RECAPTURE' ||
    sceneCategory === 'PRINTED_PHOTO' ||
    recaptureType === 'PRINTED_PHOTO' ||
    (isRecapture && (reasonText.includes('print') || reasonText.includes('paper')))
  ) {
    return 'Print recapture: Photo looks taken from a printed picture. Please check with the reporter.';
  }

  // 2. Blurry photo
  if (
    sceneCategory === 'BLURRY_OR_DARK' ||
    sceneCategory === 'BLURRY_PHOTO' ||
    sceneCategory === 'BLURRY'
  ) {
    return 'Blurry photo: Image is too blurry or dark to see clearly. Please check with the reporter.';
  }

  // 3. Non-incident related
  if (
    sceneCategory === 'NON_INCIDENT' ||
    sceneCategory === 'NON_INCIDENT_RELATED'
  ) {
    return 'Non-incident related: Photo does not show an emergency. Please check with the reporter.';
  }

  // 4. Screen recapture
  if (
    sceneCategory === 'SCREEN_RECAPTURE' ||
    sceneCategory === 'SCREEN_DISPLAY' ||
    sceneCategory === 'DIGITAL_SCREENSHOT' ||
    recaptureType === 'SCREEN_DISPLAY' ||
    recaptureType === 'DIGITAL_SCREENSHOT' ||
    isRecapture
  ) {
    return 'Screen recapture: Photo looks taken from a screen. Please check with the reporter.';
  }

  // 5. Verified Live Scene (valid emergency)
  if (aiRecognized || sceneCategory === 'VALID_EMERGENCY' || sceneCategory === 'LIVE_SCENE') {
    return undefined;
  }

  // Service fallback check (only if AI service was unreachable / errored)
  const isServiceFallback =
    reasonText.includes('ai service issue') ||
    reasonText.includes('fallback assessment due to service error') ||
    reasonText.includes('image data was unreachable');

  if (isServiceFallback) {
    return 'Cannot identify: Could not tell what is in the photo. Please check with the reporter.';
  }

  // Keyword fallback between Blurry photo vs Non-incident related
  const hasBlurHint =
    /\b(blur|blurry|out of focus|defocused|too dark|pitch dark|low light|poor quality)\b/.test(reasonText) &&
    !/\b(no blur|not blurry)\b/.test(reasonText);

  if (hasBlurHint) {
    return 'Blurry photo: Image is too blurry or dark to see clearly. Please check with the reporter.';
  }

  return 'Non-incident related: Photo does not show an emergency. Please check with the reporter.';
}

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

  // ── 1. Run AI classification & Real-time Liveness Audit ───────────────────
  const assessment = await runAIAnalysis(imageUrl);
  const rawConfidence: string = (assessment.confidence || '').toLowerCase();
  const isLowConfidence: boolean = rawConfidence === 'low';
  const isRecapture: boolean = Boolean(
    assessment.recaptureDetected ||
    assessment.sceneCategory === 'PRINT_RECAPTURE' ||
    assessment.sceneCategory === 'SCREEN_RECAPTURE'
  );
  // Treat incident as recognized ONLY if recognized flag is true, confidence is NOT low, AND it is NOT a recapture
  const baseRecognized: boolean = assessment.recognized ?? isRecognizedIncident(assessment.incidentType);
  const aiRecognized: boolean = baseRecognized && !isLowConfidence && !isRecapture;
  const aiConfidence: string = assessment.confidence || (aiRecognized ? 'medium' : 'low');

  // Dynamically resolve AI suggestion against all registered departments in the database
  let recommended = 'RESCUE';
  try {
    const allDepts = await prisma.departmentInfo.findMany({ select: { name: true, fullName: true } });
    const aiSuggestion = (assessment.recommendedDept || '').toUpperCase();
    const incType = (assessment.incidentType || '').toUpperCase();

    if (allDepts.length > 0) {
      // 1. Direct match on code
      const exact = allDepts.find(d => d.name.toUpperCase() === aiSuggestion);
      if (exact) {
        recommended = exact.name;
      } else {
        // 2. Match against full name or incident keywords
        const matched = allDepts.find(d => {
          const n = d.name.toUpperCase();
          const fn = (d.fullName || '').toUpperCase();
          if ((aiSuggestion.includes('FIRE') || incType.includes('FIRE')) && (n.includes('BFP') || fn.includes('FIRE'))) return true;
          if ((aiSuggestion.includes('POLICE') || incType.includes('CRIME') || incType.includes('SHOOTING')) && (n.includes('PNP') || fn.includes('POLICE'))) return true;
          if ((aiSuggestion.includes('MEDIC') || aiSuggestion.includes('AMBULANCE') || incType.includes('MEDIC') || incType.includes('TRAUMA')) && (n.includes('MEDIC') || fn.includes('HEALTH') || fn.includes('AMBULANCE'))) return true;
          if ((aiSuggestion.includes('ENGINEER') || aiSuggestion.includes('ROAD') || incType.includes('COLLAPSE') || incType.includes('TREE')) && (n.includes('ENGINEER') || fn.includes('ENGINEER') || fn.includes('PUBLIC WORKS'))) return true;
          if ((aiSuggestion.includes('COAST') || incType.includes('DROWN') || incType.includes('SEA')) && (n.includes('COAST') || n.includes('PCG') || fn.includes('COAST GUARD'))) return true;
          return aiSuggestion.includes(n) || (aiSuggestion.length > 2 && fn.includes(aiSuggestion));
        });
        if (matched) {
          recommended = matched.name;
        } else {
          const rescueDept = allDepts.find(d => d.name.toUpperCase().includes('RESCUE'));
          recommended = rescueDept ? rescueDept.name : allDepts[0].name;
        }
      }
    }
  } catch (deptErr: any) {
    console.warn('⚠️ Dynamic department matching fallback:', deptErr.message);
    recommended = 'RESCUE';
  }

  const finalStatus = aiRecognized ? 'PENDING' : 'REVIEWING';

  // ── 2. Update the incident record with AI results ─────────────────────────
  const adminNoteMsg = buildAdminNoteFromAssessment(assessment, isRecapture, aiRecognized, isLowConfidence);

  const incident = await prisma.incident.update({
    where: { id: incidentId },
    data: {
      aiDetectedType: assessment.incidentType,
      aiRecommendedDept: aiRecognized ? recommended : undefined,
      severity: assessment.severity || 'MEDIUM',
      urgencyScore: assessment.urgencyScore || 50,
      status: finalStatus,
      adminNotes: adminNoteMsg,
    },
  });

  console.log(`✅ Incident ${incidentId} updated | Type: ${assessment.incidentType} | Recognized: ${aiRecognized} | Status: ${finalStatus}`);

  // ── 2b. Broadcast SSE IMMEDIATELY to admin web dashboard (0ms wait on FCM/activity logs) ──
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
        aiDetectedType: isLowConfidence ? `${assessment.incidentType} (Low Confidence)` : assessment.incidentType,
        aiConfidence,
        adminNotes: adminNoteMsg,
        sceneCategory: assessment.sceneCategory,
        severity: assessment.severity || 'LOW',
        urgencyScore: assessment.urgencyScore || 20,
        status: 'REVIEWING',
        createdAt: incident.createdAt,
      });
    }
  } catch (sseErr: any) {
    console.error(`⚠️ SSE broadcast failed: ${sseErr.message}`);
  }

  // ── 3. Run Activity Logs & FCM Push Notifications in parallel (non-blocking for SSE) ──
  const detectedLabel = (assessment.incidentType || 'Emergency').toUpperCase();
  const activitiesToCreate: Array<{ incidentId: string; title: string; type: string }> = [
    {
      incidentId,
      title: `AI analysis completed — ${detectedLabel} detected`,
      type: 'AI_ANALYSIS',
    },
  ];
  if (isRecapture) {
    activitiesToCreate.push({
      incidentId,
      title: `⚠️ Liveness alert: Suspected recapture (${assessment.recaptureType || 'Screen/Photo'})`,
      type: 'AI_ANALYSIS',
    });
  }
  if (aiRecognized && recommended) {
    activitiesToCreate.push({
      incidentId,
      title: `Auto-assigned to ${recommended} based on AI recommendation`,
      type: 'ASSIGNED',
    });
  }

  await Promise.allSettled([
    prisma.incidentActivity
      .createMany({ data: activitiesToCreate })
      .catch((actErr: any) => console.warn(`⚠️ Failed to log AI activities for incident ${incidentId}:`, actErr.message)),

    // Admin FCM push
    (async () => {
      if (!messaging) return;
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', pushToken: { not: null } },
        select: { pushToken: true },
      });
      const adminTokens = admins.map((a: any) => a.pushToken!).filter(Boolean);
      if (adminTokens.length > 0) {
        await messaging.sendEachForMulticast({
          tokens: adminTokens,
          notification: {
            title: isRecapture ? '⚠️ SUSPECTED RECAPTURE / FAKE REPORT!' : (aiRecognized ? '🚨 Bagong Emergency Report!' : '⚠️ Hindi Nakilala ang Incident!'),
            body: isRecapture
              ? `AI detected non-realtime recaptured media (${assessment.recaptureType || 'Screen/Photo'}). Admin review required.`
              : (aiRecognized
                  ? `${assessment.incidentType} na na-detect sa Balayan. I-review na agad!`
                  : `May bagong report na hindi nakilala ng AI. Kailangan ng admin decision.`),
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
    })().catch((pushErr: any) => console.error(`⚠️ Admin push notification failed: ${pushErr.message}`)),

    // Reporter confirmation FCM push
    (async () => {
      if (!messaging) return;
      const reporter = await prisma.user.findUnique({
        where: { id: incident.reporterId },
        select: { pushToken: true },
      });
      if (reporter?.pushToken) {
        await messaging.send({
          token: reporter.pushToken,
          notification: {
            title: '📋 Report Received',
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
    })().catch((reporterPushErr: any) => console.error(`⚠️ Reporter confirmation push failed: ${reporterPushErr.message}`)),
  ]);
}

// ─── Worker ────────────────────────────────────────────────────────────────────

/**
 * incidentWorker — runs in the background.
 * For each job: runs AI, updates the incident, sends FCM push, broadcasts SSE.
 * Polling delays tuned for serverless Redis (Upstash) command quotas.
 */
export const incidentWorker = redis
  ? new Worker<IncidentJobData>(
      'incident-processing',
      async (job: Job<IncidentJobData>) => {
        const { incidentId, imageUrl, latitude, longitude } = job.data;
        await processIncidentDirectly(incidentId, imageUrl, latitude, longitude);
      },
      {
        connection: redis,
        concurrency: 3,           // 3 concurrent jobs (safe balance)
        limiter: {
          max: 12,                // Max 12 requests per minute (Gemini free tier quota is 15 RPM)
          duration: 60000,
        },
        drainDelay: 1,            // Immediate job pickup when queue wakes up
        stalledInterval: 120000,  // Check stalled jobs every 2 min
        lockDuration: 60000,      // 60s lock for long Gemini vision queries
      }
    )
  : null;

// ─── Worker event handlers ─────────────────────────────────────────────────────

if (incidentWorker) {
  incidentWorker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} completed`);
  });

  incidentWorker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`);
  });
}
