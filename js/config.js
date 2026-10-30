// Label vocabularies. Kept in one place so they can later be swapped for
// Xactimate-style category names without touching the UI code.

export const PRESET_ROOMS = [
  'Exterior', 'Kitchen', 'Living Room', 'Bedroom 1', 'Bedroom 2',
  'Bathroom', 'Basement', 'Garage',
];

export const SHOWS = [
  'Overview of room', 'Drywall', 'Baseboard', 'Flooring', 'Tile', 'Carpet',
  'Cabinets', 'Ceiling', 'Wall', 'Door', 'Trim', 'Appliance',
  'Moisture reading', 'Water line', 'Mold', 'Other',
];

export const LOCATIONS = [
  'North wall', 'South wall', 'East wall', 'West wall',
  'Floor', 'Ceiling', 'Corner', 'Whole room',
];

export const DAMAGE = ['Minor', 'Moderate', 'Severe'];

// Photos are resized so the long side is at most this many pixels.
// 1600px keeps text on moisture meters readable while staying ~300-500 KB.
export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_QUALITY = 0.82;
export const THUMB_MAX_SIDE = 360;
