import axios from 'axios';

interface BarangayCoord {
  name: string;
  lat: number;
  lng: number;
}

const BARANGAYS: BarangayCoord[] = [
  { name: 'Brgy. 1 (Poblacion)', lat: 13.9349, lng: 120.7285 },
  { name: 'Brgy. 2 (Poblacion)', lat: 13.9355, lng: 120.7260 },
  { name: 'Brgy. 3 (Poblacion)', lat: 13.9381, lng: 120.7265 },
  { name: 'Brgy. 4 (Poblacion)', lat: 13.9389, lng: 120.7286 },
  { name: 'Brgy. 5 (Poblacion)', lat: 13.9396, lng: 120.7310 },
  { name: 'Brgy. 6 (Poblacion)', lat: 13.9398, lng: 120.7338 },
  { name: 'Brgy. 7 (Poblacion)', lat: 13.9381, lng: 120.7359 },
  { name: 'Brgy. 8 (Poblacion)', lat: 13.9369, lng: 120.7382 },
  { name: 'Brgy. 9 (Poblacion)', lat: 13.9354, lng: 120.7358 },
  { name: 'Brgy. 10 (Poblacion)', lat: 13.9360, lng: 120.7344 },
  { name: 'Brgy. 11 (Poblacion)', lat: 13.9359, lng: 120.7326 },
  { name: 'Brgy. 12 (Poblacion)', lat: 13.9366, lng: 120.7306 },
  { name: 'Baclaran', lat: 13.9292, lng: 120.7727 },
  { name: 'Navotas', lat: 13.9311, lng: 120.7197 },
  { name: 'Duhatan', lat: 13.9441, lng: 120.6618 },
  { name: 'Malalay', lat: 13.9578, lng: 120.6762 },
  { name: 'Sukol', lat: 14.0130, lng: 120.7817 },
  { name: 'Munting Tubig', lat: 13.9664, lng: 120.7266 },
  { name: 'Carenahan', lat: 13.9315, lng: 120.7581 },
  { name: 'Lagnas', lat: 13.9666, lng: 120.6899 },
  { name: 'Dalig', lat: 13.9348, lng: 120.6954 },
  { name: 'Calan', lat: 13.9977, lng: 120.7679 },
  { name: 'Caloocan', lat: 13.9501, lng: 120.7225 },
  { name: 'Durungao', lat: 13.9435, lng: 120.7653 },
  { name: 'Palikpikan', lat: 13.9123, lng: 120.7010 },
  { name: 'Tactac', lat: 13.9805, lng: 120.6975 },
  { name: 'Taludtud', lat: 13.9835, lng: 120.7559 },
  { name: 'Calzada', lat: 13.9500, lng: 120.7296 },
  { name: 'Canda', lat: 13.9573, lng: 120.7014 },
  { name: 'Caybunga', lat: 13.9452, lng: 120.7596 },
  { name: 'Cayponce', lat: 13.9568, lng: 120.7358 },
  { name: 'Dilao', lat: 13.9753, lng: 120.6816 },
  { name: 'Gimalas', lat: 13.9476, lng: 120.7496 },
  { name: 'Gumamela', lat: 13.9451, lng: 120.7418 },
  { name: 'Langgangan', lat: 13.9455, lng: 120.7537 },
  { name: 'Lucban Pook', lat: 13.9909, lng: 120.7711 },
  { name: 'Lucban Putol', lat: 13.9561, lng: 120.7511 },
  { name: 'Magabe', lat: 13.9717, lng: 120.7065 },
  { name: 'Patugo', lat: 14.0044, lng: 120.7851 },
  { name: 'Pooc', lat: 13.9580, lng: 120.7578 },
  { name: 'Sambat', lat: 13.9506, lng: 120.7080 },
  { name: 'Sampaga', lat: 13.9405, lng: 120.7721 },
  { name: 'San Juan', lat: 13.9375, lng: 120.7407 },
  { name: 'San Piro', lat: 13.9207, lng: 120.7060 },
  { name: 'Santol', lat: 13.9412, lng: 120.7133 },
  { name: 'Tanggoy', lat: 13.9514, lng: 120.6844 },
  { name: 'Dao', lat: 13.9731, lng: 120.7405 },
  { name: 'Lanatan', lat: 13.9562, lng: 120.7286 }
];

