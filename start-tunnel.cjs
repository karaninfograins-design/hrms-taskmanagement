// Dedicated ngrok tunnel runner for HRMS Backend (Port 5000)
const path = require("path");

// Resolve @ngrok/ngrok from global omniroute module
const ngrokModulePath = "C:\\Users\\LENOVO\\AppData\\Roaming\\npm\\node_modules\\omniroute\\node_modules\\@ngrok\\ngrok";
const ngrok = require(ngrokModulePath);

const PORT = 5000;
const DOMAIN = "float-festivity-spotter.ngrok-free.dev";
const AUTHTOKEN = "3L5ypWHoq5a1vmfHucDlP6On99m_7JhiTZG5DtzdKr3rcXU5G";

async function start() {
  try {
    console.log(`Starting ngrok tunnel for 127.0.0.1:${PORT} on domain ${DOMAIN}...`);
    const listener = await ngrok.forward({
      addr: PORT,
      domain: DOMAIN,
      authtoken: AUTHTOKEN,
    });

    console.log(`Tunnel established successfully!`);
    console.log(`Public URL: ${listener.url()} -> http://127.0.0.1:${PORT}`);

    process.on("SIGINT", async () => {
      console.log("Shutting down tunnel...");
      await listener.close();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("Shutting down tunnel...");
      await listener.close();
      process.exit(0);
    });

    // Keep process alive
    setInterval(() => { }, 1000 * 60 * 60);
  } catch (err) {
    console.error("Failed to establish ngrok tunnel:", err);
    process.exit(1);
  }
}

start();
