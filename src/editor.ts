// TODO:
// color color button based on selection
// temp color override
// fix ctrl a adding soh
//
// back-burner:
// offset on continued lines
// strikethrough shadow
// non-breaking spaces before line break shouldn't have strikethrough
// granular syncing instead of whole copy every input (would require a HUGE overhaul)
// maybe figure out a better solution for the invisible magic thing but i actually don't
//   mind that it reveals the text on selection
// firefox compat - arrow keys over spaces forces double input
//  - this seems really tough to fix because its not a pseudoelement issue and would
//    require re-implementing arrow keys which doesn't sound that bad on its own but
//    considering ctrl, selection enlarging and shrinking (forwards and backwards!)
//    it just doesn't sound worth it
// fix pasting a large amount of text messing up shadow

import { calculateShadowColor, commaFormat } from "./util";
import { getColor, shouldBeStyled, styleMagic } from "./styling";
import { refreshToolbar, styleOverride } from "./toolbar";

let color = "#FFFFFF";
const selection = window.getSelection();

type HistoryEntry = {
    editor: string;
    selectionStart: number;
    selectionEnd: number;
};

let undoStack: HistoryEntry[] = [];
let redoStack: HistoryEntry[] = [];

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

        // take a snapshot for undo/redo
        if (event.key === " " || event.key === "Enter") {
            saveSnapshot();
        }

        const span = createCharSpan(char);

        // apply current formatting styles
        Object.keys(styleOverride).forEach((style) => {
            if (shouldBeStyled(style)) span.classList.add(style);
        });
        if (shouldBeStyled("magic")) {
            styleMagic(span);
        }
        const color = getColor();
        if (color !== undefined && color !== "#FFFFFF" && color !== "") {
            span.style.setProperty("--color", color);
            span.style.setProperty("--shadow", calculateShadowColor(color));
        }

        // find cursor position
        if (!selection) return;
        if (!(selection.rangeCount > 0)) return;
        const range = selection.getRangeAt(0);

        /* sometimes chars can be inserted into another span which is problematic,
           notably when navigating before a line break in firefox or even in other
           browsers when navigating around and typing characters rapidly */
        const ancestor = range.commonAncestorContainer as HTMLElement;
        if (ancestor.classList.contains("char")) {
            range.setStartBefore(ancestor);
            range.setEndBefore(ancestor);
        }

        // insert at cursor
        range.deleteContents();
        range.insertNode(span);

        // move cursor after the span
        range.setStartAfter(span);
        range.setEndAfter(span);
        selection.removeAllRanges();
        selection.addRange(range);

        // scroll to it if necessary
        const editorBoundingRect = document.getElementById("editor-wrap")!.getBoundingClientRect();
        const spanBoundingRect = span.getBoundingClientRect();
        if (spanBoundingRect.top < editorBoundingRect.top || spanBoundingRect.bottom > editorBoundingRect.bottom) {
            span.scrollIntoView();
        }

        syncEditors();
    });

    // disallow emojis
    editor.addEventListener("input", function (event) {
        // ignore this if the input isn't an emoji
        const data = (event as InputEvent).data;

        if (!data) {
            // still useful for copying over the contents
            requestAnimationFrame(() => syncEditors());
            return;
        }
        if (!/\p{Emoji}/u.test(data)) return;

        const range = selection!.getRangeAt(0);

        // chrome - emojis end up in a span
        document.querySelectorAll(".editor .char").forEach((span) => {
            if ([...span.textContent!].length > 1) {
                span.textContent = [...span.textContent!][0];
                range.setStartAfter(span);
                range.setEndAfter(span);
                alert("Emojis are not supported. If you really need to add one, copy it elsewhere and paste it in.");
            }
        });

        // firefox - emojis end up outside of spans
        document.getElementById("editor")?.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                node.remove();
                alert("Emojis are not supported. If you really need to add one, copy it elsewhere and paste it in.");
            }
        });
    });

    editor.addEventListener("keydown", function (event) {
        // save snapshot before deleting
        if (event.key === "Backspace") {
            saveSnapshot();
        }
    });

    // handle pasting
    // -> if valid HTML coming from this editor, extract what we need and paste as HTML with the styles
    // -> if plaintext or invalid HTML, paste as plaintext and also split up into separate spans
    editor.addEventListener("paste", function (event) {
        event.preventDefault();

        saveSnapshot();

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
                child = node.children[0] as HTMLElement;
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

                // reset all irrelevant styles
                const style = child.getAttribute("style");
                console.log(style);

                let color, shadow;
                /* i don't think there's a better way of doing this, you can't
                   use getComputedStyle because the style isn't computed yet,
                   it's just from the import */
                if (style) {
                    color = style.match(/--color:\s*([^;]+)/)?.[1];
                    shadow = style.match(/--shadow:\s*([^;]+)/)?.[1];
                }

                child.removeAttribute("style");

                if (color) child.style.setProperty("--color", color);
                if (shadow) child.style.setProperty("--shadow", shadow);

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
            if (/\p{Emoji}/u.test(content)) {
                span.classList.add("emoji");
            }

            fragment.appendChild(span);
        }
        range.insertNode(fragment);

        // move cursor after the pasted content
        if (span) {
            range.setStartAfter(span);
            range.setEndAfter(span);
            selection.removeAllRanges();
            selection.addRange(range);

            // scroll to it
            span.scrollIntoView();
        }

        // remove empty spans
        const emptySpans = document.querySelectorAll(".editor .char:empty");
        emptySpans.forEach((span) => span.remove());

        if (DEBUG) console.log("[DEBUG] Pasted as plaintext");

        syncEditors();
    });

    const editorStack = document.querySelector(".editor-stack") as HTMLElement;
    editorStack.addEventListener("keydown", selectionChanged);
    editorStack.addEventListener("keypress", selectionChanged);
    editorStack.addEventListener("pointerdown", mouseDownSelectionChanged);
    editorStack.addEventListener("pointerup", mouseUpSelectionChanged);

    preventSpaceNewlines();
}

