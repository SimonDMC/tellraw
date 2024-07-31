import { syncEditors, styleOverride, refreshToolbar, isSelectionBackwards, selectBetweenSpans } from "./editor";
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

        for (const button of STYLE_BUTTONS) {
            if (ev.key === button.key) {
                pressStyleButton(button.name);
                ev.preventDefault();
            }
        }
    });
}

export function pressStyleButton(styleName: string) {
    // if something is selected, style it
    if (!selection) return;

    if (selection.toString().length > 0) {
        style(styleName);
    } else {
        // otherwise temporarily override the style
        if (styleOverride[styleName] === undefined) {
            styleOverride[styleName] = !shouldBeStyled(styleName);
        } else {
            styleOverride[styleName] = !styleOverride[styleName];
        }
    }
}

// apply a class to selected text
function style(className: string) {
    const range = selection!.getRangeAt(0);
    const isBackwards = isSelectionBackwards();
    const fragment = range.cloneContents();

    const children = [...fragment.children];
    // if the selection only has one character, it's not a part of fragment.children so it needs to be added manually
    if (children.length === 0) {
        const anchorNode = selection!.anchorNode! as HTMLElement;
        if (anchorNode.classList) {
            children.push(anchorNode);
        } else {
            children.push(anchorNode.parentElement!);
        }
    }

    // if every child already has the class, remove it
    if (selectionHasClass(className)) {
        for (let i = 0; i < children.length; i++) {
            const span = children[i] as HTMLElement;
            span.classList.remove(className);
            // if disabling magic, revert to the original character
            if (className === "magic") {
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
        for (let i = 0; i < children.length; i++) {
            const span = children[i] as HTMLElement;
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
    selectBetweenSpans(children[0] as HTMLElement, children[children.length - 1] as HTMLElement, isBackwards);

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

function selectionHasClass(className: string) {
    if (selection!.rangeCount === 0) return false;
    const range = selection!.getRangeAt(0);
    const fragment = range.cloneContents();

    const children = [...fragment.children];
    // if the selection only has one character, it's not a part of fragment.children so it needs to be added manually
    // if the selection only has one character, it's not a part of fragment.children so it needs to be added manually
    if (children.length === 0) {
        const anchorNode = selection!.anchorNode! as HTMLElement;
        if (anchorNode.classList) {
            children.push(anchorNode);
        } else {
            children.push(anchorNode.parentElement!);
        }
    }

    // if the selection is empty, check the span right before the cursor
    if (selection!.toString().length === 0) {
        const span = getSpanBeforeCursor();

        if (!span) return false;
        return span.classList.contains(className);
    }
    for (let i = 0; i < children.length; i++) {
        const span = children[i] as HTMLElement;
        if (!span.classList.contains(className)) return false;
    }
    return true;
}

/* this doesn't actually return any useful data, it's a mishmash, but instead
   uniquely identifies a selection range */
export function getCursorData() {
    if (selection!.rangeCount === 0) return null;

    const range = selection!.getRangeAt(0);
    let data: any = range.startOffset;

    const length = selection!.toString().length;
    if (length > 0) {
        data += `${length}`;
    }

    return data;
}

function getSpanBeforeCursor() {
    const offset = getCursorData();
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

            // set in shadow and overlay
            const index = [...span.parentElement!.children].indexOf(span);

            const shadowChildren = [...document.getElementById("editor-shadow")!.children].filter((child) =>
                child.classList.contains("char")
            );
            const shadowSpan = shadowChildren[index] as HTMLElement;
            shadowSpan.innerText = randomChar;

            const overlayChildren = [...document.getElementById("editor-overlay")!.children].filter((child) =>
                child.classList.contains("char")
            );
            const overlaySpan = overlayChildren[index] as HTMLElement;
            overlaySpan.innerText = randomChar;
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
