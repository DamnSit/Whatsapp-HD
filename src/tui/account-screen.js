export async function accountScreen(ui, client) {
  while (!ui.closed) {
    const state = client.getState();
    const choice = await ui.menu("Account Management", [`Connection: ${state.connection}`, `Session: ${state.session}`, `Account: ${state.account || "Not connected"}`, `Session directory: ${client.paths.authDir}`, "Exit keeps this linked device and its credentials."], ["Logout WhatsApp", "Back"]);
    if (choice !== 0) return;
    const confirm = await ui.menu("Logout WhatsApp", ["This will unlink this WhatsApp device, delete local authentication credentials and clear the Status Audience cache.", "You will need to pair WhatsApp again.", "A network failure preserves local data."], ["Cancel", "Confirm Logout"]);
    if (confirm !== 1) continue;
    try {
      await ui.busy("Logging out", () => client.logout());
      await ui.message("Logged out", ["This linked device was disconnected and local account data cleared."]);
      return;
    } catch (error) { await ui.message("Logout incomplete", [error.message, client.getState().warning]); }
  }
}
