// code.ts (Final Version with All Fixes, Including the 'startPos' Scope Bug)

// --- Constants ---
const PADDING_COLOR: RGB = { r: 0.74, g: 0.31, b: 0.95 };
const GAP_COLOR: RGB = { r: 0.949, g: 0.6, b: 0.29 };
const TITLE_COLOR: RGB = { r: 0, g: 0, b: 0 };
const CIRCLE_TEXT_COLOR: RGB = { r: 1, g: 1, b: 1 };
const LEGEND_BLUE: RGB = { r: 0, g: 0.408, b: 0.98 }; // #0068FA
const SWATCH_STROKE_COLOR: RGB = { r: 0.2, g: 0.2, b: 0.2 };

// --- Type Definitions ---
type AutoLayoutFrame = FrameNode & {
  layoutMode: 'HORIZONTAL' | 'VERTICAL';
  itemSpacing: number; paddingTop: number; paddingBottom: number; paddingLeft: number; paddingRight: number;
  primaryAxisAlignItems: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN';
};

// --- 1. CORE HELPER & UI FUNCTIONS ---

function createTitle(text: string): TextNode {
  const titleNode = figma.createText();
  titleNode.fontName = { family: "Inter", style: "Bold" };
  titleNode.characters = text;
  titleNode.fontSize = 36;
  titleNode.fills = [{ type: 'SOLID', color: TITLE_COLOR }];
  return titleNode;
}

function createSectionTitle(text: string): TextNode {
  const titleNode = figma.createText();
  titleNode.fontName = { family: "Inter", style: "Bold" };
  titleNode.characters = text;
  titleNode.fontSize = 48;
  titleNode.fills = [{ type: 'SOLID', color: TITLE_COLOR }];
  return titleNode;
}

function createStyledText(characters: string, isBold = false): TextNode {
    const textNode = figma.createText();
    textNode.fontName = { family: "Inter", style: isBold ? "Bold" : "Regular" };
    textNode.characters = characters;
    textNode.fontSize = 12;
    textNode.lineHeight = { unit: 'PIXELS', value: 20 };
    textNode.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
    return textNode;
};

function createLine(x1: number, y1: number, x2: number, y2: number, color: RGB): VectorNode {
  const vector = figma.createVector();
  vector.strokeWeight = 1;
  vector.strokes = [{ type: 'SOLID', color }];
  vector.x = x1;
  vector.y = y1;
  vector.vectorNetwork = { vertices: [{ x: 0, y: 0 }, { x: x2 - x1, y: y2 - y1 }], segments: [{ start: 0, end: 1 }], regions: [] };
  return vector;
}

async function createValueCircle(value: number, color: RGB, unit: string = ''): Promise<GroupNode> {
    const PADDING_HORIZONTAL = 8;
    const PADDING_VERTICAL = 4;
    const LEGEND_DIAMETER = 24;

    const text = figma.createText();
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    text.fontName = { family: "Inter", style: "Bold" };
    text.characters = `${Math.round(value)}${unit}`;
    text.fontSize = 10;
    text.fills = [{ type: 'SOLID', color: CIRCLE_TEXT_COLOR }];
    text.textAlignHorizontal = 'CENTER';
    text.textAlignVertical = 'CENTER';
    text.textAutoResize = 'WIDTH_AND_HEIGHT';

    const background = figma.createRectangle();
    
    let bgWidth: number, bgHeight: number;

    if (!unit) {
        bgWidth = LEGEND_DIAMETER;
        bgHeight = LEGEND_DIAMETER;
    } else {
        bgWidth = text.width + PADDING_HORIZONTAL * 2;
        bgHeight = text.height + PADDING_VERTICAL * 2;
    }

    background.resize(bgWidth, bgHeight);
    background.cornerRadius = bgHeight / 2;
    background.fills = [{ type: 'SOLID', color }];

    text.textAutoResize = 'NONE';
    text.resize(bgWidth, bgHeight);

    const group = figma.group([background, text], figma.currentPage);
    group.appendChild(text);
    return group;
}

// --- 2. GENERIC UTILITY & LAYOUT FUNCTIONS ---

function findNodesRecursive(nodes: readonly SceneNode[], predicate: (node: SceneNode) => boolean): SceneNode[] {
    let collection: SceneNode[] = [];
    for (const node of nodes) {
        if (!node.visible) continue;
        if (predicate(node)) {
            collection.push(node);
        }
        if ('children' in node) {
            collection = collection.concat(findNodesRecursive(node.children, predicate));
        }
    }
    return collection;
}

function createSpecSheetFrame(title: string, content: SceneNode): FrameNode {
    const container = figma.createFrame();
    container.name = `${title} Spec`;
    container.layoutMode = 'VERTICAL';
    container.itemSpacing = 24;
    container.paddingTop = 24; container.paddingBottom = 40;
    container.paddingLeft = 24; container.paddingRight = 40;
    container.primaryAxisSizingMode = 'AUTO';
    container.counterAxisSizingMode = 'AUTO';
    container.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
    container.cornerRadius = 8;
    container.appendChild(createTitle(title));
    container.appendChild(content);
    return container;
}

function createHorizontalContainer(sheets: FrameNode[]): FrameNode | null {
    if (sheets.length === 0) return null;

    const container = figma.createFrame();
    container.name = "Spec Group";
    container.layoutMode = 'HORIZONTAL';
    container.itemSpacing = 50;
    container.primaryAxisSizingMode = 'AUTO';
    container.counterAxisSizingMode = 'AUTO';
    container.fills = [];
    sheets.forEach(sheet => container.appendChild(sheet));
    return container;
}

// --- UNIFIED OPACITY LOGIC ---

function getVisibleNodeIds(rootNode: SceneNode, focusNodes: SceneNode[]): Set<string> {
    const visibleIds = new Set<string>();
    function addAllDescendants(node: SceneNode) {
        visibleIds.add(node.id);
        if ('children' in node) {
            for (const child of node.children) { addAllDescendants(child); }
        }
    }
    for (const focusNode of focusNodes) {
        addAllDescendants(focusNode);
        let current: BaseNode | null = focusNode.parent;
        while (current && 'id' in current) {
            visibleIds.add(current.id);
            if (current.id === rootNode.id) break;
            current = current.parent;
        }
    }
    return visibleIds;
}

