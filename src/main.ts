import { addKeybinds } from "./styling";
import { addEditorHooks } from "./editor";

// REMOVE THIS WHEN I DONT NEED IT
function allowFreeDrag(el: HTMLElement) {
    let pos1 = 0,
        pos2 = 0,
        pos3 = 0,
        pos4 = 0;
    el.onmousedown = (ev) => {
        // only mmb
        if (ev.button !== 1) return;
        ev = ev || window.event;
        ev.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = ev.clientX;
        pos4 = ev.clientY;
        document.onmouseup = () => {
            document.onmouseup = null;
            document.onmousemove = null;
        };
        // call a function whenever the cursor moves:
        document.onmousemove = (ev2) => {
            ev2 = ev2 || window.event;
            ev2.preventDefault();
            // calculate the new cursor position:
            pos1 = pos3 - ev2.clientX;
            pos2 = pos4 - ev2.clientY;
            pos3 = ev2.clientX;
            pos4 = ev2.clientY;
            // set the element's new position:
            el.style.top = el.offsetTop - pos2 + "px";
            el.style.left = el.offsetLeft - pos1 + "px";
            //console.log(`top: ${el.style.top}, left: ${el.style.left}`);
        };
    };
}
const el = document.getElementById("editor");
if (el) allowFreeDrag(el);

addEditorHooks();
addKeybinds();
