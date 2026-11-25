/**
 * Geographic centroids for all 36 Indian States/UTs, major Indian cities,
 * and key international hubs for the Interactive Order Locations Map.
 */

export const INDIA_STATE_COORDINATES: Record<string, [number, number]> = {
  'andaman & nicobar': [11.7401, 92.6586],
  'andaman and nicobar islands': [11.7401, 92.6586],
  'andhra pradesh': [15.9129, 79.74],
  'arunachal pradesh': [28.218, 94.7278],
  assam: [26.2006, 92.9376],
  bihar: [25.0961, 85.3131],
  chandigarh: [30.7333, 76.7794],
  chhattisgarh: [21.2787, 81.8661],
  'dadra and nagar haveli and daman and diu': [20.3974, 72.8328],
  'dadra & nagar haveli': [20.1809, 73.0169],
  'daman & diu': [20.3974, 72.8328],
  delhi: [28.7041, 77.1025],
  'nct of delhi': [28.7041, 77.1025],
  'new delhi': [28.6139, 77.209],
  goa: [15.2993, 74.124],
  gujarat: [22.2587, 71.1924],
  haryana: [29.0588, 76.0856],
  'himachal pradesh': [31.1048, 77.1734],
  'jammu & kashmir': [33.7782, 76.5762],
  'jammu and kashmir': [33.7782, 76.5762],
  jharkhand: [23.6102, 85.2799],
  karnataka: [15.3173, 75.7139],
  kerala: [10.8505, 76.2711],
  ladakh: [34.1526, 77.5771],
  lakshadweep: [10.5667, 72.6417],
  'madhya pradesh': [22.9734, 78.6569],
  maharashtra: [19.7515, 75.7139],
  manipur: [24.6637, 93.9063],
  meghalaya: [25.467, 91.3662],
  mizoram: [23.1645, 92.9376],
  nagaland: [26.1584, 94.5624],
  odisha: [20.9517, 85.0985],
  orissa: [20.9517, 85.0985],
  puducherry: [11.9416, 79.8083],
  pondicherry: [11.9416, 79.8083],
  punjab: [31.1471, 75.3412],
  rajasthan: [27.0238, 74.2179],
  sikkim: [27.533, 88.5122],
  'tamil nadu': [11.1271, 78.6569],
  telangana: [18.1124, 79.0193],
  tripura: [23.9408, 91.9882],
  'uttar pradesh': [26.8467, 80.9462],
  uttarakhand: [30.0668, 79.0193],
  'west bengal': [22.9868, 87.855],
};

