const selection = window.getSelection();

export function addStylingHook() {
    const editor = document.getElementById("editor") as HTMLElement;

    editor.addEventListener("keypress", function (event) {
        // Prevent the default action to manually handle insertion
        event.preventDefault();

        // Get the character pressed
        let char = String.fromCharCode(event.charCode);
        // fix special characters
        if (char === " ") char = "\u00A0";
        if (event.key === "Enter") char = "<br>";

        // Create a span element and set its text content to the character
        const span = document.createElement("span");
        span.classList.add("char");
        span.innerHTML = char;

        // Get the current selection
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);

            // Insert the span element at the cursor position
            range.deleteContents(); // Remove any selected content
            range.insertNode(span);

            // Move the cursor after the inserted span
            range.setStartAfter(span);
            range.setEndAfter(span);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    });

    // Add styling hooks
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
    console.log("Styling", className);

    const range = selection!.getRangeAt(0);
    const fragment = range.cloneContents();
    const fragmentTo = document.createDocumentFragment();
    console.log(fragment.children.length);
    if (!(fragment.children[0] === fragment.firstChild)) {
        const span = document.createElement("span");
        span.classList.add(className);
        span.appendChild(fragment.firstChild as Node);
        fragmentTo.appendChild(span);
    }

    while (fragment.children.length > 0) {
        const span = fragment.children[0] as HTMLElement;
        span.classList.toggle(className);
        fragmentTo.appendChild(span);
    }
    range.deleteContents();
    range.insertNode(fragmentTo);
}
