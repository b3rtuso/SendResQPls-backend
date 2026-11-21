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
      // If hosted on Cloudinary, fetch a lightweight 768px compressed JPEG for fast AI analysis
      // (the original high-resolution URL remains saved in the database for dispatchers)
      const optimizedUrl =
        imageUrl.includes("res.cloudinary.com") && imageUrl.includes("/image/upload/")
          ? imageUrl.replace("/image/upload/", "/image/upload/w_768,q_auto:good,f_jpg/")
          : imageUrl;
      let imageResponse;
      try {
        imageResponse = await axios.get(optimizedUrl, { responseType: "arraybuffer", timeout: 8000 });
      } catch {
        imageResponse = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 8000 });
      }
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

    const prompt = `You are an emergency incident photo classifier, authenticity evaluator, and urgency rater for MDRRMO Balayan, Batangas, Philippines.

Analyze the submitted image by following this strict 5-CATEGORY DECISION TREE in priority order (choose exactly ONE sceneCategory from the 5 categories below):

STEP 1 — Check for PRINT_RECAPTURE (Photo of a Physical Print):
- Does the photo show a physical printed picture, paper printout, magazine, newspaper, document, or framed photo?
- Look for: visible paper edges/corners, white paper borders/margins, paper creases/folds/sheen, a desk/table/logbook/keyboard background surrounding a printed sheet, halftone ink dots, or hands/fingers holding paper.
- If YES → set:
  "sceneCategory": "PRINT_RECAPTURE", "recognized": false, "isLiveScene": false, "recaptureDetected": true, "recaptureType": "PRINTED_PHOTO", "incidentType": "Unrecognized", "recommendedDept": "UNKNOWN", "severity": "LOW", "urgencyScore": 0, "suggestAction": "REJECT"

STEP 2 — Check for SCREEN_RECAPTURE (Photo of a Digital Screen or Screenshot):
- Is the image a photo taken of another digital display screen (phone, computer monitor, laptop, tablet, television) OR a digital screenshot?
- Look for: screen bezels/monitor frames, LCD pixel grid/moiré scan lines, glass glare/reflection on a screen, browser tabs/address bars, mobile status bars, app UI overlays, or video player scrubber bars.
- If YES → set:
  "sceneCategory": "SCREEN_RECAPTURE", "recognized": false, "isLiveScene": false, "recaptureDetected": true, "recaptureType": "SCREEN_DISPLAY", "incidentType": "Unrecognized", "recommendedDept": "UNKNOWN", "severity": "LOW", "urgencyScore": 0, "suggestAction": "REJECT"

STEP 3 — Check for BLURRY_OR_DARK (Blurry, Out-of-Focus, Dark, or Obstructed Photo):
- Is the photo too blurry, out of focus, motion-blurred, defocused, pitch-dark, severely overexposed, or physically obstructed (e.g. lens covered) to clearly see any subject or scene?
- If YES → set:
  "sceneCategory": "BLURRY_OR_DARK", "recognized": false, "isLiveScene": true, "recaptureDetected": false, "recaptureType": "NONE", "incidentType": "Unrecognized", "recommendedDept": "UNKNOWN", "severity": "LOW", "urgencyScore": 15, "suggestAction": "REJECT"

STEP 4 — Check for NON_INCIDENT (Clear Real-World Photo with NO Emergency):
- Is the photo reasonably visible, taken directly in the real world (not a print or screen), and shows NO active emergency, hazard, or injury?
- Examples of NON_INCIDENT:
  • Outdoor or indoor scenery (trees, sky, calm street, buildings, houses, walls, floors, ceiling, empty room, furniture)
  • Casual photo of a person or people (selfies, portraits, people standing/sitting/walking/talking/smiling indoors or outdoors with NO visible injury, bleeding, collapse, or distress)
  • Everyday objects, documents, food, pets, vehicles parked normally, or harmless scenes
- If YES → set:
  "sceneCategory": "NON_INCIDENT", "recognized": false, "isLiveScene": true, "recaptureDetected": false, "recaptureType": "NONE", "incidentType": "Unrecognized", "recommendedDept": "UNKNOWN", "severity": "LOW", "urgencyScore": 10, "suggestAction": "REJECT"

STEP 5 — Check for VALID_EMERGENCY (Verified Live Scene Photo of an Active Emergency):
- Is the photo a direct, real-time camera capture of an active emergency or life-safety hazard happening live in front of the camera?
- Valid Incident Types & Department Mapping:
  • "Fire" (active flames, structure/vehicle/grass fire, heavy smoke plume) → "BFP"
  • "Crime" (active violence, assault, armed threat, crime scene) → "PNP"
  • "Medical Emergency" (unconscious/collapsed person, cardiac/respiratory distress, acute medical crisis) → "MEDICAL"
  • "Trauma" (severe bleeding, open wounds, fracture, physical trauma victim) → "MEDICAL"
  • "Vehicular Accident" (crashed/collided/overturned vehicles, road collision victim) → "RESCUE"
  • "Flood" (flooded road/street/house, rising floodwater, stranded residents/vehicles) → "RESCUE"
  • "Typhoon" (severe storm damage, fallen trees/poles blocking road, blown-off roof) → "RESCUE"
  • "Landslide" (collapsed slope, mudslide, rockfall, road collapse) → "ENGINEERING"
- Severity & Urgency Score (for VALID_EMERGENCY):
  • "CRITICAL" (85-100): Raging fire, violent crime, severe crash with trapped/bleeding victims, deep life-threatening flood, structural collapse.
  • "HIGH" (65-84): Vehicular collision, significant road/residential flooding, landslide blocking road, acute medical/trauma emergency.
  • "MEDIUM" (40-64): Fallen tree/utility pole, localized minor flooding, minor property damage.
- If YES → set:
  "sceneCategory": "VALID_EMERGENCY", "recognized": true, "isLiveScene": true, "recaptureDetected": false, "recaptureType": "NONE", "suggestAction": "PROCESS"

Return ONLY a valid JSON object matching this exact schema:
{
  "incidentType": "<Fire|Flood|Vehicular Accident|Medical Emergency|Trauma|Crime|Typhoon|Landslide|Unrecognized>",
  "recommendedDept": "<BFP|PNP|MEDICAL|ENGINEERING|RESCUE|UNKNOWN>",
  "confidence": "<high|medium|low>",
  "severity": "<CRITICAL|HIGH|MEDIUM|LOW>",
  "urgencyScore": <number 0-100>,
  "recognized": <true|false>,
  "isLiveScene": <true|false>,
  "recaptureDetected": <true|false>,
  "recaptureType": "<NONE|SCREEN_DISPLAY|PRINTED_PHOTO>",
  "sceneCategory": "<PRINT_RECAPTURE|SCREEN_RECAPTURE|BLURRY_OR_DARK|NON_INCIDENT|VALID_EMERGENCY>",
  "authenticityReasoning": "<1 short sentence (max 15 words)>",
  "suggestAction": "<PROCESS|REJECT>",
  "reasoning": "<1 short sentence (max 15 words)>"
}`;

    const envModel = (process.env.GEMINI_MODEL || "").trim();
    const isValidEnvModel =
      envModel &&
      !envModel.includes("1.5") &&
      !envModel.includes("2.0") &&
      !envModel.includes("2.5");

    // Prioritize gemini-flash-latest first to avoid gemini-3.6-flash's 20 req/day Free Tier bottleneck
    const candidateModels = Array.from(
      new Set([
        ...(isValidEnvModel ? [envModel] : []),
        "gemini-flash-latest",
        "gemini-3.6-flash",
      ])
    );

    let parsed: any = null;
    let lastError: any = null;

    // Fast pass across candidate models (0ms delay on failover to next model)
    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 256,
            responseMimeType: "application/json",
          },
        });
        const result = await model.generateContent([
          prompt,
          { inlineData: { data: imageData, mimeType } },
        ]);
        if (result) {
          const text = result.response.text();
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
          if (parsed && typeof parsed === "object") break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`⚠️ Gemini model ${modelName} failed (${err.message}), switching immediately to next candidate...`);
        continue;
      }
    }

    if (!parsed) {
      throw lastError || new Error("Failed to generate content with any Gemini model.");
    }

    // Normalize sceneCategory aliases into the 5 canonical categories
    const rawCategory = String(parsed.sceneCategory || "").toUpperCase().trim();
    const rawRecaptureType = String(parsed.recaptureType || "").toUpperCase().trim();
    const combinedReasoning = `${parsed.reasoning || ""} ${parsed.authenticityReasoning || ""}`.toLowerCase();

    if (
      rawCategory === "PRINT_RECAPTURE" ||
      rawCategory === "PRINTED_PHOTO" ||
      rawRecaptureType === "PRINTED_PHOTO"
    ) {
      parsed.sceneCategory = "PRINT_RECAPTURE";
      parsed.recaptureDetected = true;
      parsed.recaptureType = "PRINTED_PHOTO";
      parsed.isLiveScene = false;
      parsed.recognized = false;
      parsed.suggestAction = "REJECT";
    } else if (
      rawCategory === "SCREEN_RECAPTURE" ||
      rawCategory === "SCREEN_DISPLAY" ||
      rawCategory === "DIGITAL_SCREENSHOT" ||
      rawRecaptureType === "SCREEN_DISPLAY" ||
      rawRecaptureType === "DIGITAL_SCREENSHOT"
    ) {
      parsed.sceneCategory = "SCREEN_RECAPTURE";
      parsed.recaptureDetected = true;
      parsed.recaptureType = "SCREEN_DISPLAY";
      parsed.isLiveScene = false;
      parsed.recognized = false;
      parsed.suggestAction = "REJECT";
    } else if (
      rawCategory === "BLURRY_OR_DARK" ||
      rawCategory === "BLURRY_PHOTO" ||
      rawCategory === "BLURRY"
    ) {
      parsed.sceneCategory = "BLURRY_OR_DARK";
      parsed.recaptureDetected = false;
      parsed.recaptureType = "NONE";
      parsed.isLiveScene = true;
      parsed.recognized = false;
      parsed.suggestAction = "REJECT";
    } else if (
      rawCategory === "NON_INCIDENT" ||
      rawCategory === "NON_INCIDENT_RELATED"
    ) {
      parsed.sceneCategory = "NON_INCIDENT";
      parsed.recaptureDetected = false;
      parsed.recaptureType = "NONE";
      parsed.isLiveScene = true;
      parsed.recognized = false;
      parsed.suggestAction = "REJECT";
    } else if (
      rawCategory === "VALID_EMERGENCY" ||
      rawCategory === "LIVE_SCENE" ||
      rawCategory === "LIVE_SCENE_PHOTO"
    ) {
      parsed.sceneCategory = "VALID_EMERGENCY";
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
      parsed.recaptureDetected =
        parsed.sceneCategory === "PRINT_RECAPTURE" ||
        parsed.sceneCategory === "SCREEN_RECAPTURE";
    }
    if (parsed.recaptureDetected) {
      parsed.recognized = false;
      parsed.isLiveScene = false;
      parsed.suggestAction = "REJECT";
      if (
        parsed.sceneCategory !== "PRINT_RECAPTURE" &&
        parsed.sceneCategory !== "SCREEN_RECAPTURE"
      ) {
        parsed.sceneCategory =
          rawRecaptureType === "PRINTED_PHOTO" ||
          /\b(print|printed|paper)\b/.test(combinedReasoning)
            ? "PRINT_RECAPTURE"
            : "SCREEN_RECAPTURE";
      }
    }

    // Guarantee every genuine AI response resolves to one of the 5 canonical categories
    if (
      parsed.sceneCategory !== "PRINT_RECAPTURE" &&
      parsed.sceneCategory !== "SCREEN_RECAPTURE" &&
      parsed.sceneCategory !== "BLURRY_OR_DARK" &&
      parsed.sceneCategory !== "NON_INCIDENT" &&
      parsed.sceneCategory !== "VALID_EMERGENCY"
    ) {
      if (parsed.recognized && isRecognizedIncident(parsed.incidentType)) {
        parsed.sceneCategory = "VALID_EMERGENCY";
      } else if (
        /\b(blur|blurry|out of focus|defocused|too dark|pitch dark|low light)\b/.test(combinedReasoning) &&
        !/\b(no blur|not blurry)\b/.test(combinedReasoning)
      ) {
        parsed.sceneCategory = "BLURRY_OR_DARK";
        parsed.isLiveScene = false;
      } else {
        parsed.sceneCategory = "NON_INCIDENT";
        parsed.isLiveScene = true;
      }
    }

    // Ensure calibrated severity and urgency score
    const fallback = calculateUrgency(parsed.incidentType, parsed.confidence);
    if (!parsed.severity) parsed.severity = fallback.severity;
    if (parsed.urgencyScore === undefined || typeof parsed.urgencyScore !== 'number') {
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