export const CITY_COORDINATES: Record<string, [number, number]> = {
  // Gujarat
  surat: [21.1702, 72.8311],
  ahmedabad: [23.0225, 72.5714],
  vadodara: [22.3072, 73.1812],
  rajkot: [22.3039, 70.8022],
  bhavnagar: [21.7645, 72.1519],
  jamnagar: [22.4707, 70.0577],
  gandhinagar: [23.2156, 72.6369],
  junagadh: [21.5222, 70.4579],
  anand: [22.5645, 72.9289],
  navsari: [20.9467, 72.952],
  bharuch: [21.7051, 72.9959],
  vapi: [20.3893, 72.9106],
  valsad: [20.5992, 72.9342],
  mehsana: [23.588, 72.3693],
  morbi: [22.812, 70.8236],

  // Maharashtra
  mumbai: [19.076, 72.8777],
  pune: [18.5204, 73.8567],
  nagpur: [21.1458, 79.0882],
  thane: [19.2183, 72.9781],
  nashik: [19.9975, 73.7898],
  aurangabad: [19.8762, 75.3433],
  solapur: [17.6599, 75.9064],
  kolhapur: [16.705, 74.2433],
  navi_mumbai: [19.033, 73.0297],
  'navi mumbai': [19.033, 73.0297],

  // Delhi & NCR
  delhi: [28.7041, 77.1025],
  'new delhi': [28.6139, 77.209],
  noida: [28.5355, 77.391],
  gurugram: [28.4595, 77.0266],
  gurgaon: [28.4595, 77.0266],
  faridabad: [28.4089, 77.3178],
  ghaziabad: [28.6692, 77.4538],

  // Jammu & Kashmir / Ladakh / North
  jammu: [32.7266, 74.857],
  srinagar: [34.0837, 74.7973],
  udhampur: [32.916, 75.1416],
  leh: [34.1526, 77.5771],
  chandigarh: [30.7333, 76.7794],
  ludhiana: [30.901, 75.8573],
  amritsar: [31.634, 74.8723],
  jalandhar: [31.326, 75.5762],
  shimla: [31.1048, 77.1734],
  dehradun: [30.3165, 78.0322],
  haridwar: [29.9457, 78.1642],

  // Rajasthan
  jaipur: [26.9124, 75.7873],
  jodhpur: [26.2389, 73.0243],
  udaipur: [24.5854, 73.7125],
  kota: [25.2138, 75.8648],
  ajmer: [26.4499, 74.6399],
  bikaner: [28.0229, 73.3119],

  // Uttar Pradesh
  lucknow: [26.8467, 80.9462],
  kanpur: [26.4499, 80.3319],
  varanasi: [25.3176, 82.9739],
  agra: [27.1767, 78.0081],
  prayagraj: [25.4358, 81.8463],
  meerut: [28.9845, 77.7064],

  // South India
  bengaluru: [12.9716, 77.5946],
  bangalore: [12.9716, 77.5946],
  mysuru: [12.2958, 76.6394],
  mangaluru: [12.9141, 74.856],
  hyderabad: [17.385, 78.4867],
  warangal: [17.9689, 79.5941],
  chennai: [13.0827, 80.2707],
  coimbatore: [11.0168, 76.9558],
  madurai: [9.9252, 78.1198],
  kochi: [9.9312, 76.2673],
  thiruvananthapuram: [8.5241, 76.9366],
  kozhikode: [11.2588, 75.7804],
  visakhapatnam: [17.6868, 83.2185],
  vijayawada: [16.5062, 80.648],

  // East & Central India
  kolkata: [22.5726, 88.3639],
  howrah: [22.5958, 88.2636],
  patna: [25.5941, 85.1376],
  ranchi: [23.3441, 85.3096],
  bhubaneswar: [20.2961, 85.8245],
  indore: [22.7196, 75.8577],
  bhopal: [23.2599, 77.4126],
  raipur: [21.2514, 81.6296],
  guwahati: [26.1445, 91.7362],
  panaji: [15.4909, 73.8278],

  // Key International Hubs (if global orders exist)
  dubai: [25.2048, 55.2708],
  'abu dhabi': [24.4539, 54.3773],
  london: [51.5074, -0.1278],
  'new york': [40.7128, -74.006],
  toronto: [43.6532, -79.3832],
  singapore: [1.3521, 103.8198],
  sydney: [-33.8688, 151.2093],
  melbourne: [-37.8136, 144.9631],
  doha: [25.2854, 51.531],
  muscat: [23.588, 58.3829],
  riyadh: [24.7136, 46.6753],
};

/**
 * Normalize Indian state names from GeoJSON properties (`ST_NM`) or backend data
 * so both sides match consistently.
 */
export function canonicalStateKey(name: string): string {
  const s = (name || '').trim().toLowerCase();
  if (!s) return '';
  if (s.includes('jammu') || s.includes('kashmir')) return 'jammu & kashmir';
  if (s.includes('delhi')) return 'delhi';
  if (s.includes('andaman')) return 'andaman & nicobar';
  if (s.includes('dadra') || s.includes('daman')) return 'dadra and nagar haveli and daman and diu';
  if (s === 'orissa') return 'odisha';
  if (s === 'pondicherry') return 'puducherry';
  if (s === 'uttaranchal') return 'uttarakhand';
  return s;
}

/**
 * Deterministic coordinate lookup for any city/state pair, falling back to
 * the state's centroid with a tiny deterministic offset if the city is unknown.
 */
export function resolveCityCoordinates(city: string, state: string): [number, number] | null {
  const cKey = (city || '').trim().toLowerCase();
  if (cKey && CITY_COORDINATES[cKey]) {
    return CITY_COORDINATES[cKey];
  }
  const sKey = canonicalStateKey(state);
  const stateCenter = INDIA_STATE_COORDINATES[sKey];
  if (!stateCenter) return null;

  // Tiny deterministic spread so multiple unknown cities in one state don't overlap identically
  let hash = 0;
  for (let i = 0; i < cKey.length; i++) {
    hash = (hash * 31 + cKey.charCodeAt(i)) % 1000;
  }
  const latOffset = ((hash % 40) - 20) * 0.018;
  const lngOffset = (((Math.floor(hash / 40)) % 40) - 20) * 0.018;
  return [stateCenter[0] + latOffset, stateCenter[1] + lngOffset];
}