function applyFocusOpacity(rootClone: SceneNode, originalRoot: SceneNode, focusNodes: SceneNode[]) {
    const visibleNodeIds = getVisibleNodeIds(originalRoot, focusNodes);
    function recursiveDim(originalNode: SceneNode, clonedNode: SceneNode) {
        if (visibleNodeIds.has(originalNode.id)) {
            if ('children' in originalNode && 'children' in clonedNode) {
                for (let i = 0; i < originalNode.children.length; i++) {
                    if (originalNode.children[i] && clonedNode.children[i]) {
                        recursiveDim(originalNode.children[i], clonedNode.children[i]);
                    }
                }
            }
        } else {
            if ('opacity' in clonedNode) { clonedNode.opacity = 0.2; }
            if ('fills' in clonedNode && Array.isArray(clonedNode.fills)) {
                clonedNode.fills = clonedNode.fills.map(paint => Object.assign({}, paint, { opacity: 0.2 }));
            }
            if ('strokes' in clonedNode && Array.isArray(clonedNode.strokes)) {
                clonedNode.strokes = clonedNode.strokes.map(paint => Object.assign({}, paint, { opacity: 0.2 }));
            }
        }
    }
    recursiveDim(originalRoot, rootClone);
}


// --- 3. NEW ANNOTATION ENGINE WITH ADVANCED COLLISION AVOIDANCE ---

async function drawNumberedLegendAnnotations(nodes: SceneNode[], rootBounds: Rect): Promise<SceneNode[]> {
    const annotations: SceneNode[] = [];
    const CONTAINER_PADDING = 80;
    const ELBOW_LENGTH = 30;
    const DOT_DIAMETER = 5;
    const MIN_SPACING = 32;

    const rootCenter = { x: rootBounds.x + rootBounds.width / 2, y: rootBounds.y + rootBounds.height / 2 };
    const quadrants: { [key: string]: SceneNode[] } = { top: [], bottom: [], left: [], right: [] };

    for (const node of nodes) {
        const nodeCenter = { x: node.absoluteBoundingBox!.x + node.absoluteBoundingBox!.width / 2, y: node.absoluteBoundingBox!.y + node.absoluteBoundingBox!.height / 2 };
        const delta = { x: nodeCenter.x - rootCenter.x, y: nodeCenter.y - rootCenter.y };
        if (Math.abs(delta.x) > Math.abs(delta.y)) {
            quadrants[delta.x > 0 ? 'right' : 'left'].push(node);
        } else {
            quadrants[delta.y > 0 ? 'bottom' : 'top'].push(node);
        }
    }
    
    let legendCounter = 1;

    const processQuadrant = async (nodes: SceneNode[], side: 'top' | 'bottom' | 'left' | 'right') => {
        if (nodes.length === 0) return;

        // --- START: MODIFIED CODE ---
        const ANNOTATION_BUFFER = 12; // The minimum pixel buffer between adjacent annotation stems.
        // --- END: MODIFIED CODE ---

        if (side === 'left' || side === 'right') {
            nodes.sort((a, b) => (a.absoluteBoundingBox!.y + a.absoluteBoundingBox!.height / 2) - (b.absoluteBoundingBox!.y + b.absoluteBoundingBox!.height / 2));
        } else {
            nodes.sort((a, b) => (a.absoluteBoundingBox!.x + a.absoluteBoundingBox!.width / 2) - (b.absoluteBoundingBox!.x + b.absoluteBoundingBox!.width / 2));
        }
        
        let lastEndPos = -Infinity;
        // --- START: MODIFIED CODE ---
        // This will track the start position of the last annotation to prevent overlap.
        let lastStartPos = -Infinity;
        // --- END: MODIFIED CODE ---

        for (const node of nodes) {
            const nodeBounds = node.absoluteBoundingBox!;
            const nodeCenter = { x: nodeBounds.x + nodeBounds.width / 2, y: nodeBounds.y + nodeBounds.height / 2 };
            
            let startPos = { x: 0, y: 0 };
            
            const numberCircle = await createValueCircle(legendCounter, LEGEND_BLUE);

            if (side === 'left' || side === 'right') {
                // --- START: MODIFIED CODE for Horizontal Overlap ---
                const potentialStartY = nodeCenter.y;
                // Enforce a minimum buffer between annotation start points.
                const correctedStartY = Math.max(potentialStartY, lastStartPos + ANNOTATION_BUFFER);
                lastStartPos = correctedStartY; // Update for the next iteration.

                startPos = { x: side === 'left' ? nodeBounds.x : nodeBounds.x + nodeBounds.width, y: correctedStartY };
                // --- END: MODIFIED CODE for Horizontal Overlap ---
                
                const endPos = { x: side === 'left' ? rootBounds.x - CONTAINER_PADDING : rootBounds.x + rootBounds.width + CONTAINER_PADDING, y: 0 };
                
                // This logic spaces out the numbered circles at the end of the lines.
                const correctedEndY = Math.max(startPos.y, lastEndPos + MIN_SPACING);
                lastEndPos = correctedEndY;
                endPos.y = correctedEndY;
                
                const elbowX = endPos.x + (side === 'left' ? ELBOW_LENGTH : -ELBOW_LENGTH);
                annotations.push(createLine(startPos.x, startPos.y, elbowX, startPos.y, LEGEND_BLUE));
                annotations.push(createLine(elbowX, startPos.y, endPos.x, endPos.y, LEGEND_BLUE));

                numberCircle.x = endPos.x - numberCircle.width / 2;
                numberCircle.y = endPos.y - numberCircle.height / 2;

            } else { // Top or Bottom
                // --- START: MODIFIED CODE for Vertical Overlap ---
                const potentialStartX = nodeCenter.x;
                // Enforce a minimum buffer between annotation start points.
                const correctedStartX = Math.max(potentialStartX, lastStartPos + ANNOTATION_BUFFER);
                lastStartPos = correctedStartX; // Update for the next iteration.
                
                startPos = { x: correctedStartX, y: side === 'top' ? nodeBounds.y : nodeBounds.y + nodeBounds.height };
                // --- END: MODIFIED CODE for Vertical Overlap ---

                const endPos = { x: 0, y: side === 'top' ? rootBounds.y - CONTAINER_PADDING : rootBounds.y + rootBounds.height + CONTAINER_PADDING };

                // This logic spaces out the numbered circles at the end of the lines.
                const correctedEndX = Math.max(startPos.x, lastEndPos + MIN_SPACING);
                lastEndPos = correctedEndX;
                endPos.x = correctedEndX;
                
                const elbowY = endPos.y + (side === 'top' ? ELBOW_LENGTH : -ELBOW_LENGTH);
                annotations.push(createLine(startPos.x, startPos.y, startPos.x, elbowY, LEGEND_BLUE));
                annotations.push(createLine(startPos.x, elbowY, endPos.x, endPos.y, LEGEND_BLUE));
                
                numberCircle.x = endPos.x - numberCircle.width / 2;
                numberCircle.y = endPos.y - numberCircle.height / 2;
            }

            const dot = figma.createEllipse();
            dot.resize(DOT_DIAMETER, DOT_DIAMETER);
            dot.fills = [{ type: 'SOLID', color: LEGEND_BLUE }];
            dot.x = startPos.x - DOT_DIAMETER / 2;
            dot.y = startPos.y - DOT_DIAMETER / 2;
            
            annotations.push(dot, numberCircle);
            legendCounter++;
        }
    };

    await processQuadrant(quadrants.left, 'left');
    await processQuadrant(quadrants.right, 'right');
    await processQuadrant(quadrants.top, 'top');
    await processQuadrant(quadrants.bottom, 'bottom');

    return annotations;
}

