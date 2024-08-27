function runScript() {
  var iframe = document.getElementById("ptifrmtgtframe");
  let elements = iframe.contentWindow.document.querySelectorAll('[id^="MTG_INSTR$"]');

  // Remove any existing message to avoid duplicates
  const existingMessage = document.getElementById('extension-message');
  if (existingMessage) {
      existingMessage.remove();
  }

  const message = document.createElement("p");
  // Set an ID to the message to prevent duplicates
  message.id = "extension-message";

  // Get the current timestamp
  const timestamp = new Date().toLocaleString();

  // Add the elements length and timestamp to the text content
  message.textContent = `${elements.length} elements found at ${timestamp}`;

  // Apply some basic styling so it's visible
  message.style.fontSize = "20px";
  message.style.color = "red";
  message.style.fontWeight = "bold";
  message.style.textAlign = "center";
  message.style.marginTop = "20px";

  // Insert the message at the beginning of the body
  document.body.insertAdjacentElement("afterbegin", message);
}

// Run the script every 5 seconds
setInterval(runScript, 5000);

// Optionally, run the script once immediately when the content script is loaded
runScript();
