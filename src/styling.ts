const selection = window.getSelection();

export function addStylingHook() {
    const editor = document.getElementById("editor") as HTMLElement;

    // Add styling hooks
    // CTRL + B - Bold
    // CTRL + I - Italic
    // CTRL + U - Underline
    editor.addEventListener("keydown", (ev) => {
        if (!ev.ctrlKey) return;
        if (!selection) return;
        ev.preventDefault();

        if (ev.key === "b") {
            style("bold");
        } else if (ev.key === "i") {
            style("italic");
        } else if (ev.key === "u") {
            style("underline");
        }
    });
}

function style(className: string) {
    const range = selection!.getRangeAt(0);
    const fragment = range.extractContents();
    while (fragment.lastChild) {
        const span = document.createElement("span");
        span.classList.add(className);
        span.appendChild(fragment.lastChild);
        range.insertNode(span);
    }
}