// --- 4. SPEC-SPECIFIC LOGIC ---
// --- LAYOUT SPECS ---
async function createLayoutSpecInfoFrame(frame: AutoLayoutFrame): Promise<FrameNode> {
  const container = figma.createFrame(); container.name = "Spec Info";
  container.layoutMode = 'VERTICAL'; container.itemSpacing = 4;
  container.primaryAxisSizingMode = 'AUTO'; container.counterAxisSizingMode = 'AUTO';
  container.fills = []; container.appendChild(createStyledText(`Frame: "${frame.name}"`));
  const spacer = figma.createRectangle(); spacer.resize(1, 16); spacer.fills = [];
  container.appendChild(spacer); container.appendChild(createStyledText("Layout Specs:", true));
  const getVarName = async (obj: any, key: string) => {
    const boundVar = obj.boundVariables?.[key];
    if (boundVar && 'id' in boundVar) { const variable = await figma.variables.getVariableByIdAsync(boundVar.id); return variable ? ` (${variable.name})` : ''; }
    return '';
  };
  let specStr = '';
  if (frame.paddingTop > 0) specStr += `• Top Padding: ${frame.paddingTop}px${await getVarName(frame, 'paddingTop')}\n`;
  if (frame.paddingBottom > 0) specStr += `• Bottom Padding: ${frame.paddingBottom}px${await getVarName(frame, 'paddingBottom')}\n`;
  if (frame.paddingLeft > 0) specStr += `• Left Padding: ${frame.paddingLeft}px${await getVarName(frame, 'paddingLeft')}\n`;
  if (frame.paddingRight > 0) specStr += `• Right Padding: ${frame.paddingRight}px${await getVarName(frame, 'paddingRight')}\n`;
  if (frame.itemSpacing > 0 && frame.children.length > 1) {
    const gapDir = frame.layoutMode === 'VERTICAL' ? 'Vertical' : 'Horizontal';
    specStr += `• ${gapDir} Gap: ${frame.primaryAxisAlignItems === 'SPACE_BETWEEN' ? 'Auto' : `${frame.itemSpacing}px${await getVarName(frame, 'itemSpacing')}`}\n`;
  }
  if (specStr) container.appendChild(createStyledText(specStr.trim()));
  return container;
}
async function drawPaddingAnnotations(focusFrame: AutoLayoutFrame, topLevelFrame: SceneNode): Promise<SceneNode[]> {
  const createdNodes: SceneNode[] = []; const EXTENSION = 24; const GAP_FROM_LINE = 4;
  const { absoluteTransform: focusAbsT, width: focusW, height: focusH } = focusFrame;
  const { absoluteBoundingBox: parentBounds } = topLevelFrame; if (!parentBounds) return [];
  const focusAbsX = focusAbsT[0][2]; const focusAbsY = focusAbsT[1][2];
  const lineStartX = parentBounds.x - EXTENSION; const lineEndX = parentBounds.x + parentBounds.width + EXTENSION;
  const lineStartY = parentBounds.y - EXTENSION; const lineEndY = parentBounds.y + parentBounds.height + EXTENSION;
  const paddings: { [key: string]: number } = { Top: focusFrame.paddingTop, Bottom: focusFrame.paddingBottom, Left: focusFrame.paddingLeft, Right: focusFrame.paddingRight };
  for (const side in paddings) {
    const value = paddings[side]; if (value <= 0) continue;
    const rect = figma.createRectangle(); rect.fills = [{ type: 'SOLID', color: PADDING_COLOR, opacity: 0.3 }];
    if (side === 'Top') { rect.resize(focusW, value); rect.x = focusAbsX; rect.y = focusAbsY; createdNodes.push(createLine(lineStartX, focusAbsY, lineEndX, focusAbsY, PADDING_COLOR), createLine(lineStartX, focusAbsY + value, lineEndX, focusAbsY + value, PADDING_COLOR)); }
    else if (side === 'Bottom') { rect.resize(focusW, value); rect.x = focusAbsX; rect.y = focusAbsY + focusH - value; createdNodes.push(createLine(lineStartX, rect.y, lineEndX, rect.y, PADDING_COLOR), createLine(lineStartX, rect.y + value, lineEndX, rect.y + value, PADDING_COLOR)); }
    else if (side === 'Left') { rect.resize(value, focusH); rect.x = focusAbsX; rect.y = focusAbsY; createdNodes.push(createLine(focusAbsX, lineStartY, focusAbsX, lineEndY, PADDING_COLOR), createLine(focusAbsX + value, lineStartY, focusAbsX + value, lineEndY, PADDING_COLOR)); }
    else if (side === 'Right') { rect.resize(value, focusH); rect.x = focusAbsX + focusW - value; rect.y = focusAbsY; createdNodes.push(createLine(rect.x, lineStartY, rect.x, lineEndY, PADDING_COLOR), createLine(rect.x + value, lineStartY, rect.x + value, lineEndY, PADDING_COLOR)); }
    const iconGroup = await createValueCircle(value, PADDING_COLOR, 'px');
    if (side === 'Top' || side === 'Bottom') { iconGroup.x = lineEndX + GAP_FROM_LINE; iconGroup.y = rect.y + rect.height / 2 - iconGroup.height / 2; }
    else { iconGroup.x = rect.x + rect.width / 2 - iconGroup.width / 2; iconGroup.y = lineEndY + GAP_FROM_LINE; }
    createdNodes.push(iconGroup, rect);
  } return createdNodes;
}
async function drawItemSpacingAnnotations(focusFrame: AutoLayoutFrame, topLevelFrame: SceneNode): Promise<SceneNode[]> {
  if (focusFrame.itemSpacing <= 0 || focusFrame.children.length < 2 || focusFrame.primaryAxisAlignItems === 'SPACE_BETWEEN') return [];
  const createdNodes: SceneNode[] = []; const EXTENSION = 24; const GAP_FROM_LINE = 4; const value = focusFrame.itemSpacing;
  const { absoluteBoundingBox: parentBounds } = topLevelFrame; if (!parentBounds) return [];
  const lineStartX = parentBounds.x - EXTENSION; const lineEndX = parentBounds.x + parentBounds.width + EXTENSION;
  const lineStartY = parentBounds.y - EXTENSION; const lineEndY = parentBounds.y + parentBounds.height + EXTENSION;
  for (let i = 0; i < focusFrame.children.length - 1; i++) {
    const child = focusFrame.children[i];
    if ('absoluteTransform' in child && 'width' in child && 'height' in child) {
      const rect = figma.createRectangle(); rect.fills = [{ type: 'SOLID', color: GAP_COLOR, opacity: 0.3 }];
      const childAbsT = child.absoluteTransform; const childAbsX = childAbsT[0][2]; const childAbsY = childAbsT[1][2];
      if (focusFrame.layoutMode === 'VERTICAL') {
        const gapY = childAbsY + child.height; rect.resize(child.width, value); rect.x = childAbsX; rect.y = gapY;
        if (i === 0) { createdNodes.push(createLine(lineStartX, gapY, lineEndX, gapY, GAP_COLOR), createLine(lineStartX, gapY + value, lineEndX, gapY + value, GAP_COLOR)); const iconGroup = await createValueCircle(value, GAP_COLOR, 'px'); iconGroup.x = lineEndX + GAP_FROM_LINE; iconGroup.y = rect.y + rect.height / 2 - iconGroup.height / 2; createdNodes.push(iconGroup); }
      } else {
        const gapX = childAbsX + child.width; rect.resize(value, child.height); rect.x = gapX; rect.y = childAbsY;
        if (i === 0) { createdNodes.push(createLine(gapX, lineStartY, gapX, lineEndY, GAP_COLOR), createLine(gapX + value, lineStartY, gapX + value, lineEndY, GAP_COLOR)); const iconGroup = await createValueCircle(value, GAP_COLOR, 'px'); iconGroup.x = rect.x + rect.width / 2 - iconGroup.width / 2; iconGroup.y = lineEndY + GAP_FROM_LINE; createdNodes.push(iconGroup); }
      } createdNodes.push(rect);
    }
  } return createdNodes;
}
async function generateSingleLayoutSpec(focusFrame: AutoLayoutFrame, topLevelFrame: SceneNode): Promise<FrameNode> {
    const fullClone = topLevelFrame.clone();
    applyFocusOpacity(fullClone, topLevelFrame, [focusFrame]);
    const annotations = [ ...await drawPaddingAnnotations(focusFrame, topLevelFrame), ...await drawItemSpacingAnnotations(focusFrame, topLevelFrame) ];
    const specInfoFrame = await createLayoutSpecInfoFrame(focusFrame);
    
    const specContent = figma.createFrame();
    specContent.layoutMode = 'HORIZONTAL';
    specContent.itemSpacing = 24;
    specContent.primaryAxisSizingMode = 'AUTO';
    specContent.counterAxisSizingMode = 'AUTO';
    specContent.counterAxisAlignItems = 'CENTER';
    specContent.fills = [];
    specContent.appendChild(specInfoFrame);

    figma.group([fullClone, ...annotations], specContent, 0);

    return createSpecSheetFrame(focusFrame.name, specContent);
}