const cache = new Map<string, { barangay: string; formattedAddress: string }>();

function getNearestBarangay(lat: number, lng: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  let nearest = BARANGAYS[0];
  let minDist = Infinity;
  for (const b of BARANGAYS) {
    const dLat = toRad(lat - b.lat);
    const dLng = toRad(lng - b.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(b.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
    const dist = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist < minDist) {
      minDist = dist;
      nearest = b;
    }
  }
  return `${nearest.name}, Balayan, Batangas`;
}

export async function performReverseGeocode(lat: number, lng: number): Promise<{ barangay: string; formattedAddress: string; source: string }> {
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (cache.has(cacheKey)) {
    return { ...cache.get(cacheKey)!, source: 'cache' };
  }

  // Fallback: Haversine
  const localFallback = getNearestBarangay(lat, lng);
  const fallbackResult = {
    barangay: localFallback.split(',')[0],
    formattedAddress: localFallback,
  };

  const googleApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

  // 1. Try Google Maps Geocoding API if key is present
  if (googleApiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleApiKey}`;
      const response = await axios.get(url, { timeout: 5000 });
      const data = response.data;
      if (data && data.status === 'OK' && data.results && data.results.length > 0) {
        let barangayName = '';
        const firstResult = data.results[0];
        
        // Look for sublocality (barangay) in components
        for (const component of firstResult.address_components) {
          const types = component.types;
          if (types.includes('sublocality_level_1') || types.includes('neighborhood') || types.includes('sublocality')) {
            barangayName = component.long_name;
            break;
          }
        }

        // If not found in first result components, check other results
        if (!barangayName) {
          for (const res of data.results) {
            for (const component of res.address_components) {
              const types = component.types;
              if (types.includes('sublocality_level_1') || types.includes('neighborhood') || types.includes('sublocality')) {
                barangayName = component.long_name;
                break;
              }
            }
            if (barangayName) break;
          }
        }

        // Clean up barangay name (e.g. remove "Barangay" prefix or suffix if it exists, or standardize)
        if (barangayName) {
          // If it matched gumamela or dilao, make sure we format it nicely
          const formattedAddress = firstResult.formatted_address || `${barangayName}, Balayan, Batangas`;
          const result = { barangay: barangayName, formattedAddress };
          cache.set(cacheKey, result);
          return { ...result, source: 'google' };
        }
      }
    } catch (err: any) {
      console.warn(`[Geocoding] Google Maps API failed, falling back to OSM: ${err.message}`);
    }
  }

  // 2. Try OpenStreetMap Nominatim API
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`;
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'DisasterIncidentReportingSystem/1.0',
      },
    });
    const data = response.data;
    if (data && data.address) {
      const addr = data.address;
      // In the Philippines, the barangay is often returned as village, suburb, neighborhood, or quarter.
      const barangayName = addr.village || addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district;
      if (barangayName) {
        // Standardize the display name
        const displayBarangay = barangayName.startsWith('Barangay') ? barangayName : `Brgy. ${barangayName}`;
        const road = addr.road || '';
        const formattedAddress = road 
          ? `${road}, ${displayBarangay}, Balayan, Batangas`
          : `${displayBarangay}, Balayan, Batangas`;
        
        const result = { barangay: barangayName, formattedAddress };
        cache.set(cacheKey, result);
        return { ...result, source: 'osm' };
      }
    }
  } catch (err: any) {
    console.warn(`[Geocoding] OSM Nominatim API failed, using Haversine fallback: ${err.message}`);
  }

  // 3. Return local fallback
  cache.set(cacheKey, fallbackResult);
  return { ...fallbackResult, source: 'local' };
}
