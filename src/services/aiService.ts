import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageData = Buffer.from(imageResponse.data).toString("base64");

    const prompt = `You are an emergency incident classifier and urgency evaluator for MDRRMO Balayan, Batangas Philippines.
Analyze this image and determine if it shows a real emergency incident.

Return ONLY a JSON object with this exact structure:
{
  "incidentType": "<specific type e.g. Fire, Flood, Vehicular Accident, Medical Emergency, Fallen Tree, or 'Unrecognized'>",
  "recommendedDept": "<BFP|PNP|MEDICAL|ENGINEERING|RESCUE|UNKNOWN>",
  "confidence": "<high|medium|low>",
  "severity": "<CRITICAL|HIGH|MEDIUM|LOW>",
  "urgencyScore": <number 1-100>,
  "recognized": <true|false>,
  "suggestAction": "<PROCESS|REJECT>"
}

Severity & Urgency Scoring Rules:
- CRITICAL (85-100): Active fires, structural collapse, severe trauma, drowning, active violent crime, life-threatening disaster.
- HIGH (65-84): Vehicular accidents with injuries, acute medical distress, deep flash flood, landslides blocking evacuation.
- MEDIUM (40-64): Fallen trees, damaged roads, utility hazards, non-life-threatening property damage.
- LOW (1-39): Minor debris, general inquiries, benign scenery, unclear submissions.

Rules:
- If the image clearly shows an emergency → recognized: true, suggestAction: "PROCESS"
- If the image is unclear, a selfie, random scenery, meme, or NOT an emergency → recognized: false, incidentType: "Unrecognized", severity: "LOW", urgencyScore: 10, suggestAction: "REJECT"
- When in doubt, lean toward recognized: false and suggestAction: "REJECT" to prevent false alarms`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: imageData, mimeType: "image/jpeg" } }
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{.*\}/s);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);

    // Normalize the recognized flag
    if (parsed.recognized === undefined) {
      parsed.recognized = isRecognizedIncident(parsed.incidentType);
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
    };
  }
};