// --- COLOR SPECS ---
function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (c: number) => ('0' + Math.round(c * 255).toString(16)).slice(-2);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}
async function findAllColorNodes(nodes: readonly SceneNode[], map: Map<string, { value: RGB; elements: Map<string, {node: SceneNode, props: Set<'fills' | 'strokes'>}>; variable?: Variable }>) {
    for (const node of nodes) {
        if (!node.visible) continue;
        const props: ('fills' | 'strokes')[] = ['fills', 'strokes'];
        for (const prop of props) {
            if (prop in node && Array.isArray((node as any)[prop])) {
                for (const paint of (node as any)[prop]) {
                    if (paint.type === 'SOLID' && paint.visible && (paint.opacity === undefined || paint.opacity > 0)) {
                        let key: string | undefined, variable: Variable | undefined;
                        if (paint.boundVariables?.color) {
                            variable = await figma.variables.getVariableByIdAsync(paint.boundVariables.color.id);
                            if (variable) key = variable.name;
                        } else { key = rgbToHex(paint.color.r, paint.color.g, paint.color.b); }
                        if (key) {
                            let focusTarget = node;
                            const parent = node.parent;
                            if (parent && 'children' in parent && parent.children.some(child => 'isMask' in child && child.isMask)) {
                                focusTarget = parent as SceneNode;
                            }
                            if (!map.has(key)) map.set(key, { value: paint.color, elements: new Map(), variable });
                            const colorEntry = map.get(key)!;
                            if (!colorEntry.elements.has(focusTarget.id)) colorEntry.elements.set(focusTarget.id, { node: focusTarget, props: new Set() });
                            colorEntry.elements.get(focusTarget.id)!.props.add(prop);
                        }
                    }
                }
            }
        }
        if ('children' in node) await findAllColorNodes(node.children, map);
    }
}
async function generateSingleColorSpec(colorData: { value: RGB; elements: Map<string, {node: SceneNode, props: Set<'fills' | 'strokes'>}>; variable?: Variable }, key: string, topLevelFrame: SceneNode): Promise<FrameNode> {
    const nodes = Array.from(colorData.elements.values()).map(e => e.node);
    const { value, variable } = colorData;
    const fullClone = topLevelFrame.clone();
    applyFocusOpacity(fullClone, topLevelFrame, nodes);
    
    const annotations = await drawNumberedLegendAnnotations(nodes, topLevelFrame.absoluteBoundingBox!);
    
    const specInfoFrame = figma.createFrame();
    specInfoFrame.layoutMode = 'VERTICAL';
    specInfoFrame.itemSpacing = 8;
    specInfoFrame.primaryAxisSizingMode = 'AUTO';
    specInfoFrame.counterAxisSizingMode = 'AUTO';
    specInfoFrame.fills = [];

    const colorTitle = variable ? variable.name : key;
    specInfoFrame.appendChild(createStyledText(colorTitle, true));

    const swatchLine = figma.createFrame();
    swatchLine.layoutMode = 'HORIZONTAL';
    swatchLine.itemSpacing = 8;
    swatchLine.primaryAxisSizingMode = 'AUTO';
    swatchLine.counterAxisSizingMode = 'AUTO';
    swatchLine.counterAxisAlignItems = 'CENTER';
    swatchLine.fills = [];
    const swatch = figma.createRectangle();
    swatch.resize(16, 16);
    swatch.cornerRadius = 2;
    swatch.fills = [{ type: 'SOLID', color: value }];
    swatch.strokes = [{ type: 'SOLID', color: SWATCH_STROKE_COLOR }];
    swatchLine.appendChild(swatch);
    const hex = rgbToHex(value.r, value.g, value.b);
    const rgb = `rgb(${Math.round(value.r * 255)}, ${Math.round(value.g * 255)}, ${Math.round(value.b * 255)})`;
    swatchLine.appendChild(createStyledText(`${hex}  •  ${rgb}`));
    specInfoFrame.appendChild(swatchLine);

    const spacer = figma.createRectangle(); spacer.resize(1, 16); spacer.fills = [];
    specInfoFrame.appendChild(spacer);

    specInfoFrame.appendChild(createStyledText("Applied To:", true));
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const legendItem = figma.createFrame();
        legendItem.layoutMode = 'HORIZONTAL';
        legendItem.itemSpacing = 8;
        legendItem.primaryAxisSizingMode = 'AUTO';
        legendItem.counterAxisSizingMode = 'AUTO';
        legendItem.counterAxisAlignItems = 'CENTER';
        legendItem.fills = [];

        const numberCircle = await createValueCircle(i + 1, LEGEND_BLUE);
        legendItem.appendChild(numberCircle);
        legendItem.appendChild(createStyledText(node.name));
        specInfoFrame.appendChild(legendItem);
    }
    
    const specContent = figma.createFrame();
    specContent.layoutMode = 'HORIZONTAL';
    specContent.itemSpacing = 24;
    specContent.primaryAxisSizingMode = 'AUTO';
    specContent.counterAxisSizingMode = 'AUTO';
    specContent.counterAxisAlignItems = 'CENTER';
    specContent.fills = [];
    specContent.appendChild(specInfoFrame);

    const visualUnit = figma.group([fullClone, ...annotations], specContent, 0);
    visualUnit.name = `Visuals for Color: ${colorTitle}`;
    
    return createSpecSheetFrame(colorTitle, specContent);
}

