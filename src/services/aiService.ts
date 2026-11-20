import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

// Known incident types the AI should recognize
const KNOWN_INCIDENT_TYPES = [
  'fire', 'flood', 'accident', 'medical', 'trauma', 'crime',
  'landslide', 'typhoon', 'earthquake', 'rescue', 'emergency',
  'shooting', 'robbery', 'assault', 'drowning', 'explosion',
  'structural', 'road', 'vehicle', 'injury', 'collapse'
];

/** Returns true if the AI incident type is recognizable */
export const isRecognizedIncident = (incidentType: string): boolean => {
  if (!incidentType) return false;
  const lower = incidentType.toLowerCase();
  // Generic/fallback responses are treated as unrecognized
  if (lower.includes('pending review') || lower.includes('unknown') || lower.includes('unclear')) return false;
  return KNOWN_INCIDENT_TYPES.some(keyword => lower.includes(keyword));
};

/** Calculates calibrated severity and urgency score based on incident type and characteristics */
export const calculateUrgency = (
  incidentType: string,
  confidence: string = 'medium'
): { severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; urgencyScore: number } => {
  const lower = (incidentType || '').toLowerCase();

  // CRITICAL: Immediate threat to human life, rapid spread, severe trauma
  if (
    lower.includes('fire') ||
    lower.includes('explosion') ||
    lower.includes('shooting') ||
    lower.includes('collapse') ||
    lower.includes('trauma') ||
    lower.includes('drowning') ||
    lower.includes('cardiac')
  ) {
    const base = 92;
    const bonus = confidence === 'high' ? 6 : confidence === 'low' ? -4 : 0;
    return { severity: 'CRITICAL', urgencyScore: Math.min(100, Math.max(85, base + bonus)) };
  }

  // HIGH: Severe hazard, road accident with injury, flood, medical distress
  if (
    lower.includes('medical') ||
    lower.includes('accident') ||
    lower.includes('vehicle') ||
    lower.includes('flood') ||
    lower.includes('landslide') ||
    lower.includes('robbery') ||
    lower.includes('assault') ||
    lower.includes('typhoon')
  ) {
    const base = 75;
    const bonus = confidence === 'high' ? 7 : confidence === 'low' ? -5 : 0;
    return { severity: 'HIGH', urgencyScore: Math.min(84, Math.max(65, base + bonus)) };
  }

  // MEDIUM: Blocked access, fallen trees, utility failure, property risk
  if (
    lower.includes('tree') ||
    lower.includes('road') ||
    lower.includes('structural') ||
    lower.includes('hazard') ||
    lower.includes('electric') ||
    lower.includes('debris')
  ) {
    const base = 52;
    const bonus = confidence === 'high' ? 8 : confidence === 'low' ? -7 : 0;
    return { severity: 'MEDIUM', urgencyScore: Math.min(64, Math.max(40, base + bonus)) };
  }

  // LOW / Unrecognized
  return { severity: 'LOW', urgencyScore: 25 };
};

