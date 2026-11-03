// The default physical sheet: a 6 x 4 inch postcard. Every millimetre size in the painter (brush widths, paper tooth,
// pen nibs) is turned into cells through it, so a painting at 360, 540 or 1086 cells across shows the same brushwork.
// --sheetmm sets another width. src/paint/brushes.json holds the same sheet for --physical 1.
export const POSTCARD_WIDTH_MM = 152.4;
export const POSTCARD_HEIGHT_MM = 101.6;
export const DEFAULT_SHEET_MM = POSTCARD_WIDTH_MM;
