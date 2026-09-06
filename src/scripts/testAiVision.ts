import 'dotenv/config';
import path from 'path';
import { runAIAnalysis } from '../services/aiService';

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 RUNNING AI VISION INCIDENT IDENTIFICATION TESTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test 1: Non-emergency image (Official SRQ Logo)
  const nonEmergencyPath = path.resolve(__dirname, '../assets/logo.jpg');
  console.log('Test 1: Testing non-emergency image (logo.jpg)...');
  console.log(`Input path: ${nonEmergencyPath}`);
  try {
    const result1 = await runAIAnalysis(nonEmergencyPath);
    console.log('Result 1 (Non-Emergency Analysis):');
    console.log(JSON.stringify(result1, null, 2));

    if (!result1.recognized || result1.suggestAction === 'REJECT') {
      console.log('✅ TEST 1 PASSED: Correctly rejected non-emergency image!\n');
    } else {
      console.log('⚠️ TEST 1 WARNING: AI did not reject logo image.\n');
    }
  } catch (err: any) {
    console.error('❌ Test 1 Error:', err.message);
  }

  // Test 2: Real emergency public image (Car Crash / Vehicular Collision from Wikimedia Commons)
  const realEmergencyUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Car_Crash_2.jpg/640px-Car_Crash_2.jpg';
  console.log('Test 2: Testing real emergency image (Car Crash on road)...');
  console.log(`Input URL: ${realEmergencyUrl}`);
  try {
    const result2 = await runAIAnalysis(realEmergencyUrl);
    console.log('Result 2 (Emergency Analysis):');
    console.log(JSON.stringify(result2, null, 2));

    if (result2.recognized && result2.suggestAction === 'PROCESS') {
      console.log('✅ TEST 2 PASSED: Correctly identified real emergency incident!\n');
    } else {
      console.log('⚠️ TEST 2 WARNING: AI did not process real emergency image.\n');
    }
  } catch (err: any) {
    console.error('❌ Test 2 Error:', err.message);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🏁 AI VISION TESTS COMPLETED');
  console.log('═══════════════════════════════════════════════════════════');
}

runTests().catch(console.error);
