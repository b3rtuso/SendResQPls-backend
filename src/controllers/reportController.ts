import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { prisma } from '../config/db';
import { getNearestBarangay } from '../services/geocodingService';

// ─── Number → English words helper ──────────────────────────────────────────

function toWords(n: number): string {
  if (n === 0) return 'Zero';
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? `-${ones[n % 10]}` : '');
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return `${ones[h]} Hundred${r ? ' ' + toWords(r) : ''}`;
  }
  return String(n);
}

function countWithWords(n: number): string {
  return `${toWords(n)} (${n})`;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function militaryTime(date: Date | string): string {
  const d = new Date(date);
  return `${pad2(d.getHours())}${pad2(d.getMinutes())}H`;
}

function formatDisplayDate(dateRaw: Date | string): string {
  if (!dateRaw) return '';
  const dt = new Date(dateRaw);
  if (!isNaN(dt.getTime())) {
    return dt.toLocaleDateString('en-PH', { day: '2-digit', month: 'long', year: 'numeric' });
  }
  return String(dateRaw);
}

function cleanLocation(raw?: string): string {
  if (!raw || !raw.trim()) return 'Balayan, Batangas';
  let str = raw.trim();
  str = str.replace(/,\s*Balayan,\s*Batangas/gi, '');
  str = str.replace(/,\s*Balayan/gi, '');
  str = str.replace(/,\s*Batangas/gi, '');
  return `${str.trim()}, Balayan, Batangas`;
}

function resolveLocation(inc: any): string {
  if (inc.resolutionForm?.incidentLocation) return cleanLocation(inc.resolutionForm.incidentLocation);
  if (inc.formattedAddress) return cleanLocation(inc.formattedAddress);
  if (inc.barangay) return cleanLocation(`${inc.barangay}, Balayan, Batangas`);
  if (inc.adminNotes) {
    const brgyMatch = inc.adminNotes.match(/Brgy\.?\s+([A-Za-z\s]+)/i);
    if (brgyMatch) return cleanLocation(`Brgy. ${brgyMatch[1].trim()}`);
  }
  if (inc.latitude && inc.longitude) {
    return cleanLocation(getNearestBarangay(inc.latitude, inc.longitude));
  }
  return 'Balayan, Batangas';
}

function describeType(inc: any): string {
  if (inc.resolutionForm?.incidentType) return inc.resolutionForm.incidentType;
  const raw = inc.aiDetectedType ?? '';
  if (!raw || raw.trim() === '' || raw.includes('Pending Review') || raw.includes('Processing')) return 'General Emergency';
  return raw.replace(/\b\w/g, (c: string) => c.toUpperCase());
}

// ─── Typography & Page Setup Post-Processor ──────────────────────────────────

function applyDocxTypography(zip: PizZip): void {
  const docXml = zip.file('word/document.xml')?.asText();
  if (!docXml) return;

  let xml = docXml;

  // 1. Ensure clean line spacing and paragraph alignment
  xml = xml.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/g, (match, inner) => {
    if (/<w:pStyle[^/]*w:val="Heading/i.test(inner)) return match;
    if (/<w:pStyle[^/]*w:val="(TOC|Caption|Title|Subtitle)/i.test(inner)) return match;

    let props = inner;
    if (!/<w:jc\b/.test(props)) {
      props += '<w:jc w:val="both"/>';
    }
    if (!/<w:spacing\b/.test(props)) {
      props += '<w:spacing w:after="120" w:before="60" w:line="276" w:lineRule="auto"/>';
    }
    return `<w:pPr>${props}</w:pPr>`;
  });

  // 2. Ensure runs use Arial font
  xml = xml.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, (_match, inner) => {
    let props = inner;
    const is11pt = /<w:sz\b[^/]*w:val="22"/i.test(props);
    const szVal = is11pt ? '22' : '24';

    props = props.replace(/<w:rFonts[^/]*\/>/g, '');
    props = props.replace(/<w:rFonts[\s\S]*?\/>/g, '');
    props = props.replace(/<w:sz\b[^/]*\/>/g, '');
    props = props.replace(/<w:szCs\b[^/]*\/>/g, '');
    props =
      '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>' +
      `<w:sz w:val="${szVal}"/><w:szCs w:val="${szVal}"/>` +
      props;
    return `<w:rPr>${props}</w:rPr>`;
  });

  // 3. Enforce Standard Letter Page Size (8.5" x 11"), Portrait Orientation, 1-Inch Margins
  if (/<w:sectPr\b/.test(xml)) {
    xml = xml.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, (match) => {
      let sect = match;
      if (/<w:pgSz\b/.test(sect)) {
        sect = sect.replace(/<w:pgSz\b[^/>]*(\/>|><\/w:pgSz>)/g, '<w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>');
      } else {
        sect = sect.replace('<w:sectPr>', '<w:sectPr><w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>');
      }
      if (/<w:pgMar\b/.test(sect)) {
        sect = sect.replace(/<w:pgMar\b[^/>]*(\/>|><\/w:pgMar>)/g, '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>');
      } else {
        sect = sect.replace('<w:sectPr>', '<w:sectPr><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>');
      }
      return sect;
    });
  } else {
    xml = xml.replace('</w:body>', '<w:sectPr><w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body>');
  }

  // 4. Ensure tables adjust dynamically
  xml = xml.replace(/<w:tblW\b[^/>]*(\/>|><\/w:tblW>)/g, '<w:tblW w:w="5000" w:type="pct"/>');

  zip.file('word/document.xml', xml);
}

