import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";
import welliidRoutes from "./routes/welliidRoutes.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Routes
app.use("/app", welliidRoutes);

// Health check
app.get("/", (req, res) => res.send("WelliID Issuer Service is running..."));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ WelliID Issuer Service listening on port ${PORT}`);
});