function preventSpaceNewlines() {
    // remove all "space" newline chars because firefox just be doing whatever
    requestAnimationFrame(() => {
        const wrongSpaces = document.querySelectorAll(".editor .space br");
        wrongSpaces.forEach((span) => span.parentElement!.remove());
        preventSpaceNewlines();
    });
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
    let currentYPos = 0;
    let showOverlay = false;
    // take the newline spacing from the main editor since absolute elements mess it up
    // so we have to "recreate" it
    Array.from(editor.children).forEach((node) => {
        let yPos = node.getBoundingClientRect().bottom;
        let broken = false;

        // check for overlay-dependant styles
        if (node.classList.contains("strikethrough") || node.classList.contains("magic")) {
            showOverlay = true;
        }

        if (node.firstChild?.nodeName == "BR") {
            currentYPos = yPos;
        }

        // check for a minimum difference of 6px between lines
        // since this can only check for one line break, if there are multiple, also add a br for all but one
        const isNonbreakingSpace = node.classList.contains("space") && !node.previousElementSibling;
        if (
            (yPos - 16 > currentYPos && !isNonbreakingSpace) ||
            (node.firstChild?.nodeName == "BR" && node.nextElementSibling?.firstChild?.nodeName === "BR")
        ) {
            if (currentYPos !== 0) {
                forceBrokenHTML += "<br>";
            }
            currentYPos = yPos;
            broken = true;
        }

        // remove leftover newline spaces
        if (node.classList.contains("nl-space") && node.nextElementSibling && node.nextElementSibling.classList.contains("char")) {
            if (node.nextElementSibling.getBoundingClientRect().bottom - node.getBoundingClientRect().bottom < 6) {
                node.classList.remove("nl-space");
            }
        }

        // don't render spaces if they break the line
        if (
            broken &&
            (node.textContent === " " || node.textContent === " ") &&
            node.previousElementSibling &&
            !node.previousElementSibling.classList.contains("nl-space") &&
            node.previousElementSibling.children.length === 0
        ) {
            node.classList.add("nl-space");
        } else {
            forceBrokenHTML += node.outerHTML;
        }
    });

    // don't render overlay if not in use
    if (showOverlay) {
        if (DEBUG) console.log("[DEBUG] Showing overlay");
        document.body.classList.add("show-overlay");
        editorOverlay.innerHTML = forceBrokenHTML;
    } else {
        document.body.classList.remove("show-overlay");
    }

    editorShadow.innerHTML = forceBrokenHTML;
}

