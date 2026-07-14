// DWP FF&E / Material Schedule layout for the Google Sheets export.
//
// A tag only carries { code, note, position }, so most columns are left blank for
// the designer to complete (or to paste into the master schedule). What we CAN fill
// truthfully is the column layout + header block, the Category (from the code prefix),
// Item, Description, qty, price, source links — and the standard per-category
// "Special Instructions" boilerplate below, which is template text (not invented data)
// transcribed from the project's existing schedule.

// The 28 columns, in order, exactly as the DWP schedule expects them.
export const SCHEDULE_COLUMNS = [
    'Layer',
    'Area',
    'Area Count',
    'Category',
    'Item',
    'Supplier',
    'Description',
    'Images',
    'Docs',
    'Product Name',
    'Model #',
    'Dimension',
    'Finish/Color',
    'Notes',
    'Composition',
    'Backing',
    'Width',
    'Thickness',
    'Pile Height',
    'Abrasion',
    'Material',
    'Fire resistance',
    'Manufacturer / Contact book',
    'Special Instructions',
    'Link',
    'Location of use',
    'Estimated Price',
    'Quality',
] as const;

// Leading letters of a code → its category prefix. "SE-24" → "SE", "XFB-31" → "XFB".
const prefixOf = (code: string): string => (code.match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase();

// Prefix → human category name. The "Category" cell is rendered as "<PREFIX> <NAME>"
// (e.g. "SE SEATING"), matching the schedule.
const CATEGORY_NAMES: Record<string, string> = {
    // Furniture / FF&E
    SE: 'SEATING',
    CG: 'CASEGOOD',
    TA: 'TABLE',
    DL: 'DECORATIVE LIGHTING (LAMP)',
    SA: 'SANITARY ACCESSORIES',
    BP: 'BEDDING, LINENS and PILLOWS',
    AP: 'APPLIANCE',
    AT: 'ARTWORK',
    DB: 'DRAPERY & BLINDS',
    WK: 'WORKSTATION / SYSTEM FURNITURE',
    // Materials & finishes
    MT: 'METAL',
    TL: 'TILE',
    ST: 'STONE',
    PT: 'PAINT',
    PL: 'PLASTIC LAMINATE',
    LE: 'LEATHER',
    FB: 'FABRIC',
    WC: 'WALLPAPER',
    GL: 'GLASS & MIRROR',
    SK: 'SKIRTING (WALL BASE)',
    WD: 'WOOD',
    CE: 'CEILING',
    SF: 'SPECIAL FINISHES',
    CP: 'CARPET',
    VT: 'VINYL TILE',
    AG: 'AGGREGATE',
    AL: 'ALUMINUM',
    AY: 'ACRYLIC',
    LT: 'LIGHTING',
    EE: 'ELECTRICAL EQUIPMENT',
    PF: 'PLUMBING FIXTURES',
    D: 'DOOR',
    // X-prefixed loose-furniture finishes / sub-materials
    XFB: 'FABRIC',
    XGL: 'GLASS',
    XLE: 'LEATHER',
    XMT: 'METAL',
    XSF: 'SPECIAL FINISHES',
    XST: 'STONE & SOLID SURFACE',
    XWD: 'WOOD',
};

export const categoryLabel = (code: string): string => {
    const prefix = prefixOf(code);
    const name = CATEGORY_NAMES[prefix];
    return name ? `${prefix} ${name}` : (prefix || code);
};

// ---- Standard "Special Instructions" boilerplate, transcribed from the schedule ----

// Upholstered seating (armchairs, sofas, chairs, stools, sun lounges, banquettes).
const SEATING_SI = `
All table top, counter and usable surfaces to be treated to be scratch resistant.
Glides: Provide heavy-duty glides suitable for carpet and durable for use.
Levelers: Provide heavy duty adjustable levelers. To be concealed within the base. Concealed levelers with rubber pads suitable for stone/carpet floor.
Metal Construction: Mild steel with all joints welded, braised and polished. Provide proper support for size of specified piece to avoid racking and twisting.
Back and Underside: Finished Manufacturer to provide DWP with shop drawings for approval prior to production. Shop drawings must show all visible blocking.
Glides: Provide cushion stainless steel glides for furniture on wood floors and heavy duty nylon glides for other floor finishes.
Welding quality to be good standard - smooth finish with no noticeable joints.( Weld, grind, polish)
Manufacturer to provide DWP with prototype for approval prior to production.
Refer to plans, elevations and details for exact locations.
Item to be of contract quality.
Quantity to be confirmed by contractor prior to placement of order.
All materials must be suitable for use in dry and high humid areas.
Manufacturer to work in conjunction with DWP designer to ensure proper proportions and design intent.
Item to be received and confirmed in Mock-Up.
Manufacturer to provide DWP with finish samples for approval prior to production.
Prototype needs to be submitted for designer's approval. Dimensions are subject to change as per a result of perfecting the prototype.
Manufacturer (vendor) warrants all products from all defects and guarantees to replace any or all parts should they prove deficient within one year from date to owner acceptance. All costs in this regard shall be borne by the manufacturer.
Warranties provided need to meet or exceed operator standards. Warranties to be provided prior to mass production.
Ensure that piece will fit in lifts and through doors prior to commencing fabrication.
Contractor/ manufacturer to ensure stability of product.
Fabric Sample needs to be submitted for designer's approval.
Loose Cushions: Reversible.
If specified supplier is requested to be replaced, the product/ supplier being selected must be of equal or equivalent quality.
Memory Quality: Provide sufficient foam quality to retain 85% memory for five years. Foam density should be minimum of 40KG. The hard type can be used on the seat and back cushions while the soft type can be used on the cushions.
All Foam and Fabrics to be fire rated to meet local authority requirements and operator standards.
Backs: 24.3 kg/m3 (1.5 lbs/ft3) minimum foam density, ILD (compression) 6.8 kg (15 lbs).
Reversible Glides: Provide cushion stainless steel glides for furniture on wood floors and heavy duty nylon glides for other floor finishes.
Glides: Provide heavy-duty glides suitable for hard surface/Carpet and durable for use.
Glides: Provide cushion stainless steel glides for furniture on wood floors and heavy duty nylon glides for other floor finishes.
Solid Foam Core: Cover with 2.5 cm (1 inch) layer of polyester batting.
Wood Construction: Frame to be constructed of five quarter kiln-dried solid hardwood, reinforced with corner blocks, glued and screwed to rail. All rails and posts to be double dowelled, screwed and glued in place. Must be of fire retardant construction.
All materials must be suitable for contract use.
Warranties provided need to meet or exceed operator standards. Warranties to be provided prior to mass production.
Quantity to be confirmed by contractor prior to placement of order.
Refer to plans, elevations and details for exact locations.
Ensure that piece will fit in lifts and through doors prior to commencing fabrication.
Manufacturer to provide DWP with finish samples for approval prior to production.
Manufacturer to submit prototype for DWP approval prior to mass production.
Manufacturer (Vendor) warrants all products from all defects and guarantees to replace and all parts should they prove deficient within one year from owner acceptance.
Metal finish to be scratch, rust and corrosion resistant. Mild steel with all joints welded, braised and polished. Provide proper support for size of specified piece to avoid racking and twisting. Finish to be in MTP02. Item to be of contract quality. Dimensions are subject to change as per a result of perfecting the prototype.
Upholstery in designer specified fabric. Contractor to co-ordinate specified fabric with manufacturer. Upholstery to be tight. Manufacturer to provide DWP with shop drawings for approval prior to production. Shop drawings must show all visible blocking.
Seat Cushions: 29.2 kg/m3 (1.8 lbs./ft3) minimum foam density, ILD (compression) 11.8 to 13.6 kg (26 to 30 lbs). Seat cushion foam for public spaces - 2.5 lb. per ft. minimum.
If specified supplier is requested to be replaced, the product/ supplier being selected must be of equal or equivalent quality.
`.trim();

// General casegoods, tables, lighting, sanitary accessories, pillows/bedding.
const FURNITURE_SI = `
All table top, counter and usable surfaces to be treated to be scratch resistant.
Glides: Provide heavy-duty glides suitable for carpet and durable for use.
Levelers: Provide heavy duty adjustable levelers. To be concealed within the base. Concealed levelers with rubber pads suitable for stone/carpet floor.
Metal Construction: Mild steel with all joints welded, braised and polished. Provide proper support for size of specified piece to avoid racking and twisting.
Back and Underside: Finished Manufacturer to provide DWP with shop drawings for approval prior to production. Shop drawings must show all visible blocking.
Glides: Provide cushion stainless steel glides for furniture on wood floors and heavy duty nylon glides for other floor finishes.
Welding quality to be good standard - smooth finish with no noticeable joints.( Weld, grind, polish)
Item to be received and confirmed in Mock-Up.
Manufacturer to provide DWP with prototype for approval prior to production.
Item to be of contract quality.
Refer to plans, elevations and details for exact locations.
Quantity to be confirmed by contractor prior to placement of order.
All materials must be suitable for use in dry and high humid areas.
Manufacturer to work in conjunction with DWP designer to ensure proper proportions and design intent.
Manufacturer to provide DWP with finish samples for approval prior to production.
Prototype needs to be submitted for designer's approval. Dimensions are subject to change as per a result of perfecting the prototype.
Manufacturer (vendor) warrants all products from all defects and guarantees to replace any or all parts should they prove deficient within one year from date to owner acceptance. All costs in this regard shall be borne by the manufacturer.
Warranties provided need to meet or exceed operator standards. Warranties to be provided prior to mass production.
Ensure that piece will fit in lifts and through doors prior to commencing fabrication.
If specified supplier is requested to be replaced, the product/ supplier being selected must be of equal or equivalent quality.
`.trim();

// Tile, stone and solid surface.
const STONE_SI = `
Stone cracks, holes, and crevices to be filled with clear sealer in problem areas prior to finish sealant application and polishing.
Filled areas not to exceed 10-12% of total surface material.
Fabricate stone to comply with recommendations of Marble Institute of America's "Dimensional Stone--Design Manual IV."
All installed materials to be guaranteed sealed and erosion proof. After Installation all surfaces shall be clean and free from defects such as splotches, cracks, chipping and uneven surface transitions.
For stone finishing, the contractor must protect the surface with stain defence sealer (Natural look - sealer).
Supplier to submit finish sample for Designer approval.
Solvent base Glaze'N Seal is recommended, but manufacturer to show alternative with submitted finish sample (where applicable).
Samples at least 12 inches (300 mm) square.
`.trim();

const SI_BY_PREFIX: Record<string, string> = {
    // Upholstered seating
    SE: SEATING_SI,
    // Tile / stone / solid surface
    TL: STONE_SI,
    ST: STONE_SI,
    XST: STONE_SI,
    // General furniture, casegoods, tables, lighting, sanitary, pillows
    CG: FURNITURE_SI,
    TA: FURNITURE_SI,
    DL: FURNITURE_SI,
    SA: FURNITURE_SI,
    BP: FURNITURE_SI,
};

// Standard boilerplate for a code's category, or '' for plain materials/finishes
// (metal, paint, fabric, glass, …) which carry no special instructions in the schedule.
export const specInstructionsFor = (code: string): string => SI_BY_PREFIX[prefixOf(code)] ?? '';

// ---- Sheet formatting (Google Sheets API) -----------------------------------

// Rows above the column-header row: [blank, "Version No.", date, blank] → header sits at row index 4.
export const HEADER_BLOCK_ROWS = 4;

// Per-column pixel widths, aligned 1:1 with SCHEDULE_COLUMNS.
const COLUMN_WIDTHS: number[] = [
    70,  // Layer
    130, // Area
    70,  // Area Count
    120, // Category
    80,  // Item
    110, // Supplier
    170, // Description
    110, // Images
    80,  // Docs
    120, // Product Name
    110, // Model #
    150, // Dimension
    180, // Finish/Color
    150, // Notes
    130, // Composition
    90,  // Backing
    80,  // Width
    80,  // Thickness
    80,  // Pile Height
    90,  // Abrasion
    110, // Material
    100, // Fire resistance
    200, // Manufacturer / Contact book
    340, // Special Instructions
    180, // Link
    120, // Location of use
    130, // Estimated Price
    90,  // Quality
];

// Verbose free-text columns read better left/top-aligned than centered.
const LEFT_TOP_COLUMNS = [6 /* Description */, 22 /* Manufacturer */, 23 /* Special Instructions */, 24 /* Link */];

const SOLID_BORDER = { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } };

