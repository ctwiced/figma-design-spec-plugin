# Design Spec Generator - Figma Plugin

A Figma plugin that automates the tedious process of creating detailed design specifications. Select any frame, component, or group, and this plugin will instantly generate comprehensive spec sheets for spacing, colors, radii, and typography.

![Design Spec Plugin UI](https://i.imgur.com/your-image-url.png) 
*Need to get a screenshot

---

## ✨ Features

-   **Automatic Spec Generation:** Creates spec sheets with a single click.
-   **Cloned & Focused Visuals:** Each spec sheet includes a faded clone of the original frame, highlighting only the relevant elements for clear communication.
-   **Numbered Annotations:** Automatically generates numbered dots and lines to connect specs to elements, with a corresponding legend.
-   **Intelligent Collision Avoidance:** Annotation lines are automatically offset to prevent overlap, ensuring legibility even with closely-packed elements.

### Supported Specifications

-   **Spacing:** Detects and annotates `padding` and `itemSpacing` (gap) in Auto Layout frames.
-   **Colors:** Finds all solid colors (both raw hex values and bound variables), groups them, and lists every element using that color.
-   **Radius:** Detects and annotates corner radius values, whether they are uniform or individual corners.
-   **Typography:** Groups all text layers by style or by variable and lists all instances.

---

## 🚀 How to Use

1.  **Select a Frame:** In Figma, select a single top-level frame, component, or group that you want to generate specs for.
2.  **Run the Plugin:** Open the "Design Spec Generator" from your Figma plugins menu.
3.  **Choose Options:** Use the toggles to select which types of specifications you want to generate (Spacing, Colors, Radius, Text).
4.  **Generate:** Click the "Generate Specs" button.
5.  **Done!** A new frame containing all the spec sheets will be created below your original selection on the Figma canvas.

---

## 🛠️ Built With

-   **Figma Plugin API:** Core technology for interacting with the Figma canvas.
-   **TypeScript:** For robust, type-safe code.
-   **HTML/CSS/JavaScript:** For the plugin's user interface.

---

## 📂 Project Structure

This repository contains the source code for the Figma plugin.

-   `code.ts`: The main plugin logic written in TypeScript. This file handles all interactions with the Figma API, node analysis, and spec generation.
-   `ui.html`: The HTML, CSS, and JavaScript that creates the plugin's user interface window.
-   `manifest.json`: The required manifest file that tells Figma about the plugin (name, API version, UI file, etc.).
-   `tsconfig.json`: The configuration file for the TypeScript compiler.