let mouseX: number | null = null;
let mouseY: number | null = null;
let selectionExists = false;
function mouseDownSelectionChanged(e: PointerEvent) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    selectionExists = selection!.toString().length > 0;
    selectionChanged();
}

function mouseUpSelectionChanged(e: PointerEvent) {
    /* this whole thing is necessary so that when you click during a selection
       it clears it and sets the cursor properly. selectionExists check is to
       re-enable double click to select word 
       
       triple click to select paragraph doesn't work but that would be
       non-trivial to implement and i'm not sure how i would go about it */
    if (
        ((e.target as HTMLElement).classList.contains("char") || (e.target as HTMLElement).id === "editor") &&
        mouseX == e.clientX &&
        mouseY == e.clientY &&
        mouseX != null &&
        mouseY != null &&
        selectionExists
    ) {
        // set caret at mouse position
        selection!.removeAllRanges();
        // this only works with chrome 128+ which is super recent rn
        const caretPos = document.caretPositionFromPoint(e.clientX, e.clientY);
        const range = document.createRange();
        range.setStart(caretPos.offsetNode, caretPos.offset);
        range.setEnd(caretPos.offsetNode, caretPos.offset);
        selection!.addRange(range);
    }
    selectionChanged();
}

function selectionChanged() {
    requestAnimationFrame(() => {
        /* usually navigating around makes the cursor fall into one of the existing
       spans which is problematic since we need to be able to style individual 
       characters. i tried messing with contenteditable=false but that caused
       a plethora of other issues. so instead we just jump out of the span */

        const range = selection!.rangeCount > 0 ? selection!.getRangeAt(0) : null;
        const container = range?.startContainer.parentElement;

        if (container && container.classList.contains("char")) {
            // if the selection is just a caret, set caret right outside the span
            if (selection!.toString().length === 0) {
                if (DEBUG) console.log("[DEBUG] Jumping out of span");
                if (range.startOffset > 0) {
                    range.setStartAfter(container);
                    range.setEndAfter(container);
                } else {
                    range.setStartBefore(container);
                    range.setEndBefore(container);
                }
            } else {
                // chrome
                fixMultiCharacterSelection(range);
            }
        } else if (container && container.id === "editor-wrap" && selection!.toString().length > 0) {
            // firefox
            fixMultiCharacterSelection(range);
        }

        // there may be some remnants of empty spans, remove them
        const emptySpans = document.querySelectorAll(".editor .char:empty");
        emptySpans.forEach((span) => span.remove());

        // and then also refresh the toolbar
        refreshToolbar();
    });
}

function fixMultiCharacterSelection(range: Range) {
    const children = [...range.commonAncestorContainer.childNodes].filter((node) => range.intersectsNode(node));
    if (children.length === 0) {
        const anchorNode = selection!.anchorNode! as HTMLElement;
        if (anchorNode.classList) {
            children.push(anchorNode);
        } else {
            children.push(anchorNode.parentElement!);
        }
    }
    selectBetweenSpans(children[0] as HTMLElement, children[children.length - 1] as HTMLElement, isSelectionBackwards());
}