// batchUpdate requests that turn the imported CSV into the bordered, header-styled
// schedule table. Best-effort: the caller runs these in a try/catch so an export
// still succeeds (unformatted) if the Sheets API is unavailable.
export function buildScheduleFormatRequests(opts: { sheetId: number; dataRowCount: number }): unknown[] {
    const { sheetId, dataRowCount } = opts;
    const numCols = SCHEDULE_COLUMNS.length;
    const headerRow = HEADER_BLOCK_ROWS;     // 0-based index of the column-header row
    const dataStart = headerRow + 1;
    const dataEnd = dataStart + dataRowCount; // exclusive

    const requests: unknown[] = [
        // Column-header row: bold, centered, grey fill, wrapped.
        {
            repeatCell: {
                range: { sheetId, startRowIndex: headerRow, endRowIndex: headerRow + 1, startColumnIndex: 0, endColumnIndex: numCols },
                cell: { userEnteredFormat: { backgroundColor: { red: 0.91, green: 0.91, blue: 0.91 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP', textFormat: { bold: true, fontSize: 10 } } },
                fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)',
            },
        },
        // "Version No." label in bold.
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 2 },
                cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 11 } } },
                fields: 'userEnteredFormat.textFormat',
            },
        },
        // Freeze the version block + header row.
        {
            updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: dataStart } }, fields: 'gridProperties.frozenRowCount' },
        },
    ];

    if (dataRowCount > 0) {
        // Data cells: centered + wrapped by default.
        requests.push({
            repeatCell: {
                range: { sheetId, startRowIndex: dataStart, endRowIndex: dataEnd, startColumnIndex: 0, endColumnIndex: numCols },
                cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP', textFormat: { fontSize: 9 } } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)',
            },
        });
        // Verbose columns: left/top.
        for (const col of LEFT_TOP_COLUMNS) {
            requests.push({
                repeatCell: {
                    range: { sheetId, startRowIndex: dataStart, endRowIndex: dataEnd, startColumnIndex: col, endColumnIndex: col + 1 },
                    cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'TOP' } },
                    fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
                },
            });
        }
        // Full grid borders around the table (header + data).
        requests.push({
            updateBorders: {
                range: { sheetId, startRowIndex: headerRow, endRowIndex: dataEnd, startColumnIndex: 0, endColumnIndex: numCols },
                top: SOLID_BORDER, bottom: SOLID_BORDER, left: SOLID_BORDER, right: SOLID_BORDER,
                innerHorizontal: SOLID_BORDER, innerVertical: SOLID_BORDER,
            },
        });
    }

    // Column widths.
    COLUMN_WIDTHS.forEach((pixelSize, i) => {
        requests.push({
            updateDimensionProperties: {
                range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
                properties: { pixelSize },
                fields: 'pixelSize',
            },
        });
    });

    return requests;
}
