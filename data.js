// Source of truth for the key tracker.
// Edit KEY_ASSIGNMENTS below to record which numbered key fits each keyhole.
// Replace `null` with the key's stamped number (1-3 digits), e.g. 47 or "047".

const BOXES = [
  { id: "A", label: "Box A", side: "east" },
  { id: "B", label: "Box B", side: "east" },
  { id: "C", label: "Box C", side: "east" },
  { id: "D", label: "Box D", side: "east" },
  { id: "X", label: "Box X", side: "east" },
  { id: "E", label: "Box E", side: "west" },
  { id: "MAIN", label: "Main", side: "west" },
  { id: "F", label: "Box F", side: "west" }, // L-corner
  { id: "G", label: "Box G", side: "west" },
];

// Display-name overrides for boxes (visual only).
// Set a value to rename how a box appears on the map and in cards.
// null => falls back to the box id (A, B, MAIN, etc.)
const BOX_NAMES = {
  A:    "Gia",
  B:    "Dikshya",
  C:    "Parlor",
  D:    "Tailor",
  X:    "Toilet",
  E:    "Paan",
  MAIN: null,
  F:    "Clothes",
  G:    "Chura",
};

// 12 doors. IDs use facing direction; for boxes with multiple doors on the
// same facing, suffix 1 = northern, 2 = southern.
// Each door has 2 keyholes labeled "a" (upper/left) and "b" (lower/right).
const DOORS = [
  { id: "A-W1", box: "A", facing: "W" }, // northern west door of A
  { id: "A-W2", box: "A", facing: "W" }, // southern west door of A
  { id: "B-W",  box: "B", facing: "W" },
  { id: "C-W1", box: "C", facing: "W" },
  { id: "C-W2", box: "C", facing: "W" },
  { id: "X-W",  box: "X", facing: "W" },
  { id: "D-W",  box: "D", facing: "W" },
  { id: "E-E",  box: "E", facing: "E" },
  { id: "E-S",  box: "E", facing: "S" },
  { id: "MAIN-E", box: "MAIN", facing: "E" },
  { id: "F-E1", box: "F", facing: "E" }, // northern east door of F
  { id: "F-E2", box: "F", facing: "E" }, // southern east door of F
  { id: "F-S",  box: "F", facing: "S" },
  { id: "G-S",  box: "G", facing: "S" },
];

// 24 keyholes. Populate by replacing null with the key number.
const KEY_ASSIGNMENTS = {
  "A-W1-a": 351,
  "A-W1-b": 651,
  "A-W2-a": 917,
  "A-W2-b": "561S",
  "B-W-a":  518,
  "B-W-b":  "167,199",
  "C-W1-a": 185,
  "C-W1-b": 208,
  "C-W2-a": 668,
  "C-W2-b": 535,
  "X-W-a":  null,
  "D-W-a":  193,
  "D-W-b":  138,
  "E-E-a":  812,
  "E-E-b":  690,
  "E-S-a":  "5(1),336(1)",
  "E-S-b":  "5(1),336(1)",
  "MAIN-E-a": 386,
  "MAIN-E-b": 199,
  "F-E1-a": 602,
  "F-E1-b": 404,
  "F-E2-a": null,
  "F-E2-b": "289,322",
  "F-S-a":  713,
  "F-S-b":  "727(1)",
  "G-S-a":  739,
  "G-S-b":  375,
};
