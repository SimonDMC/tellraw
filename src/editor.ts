// TODO:
// override undo and redo to work with the custom system
//  - snapshots every word and style change (not temp override!)
// fix underlined spaces and strikethrough styling

import { calculateShadowColor, commaFormat } from "./util";
import { STYLE_BUTTONS, getCursorData, pressStyleButton, shouldBeStyled, styleMagic } from "./styling";

let color = "#FFFFFF";
let lastCursorPos: number | null = null;
const selection = window.getSelection();

export const styleOverride: { [key: string]: boolean | undefined } = {
    bold: undefined,
    italic: undefined,
    underline: undefined,
    strikethrough: undefined,
    magic: undefined,
};
const lastStyleOverride: { [key: string]: boolean | undefined } = {};

export let DEBUG = new URLSearchParams(window.location.search).has("debug");
if (DEBUG) console.log("[DEBUG] Debug mode enabled");

export function addEditorHooks() {
    const editor = document.getElementById("editor") as HTMLElement;

    // wrap each inputted character in an individual span element
    // looks quite ugly in the DOM, but it's the easiest way to granularly style individual characters
    editor.addEventListener("keypress", function (event) {
        event.preventDefault();

        let char = String.fromCharCode(event.charCode);
        // fix enter
        if (event.key === "Enter") char = "<br>";

        const span = createCharSpan(char);

        // apply current formatting styles
        Object.keys(styleOverride).forEach((style) => {
            if (shouldBeStyled(style)) span.classList.add(style);
        });
        if (shouldBeStyled("magic")) {
            styleMagic(span);
        }

        // find cursor position
        if (!selection) return;
        if (!(selection.rangeCount > 0)) return;
        const range = selection.getRangeAt(0);

        // insert at cursor
        range.deleteContents();
        range.insertNode(span);

        // move cursor after the span
        range.setStartAfter(span);
        range.setEndAfter(span);
        selection.removeAllRanges();
        selection.addRange(range);

        syncEditors();
    });

    // wrap emojis in separate spans too (they don't trigger keypress events)
    let cooldown = false;
    editor.addEventListener("input", function (event) {
        // ignore this if the input isn't an emoji
        const data = (event as InputEvent).data;
        if (!data) {
            // still useful for copying over the contents
            syncEditors();
            return;
        }
        if (!/\p{Emoji}/u.test(data)) return;

        // mark added character with an id so we can find it and put the cursor after it
        editor.innerHTML = editor.innerHTML.replace(/(?<!">)(\p{Emoji})/gu, "<span class='char emoji' id='emoji-loc'>$1</span>");
        const emoji = document.getElementById("emoji-loc");
        if (!emoji) return;

        // move cursor after the emoji
        const range = document.createRange();
        range.setStartAfter(emoji);
        range.setEndAfter(emoji);
        if (!selection) return;
        selection.removeAllRanges();
        selection.addRange(range);

        // for some reason chrome does a double input event for emojis
        // so we need to axe the second one
        if (cooldown) {
            emoji.remove();
            setTimeout(() => {
                cooldown = false;
                syncEditors();
            }, 1);
            return;
        }

        // remove the id since we don't need it anymore
        emoji.removeAttribute("id");

        cooldown = true;
    });

    // handle pasting
    // -> if valid HTML coming from this editor, extract what we need and paste as HTML with the styles
    // -> if plaintext or invalid HTML, paste as plaintext and also split up into separate spans
    editor.addEventListener("paste", function (event) {
        event.preventDefault();

        const pasteLength = event.clipboardData?.getData("text/plain").length || 0;
        if (pasteLength > 5000) {
            let prompt = confirm(
                `You are pasting over 5,000 characters (${commaFormat(
                    pasteLength
                )}). This will probably cause the editor to freeze for a while. Are you SURE?`
            );
            if (!prompt) {
                return;
            }
        }

        let toPaste = event.clipboardData?.getData("text/html");

        // insert at cursor
        if (!selection) return;
        if (!(selection.rangeCount > 0)) return;
        const range = selection.getRangeAt(0);
        range.deleteContents();

        // try pasting as HTML first
        if (toPaste) {
            const node = new DOMParser().parseFromString(toPaste, "text/html").body;
            // insert the inside of the body, not the body itself
            const fragment = document.createDocumentFragment();
            let validPaste = true;
            let child;
            while (node.children[0]) {
                // validate the pasted content
                if (node.children[0].nodeName === "BR") {
                    node.removeChild(node.children[0]);
                    continue;
                }
                child = node.children[0];
                if (child.nodeName !== "SPAN" || !child.classList.contains("char")) {
                    validPaste = false;
                    break;
                }
                if (!(child.textContent?.length === 1 || child.firstChild?.nodeName === "BR")) {
                    validPaste = false;
                    break;
                }

                // cut br if 1/2 children (gets copied when copying from the beginning of the input)
                if (child.childNodes.length === 2) {
                    child.removeChild(child.childNodes[0]);
                }

                // reset all styles
                child.removeAttribute("style");
                fragment.appendChild(child);
            }
            if (validPaste && child) {
                range.insertNode(fragment);

                // move cursor after the pasted content
                range.setStartAfter(child);
                range.setEndAfter(child);
                selection.removeAllRanges();
                selection.addRange(range);

                if (DEBUG) console.log("[DEBUG] Pasted as HTML");

                syncEditors();
                return;
            }
        }
        // if pasting as HTML failed (either because plaintext is copied or because the HTML is invalid), paste as plain text
        toPaste = event.clipboardData?.getData("text/plain");
        if (!toPaste) return;

        // split up the text into individual characters
        const fragment = document.createDocumentFragment();
        // i'm using [...toPaste] to preserve multi-byte characters like emojis
        let span;
        for (let i = 0; i < [...toPaste].length; i++) {
            let content = [...toPaste][i];
            // repair newlines
            if (content === "\n") content = "<br>";
            span = createCharSpan(content);
            fragment.appendChild(span);
        }
        range.insertNode(fragment);

        // move cursor after the pasted content
        if (span) {
            range.setStartAfter(span);
            range.setEndAfter(span);
            selection.removeAllRanges();
            selection.addRange(range);
        }

        if (DEBUG) console.log("[DEBUG] Pasted as plaintext");

        syncEditors();
    });

    // toolbar buttons
    const toolbar = document.querySelector(".toolbar") as HTMLElement;
    toolbar.addEventListener("click", function (event) {
        const target = event.target as HTMLElement;
        if (!target.id) return;
        pressStyleButton(target.id);
        // focus editor
        editor.focus();
    });

    const editorStack = document.querySelector(".editor-stack") as HTMLElement;
    editorStack.addEventListener("click", selectionChanged);
    editorStack.addEventListener("keydown", selectionChanged);
    editorStack.addEventListener("keypress", selectionChanged);
    editorStack.addEventListener("pointerup", selectionChanged);
    editorStack.addEventListener("pointerdown", selectionChanged);
}

function createCharSpan(content: string) {
    const span = document.createElement("span");
    span.classList.add("char");
    if (color !== "#FFFFFF") {
        span.style.setProperty("--color", color);
        span.style.setProperty("--shadow", calculateShadowColor(color));
    }

    span.innerHTML = content;

    // force spaces to be visible
    if (content === " " || content === "&nbsp;") {
        span.classList.add("space");
        span.innerHTML = "&nbsp;";
    }

    return span;
}

export function syncEditors() {
    const editor = document.getElementById("editor") as HTMLElement;
    const editorShadow = document.getElementById("editor-shadow") as HTMLElement;
    const editorOverlay = document.getElementById("editor-overlay") as HTMLElement;
    let forceBrokenHTML = "";
    let continued = false;
    let currentYPos = 0;
    let hasStrikethrough = false;
    // take the newline spacing from the main editor since absolute elements mess it up
    // so we have to "recreate" it
    Array.from(editor.children).forEach((node) => {
        let yPos = node.getBoundingClientRect().bottom;
        let broken = false;

        // check for strikethrough
        if (node.classList.contains("strikethrough")) {
            hasStrikethrough = true;
        }

        if (node.firstChild?.nodeName == "BR") {
            currentYPos = yPos;
            continued = false;
        }

        // check for a minimum difference of 6px
        if (yPos - 6 > currentYPos) {
            if (currentYPos !== 0) {
                forceBrokenHTML += "<br>";
                continued = true;
            }
            currentYPos = yPos;
            broken = true;
        }

        if (continued) node.classList.add("cont");

        // don't render spaces if they break the line
        if (
            broken &&
            (node.textContent === " " || node.textContent === " ") &&
            node.previousElementSibling &&
            !node.previousElementSibling.classList.contains("nl-space")
        ) {
            node.classList.add("nl-space");
        } else {
            forceBrokenHTML += node.outerHTML;
        }
    });

    // don't render strikethrough unless necessary
    if (hasStrikethrough) {
        if (DEBUG) console.log("[DEBUG] Showing strikethrough");

        document.body.classList.add("show-strikethrough");
        editorOverlay.innerHTML = forceBrokenHTML;
    } else {
        document.body.classList.remove("show-strikethrough");
    }
    editorShadow.innerHTML = forceBrokenHTML;
}

function selectionChanged() {
    requestAnimationFrame(() => {
        /* usually navigating around makes the cursor fall into one of the existing
       spans which is problematic since we need to be able to style individual 
       characters. i tried messing with contenteditable=false but that caused
       a plethora of other issues. so instead we just jump out of the span */

        const range = selection!.rangeCount > 0 ? selection!.getRangeAt(0) : null;
        const span = range?.startContainer.parentElement;
        if (span) {
            // if the selection is just a caret, set caret right outside the span
            if (span.classList.contains("char") && selection!.toString().length === 0) {
                if (DEBUG) console.log("[DEBUG] Jumping out of span");
                if (range.startOffset === 1) {
                    range.setStartAfter(span);
                    range.setEndAfter(span);
                } else {
                    range.setStartBefore(span);
                    range.setEndBefore(span);
                }
            } else {
                // there may be some remnants of empty spans, remove them
                const emptySpans = document.querySelectorAll("#editor .char:empty");
                emptySpans.forEach((span) => span.remove());
            }
        }

        // and then also refresh the toolbar
        refreshToolbar();
    });
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