export function selectBetweenSpans(start: HTMLElement, end: HTMLElement, backwards: boolean, range: Range = selection!.getRangeAt(0)) {
    // find start and end indices
    let commonAncestor = document.getElementById("editor")!;

    const childNodesArray = [...commonAncestor.childNodes];

    if (backwards) {
        const startIndex = childNodesArray.indexOf(end) + 1;
        const endIndex = childNodesArray.indexOf(start);

        range.setStart(commonAncestor, startIndex);
        range.setEnd(commonAncestor, startIndex);
        selection!.removeAllRanges();
        selection!.addRange(range);
        selection!.extend(commonAncestor, endIndex);
    } else {
        const startIndex = childNodesArray.indexOf(start);
        const endIndex = childNodesArray.indexOf(end) + 1;

        range.setStart(commonAncestor, startIndex);
        range.setEnd(commonAncestor, endIndex);
        selection!.removeAllRanges();
        selection!.addRange(range);
    }
}

// https://stackoverflow.com/a/12652116/19271522
export function isSelectionBackwards() {
    var backwards = false;
    if (window.getSelection) {
        var sel = window.getSelection();
        if (!sel!.isCollapsed) {
            var range = document.createRange();
            range.setStart(sel!.anchorNode!, sel!.anchorOffset);
            range.setEnd(sel!.focusNode!, sel!.focusOffset);
            backwards = range.collapsed;
        }
    }
    return backwards;
}

export function saveSnapshot() {
    const editor = document.getElementById("editor") as HTMLElement;
    if (selection!.rangeCount === 0) return;
    const range = selection!.getRangeAt(0);
    const selectionStart = range.startOffset;
    const selectionEnd = range.endOffset;
    const editorHTML = editor.innerHTML;
    undoStack.push({ editor: editorHTML, selectionStart, selectionEnd });
    redoStack = [];
    if (DEBUG) console.log("[DEBUG] Saved snapshot", undoStack.length, selectionStart, selectionEnd);
}

export function undo() {
    const editor = document.getElementById("editor") as HTMLElement;
    const range = selection!.getRangeAt(0);
    if (undoStack.length === 0) {
        // snapshots for empty editor might not be saved so revert to that
        if (editor.textContent !== "") {
            redoStack.push({ editor: editor.innerHTML, selectionStart: range.startOffset, selectionEnd: range.endOffset });
        }
        editor.innerHTML = "";
        syncEditors();
        if (DEBUG) console.log("[DEBUG] Clean undo");
        return;
    }
    const snapshot = undoStack.pop()!;
    redoStack.push({ editor: editor.innerHTML, selectionStart: range.startOffset, selectionEnd: range.endOffset });
    editor.innerHTML = snapshot.editor;
    syncEditors();
    if (editor.childNodes[snapshot.selectionStart - 1]) {
        range.setStartAfter(editor.childNodes[snapshot.selectionStart - 1]);
        range.setEndAfter(editor.childNodes[snapshot.selectionEnd - 1]);
    } else {
        range.setStart(editor, 0);
        range.setEnd(editor, 0);
    }
    selection!.removeAllRanges();
    selection!.addRange(range);
    if (DEBUG) console.log("[DEBUG] Undo", undoStack.length);
}

export function redo() {
    if (redoStack.length === 0) return;
    const editor = document.getElementById("editor") as HTMLElement;
    const range = selection!.getRangeAt(0);
    const snapshot = redoStack.pop()!;
    undoStack.push({ editor: editor.innerHTML, selectionStart: range.startOffset, selectionEnd: range.endOffset });
    editor.innerHTML = snapshot.editor;
    syncEditors();
    if (editor.childNodes[snapshot.selectionStart - 1]) {
        range.setStartAfter(editor.childNodes[snapshot.selectionStart - 1]);
        range.setEndAfter(editor.childNodes[snapshot.selectionEnd - 1]);
    } else {
        range.setStart(editor, 0);
        range.setEnd(editor, 0);
    }
    selection!.removeAllRanges();
    selection!.addRange(range);
    if (DEBUG) console.log("[DEBUG] Redo", redoStack.length);
}
