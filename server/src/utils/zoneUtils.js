/**
 * Haversine distance between two lat/lng points (returns km)
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Bearing (degrees, 0=North, clockwise) from center to point
 */
function bearingDeg(centerLat, centerLng, pointLat, pointLng) {
  const lat1 = centerLat * Math.PI / 180;
  const lat2 = pointLat * Math.PI / 180;
  const dLon = (pointLng - centerLng) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Classify a point into zones A-F based on bearing from center.
 * Zone division: each 60° arc clockwise from North
 *   A: 0°  – 60°   (NNE → ENE)
 *   B: 60° – 120°  (ENE → ESE)
 *   C: 120°– 180°  (ESE → S)
 *   D: 180°– 240°  (S   → WSW)
 *   E: 240°– 300°  (WSW → WNW)
 *   F: 300°– 360°  (WNW → N)
 */
function classifyZone(centerLat, centerLng, pointLat, pointLng) {
  const bearing = bearingDeg(centerLat, centerLng, pointLat, pointLng);
  const zoneIndex = Math.floor(bearing / 60); // 0-5
  return String.fromCharCode(65 + zoneIndex);  // 'A' - 'F'
}

/**
 * Filter incidents within radiusKm of center and annotate with zone
 */
function filterAndAnnotate(incidents, centerLat, centerLng, radiusKm = 5) {
  return incidents
    .filter(inc => {
      if (!inc.location || inc.location.lat == null || inc.location.lng == null) return false;
      const dist = haversineKm(centerLat, centerLng, inc.location.lat, inc.location.lng);
      return dist <= radiusKm;
    })
    .map(inc => ({
      ...inc,
      zone: classifyZone(centerLat, centerLng, inc.location.lat, inc.location.lng),
      distanceKm: haversineKm(centerLat, centerLng, inc.location.lat, inc.location.lng)
    }));
}

module.exports = { haversineKm, bearingDeg, classifyZone, filterAndAnnotate };
