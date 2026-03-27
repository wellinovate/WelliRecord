import bodyParse from "body-parser";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import morgan from "morgan";
import connectDB from "./config/db.js";
import authRouter from "./modules/auth/auth_routes.js";
// import welliidRoutes from "./routes/welliidRoutes.js";
import userRoutes from "./modules/users/users_routes.js";
import vitalRoutes from "./modules/vitals/vital_routes.js";
import encounterRoutes from "./modules/encounter/encounter_routes.js";
import medicationRoutes from "./modules/medications/medication_routes.js";
import organization from "./modules/organizations/organizations_routes.js";
import allergyRoutes from "./modules/allergies/allergies_routes.js";
import diagnosisRoutes from "./modules/diagnoses/diagnosis_routes.js";
import labResultRoutes from "./modules/lab/lab_result_routes.js";
import procedureRoutes from "./modules/procedure/procedure_routes.js";
import immunizationRoutes from "./modules/immunizations/immunization_routes.js";
// import uploadRoute from "./routes/upload.js";

dotenv.config();

const app = express();
// app.use(bodyParser.json());

connectDB();

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://wellirecord.com",
    "https://wellirecords.vercel.app",
    "http://localhost:3000",
  ],
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
};

// app use
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));
app.use(cors(corsOptions));
app.use(bodyParse.json({ limit: "10mb" }));
app.use(cookieParser());


// Routes
// app.use("/app", welliidRoutes);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/medications", medicationRoutes);
app.use("/api/v1/organization", organization);
app.use("/api/v1/allergies", allergyRoutes);
app.use("/api/v1/diagnoses", diagnosisRoutes);
app.use("/api/v1/lab-results", labResultRoutes);
app.use("/api/v1/procedures", procedureRoutes);
app.use("/api/v1/immunizations", immunizationRoutes);
app.use("/api/v1/vitals", vitalRoutes);
app.use("/api/v1/encounter", encounterRoutes);
app.use("/api/v1/user", userRoutes);

// Health check
app.get("/", (req, res) => res.send("WelliID Issuer Service is running..."));

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ WelliID Issuer Service listening on port ${PORT}`);
});
