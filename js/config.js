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

export const LOSS_TYPES = ['Flood', 'Water (non-flood)', 'Wind', 'Fire', 'Other'];

// Damage categories in scoping order: top of the room down (ceiling, walls,
// floor), then fixtures and contents. Exports list damage in this order so
// it can be typed into an estimate room by room without jumping around.
// Each category has the unit it is usually measured in.
export const DAMAGE_CATEGORIES = [
  ['Ceiling', 'SF'],
  ['Drywall', 'SF'],
  ['Insulation', 'SF'],
  ['Paneling', 'SF'],
  ['Paint', 'SF'],
  ['Baseboard', 'LF'],
  ['Trim', 'LF'],
  ['Doors', 'EA'],
  ['Windows', 'EA'],
  ['Cabinets', 'LF'],
  ['Countertops', 'SF'],
  ['Appliances', 'EA'],
  ['Plumbing fixtures', 'EA'],
  ['Electrical', 'EA'],
  ['Flooring', 'SF'],
  ['Carpet & pad', 'SF'],
  ['Tile', 'SF'],
  ['Subfloor', 'SF'],
  ['Contents', 'EA'],
  ['Other', 'EA'],
];

export const UNITS = ['SF', 'LF', 'SY', 'EA', 'HR'];

export const ACTIONS = ['Remove', 'Replace', 'Remove & replace', 'Clean', 'Dry', 'Treat', 'Detach & reset'];

export const DISCLAIMER = 'Not affiliated with or endorsed by Verisk or Xactimate.';
