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
        span.contentEditable = "false";
        span.classList.add("char");
        span.innerHTML = char;

        // Get the current selection
        const selection = window.getSelection();
        if (!selection) return;
        if (!(selection.rangeCount > 0)) return;
        const range = selection.getRangeAt(0);

        // Insert the span element at the cursor position
        range.deleteContents(); // Remove any selected content
        range.insertNode(span);

        // Move the cursor after the inserted span
        range.setStartAfter(span);
        range.setEndAfter(span);
        selection.removeAllRanges();
        selection.addRange(range);
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
    const range = selection!.getRangeAt(0);
    const fragment = range.cloneContents();
    console.log(fragment.children.length);
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
