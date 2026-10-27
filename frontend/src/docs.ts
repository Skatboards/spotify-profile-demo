import { marked } from "marked";
import "../docs/styles.css";

const content = document.getElementById("content");

if (!content) {
    throw new Error("The documentation content element is missing.");
}

try {
    const response = await fetch("./curl-commands.md");

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
    }

    const markdown = await response.text();

    // This file is committed application documentation rather than user input.
    content.innerHTML = await marked.parse(markdown);
} catch (error) {
    console.error("Unable to load the curl command reference.", error);
    const message = document.createElement("p");
    message.className = "error";
    message.setAttribute("role", "alert");
    message.textContent = "Unable to load the curl command reference.";
    content.replaceChildren(message);
}