// ─── Template buffer loader ──────────────────────────────────────────────────

function getTemplateBuffer(name: 'daily' | 'weekly' | 'monthly'): Buffer {
  const templatePath = path.join(__dirname, '..', '..', 'templates', `${name}-template.docx`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found at: ${templatePath}`);
  }
  return fs.readFileSync(templatePath);
}

// ─── Main Report Controller Handler ──────────────────────────────────────────

export const downloadOfficialReport = async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string || 'daily').toLowerCase() as 'daily' | 'weekly' | 'monthly';
    const dateQuery = (req.query.date as string) || new Date().toISOString().slice(0, 10);

    let fromDate: Date;
    let toDate: Date;
    let filename: string;

    if (range === 'daily') {
      const [y, m, d] = dateQuery.split('-').map(Number);
      fromDate = new Date(y, m - 1, d, 0, 0, 0, 0);
      toDate = new Date(y, m - 1, d, 23, 59, 59, 999);
      const cleanNum = dateQuery.replace(/-/g, '');
      filename = `DAILY-INCIDENT-REPORT_${cleanNum}.docx`;
    } else if (range === 'weekly') {
      const [y, m, d] = dateQuery.split('-').map(Number);
      const ref = new Date(y, m - 1, d);
      const day = ref.getDay();
      const mon = new Date(ref);
      mon.setDate(ref.getDate() - (day === 0 ? 6 : day - 1));
      mon.setHours(0, 0, 0, 0);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      sun.setHours(23, 59, 59, 999);

      fromDate = mon;
      toDate = sun;
      const monthNameUpper = mon.toLocaleDateString('en-PH', { month: 'long' }).toUpperCase();
      filename = `WEEKLY-INCIDENT-REPORT_${monthNameUpper}-${mon.getFullYear()}.docx`;
    } else {
      // Monthly
      const [y, m] = dateQuery.split('-').map(Number);
      fromDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
      toDate = new Date(y, m, 0, 23, 59, 59, 999);
      const monthNameStr = fromDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
      filename = `MONTHLY-INCIDENT-REPORT_${monthNameStr.replace(/ /g, '-').toUpperCase()}.docx`;
    }

    // Query incidents within period from PostgreSQL
    const incidents = await prisma.incident.findMany({
      where: {
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        reporter: { select: { name: true, phoneNumber: true, email: true } },
        resolutionForm: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // In MDRRMO official operational reporting, resolved incidents with mission completion forms are prioritized
    const resolved = incidents.filter(i => i.status === 'RESOLVED');
    const sorted = (resolved.length > 0 ? resolved : incidents.filter(i => i.status !== 'REJECTED'))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const templateBuf = getTemplateBuffer(range);
    const zip = new PizZip(templateBuf);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    });

    let templateData: Record<string, any> = {};

    if (range === 'daily') {
      const reportDate = formatDisplayDate(dateQuery);
      const incidentData = sorted.map((inc, idx) => {
        const rf = inc.resolutionForm;
        const incTimeStr = rf?.incidentTime 
          ? (rf.incidentTime.includes('H') ? rf.incidentTime : rf.incidentTime.replace(':', '') + 'H') 
          : militaryTime(inc.createdAt);
        const incDateStr = rf?.incidentDate ? formatDisplayDate(rf.incidentDate) : formatDisplayDate(inc.createdAt);
        const incTypeStr = describeType(inc);
        const locStr = resolveLocation(inc);

        const patientName = rf?.patientName || inc.reporter?.name || 'Citizen Reporter / Patient';
        const patientSex = (rf?.patientSex || 'unspecified').toLowerCase();
        const patientAge = rf?.patientAge || 'N/A';
        const patientAddress = cleanLocation(rf?.patientAddress || locStr);

        const intoxicationDetail = rf?.intoxicationSuspected?.toLowerCase() === 'yes' ? 'was suspected of alcohol intoxication, ' : '';
        const mechanismDetail = rf?.mechanismOfInjury 
          ? `crashed / suffered ${rf.mechanismOfInjury.toLowerCase()}, ` 
          : (rf?.howIncidentHappened ? `experienced ${rf.howIncidentHappened.toLowerCase()}, ` : 'was involved in an emergency incident, ');
        const injuriesObserved = rf?.injuriesObserved ? rf.injuriesObserved.toLowerCase() : 'injuries assessed on scene';

        const responders = rf?.responderNames || (inc.assignedDepartment ? `${inc.assignedDepartment} On-Duty Team` : 'MDRRMO Rescue & EMS Response Team');
        const interventions = rf?.treatmentInterventions 
          ? `including ${rf.treatmentInterventions.toLowerCase()},` 
          : 'including supportive patient positioning and continuous monitoring,';

        const hasVitals = rf?.oxygenSaturation || rf?.pulseRate || rf?.bloodPressure || rf?.gcsScore;
        const vitalsDetail = hasVitals
          ? `an SaO₂ of ${rf?.oxygenSaturation || '98'}%, pulse rate of ${rf?.pulseRate || '80'} bpm, blood pressure of ${rf?.bloodPressure || '120/80'} mmHg, and a GCS of ${rf?.gcsScore || '15'}`
          : 'vital signs monitored and maintained within stable limits';

        const dispositionDetail = rf?.destinationFacility
          ? `immediately transported to ${rf.destinationFacility} for further medical evaluation and management`
          : (rf?.dispositionStatus === 'DEAD_ON_SPOT'
              ? 'pronounced deceased on the spot and endorsed to authorities'
              : (rf?.dispositionStatus === 'REFUSED_TRANSPORT'
                  ? 'refused ambulance transport after on-scene care and signed release waiver'
                  : 'managed and rendered appropriate care on scene'));

        return {
          incident_no: idx + 1,
          time: incTimeStr,
          date: incDateStr || reportDate,
          incident_type: incTypeStr,
          location: locStr,
          patient_name: patientName,
          patient_sex: patientSex,
          patient_age: patientAge,
          patient_address: patientAddress,
          intoxication_detail: intoxicationDetail,
          mechanism_detail: mechanismDetail,
          injuries_observed: injuriesObserved,
          responders: responders,
          interventions_detail: interventions,
          vitals_detail: vitalsDetail,
          disposition_detail: dispositionDetail,
          procedure_photo_xml: '',
        };
      });

      templateData = {
        report_date: reportDate,
        total_incidents: sorted.length,
        incidents: incidentData.length > 0 ? incidentData : [
          {
            incident_no: 1,
            time: '0000H',
            date: reportDate,
            incident_type: 'No Incident Recorded',
            location: 'Balayan, Batangas',
            patient_name: 'N/A',
            patient_sex: 'N/A',
            patient_age: 'N/A',
            patient_address: 'Balayan, Batangas',
            intoxication_detail: '',
            mechanism_detail: '',
            injuries_observed: 'none',
            responders: 'MDRRMO Duty Responders',
            interventions_detail: 'standby monitoring, ',
            vitals_detail: 'normal vitals',
            disposition_detail: 'recorded with zero active emergencies',
            procedure_photo_xml: '',
          },
        ],
      };
    } else if (range === 'weekly') {
      const monLabel = fromDate.toLocaleDateString('en-PH', { day: '2-digit', month: 'long', year: 'numeric' });
      const sunLabel = toDate.toLocaleDateString('en-PH', { day: '2-digit', month: 'long', year: 'numeric' });
      const dateRangeStr = `${monLabel} to ${sunLabel}`;

      const groups = new Map<string, any[]>();
      sorted.forEach((inc) => {
        const typeName = describeType(inc);
        if (!groups.has(typeName)) groups.set(typeName, []);
        groups.get(typeName)!.push(inc);
      });

      const type_counts: { type_name: string; count: string }[] = [];
      const type_summaries: any[] = [];

      groups.forEach((groupIncs, typeName) => {
        if (groupIncs.length === 0) return;
        const countText = countWithWords(groupIncs.length);
        type_counts.push({ type_name: typeName, count: countText });

        const causesSet = new Set<string>();
        groupIncs.forEach((i) => {
          const rf = i.resolutionForm;
          if (rf?.mechanismOfInjury) causesSet.add(rf.mechanismOfInjury.toLowerCase());
          if (rf?.howIncidentHappened) causesSet.add(rf.howIncidentHappened.toLowerCase());
        });
        const common_causes = causesSet.size > 0 ? Array.from(causesSet).join(', ') : 'Not specified';
        const patient_count = countWithWords(groupIncs.length);

        const injuriesSet = new Set<string>();
        groupIncs.forEach((i) => {
          const rf = i.resolutionForm;
          if (rf?.injuriesObserved) {
            rf.injuriesObserved.split(/[,;]/).forEach((item: string) => item.trim() && injuriesSet.add(item.trim().toLowerCase()));
          }
        });
        const common_injuries_conditions = injuriesSet.size > 0 ? Array.from(injuriesSet).join(', ') : 'No visible injuries recorded';

        const actionsSet = new Set<string>();
        groupIncs.forEach((i) => {
          const rf = i.resolutionForm;
          if (rf?.treatmentInterventions) actionsSet.add(rf.treatmentInterventions.toLowerCase());
          if (rf?.responderNames) actionsSet.add(`responded by ${rf.responderNames}`);
        });
        const responder_actions = actionsSet.size > 0 ? Array.from(actionsSet).join(', ') : 'Patient evaluation, vital sign checking, and scene management';

        const outcomesSet = new Set<string>();
        let deadCnt = 0;
        let transportCnt = 0;
        let refuseCnt = 0;
        groupIncs.forEach((i) => {
          const rf = i.resolutionForm;
          if (rf?.dispositionStatus === 'DEAD_ON_SPOT') deadCnt++;
          else if (rf?.dispositionStatus === 'REFUSED_TRANSPORT') refuseCnt++;
          else transportCnt++;
          if (rf?.destinationFacility) outcomesSet.add(`transported to ${rf.destinationFacility}`);
        });

        let outcomesText = '';
        if (deadCnt > 0) outcomesText += `${deadCnt} dead on spot, `;
        if (refuseCnt > 0) outcomesText += `${refuseCnt} refused transport, `;
        if (transportCnt > 0) outcomesText += `${transportCnt} transported after receiving care`;
        if (outcomesSet.size > 0) outcomesText += ` (${Array.from(outcomesSet).join(', ')})`;
        if (!outcomesText) outcomesText = 'Care management rendered on scene';

        type_summaries.push({
          type_name: typeName,
          count: countText,
          common_causes,
          patient_count,
          common_injuries_conditions,
          responder_actions,
          outcomes: outcomesText,
        });
      });

      const weeksData = [
        {
          date_range: dateRangeStr,
          total_incidents: countWithWords(sorted.length),
          type_counts: type_counts.length > 0 ? type_counts : [{ type_name: 'No Active Emergency', count: 'Zero (0)' }],
          type_summaries: type_summaries.length > 0 ? type_summaries : [
            {
              type_name: 'General Incidents',
              count: 'Zero (0)',
              common_causes: 'None',
              patient_count: 'Zero (0)',
              common_injuries_conditions: 'None',
              responder_actions: 'Monitoring',
              outcomes: 'Zero incidents recorded',
            },
          ],
        },
      ];

      templateData = { weeks: weeksData };
    } else {
      // Monthly
      const monthNameStr = fromDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
      const groups = new Map<string, any[]>();
      sorted.forEach((inc) => {
        const typeName = describeType(inc);
        if (!groups.has(typeName)) groups.set(typeName, []);
        groups.get(typeName)!.push(inc);
      });

      const typeCountStrings: string[] = [];
      groups.forEach((groupIncs, typeName) => {
        if (groupIncs.length > 0) {
          typeCountStrings.push(`${countWithWords(groupIncs.length)} ${typeName}s`);
        }
      });

      let includedTypesSentence = '';
      if (typeCountStrings.length === 0) {
        includedTypesSentence = 'Zero (0) reported emergencies for this month';
      } else if (typeCountStrings.length === 1) {
        includedTypesSentence = typeCountStrings[0];
      } else if (typeCountStrings.length === 2) {
        includedTypesSentence = `${typeCountStrings[0]} and ${typeCountStrings[1]}`;
      } else {
        const last = typeCountStrings.pop();
        includedTypesSentence = `${typeCountStrings.join(', ')}, and ${last}`;
      }

      const paragraphs: string[] = [];
      groups.forEach((groupIncs, typeName) => {
        if (groupIncs.length === 0) return;

        const causesSet = new Set<string>();
        const injuriesSet = new Set<string>();
        const interventionsSet = new Set<string>();
        const facilitiesSet = new Set<string>();
        let intoxicatedCount = 0;
        let deadCount = 0;
        let transportedCount = 0;
        let refusedCount = 0;

        groupIncs.forEach((i) => {
          const rf = i.resolutionForm;
          if (rf?.mechanismOfInjury) causesSet.add(rf.mechanismOfInjury.toLowerCase());
          if (rf?.howIncidentHappened) causesSet.add(rf.howIncidentHappened.toLowerCase());
          if (rf?.injuriesObserved) injuriesSet.add(rf.injuriesObserved.toLowerCase());
          if (rf?.treatmentInterventions) interventionsSet.add(rf.treatmentInterventions.toLowerCase());
          if (rf?.intoxicationSuspected?.toLowerCase() === 'yes') intoxicatedCount++;
          if (rf?.destinationFacility) facilitiesSet.add(rf.destinationFacility);

          if (rf?.dispositionStatus === 'DEAD_ON_SPOT') deadCount++;
          else if (rf?.dispositionStatus === 'REFUSED_TRANSPORT') refusedCount++;
          else transportedCount++;
        });

        const causesText = causesSet.size > 0 ? Array.from(causesSet).join(', ') : 'reported emergency situations';
        const injuriesText = injuriesSet.size > 0 ? Array.from(injuriesSet).join(', ') : 'recorded injuries or medical conditions';
        const interventionsText = interventionsSet.size > 0 ? Array.from(interventionsSet).join(', ') : 'immediate care management and vital sign monitoring';
        const facilitiesText = facilitiesSet.size > 0 ? `hospitals such as ${Array.from(facilitiesSet).join(', ')}` : 'medical facilities';

        let dispositionSentence = '';
        if (deadCount > 0) {
          dispositionSentence += `${countWithWords(deadCount)} patients were reported dead on the spot, `;
        }
        if (transportedCount > 0) {
          dispositionSentence += `while ${countWithWords(transportedCount)} patients were given care management and transported to ${facilitiesText} for further evaluation and treatment`;
        }
        if (refusedCount > 0) {
          dispositionSentence += `, except for ${countWithWords(refusedCount)} patient who refused transport`;
        }
        if (!dispositionSentence) {
          dispositionSentence = 'all patients were evaluated and rendered appropriate care on scene.';
        } else if (!dispositionSentence.endsWith('.')) {
          dispositionSentence += '.';
        }

        const intoxicationText = intoxicatedCount > 0 ? `, while ${countWithWords(intoxicatedCount)} patient(s) were under alcohol intoxication` : '';
        const paragraph = `Most ${typeName.toLowerCase()} cases involved ${causesText} resulting in ${injuriesText}${intoxicationText}. Emergency responders performed ${interventionsText}. ${dispositionSentence}`;
        paragraphs.push(paragraph);
      });

      const monthlyNarrativeParagraphs = paragraphs.length > 0
        ? paragraphs.join('\n\n\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0 ')
        : 'No active emergency incidents were recorded for this reporting period.';

      templateData = {
        month_name: monthNameStr,
        total_incidents: countWithWords(sorted.length),
        included_types_sentence: includedTypesSentence,
        monthly_narrative_paragraphs: monthlyNarrativeParagraphs,
      };
    }

    doc.render(templateData);
    applyDocxTypography(doc.getZip());

    const outBuf = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', outBuf.length);
    res.end(outBuf);
  } catch (error: any) {
    console.error('❌ downloadOfficialReport error:', error.message);
    res.status(500).json({ error: 'Failed to generate official report document: ' + error.message });
  }
};
