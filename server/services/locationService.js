const pool = require('../db');
const { logAudit } = require('./auditLogger');

// Earth radius in meters
const EARTH_RADIUS_METERS = 6371000;

// Maximum allowed GPS uncertainty (meters). Configurable limit default 100m.
const MAX_GPS_ACCURACY_METERS = 100;

/**
 * Calculates Great-Circle distance between two coordinates in meters using the Haversine formula.
 * d = 2 * R * asin(sqrt(sin^2(dLat/2) + cos(lat1) * cos(lat2) * sin^2(dLon/2)))
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in meters rounded to 2 decimal places
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const p1 = parseFloat(lat1);
  const l1 = parseFloat(lon1);
  const p2 = parseFloat(lat2);
  const l2 = parseFloat(lon2);

  if (isNaN(p1) || isNaN(l1) || isNaN(p2) || isNaN(l2)) {
    throw new Error('Invalid coordinates supplied to calculateHaversineDistance');
  }

  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(p2 - p1);
  const dLon = toRad(l2 - l1);
  const radLat1 = toRad(p1);
  const radLat2 = toRad(p2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_METERS * c;

  return parseFloat(distance.toFixed(2));
}

/**
 * Validates latitude and longitude ranges.
 * Latitude must be -90 to 90, Longitude must be -180 to 180.
 */
function validateCoordinates(lat, lon) {
  if (lat === undefined || lat === null || lon === undefined || lon === null || lat === '' || lon === '') {
    return 'Latitude and Longitude are required.';
  }

  const pLat = parseFloat(lat);
  const pLon = parseFloat(lon);

  if (isNaN(pLat) || isNaN(pLon)) {
    return 'Latitude and Longitude must be valid numbers.';
  }

  if (pLat < -90 || pLat > 90) {
    return 'Latitude must be between -90 and 90 degrees.';
  }

  if (pLon < -180 || pLon > 180) {
    return 'Longitude must be between -180 and 180 degrees.';
  }

  return null;
}

/**
 * Checks if an employee or their department is currently location-exempt.
 */
async function isLocationExempt(employeeId, departmentId = null, dateInput = new Date(), connection = null) {
  const executor = connection || pool;
  const empId = parseInt(employeeId, 10);
  const dateStr = typeof dateInput === 'string' ? dateInput.split('T')[0] : dateInput.toISOString().split('T')[0];

  let deptId = departmentId ? parseInt(departmentId, 10) : null;
  if (!deptId && empId) {
    const [empRows] = await executor.query(
      'SELECT department_id FROM employees WHERE id = ?',
      [empId]
    );
    if (empRows.length > 0) {
      deptId = empRows[0].department_id;
    }
  }

  // Check active exemptions covering dateStr
  const [exemptions] = await executor.query(
    `SELECT * FROM location_exemptions
     WHERE is_active = TRUE
       AND start_date <= ?
       AND (end_date IS NULL OR end_date >= ?)
       AND (
         (employee_id IS NOT NULL AND employee_id = ?)
         OR
         (? IS NOT NULL AND department_id IS NOT NULL AND department_id = ?)
       )
     ORDER BY employee_id DESC LIMIT 1`,
    [dateStr, dateStr, empId, deptId, deptId]
  );

  if (exemptions.length > 0) {
    return {
      isExempt: true,
      exemption: exemptions[0]
    };
  }

  return {
    isExempt: false,
    exemption: null
  };
}

/**
 * Finds the nearest active office location and computes distance in meters.
 * Checks if the coordinates are inside ANY active office's allowed radius.
 */
