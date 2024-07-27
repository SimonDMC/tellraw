import { syncEditors, styleOverride, refreshToolbar } from "./editor";
import glyphWidthsRegular from "./glyph_widths_regular.json";
import glyphWidthsBold from "./glyph_widths_bold.json";

const selection = window.getSelection();

export const STYLE_BUTTONS = [
    { name: "bold", key: "b" },
    { name: "italic", key: "i" },
    { name: "underline", key: "u" },
    { name: "strikethrough", key: "s" },
    { name: "magic", key: "m" },
];

export function addKeybinds() {
    const editor = document.getElementById("editor") as HTMLElement;
    editor.addEventListener("keydown", (ev) => {
        if (!ev.ctrlKey) return;
        if (!selection) return;

        for (const button of STYLE_BUTTONS) {
            if (ev.key === button.key) {
                // if something is selected, style it
                if (selection.toString().length > 0) {
                    style(button.name);
                } else {
                    // otherwise temporarily override the style
                    if (styleOverride[button.name] === undefined) {
                        styleOverride[button.name] = !shouldBeStyled(button.name);
                    } else {
                        styleOverride[button.name] = !styleOverride[button.name];
                    }
                }
                ev.preventDefault();
            }
        }
    });
}

// apply a class to selected text
export function style(className: string) {
    const range = selection!.getRangeAt(0);
    const fragment = range.cloneContents();

    // if every child already has the class, remove it
    if (selectionHasClass(className)) {
        for (let i = 0; i < fragment.children.length; i++) {
            const span = fragment.children[i] as HTMLElement;
            span.classList.remove(className);
            // if disabling magic, revert to the original character
            if (className === "magic") {
                span.innerText = span.getAttribute("og-char")!;
                span.removeAttribute("og-char");
                span.removeAttribute("char-width");
            }
            // if disabling bold, recalculate the width
            if (className === "bold" && span.classList.contains("magic")) {
                const unicodePoint = span.innerText.codePointAt(0);
                const newWidth =
                    Object.keys(glyphWidthsRegular).find((key) => (glyphWidthsRegular as any)[key].includes(unicodePoint)) ?? "600";
                span.setAttribute("char-width", newWidth);
            }
        }
    } else {
        // otherwise add the class to all children
        for (let i = 0; i < fragment.children.length; i++) {
            const span = fragment.children[i] as HTMLElement;
            span.classList.add(className);
            // extra attributes for magic
            if (className === "magic") {
                styleMagic(span);
            }
            // adjust magic width for bold text
            if (className === "bold" && span.classList.contains("magic")) {
                const unicodePoint = span.innerText.codePointAt(0);
                const newWidth = Object.keys(glyphWidthsBold).find((key) => (glyphWidthsBold as any)[key].includes(unicodePoint)) ?? "600";
                span.setAttribute("char-width", newWidth);
            }
        }
    }

    range.deleteContents();
    range.insertNode(fragment);

    syncEditors();
    refreshToolbar();
}

export function styleMagic(span: HTMLSpanElement) {
    const originalChar = span.innerText;
    const unicodePoint = originalChar.codePointAt(0);
    const glyphWidths = span.classList.contains("bold") ? glyphWidthsBold : (glyphWidthsRegular as any);
    const width = Object.keys(glyphWidths).find((key) => glyphWidths[key].includes(unicodePoint)) ?? "600";

    if (!span.getAttribute("og-char")) span.setAttribute("og-char", span.innerText);
    span.setAttribute("char-width", width);
}

export function selectionHasClass(className: string) {
    if (selection!.rangeCount === 0) return false;
    const range = selection!.getRangeAt(0);
    const fragment = range.cloneContents();
    // if the selection is empty, check the span right before the cursor
    if (fragment.children.length === 0) {
        const span = getSpanBeforeCursor();

        if (!span) return false;
        return span.classList.contains(className);
    }
    for (let i = 0; i < fragment.children.length; i++) {
        const span = fragment.children[i] as HTMLElement;
        if (!span.classList.contains(className)) return false;
    }
    return true;
}

export function getCursorPosition() {
    if (selection!.rangeCount === 0) return null;

    const range = selection!.getRangeAt(0);
    const offset = range.startOffset;
    return offset;
}

function getSpanBeforeCursor() {
    const offset = getCursorPosition();
    if (!offset) return null;

    return document.getElementById("editor")!.querySelectorAll(".char")[offset - 1] as HTMLElement;
}

export function shouldBeStyled(className: string) {
    if (styleOverride[className] === undefined) return selectionHasClass(className);
    return styleOverride[className];
}

function initializeMagic() {
    requestAnimationFrame(magicFrame);
    async function magicFrame() {
        const spans = document.querySelectorAll("#editor .char.magic:not(.space)");
        for (let i = 0; i < spans.length; i++) {
            const span = spans[i] as HTMLElement;
            const width = span.getAttribute("char-width")!;
            const glyphWidths = span.classList.contains("bold") ? glyphWidthsBold : (glyphWidthsRegular as any);
            const randomChar = getRandomChar(width, glyphWidths);
            span.innerText = randomChar;

            // get child index and clone into shadow
            const index = Array.from(span.parentElement!.children).indexOf(span);
            const shadowSpan = document.getElementById("editor-shadow")!.children[index] as HTMLElement;
            shadowSpan.innerText = randomChar;
        }

        // magic toolbar button
        const hoverButton = document.querySelector(".toolbar #magic:hover");
        if (hoverButton) hoverButton.textContent = getRandomChar("600");
        const unhoverButton = document.querySelector(".toolbar #magic:not(:hover)");
        if (unhoverButton) unhoverButton.textContent = "M";

        requestAnimationFrame(magicFrame);
    }
}

function getRandomChar(width: string, glyphWidths: any = glyphWidthsRegular) {
    const validChars = glyphWidths[width];
    const randomIndex = Math.floor(Math.random() * validChars.length);
    const randomChar = String.fromCodePoint(validChars[randomIndex]);
    return randomChar;
}

initializeMagic();
