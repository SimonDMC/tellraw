const selection = window.getSelection();

// CTRL + B - bold
// CTRL + I - italic
// CTRL + U - underlined
// CTRL + S - strikethrough
export function addKeybinds() {
    const editor = document.getElementById("editor") as HTMLElement;
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
            style("underlined");
            ev.preventDefault();
        } else if (ev.key === "s") {
            style("strikethrough");
            ev.preventDefault();
        }
    });
}

// apply a class to selected text
export function style(className: string) {
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