async function evaluateLocationAgainstOffices(latitude, longitude, connection = null) {
  const executor = connection || pool;
  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);

  const [offices] = await executor.query(
    'SELECT * FROM office_locations WHERE is_active = TRUE'
  );

  if (offices.length === 0) {
    // If no active offices configured, allow check-in with flag
    return {
      hasActiveOffices: false,
      nearestOffice: null,
      distanceMeters: 0,
      isInsideAny: true,
      insideOffice: null,
      allDistances: []
    };
  }

  let minDistance = Infinity;
  let nearestOffice = null;
  let insideOffice = null;
  const allDistances = [];

  for (const office of offices) {
    const dist = calculateHaversineDistance(lat, lon, office.latitude, office.longitude);
    const isInside = dist <= office.allowed_radius;

    const item = {
      officeId: office.id,
      officeName: office.name,
      distance: dist,
      allowedRadius: office.allowed_radius,
      isInside
    };
    allDistances.push(item);

    if (dist < minDistance) {
      minDistance = dist;
      nearestOffice = office;
    }

    if (isInside && !insideOffice) {
      insideOffice = office;
    }
  }

  return {
    hasActiveOffices: true,
    nearestOffice,
    distanceMeters: minDistance,
    isInsideAny: Boolean(insideOffice),
    insideOffice: insideOffice || nearestOffice,
    allDistances
  };
}

/**
 * Requirement 7: Flag suspicious cases for HR review:
 * - Exact same coordinates many times in a row down to 7 decimal places
 * - Very low accuracy near edge of geofence
 * - Impossible jump velocity between check-in and check-out
 */
async function detectSuspiciousLocation({
  employeeId,
  checkInLat,
  checkInLon,
  checkOutLat = null,
  checkOutLon = null,
  checkInTime = null,
  checkOutTime = null,
  accuracy = 0,
  connection = null
}) {
  const executor = connection || pool;
  const empId = parseInt(employeeId, 10);

  // 1. Check for exact repeated coordinates (mock GPS indicator)
  if (checkInLat && checkInLon) {
    const [recent] = await executor.query(
      `SELECT check_in_latitude, check_in_longitude
       FROM attendance
       WHERE employee_id = ? AND check_in_latitude IS NOT NULL
       ORDER BY check_in DESC
       LIMIT 5`,
      [empId]
    );

    if (recent.length >= 4) {
      const pLat = parseFloat(checkInLat).toFixed(6);
      const pLon = parseFloat(checkInLon).toFixed(6);
      const exactMatches = recent.filter(
        (r) =>
          parseFloat(r.check_in_latitude).toFixed(6) === pLat &&
          parseFloat(r.check_in_longitude).toFixed(6) === pLon
      );

      if (exactMatches.length >= 4) {
        return {
          isSuspicious: true,
          reason: 'Coordinates identical across 5 consecutive punches (potential mock/static GPS simulator)'
        };
      }
    }
  }

  // 2. Check for impossible velocity between check-in and check-out
  if (checkInLat && checkInLon && checkOutLat && checkOutLon && checkInTime && checkOutTime) {
    try {
      const jumpMeters = calculateHaversineDistance(checkInLat, checkInLon, checkOutLat, checkOutLon);
      const timeDiffHours = (new Date(checkOutTime).getTime() - new Date(checkInTime).getTime()) / (1000 * 60 * 60);

      if (timeDiffHours > 0) {
        const speedKmH = (jumpMeters / 1000) / timeDiffHours;
        // Speeds above 800 km/h (airline cruising speed) indicate impossible physical teleportation
        if (speedKmH > 800 && jumpMeters > 50000) {
          return {
            isSuspicious: true,
            reason: `Impossible location jump of ${Math.round(jumpMeters / 1000)} km within ${timeDiffHours.toFixed(1)} hrs (${Math.round(speedKmH)} km/h)`
          };
        }
      }
    } catch (e) {
      // Ignore calculation error in check
    }
  }

  // 3. Very low accuracy near cutoff
  if (accuracy && parseFloat(accuracy) > 90) {
    return {
      isSuspicious: true,
      reason: `Marginal GPS accuracy (${Math.round(accuracy)}m uncertainty near cutoff threshold)`
    };
  }

  return {
    isSuspicious: false,
    reason: null
  };
}

module.exports = {
  EARTH_RADIUS_METERS,
  MAX_GPS_ACCURACY_METERS,
  calculateHaversineDistance,
  validateCoordinates,
  isLocationExempt,
  evaluateLocationAgainstOffices,
  detectSuspiciousLocation
};