export const runAIAnalysis = async (imageUrl: string) => {
  try {
    const genAI = new GoogleGenerativeAI((process.env.GEMINI_API_KEY || "").trim());

    let imageData: string;
    let mimeType = "image/jpeg";

    if (imageUrl.startsWith("data:")) {
      const parts = imageUrl.split(",");
      const match = parts[0].match(/:(.*?);/);
      if (match) mimeType = match[1];
      imageData = parts[1];
    } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      const imageResponse = await axios.get(imageUrl, { responseType: "arraybuffer" });
      const contentType = imageResponse.headers["content-type"];
      if (contentType) mimeType = String(contentType);
      imageData = Buffer.from(imageResponse.data).toString("base64");
    } else {
      const fs = await import("fs/promises");
      const path = await import("path");
      const ext = path.extname(imageUrl).toLowerCase();
      if (ext === ".png") mimeType = "image/png";
      else if (ext === ".webp") mimeType = "image/webp";
      const fileBuffer = await fs.readFile(imageUrl);
      imageData = fileBuffer.toString("base64");
    }

    const prompt = `You are an emergency incident classifier, authenticity evaluator, and urgency rater for MDRRMO Balayan, Batangas Philippines.
Analyze this image to determine:
1. Incident classification and urgency.
2. Authenticity & Real-Time Liveness: Check if this photo captures an active, real-time emergency happening directly in front of the camera, OR if it is a RECAPTURE (a photo taken of another display screen, monitor, TV, phone, tablet, or a physical printed photo/newspaper/document).

Return ONLY a JSON object with this exact structure:
{
  "incidentType": "<Fire|Flood|Vehicular Accident|Medical Emergency|Trauma|Crime|Typhoon|Landslide|Unrecognized>",
  "recommendedDept": "<BFP|PNP|MEDICAL|ENGINEERING|RESCUE|UNKNOWN>",
  "confidence": "<high|medium|low>",
  "severity": "<CRITICAL|HIGH|MEDIUM|LOW>",
  "urgencyScore": <number 1-100>,
  "recognized": <true|false>,
  "isLiveScene": <true|false>,
  "recaptureDetected": <true|false>,
  "recaptureType": "<NONE|SCREEN_DISPLAY|PRINTED_PHOTO|DIGITAL_SCREENSHOT|ARCHIVED_MEDIA>",
  "sceneCategory": "<VALID_EMERGENCY|NON_INCIDENT|BLURRY_OR_DARK|SCREEN_RECAPTURE|PRINT_RECAPTURE|CANNOT_IDENTIFY>",
  "authenticityReasoning": "<concise explanation of whether this is a direct real-time capture or a recapture>",
  "suggestAction": "<PROCESS|REJECT>",
  "reasoning": "<brief explanation of what is detected in the image>"
}

Authenticity & Liveness Detection Rules:
- A photo is a RECAPTURE (recaptureDetected: true, isLiveScene: false) if:
  1. SCREEN_DISPLAY: The photo shows a computer monitor, television, laptop, or mobile screen displaying an incident. Look for visible monitor borders/bezels, LCD moiré scan lines, pixel grids, glare/reflection on glass screens, browser address bars, YouTube/video scrubber bars, or TV broadcast news graphics.
  2. PRINTED_PHOTO: The photo shows a physical paper photo, magazine, newspaper clipping, or framed picture. Look for paper sheen, margins, white border lines, halftone printing artifacts, or fingers visibly holding a physical print.
  3. DIGITAL_SCREENSHOT: The image is a direct device screenshot or downloaded image file rather than a camera shot.
- If recaptureDetected is true, set recognized: false, suggestAction: "REJECT", and explain clearly in authenticityReasoning (e.g., "Photo is recaptured from a computer/TV screen showing old footage rather than an active real-time incident").
- If the image shows a genuine direct, real-world live scene happening in the environment, set isLiveScene: true, recaptureDetected: false, recaptureType: "NONE".

Department Mapping:
- Fire → BFP
- Crime, Violence, Shooting, Disturbance → PNP
- Medical Emergency, Cardiac, Unconscious → MEDICAL
- Trauma, Severe Bleeding, Amputation → MEDICAL
- Vehicular Accident, Collision → RESCUE
- Flood, Water Inundation → RESCUE
- Typhoon, Wind Damage, Fallen Tree → RESCUE
- Landslide, Mudslide, Road Collapse → ENGINEERING
- Unrecognized, Benign scenery, Meme, Non-emergency → UNKNOWN

Severity & Urgency Scoring Rules:
- CRITICAL (85-100): Active raging fires, violent armed crimes, catastrophic structural collapse, drowning, life-threatening disaster.
- HIGH (65-84): Vehicular crashes with injury, deep flood waters, landslides on roads, acute medical emergencies.
- MEDIUM (40-64): Downed utility poles, fallen trees blocking roads, minor structural damage.
- LOW (1-39): Harmless situations, memes, random objects, benign landscapes, selfies.

Strict Validation & Scene Category Rules:
- VALID_EMERGENCY: Image clearly depicts an actual disaster/emergency happening live → recognized: true, isLiveScene: true, sceneCategory: "VALID_EMERGENCY", suggestAction: "PROCESS"
- NON_INCIDENT: Image is clear enough to identify what is shown, and it is NOT an emergency — including ordinary outdoor or indoor scenery/landscapes (sky, trees, roads, buildings, rooms), casual photos of a person or people (portraits, selfies, someone standing or smiling with no visible injury, bleeding, collapse, or distress), memes, random objects, logos, food, pets, or everyday scenes → recognized: false, incidentType: "Unrecognized", recommendedDept: "UNKNOWN", severity: "LOW", urgencyScore: 10, sceneCategory: "NON_INCIDENT", suggestAction: "REJECT"
- BLURRY_OR_DARK: Image is too blurry, shaky, out of focus, dark, or obstructed to tell what is in the photo → recognized: false, incidentType: "Unrecognized", recommendedDept: "UNKNOWN", severity: "LOW", urgencyScore: 15, sceneCategory: "BLURRY_OR_DARK", suggestAction: "REJECT"
- SCREEN_RECAPTURE: Photo of a phone/monitor/TV screen or digital screenshot → recognized: false, isLiveScene: false, recaptureDetected: true, sceneCategory: "SCREEN_RECAPTURE", suggestAction: "REJECT"
- PRINT_RECAPTURE: Photo of a physical printed picture, paper, or newspaper → recognized: false, isLiveScene: false, recaptureDetected: true, sceneCategory: "PRINT_RECAPTURE", suggestAction: "REJECT"
- CANNOT_IDENTIFY: Only use when the photo is genuinely ambiguous and cannot be classified as a valid emergency, ordinary scenery, a casual person photo, blurry/dark, or a recapture → recognized: false, incidentType: "Unrecognized", recommendedDept: "UNKNOWN", severity: "LOW", urgencyScore: 20, sceneCategory: "CANNOT_IDENTIFY", suggestAction: "REJECT"
- When in doubt, default to recognized: false and suggestAction: "REJECT" to prevent false alarms.`;

    const candidateModels = [
      process.env.GEMINI_MODEL,
      "gemini-3.6-flash",
      "gemini-flash-latest",
    ].filter(Boolean) as string[];

    let parsed: any = null;
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        let attempts = 0;
        let result: any = null;
        while (attempts < 2) {
          try {
            result = await model.generateContent([
              prompt,
              { inlineData: { data: imageData, mimeType } }
            ]);
            break;
          } catch (genErr: any) {
            attempts++;
            const errMsg = (genErr.message || '').toLowerCase();
            if (errMsg.includes('not found') || errMsg.includes('no longer available')) {
              throw genErr;
            }
            if (attempts >= 2 || (!errMsg.includes('429') && !errMsg.includes('503') && !errMsg.includes('high demand') && !errMsg.includes('quota') && !errMsg.includes('resource_exhausted'))) {
              throw genErr;
            }
            console.warn(`⚠️ Gemini rate limit hit on ${modelName}, backing off 2s before retry (attempt ${attempts})...`);
            await new Promise(r => setTimeout(r, 2000));
          }
        }
        if (result) {
          const text = result.response.text();
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
          if (parsed && typeof parsed === 'object') break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`⚠️ Gemini model ${modelName} failed (${err.message}), trying next candidate...`);
        continue;
      }
    }

    if (!parsed) {
      throw lastError || new Error("Failed to generate content with any Gemini model.");
    }

    // Normalize the recognized flag
    if (parsed.recognized === undefined) {
      parsed.recognized = isRecognizedIncident(parsed.incidentType);
    }

    // Normalize liveness & recapture metadata
    if (parsed.isLiveScene === undefined) {
      parsed.isLiveScene = !parsed.recaptureDetected;
    }
    if (parsed.recaptureDetected === undefined) {
      parsed.recaptureDetected = parsed.isLiveScene === false;
    }
    if (parsed.recaptureDetected) {
      // If a recapture was detected (photo of a screen, monitor, or printout),
      // prevent auto-dispatch by setting recognized to false
      parsed.recognized = false;
      parsed.suggestAction = "REJECT";
      if (!parsed.sceneCategory || parsed.sceneCategory === 'VALID_EMERGENCY') {
        parsed.sceneCategory =
          String(parsed.recaptureType || '').toUpperCase() === 'PRINTED_PHOTO'
            ? 'PRINT_RECAPTURE'
            : 'SCREEN_RECAPTURE';
      }
    }

    if (!parsed.sceneCategory) {
      parsed.sceneCategory = parsed.recognized ? 'VALID_EMERGENCY' : 'CANNOT_IDENTIFY';
    }

    // Ensure calibrated severity and urgency score
    const fallback = calculateUrgency(parsed.incidentType, parsed.confidence);
    if (!parsed.severity) parsed.severity = fallback.severity;
    if (!parsed.urgencyScore || typeof parsed.urgencyScore !== 'number') {
      parsed.urgencyScore = fallback.urgencyScore;
    }

    return parsed;

  } catch (error: any) {
    console.error("❌ Gemini AI Service Error:", error.message);
    const fallback = calculateUrgency("Emergency (Pending Review)", "low");
    return {
      incidentType: "Emergency (Pending Review)",
      recommendedDept: "RESCUE",
      confidence: "low",
      severity: fallback.severity,
      urgencyScore: fallback.urgencyScore,
      recognized: false,
      isLiveScene: true,
      recaptureDetected: false,
      recaptureType: "NONE",
      sceneCategory: "CANNOT_IDENTIFY",
      authenticityReasoning: "Fallback assessment due to service error",
    };
  }
};