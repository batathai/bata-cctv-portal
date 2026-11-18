/**
 * Marker positions for the login scene.
 * ILLUSTRATIVE ONLY: major Thai cities spread across the country to convey nationwide coverage.
 * They are NOT store locations — the login page cannot (and must not) read store data before sign-in.
 */
export interface SceneCity {
  name: string;
  lon: number;
  lat: number;
}

export const SCENE_CITIES: readonly SceneCity[] = [
  { name: "Chiang Rai", lon: 99.83, lat: 19.91 },
  { name: "Chiang Mai", lon: 98.99, lat: 18.79 },
  { name: "Nan", lon: 100.77, lat: 18.78 },
  { name: "Phitsanulok", lon: 100.26, lat: 16.82 },
  { name: "Udon Thani", lon: 102.79, lat: 17.41 },
  { name: "Sakon Nakhon", lon: 104.15, lat: 17.16 },
  { name: "Khon Kaen", lon: 102.84, lat: 16.43 },
  { name: "Nakhon Sawan", lon: 100.12, lat: 15.7 },
  { name: "Nakhon Ratchasima", lon: 102.1, lat: 14.98 },
  { name: "Ubon Ratchathani", lon: 104.86, lat: 15.24 },
  { name: "Kanchanaburi", lon: 99.53, lat: 14.02 },
  { name: "Bangkok", lon: 100.5, lat: 13.75 },
  { name: "Chonburi", lon: 100.99, lat: 13.36 },
  { name: "Rayong", lon: 101.27, lat: 12.68 },
  { name: "Chumphon", lon: 99.18, lat: 10.49 },
  { name: "Surat Thani", lon: 99.32, lat: 9.14 },
  { name: "Phuket", lon: 98.39, lat: 7.88 },
  { name: "Hat Yai", lon: 100.47, lat: 7.01 },
];
