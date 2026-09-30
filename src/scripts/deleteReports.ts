import { prisma } from '../config/db';

async function main() {
  console.log('🔄 Checking existing reports in database...');
  const countBefore = await prisma.incident.count();
  console.log(`📊 Found ${countBefore} incident report(s).`);

  if (countBefore === 0) {
    console.log('ℹ️ There are no reports to delete.');
    return;
  }

  console.log('🗑️ Deleting incident activities...');
  const delActivities = await prisma.incidentActivity.deleteMany();
  console.log(`  Deleted ${delActivities.count} activity records.`);

  console.log('🗑️ Deleting resolution forms...');
  const delForms = await prisma.resolutionForm.deleteMany();
  console.log(`  Deleted ${delForms.count} resolution form records.`);

  console.log('🗑️ Deleting associated call logs...');
  const delCalls = await prisma.callLog.deleteMany();
  console.log(`  Deleted ${delCalls.count} call log records.`);

  console.log('🗑️ Deleting all incident reports...');
  const delIncidents = await prisma.incident.deleteMany();
  console.log(`✅ Successfully deleted ${delIncidents.count} incident report(s)!`);

  const countAfter = await prisma.incident.count();
  console.log(`📊 Remaining reports in database: ${countAfter}`);
}

main()
  .catch((err) => {
    console.error('❌ Error deleting reports:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
