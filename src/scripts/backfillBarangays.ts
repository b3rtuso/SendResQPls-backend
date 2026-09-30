import { prisma } from '../config/db';
import { getNearestBarangay } from '../services/geocodingService';

async function main() {
  console.log('🔄 Checking for incidents missing pre-computed barangay...');
  const missing = await prisma.incident.findMany({
    where: {
      OR: [
        { barangay: null },
        { formattedAddress: null },
      ],
    },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      barangay: true,
      formattedAddress: true,
    },
  });

  console.log(`Found ${missing.length} incident(s) needing barangay backfill.`);

  let updated = 0;
  for (const inc of missing) {
    if (inc.latitude && inc.longitude) {
      const nearest = getNearestBarangay(inc.latitude, inc.longitude);
      const brgyName = nearest.split(',')[0].trim();
      await prisma.incident.update({
        where: { id: inc.id },
        data: {
          barangay: inc.barangay || brgyName,
          formattedAddress: inc.formattedAddress || nearest,
        },
      });
      updated++;
    }
  }

  console.log(`✅ Backfilled ${updated} incident(s) with pre-computed barangays!`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Backfill error:', err.message);
  process.exit(1);
});