// --- RADII SPECS ---
function getRadiusString(node: SceneNode): string | null {
  if (!('topLeftRadius' in node)) return null;
  const { topLeftRadius = 0, topRightRadius = 0, bottomRightRadius = 0, bottomLeftRadius = 0 } = node;
  const radii = [topLeftRadius, topRightRadius, bottomRightRadius, bottomLeftRadius];
  if (radii.every(r => r === 0)) return null;
  const allSame = radii.every(r => r === radii[0]);
  if (allSame) {
    return `${topLeftRadius}px`;
  } else {
    const descriptiveLines = [
      `Top-Left: ${topLeftRadius}px`,
      `Top-Right: ${topRightRadius}px`,
      `Bottom-Right: ${bottomRightRadius}px`,
      `Bottom-Left: ${bottomLeftRadius}px`
    ];
    return descriptiveLines.join('\n');
  }
}
async function findAllRadiusNodesGroupedByValue(nodes: readonly SceneNode[], map: Map<string, { value: string, nodes: SceneNode[], variable?: Variable }>) {
    for (const node of nodes) {
        if (!node.visible) continue;
        let key: string | null = null; let variable: Variable | undefined;
        if ('boundVariables' in node && node.boundVariables) {
            const radiusKeys = ['cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'];
            for (const radiusKey of radiusKeys) {
                if (radiusKey in node.boundVariables) {
                    const boundVar = (node.boundVariables as any)[radiusKey];
                    if (boundVar && 'id' in boundVar) {
                        variable = await figma.variables.getVariableByIdAsync(boundVar.id);
                        if (variable) { key = variable.name; break; }
                    }
                }
            }
        }
        if (!key) key = getRadiusString(node);
        if (key) {
            if (!map.has(key)) map.set(key, { value: getRadiusString(node) || key, nodes: [], variable });
            map.get(key)!.nodes.push(node);
        }
        if ('children' in node) await findAllRadiusNodesGroupedByValue(node.children, map);
    }
}
async function createRadiusSpecInfoFrame(focusFrame: SceneNode, radiusData: { value: string, nodes: SceneNode[], variable?: Variable }): Promise<FrameNode> {
    const { nodes, variable, value } = radiusData;
    const container = figma.createFrame();
    container.name = "Spec Info";
    container.layoutMode = 'VERTICAL';
    container.itemSpacing = 4;
    container.primaryAxisSizingMode = 'AUTO';
    container.counterAxisSizingMode = 'AUTO';
    container.fills = [];
    
    container.appendChild(createStyledText(`Frame: "${focusFrame.name}"`));
    
    const spacer = figma.createRectangle(); spacer.resize(1, 16); spacer.fills = [];
    container.appendChild(spacer);
    
    container.appendChild(createStyledText("Radius Specs:", true));
    
    let specStr: string;
    if (variable) {
        const resolvedValue = variable.valuesByMode[Object.keys(variable.valuesByMode)[0]];
        specStr = typeof resolvedValue === 'number' ? `• All Corners: ${resolvedValue}px (${variable.name})` : `• All Corners: ${String(resolvedValue)} (${variable.name})`;
    } else {
        if (value.includes('\n')) {
          specStr = value.split('\n').map(line => `• ${line}`).join('\n');
        } else {
          specStr = `• All Corners: ${value}`;
        }
    }
    container.appendChild(createStyledText(specStr));

    const otherNodes = nodes.filter(n => n.id !== focusFrame.id);
    if (otherNodes.length > 0) {
        const spacer2 = figma.createRectangle(); spacer2.resize(1, 16); spacer2.fills = [];
        container.appendChild(spacer2);
        container.appendChild(createStyledText(`Also applied to ${otherNodes.length} other element(s):`, true));
        otherNodes.forEach(node => container.appendChild(createStyledText(`• ${node.name}`)));
    }

    return container;
}
async function drawRadiusAnnotations(focusFrame: SceneNode): Promise<SceneNode[]> {
    if (!('topLeftRadius' in focusFrame && 'absoluteBoundingBox' in focusFrame && focusFrame.absoluteBoundingBox)) {
        return [];
    }
    const createdNodes: SceneNode[] = [];
    const EXTENSION = 24;
    const CORNER_OFFSET = 8;
    const { absoluteTransform: focusAbsT, width: focusW, height: focusH } = focusFrame;
    const focusAbsX = focusAbsT[0][2];
    const focusAbsY = focusAbsT[1][2];

    const RADIUS_ANNOTATION_COLOR: RGB = PADDING_COLOR;

    const radii: { [key: string]: { value: number } } = {
        TopLeft: { value: focusFrame.topLeftRadius || 0 },
        TopRight: { value: focusFrame.topRightRadius || 0 },
        BottomLeft: { value: focusFrame.bottomLeftRadius || 0 },
        BottomRight: { value: focusFrame.bottomRightRadius || 0 },
    };

    for (const corner in radii) {
        const { value } = radii[corner];
        if (value <= 0) continue;

        const rect = figma.createRectangle();
        rect.resize(value, value);
        rect.fills = [{ type: 'SOLID', color: RADIUS_ANNOTATION_COLOR, opacity: 0.3 }];
        
        const iconGroup = await createValueCircle(value, RADIUS_ANNOTATION_COLOR, 'px');

        if (corner === 'TopLeft') {
            rect.x = focusAbsX; rect.y = focusAbsY;
            rect.topLeftRadius = value;
            createdNodes.push(createLine(focusAbsX - EXTENSION, focusAbsY + value, focusAbsX + value, focusAbsY + value, RADIUS_ANNOTATION_COLOR));
            createdNodes.push(createLine(focusAbsX + value, focusAbsY - EXTENSION, focusAbsX + value, focusAbsY + value, RADIUS_ANNOTATION_COLOR));
            iconGroup.x = focusAbsX - CORNER_OFFSET - iconGroup.width;
            iconGroup.y = focusAbsY - CORNER_OFFSET - iconGroup.height;
        } else if (corner === 'TopRight') {
            rect.x = focusAbsX + focusW - value; rect.y = focusAbsY;
            rect.topRightRadius = value;
            createdNodes.push(createLine(focusAbsX + focusW + EXTENSION, focusAbsY + value, focusAbsX + focusW - value, focusAbsY + value, RADIUS_ANNOTATION_COLOR));
            createdNodes.push(createLine(focusAbsX + focusW - value, focusAbsY - EXTENSION, focusAbsX + focusW - value, focusAbsY + value, RADIUS_ANNOTATION_COLOR));
            iconGroup.x = focusAbsX + focusW + CORNER_OFFSET;
            iconGroup.y = focusAbsY - CORNER_OFFSET - iconGroup.height;
        } else if (corner === 'BottomLeft') {
            rect.x = focusAbsX; rect.y = focusAbsY + focusH - value;
            rect.bottomLeftRadius = value;
            createdNodes.push(createLine(focusAbsX - EXTENSION, focusAbsY + focusH - value, focusAbsX + value, focusAbsY + focusH - value, RADIUS_ANNOTATION_COLOR));
            createdNodes.push(createLine(focusAbsX + value, focusAbsY + focusH + EXTENSION, focusAbsX + value, focusAbsY + focusH - value, RADIUS_ANNOTATION_COLOR));
            iconGroup.x = focusAbsX - CORNER_OFFSET - iconGroup.width;
            iconGroup.y = focusAbsY + focusH + CORNER_OFFSET;
        } else { // BottomRight
            rect.x = focusAbsX + focusW - value; rect.y = focusAbsY + focusH - value;
            rect.bottomRightRadius = value;
            createdNodes.push(createLine(focusAbsX + focusW + EXTENSION, focusAbsY + focusH - value, focusAbsX + focusW - value, focusAbsY + focusH - value, RADIUS_ANNOTATION_COLOR));
            createdNodes.push(createLine(focusAbsX + focusW - value, focusAbsY + focusH + EXTENSION, focusAbsX + focusW - value, focusAbsY + focusH - value, RADIUS_ANNOTATION_COLOR));
            iconGroup.x = focusAbsX + focusW + CORNER_OFFSET;
            iconGroup.y = focusAbsY + focusH + CORNER_OFFSET;
        }
        createdNodes.push(rect, iconGroup);
    }
    
    return createdNodes;
}
async function generateSingleRadiusSpec(radiusData: { value: string, nodes: SceneNode[], variable?: Variable }, key: string, topLevelFrame: SceneNode): Promise<FrameNode> {
    const focusFrame = radiusData.nodes[0];
    const fullClone = topLevelFrame.clone();
    applyFocusOpacity(fullClone, topLevelFrame, radiusData.nodes);

    const annotations = await drawRadiusAnnotations(focusFrame);
    
    const specInfoFrame = await createRadiusSpecInfoFrame(focusFrame, radiusData);

    const specContent = figma.createFrame();
    specContent.layoutMode = 'HORIZONTAL';
    specContent.itemSpacing = 24;
    specContent.primaryAxisSizingMode = 'AUTO';
    specContent.counterAxisSizingMode = 'AUTO';
    specContent.counterAxisAlignItems = 'CENTER';
    specContent.fills = [];
    specContent.appendChild(specInfoFrame);

    figma.group([fullClone, ...annotations], specContent, 0);

    let specTitle: string;
    if (radiusData.variable) {
        specTitle = radiusData.variable.name;
    } else if (key.includes('\n')) {
        specTitle = focusFrame.name;
    } else {
        specTitle = key;
    }
    
    return createSpecSheetFrame(`${specTitle} Radii`, specContent);
}

