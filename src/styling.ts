const selection = window.getSelection();

// TODO:
// handle emoji input
// handle raw text paste (including invalid html)
// fix pasting text starting at the beginning of the input adding a weird line break
// fix pasting text ending at the end of the input not setting the cursor properly (probably something to do with the stripped br)
// clean this mess up when everything works

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
        if (toPaste) {
            const node = new DOMParser().parseFromString(toPaste, "text/html").body;
            // insert the inside of the body, not the body itself
            const fragment = document.createDocumentFragment();
            let validPaste = true;
            let child;
            while (node.children[0]) {
                child = node.children[0];
                console.log(child);

                // validate the pasted content
                if (child.nodeName === "BR") {
                    node.removeChild(child);
                    continue;
                }
                if (child.nodeName !== "SPAN" || !child.classList.contains("char")) {
                    validPaste = false;
                    break;
                }
                if (!(child.textContent?.length === 1 || child.firstChild?.nodeName === "BR")) {
                    validPaste = false;
                    break;
                }

                // reset all styles
                child.removeAttribute("style");
                fragment.appendChild(child);
            }
            if (validPaste && child) {
                range.insertNode(fragment);

                // move cursor after the span
                range.setStartAfter(child);
                range.setEndAfter(child);
                selection.removeAllRanges();
                selection.addRange(range);
            } else {
                console.log("fucky wucky :(");
            }
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
