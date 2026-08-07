const { io } = require("socket.io-client");

const TOKEN = process.argv[2];
const LABEL = process.argv[3] || "socket";

const socket = io("https://wellirecord.onrender.com", {
  auth: { token: TOKEN },
});

socket.on("connect", () => console.log(`[${LABEL}] connected`));
socket.on("connect_error", (err) => console.log(`[${LABEL}] connect error:`, err.message));
socket.on("lab_order_change", (data) => console.log(`[${LABEL}] lab_order_change:`, data));
socket.on("pharmacy_order_change", (data) => console.log(`[${LABEL}] pharmacy_order_change:`, data));