// --- TEXT TOKEN SPECS ---
async function findAllTextNodesGroupedByStyle(nodes: readonly SceneNode[], map: Map<string, { nodes: TextNode[], variable?: Variable, description: string }>) {
    for (const node of nodes) {
        if (node.type === 'TEXT' && node.visible) {
            let key: string | undefined;
            let variable: Variable | undefined;
            let description: string = "";

            if (node.boundVariables && 'textStyle' in node.boundVariables) {
                const boundVar = node.boundVariables.textStyle;
                if (boundVar && typeof boundVar === 'object' && 'type' in boundVar && boundVar.type === 'VARIABLE_ALIAS') {
                    const variableAlias = boundVar as VariableAlias;
                    variable = await figma.variables.getVariableByIdAsync(variableAlias.id);
                    if (variable) {
                        key = variable.name;
                        const modeId = Object.keys(variable.valuesByMode)[0];
                        if (modeId) {
                            const value = variable.valuesByMode[modeId];
                            if (typeof value === 'string') {
                                const style = await figma.getStyleByIdAsync(value);
                                if (style && style.type === 'TEXT') {
                                    description = `${style.fontName.family} ${style.fontName.style} / ${style.fontSize}px`;
                                } else {
                                    description = "Bound to variable (style not found)";
                                }
                            }
                        }
                    }
                }
            }
            
            if (!key && typeof node.textStyleId === 'string' && node.textStyleId) {
                const style = await figma.getStyleByIdAsync(node.textStyleId);
                if (style && style.type === 'TEXT') {
                    key = style.name;
                    description = `${style.fontName.family} ${style.fontName.style} / ${style.fontSize}px`;
                }
            }

            if (!key) {
                if (node.fontName !== figma.mixed && typeof node.fontSize === 'number') {
                    const font = node.fontName as FontName;
                    const lh = node.lineHeight as LineHeight;
                    description = `${font.family} ${font.style} / ${String(node.fontSize)}px / ${'value' in lh ? lh.value + (lh.unit === 'PIXELS' ? 'px' : '%') : 'Auto'}`;
                    key = description;
                } else {
                    key = "Mixed Text Style";
                    description = "Contains mixed text properties";
                }
            }

            if (key) {
                if (!map.has(key)) {
                    map.set(key, { nodes: [], variable, description });
                }
                map.get(key)!.nodes.push(node);
            }
        }
        if ('children' in node) {
            await findAllTextNodesGroupedByStyle(node.children, map);
        }
    }
}
async function generateSingleTextSpec(textData: { nodes: TextNode[], variable?: Variable, description: string }, key: string, topLevelFrame: SceneNode): Promise<FrameNode | null> {
    const { nodes, description } = textData;

    const fontsToLoad = new Set<FontName>();
    for (const node of nodes) {
        if (node.fontName !== figma.mixed) {
            fontsToLoad.add(node.fontName);
        } else {
            const segments = node.getStyledTextSegments(['fontName']);
            for (const segment of segments) {
                fontsToLoad.add(segment.fontName);
            }
        }
    }

    try {
        await Promise.all(Array.from(fontsToLoad).map(font => figma.loadFontAsync(font)));
    } catch (e) {
        console.error(`Could not generate spec for "${key}" because a required font failed to load.`, e);
        return null;
    }

    const fullClone = topLevelFrame.clone();
    applyFocusOpacity(fullClone, topLevelFrame, nodes);
    
    const annotations = await drawNumberedLegendAnnotations(nodes, topLevelFrame.absoluteBoundingBox!);
    
    const specInfoFrame = figma.createFrame();
    specInfoFrame.layoutMode = 'VERTICAL';
    specInfoFrame.itemSpacing = 8;
    specInfoFrame.primaryAxisSizingMode = 'AUTO';
    specInfoFrame.counterAxisSizingMode = 'AUTO';
    specInfoFrame.fills = [];
    specInfoFrame.appendChild(createStyledText(key, true));
    specInfoFrame.appendChild(createStyledText(description));
    
    const spacer = figma.createRectangle(); spacer.resize(1, 16); spacer.fills = [];
    specInfoFrame.appendChild(spacer);

    specInfoFrame.appendChild(createStyledText("Applied To:", true));
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const legendItem = figma.createFrame();
        legendItem.layoutMode = 'HORIZONTAL';
        legendItem.itemSpacing = 8;
        legendItem.primaryAxisSizingMode = 'AUTO';
        legendItem.counterAxisSizingMode = 'AUTO';
        legendItem.counterAxisAlignItems = 'CENTER';
        legendItem.fills = [];

        const numberCircle = await createValueCircle(i + 1, LEGEND_BLUE);
        legendItem.appendChild(numberCircle);
        legendItem.appendChild(createStyledText(node.name));
        specInfoFrame.appendChild(legendItem);
    }

    const specContent = figma.createFrame();
    specContent.layoutMode = 'HORIZONTAL';
    specContent.itemSpacing = 24;
    specContent.primaryAxisSizingMode = 'AUTO';
    specContent.counterAxisSizingMode = 'AUTO';
    specContent.counterAxisAlignItems = 'CENTER';
    specContent.fills = [];
    specContent.appendChild(specInfoFrame);

    const visualUnit = figma.group([fullClone, ...annotations], specContent, 0);
    visualUnit.name = `Visuals for Text: ${key}`;
    
    return createSpecSheetFrame(key, specContent);
}


