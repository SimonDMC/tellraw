const selection = window.getSelection();

// TODO:
// *handle emoji input
// *emoji width fix
// *handle raw text paste (including invalid html)
// *fix pasting text starting at the beginning of the input adding a weird line break
// *fix pasting text ending at the end of the input not setting the cursor properly (probably something to do with the stripped br)
// clean this mess up when everything works
// style new characters based off the one just before
// override undo and redo to work with the custom system

export function addStylingHook() {
    const editor = document.getElementById("editor") as HTMLElement;

    // wrap each inputted character in an individual span element
    // looks quite ugly in the DOM, but it's the easiest way to granularly style individual characters
    editor.addEventListener("keypress", function (event) {
        event.preventDefault();

        let char = String.fromCharCode(event.charCode);
        // fix enter
        if (event.key === "Enter") char = "<br>";

        const span = document.createElement("span");
        // make sure when navigating around the cursor doesn't jump into one of the earlier spans
        // this causes lots of other issues but we can work around those
        span.contentEditable = "false";
        span.classList.add("char");
        span.innerHTML = char;

        // force spaces to be visible
        if (char === " ") span.classList.add("space");

        // find cursor position
        const selection = window.getSelection();
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
    });

    // wrap emojis in separate spans too (they don't trigger keypress events)
    let cooldown = false;
    editor.addEventListener("input", function (event) {
        // ignore this if the input isn't an emoji
        const data = (event as InputEvent).data;
        if (!data) return;
        if (!/\p{Emoji}/u.test(data)) return;

        // mark added character with an id so we can find it and put the cursor after it
        editor.innerHTML = editor.innerHTML.replace(
            /(?<!">)(\p{Emoji})/gu,
            "<span class='char emoji' contenteditable='false' id='emoji-loc'>$1</span>"
        );
        const emoji = document.getElementById("emoji-loc");
        if (!emoji) return;

        // move cursor after the emoji
        const range = document.createRange();
        range.setStartAfter(emoji);
        range.setEndAfter(emoji);
        const selection = window.getSelection();
        if (!selection) return;
        selection.removeAllRanges();
        selection.addRange(range);

        // for some reason chrome does a double input event for emojis
        // so we need to axe the second one
        if (cooldown) {
            emoji.remove();
            setTimeout(() => {
                cooldown = false;
            }, 1);
            return;
        }

        // remove the id since we don't need it anymore
        emoji.removeAttribute("id");

        cooldown = true;
    });

    // remove the outer div when pasting
    editor.addEventListener("paste", function (event) {
        event.preventDefault();
        let toPaste = event.clipboardData?.getData("text/html");

        // insert at cursor
        const selection = window.getSelection();
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
                console.log("Pasted as HTML");
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
            span = document.createElement("span");
            span.classList.add("char");
            // make sure when navigating around the cursor doesn't jump into one of the earlier spans
            // this causes lots of other issues but we can work around those
            span.contentEditable = "false";
            span.innerHTML = [...toPaste][i];
            fragment.appendChild(span);
        }
        range.insertNode(fragment);

        // move cursor after the pasted content
        if (span) {
            range.setStartAfter(span);
            range.setEndAfter(span);
            selection.removeAllRanges();
            selection.addRange(range);
            console.log("Pasted as plain text");
        }
    });

    // add styling keybinds
    // CTRL + B - Bold
    // CTRL + I - Italic
    // CTRL + U - Underline
    editor.addEventListener("keydown", (ev) => {
        if (!ev.ctrlKey) return;
        if (!selection) return;

        if (ev.key === "b") {
            style("bold");
            ev.preventDefault();
        } else if (ev.key === "i") {
            style("italic");
            ev.preventDefault();
        } else if (ev.key === "u") {
            style("underline");
            ev.preventDefault();
        }
    });
}

function style(className: string) {
    const range = selection!.getRangeAt(0);
    const fragment = range.cloneContents();

    // if every child already has the class, remove it
    let allHaveClass = true;
    for (let i = 0; i < fragment.children.length; i++) {
        const span = fragment.children[i] as HTMLElement;
        if (!span.classList.contains(className)) {
            allHaveClass = false;
            break;
        }
    }
    if (allHaveClass) {
        for (let i = 0; i < fragment.children.length; i++) {
            const span = fragment.children[i] as HTMLElement;
            span.classList.remove(className);
        }
    } else {
        // otherwise add the class to all children
        for (let i = 0; i < fragment.children.length; i++) {
            const span = fragment.children[i] as HTMLElement;
            span.classList.add(className);
        }
    }

    range.deleteContents();
    range.insertNode(fragment);
}
