import { DEBUG, isSelectionBackwards, redo, undo } from "./editor";
import { colorize, getCursorData, shouldBeStyled, style } from "./styling";

export type SelectionRange = {
    commonAncestorContainer: Node;
    startOffset: number;
    endOffset: number;
    isBackwards: boolean;
};

export const styleOverride: { [key: string]: boolean | string | undefined } = {
    bold: undefined,
    italic: undefined,
    underline: undefined,
    strikethrough: undefined,
    magic: undefined,
    color: undefined,
};
export const lastStyleOverride: { [key: string]: boolean | string | undefined } = {};

let lastCursorPos: number | null = null;
const selection = window.getSelection();
const editor = document.getElementById("editor") as HTMLElement;
/* the range has to be saved in a custom format because 1. clicking the color
   button changes the range and 2. just saving it as a Range object doesn't work
   since it gets overwritten by the actual current range (which is messed up) */
let lastRange: SelectionRange | null = null;

export const STYLE_BUTTONS = [
    { name: "bold", key: "b" },
    { name: "italic", key: "i" },
    { name: "underline", key: "u" },
    { name: "strikethrough", key: "s" },
    { name: "magic", key: "m" },
];

export function addToolbarHooks() {
    // toolbar buttons
    const toolbar = document.querySelector(".toolbar") as HTMLElement;
    toolbar.addEventListener("click", function (event) {
        const target = event.target as HTMLElement;
        if (!target.id) return;
        pressStyleButton(target.id);
        // focus editor
        editor.focus();
    });

    // unfocus popover on click outside
    document.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (target.id && (target.id === "color-popover" || target.id === "color")) return;
        document.getElementById("color-popover")!.classList.remove("open");
    });

    // set color on click
    document.querySelectorAll(".color-option").forEach((option) => {
        option.addEventListener("click", (event) => {
            const target = event.target as HTMLElement;
            colorize(target.style.getPropertyValue("--color"), lastRange);
            document.getElementById("color-popover")!.classList.remove("open");
        });
    });
}

export function addKeybinds() {
    editor.addEventListener("keydown", (ev) => {
        if (!ev.ctrlKey) return;

        for (const button of STYLE_BUTTONS) {
            if (ev.key === button.key) {
                pressStyleButton(button.name);
                ev.preventDefault();
            }
        }

        if (ev.key === "z") {
            ev.preventDefault();
            undo();
        }

        if (ev.key === "y") {
            ev.preventDefault();
            redo();
        }
    });
}

export function pressStyleButton(styleName: string) {
    if (styleName === "color") {
        const popover = document.getElementById("color-popover")!;
        const colorButton = document.getElementById("color")!;
        popover.classList.toggle("open");
        popover.style.left = colorButton.getBoundingClientRect().left + "px";
        popover.style.top = colorButton.getBoundingClientRect().bottom + "px";
        const range = selection!.getRangeAt(0);
        lastRange = {
            commonAncestorContainer: range.commonAncestorContainer,
            startOffset: range.startOffset,
            endOffset: range.endOffset,
            isBackwards: isSelectionBackwards(),
        };

        return;
    }

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

export function refreshToolbar() {
    STYLE_BUTTONS.forEach((button) => {
        const buttonEl = document.querySelector(`.toolbar #${button.name}`) as HTMLElement;
        let currentCursorPos = getCursorData();
        // don't update if nothing changed
        if (
            currentCursorPos === lastCursorPos &&
            lastStyleOverride[button.name] === styleOverride[button.name] &&
            selection!.toString().length === 0
        )
            return;

        if (shouldBeStyled(button.name)) {
            buttonEl.classList.add("active");
        } else {
            buttonEl.classList.remove("active");
        }
        if (lastStyleOverride[button.name] !== undefined) {
            styleOverride[button.name] = undefined;
        }
        lastStyleOverride[button.name] = styleOverride[button.name];
    });
    if (DEBUG) console.log("[DEBUG] Refreshed toolbar, cursor at", getCursorData(), "style overrides", styleOverride);
    lastCursorPos = getCursorData();
}