// --- 5. MAIN PLUGIN LOGIC ---

figma.showUI(__html__, { width: 300, height: 300 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'generate-specs') {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || !('children' in selection[0])) {
      figma.ui.postMessage({ type: 'error', message: 'Please select a single frame, component, or group.' });
      return;
    }
    const topLevelFrame = selection[0];
    
    try {
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    } catch (e) {
        console.error("Could not load the required 'Inter' font.", e);
        figma.ui.postMessage({ type: 'error', message: "Critical Error: Could not load required font 'Inter'. Please ensure it is installed." });
        return;
    }

    figma.ui.postMessage({ type: 'loading-start' });
    await new Promise(resolve => setTimeout(resolve, 50));

    // --- START: CORRECTED LINE ---
    // textSheets is now declared here with the others.
    let layoutSheets: FrameNode[] = [], colorSheets: FrameNode[] = [], radiusSheets: FrameNode[] = [], textSheets: FrameNode[] = [];
    // --- END: CORRECTED LINE ---
    
    const { layout, colors, radius, text } = msg.options;
    
    const SPEC_WEIGHTS = {
        layout: 2,
        colors: 1,
        radius: 1.5,
        text: 5 
    };

    let totalWeight = 0;
    
    const isLayoutFrameToSpec = (node: SceneNode): node is AutoLayoutFrame => node.type === 'FRAME' && node.layoutMode !== 'NONE' && (node.paddingTop > 0 || node.paddingBottom > 0 || node.paddingLeft > 0 || node.paddingRight > 0 || (node.itemSpacing > 0 && node.children.length > 1 && node.primaryAxisAlignItems !== 'SPACE_BETWEEN'));
    
    const framesToSpec = layout ? findNodesRecursive([topLevelFrame], isLayoutFrameToSpec) as AutoLayoutFrame[] : [];
    if (layout) totalWeight += framesToSpec.length * SPEC_WEIGHTS.layout;

    const allColorsMap = new Map<string, { value: RGB; elements: Map<string, {node: SceneNode, props: Set<'fills' | 'strokes'>}>; variable?: Variable }>();
    if (colors) { await findAllColorNodes([topLevelFrame], allColorsMap); totalWeight += allColorsMap.size * SPEC_WEIGHTS.colors; }
    
    const allRadiiMap = new Map<string, { value: string; nodes: SceneNode[]; variable?: Variable }>();
    if (radius) { await findAllRadiusNodesGroupedByValue([topLevelFrame], allRadiiMap); totalWeight += allRadiiMap.size * SPEC_WEIGHTS.radius; }
    
    const allTextMap = new Map<string, { nodes: TextNode[], variable?: Variable, description: string }>();
    if (text) { await findAllTextNodesGroupedByStyle([topLevelFrame], allTextMap); totalWeight += allTextMap.size * SPEC_WEIGHTS.text; }

    let completedWeight = 0;
    const updateProgress = async (weight: number) => {
        completedWeight += weight;
        const progress = (totalWeight > 0) ? (completedWeight / totalWeight) * 100 : 0;
        figma.ui.postMessage({ type: 'loading-progress', progress });
        await new Promise(resolve => setTimeout(resolve, 5));
    };

    if (layout && framesToSpec.length > 0) {
      for (const focusFrame of framesToSpec) {
        layoutSheets.push(await generateSingleLayoutSpec(focusFrame, topLevelFrame));
        await updateProgress(SPEC_WEIGHTS.layout);
      }
    }
    if (colors && allColorsMap.size > 0) {
        for (const [key, data] of allColorsMap.entries()) {
            colorSheets.push(await generateSingleColorSpec(data, key, topLevelFrame));
            await updateProgress(SPEC_WEIGHTS.colors);
        }
    }
    if (radius && allRadiiMap.size > 0) {
        for (const [key, data] of allRadiiMap.entries()) {
            radiusSheets.push(await generateSingleRadiusSpec(data, key, topLevelFrame));
            await updateProgress(SPEC_WEIGHTS.radius);
        }
    }
    if (text && allTextMap.size > 0) {
        const textPromises = Array.from(allTextMap.entries()).map(([key, data]) => {
            return generateSingleTextSpec(data, key, topLevelFrame).then(sheet => {
                updateProgress(SPEC_WEIGHTS.text);
                return sheet;
            });
        });
        const resolvedTextSheets = await Promise.all(textPromises);
        // This line now works correctly.
        textSheets.push(...resolvedTextSheets.filter(sheet => sheet !== null) as FrameNode[]);
    }
    
    const layoutGroup = createHorizontalContainer(layoutSheets);
    const colorGroup = createHorizontalContainer(colorSheets);
    const radiusGroup = createHorizontalContainer(radiusSheets);
    const textGroup = createHorizontalContainer(textSheets); // And this one too.

    if (layoutGroup || colorGroup || radiusGroup || textGroup) {
      const masterContainer = figma.createFrame();
      masterContainer.name = "Design Specs";
      masterContainer.layoutMode = 'VERTICAL'; masterContainer.itemSpacing = 80;
      masterContainer.paddingTop = 50; masterContainer.paddingBottom = 50;
      masterContainer.paddingLeft = 50; masterContainer.paddingRight = 50;
      masterContainer.primaryAxisSizingMode = 'AUTO';
      masterContainer.counterAxisSizingMode = 'AUTO';
      masterContainer.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
      
      const createSection = (title: string, group: FrameNode | null) => {
          if (!group) return;
          const section = figma.createFrame(); section.name = `${title} Section`;
          section.layoutMode = 'VERTICAL'; section.itemSpacing = 32;
          section.primaryAxisSizingMode = 'AUTO'; section.counterAxisSizingMode = 'AUTO';
          section.fills = [];
          section.appendChild(createSectionTitle(title));
          section.appendChild(group);
          masterContainer.appendChild(section);
      }
      
      createSection("Spacing", layoutGroup);
      createSection("Colors", colorGroup);
      createSection("Radii", radiusGroup);
      createSection("Text", textGroup);
      
      masterContainer.x = topLevelFrame.x;
      masterContainer.y = topLevelFrame.y + topLevelFrame.height + 100;
    } else {
        figma.ui.postMessage({ type: 'error', message: 'No spec-able items found for the selected options.' });
    }
    figma.ui.postMessage({ type: 'generation-complete' });
  }
};