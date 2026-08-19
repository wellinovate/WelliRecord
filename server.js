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
import analytics from "./modules/analytics/reports_routes.js";
import support from "./modules/support/support_ticket_routes.js";
import referrals from "./modules/referrals/referral_routes.js";
import pharmacyClaims from "./modules/pharmacy-claims/pharmacy_claim_routes.js";
import adminSupport from "./modules/support/admin_support_routes.js";
import adminVerification from "./modules/admin/admin_verification_routes.js";
import adminUsers from "./modules/admin/admin_users_routes.js";
import allergyRoutes from "./modules/allergies/allergies_routes.js";
import diagnosisRoutes from "./modules/diagnoses/diagnosis_routes.js";
import labResultRoutes from "./modules/lab/lab_result_routes.js";
import procedureRoutes from "./modules/procedure/procedure_routes.js";
import immunizationRoutes from "./modules/immunizations/immunization_routes.js";
import appointmentRoutes from "./modules/appointments/appointment_routes.js";
import visitQueueRoutes from "./modules/visitQueue/visitQueue_routes.js";
import accessGrantRoutes from "./modules/access/access_grant_routes.js";
import bridgeRoutes from "./modules/access/bridge_routes.js";
import visionRecordRoutes from "./modules/vision/vision_record_routes.js";
import dependantRoutes from "./modules/dependants/dependants_routes.js";
import waitlistRoutes from "./modules/waitlist/waitlist_routes.js";
import apiKeyRoutes from "./modules/apikeys/apikey_routes.js";
import teamRoutes from "./modules/team/team_routes.js";
import notificationRoutes from "./modules/notifications/notification_routes.js";
import { seedDefaultTemplates } from "./modules/notifications/notification_services.js";
import { seedDefaultLabTestCatalog } from "./modules/lab-tests-catalog/lab_test_catalog_service.js";
import { startAppointmentReminderScheduler } from "./modules/appointments/appointment_notifications.js";
import http from "http";
import labOrderRoutes from "./modules/lab-orders/lab_order_routes.js";
import radiologyOrderRoutes from "./modules/radiology-orders/radiology_order_routes.js";
import billingRoutes from "./modules/billing/billing_routes.js";
import labTestCatalogRoutes from "./modules/lab-tests-catalog/lab_test_catalog_routes.js";
import labDeliveryRoutes from "./modules/lab-delivery/lab_delivery_routes.js";
import pharmacyOrderRoutes from "./modules/pharmacy-orders/pharmacy_order_routes.js";
import pharmacyInventoryRoutes from "./modules/pharmacy-inventory/pharmacy_inventory_routes.js";
import localCustomerRoutes from "./modules/local-customers/local_customer_routes.js";
import rosterRoutes from "./modules/rosters/roster_routes.js";
import { initSocket } from "./shared/realtime/socket.js";
// import { connectRedis } from "./shared/config/redis.js";
import {
  globalRateLimiter,
  requestIdMiddleware,
} from "./shared/middlewares/rate_limit.js";
// import uploadRoute from "./routes/upload.js";

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
initSocket(httpServer);
// app.use(bodyParser.json());

connectDB();
// connectRedis();

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://wellirecord.com",
    "https://staging.wellirecord.com",
    // "https://www.wellirecord.com",
    "https://www.wellirecord.com",
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

// app.set("trust proxy", 1);

app.use(requestIdMiddleware);



app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;

    const method = req.method.padEnd(7);
    const url = req.originalUrl || req.url;
    const status = res.statusCode;
    const ip = req.ip || req.socket.remoteAddress;

    // Color coding for quick visual feedback
    let statusStr = status;
    if (status >= 500) statusStr = `\x1b[31m${status}\x1b[0m`;        // Red
    else if (status >= 400) statusStr = `\x1b[33m${status}\x1b[0m`;   // Yellow
    else if (status >= 200) statusStr = `\x1b[32m${status}\x1b[0m`;   // Green

    let durationStr = durationMs.toFixed(2) + ' ms';
    if (durationMs > 1000) durationStr = `\x1b[31m${durationStr}\x1b[0m`;     // Red - Very Slow
    else if (durationMs > 300) durationStr = `\x1b[33m${durationStr}\x1b[0m`; // Yellow - Slow
    else durationStr = `\x1b[32m${durationStr}\x1b[0m`;                      // Green - Fast

    console.log(`${method} ${url} ${statusStr} ${durationStr} ${ip}`);
  });

  next();
});

app.use(globalRateLimiter);

// Routes
// app.use("/app", welliidRoutes);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/medications", medicationRoutes);
app.use("/api/v1/organization", organization);
app.use("/api/v1/analytics", analytics);
app.use("/api/v1/support", support);
app.use("/api/v1/referrals", referrals);
app.use("/api/v1/pharmacy-claims", pharmacyClaims);
app.use("/api/v1/admin/support", adminSupport);
app.use("/api/v1/admin", adminVerification);
app.use("/api/v1/admin", adminUsers);
app.use("/api/v1/allergies", allergyRoutes);
app.use("/api/v1/diagnoses", diagnosisRoutes);
app.use("/api/v1/lab-results", labResultRoutes);
app.use("/api/v1/lab-orders", labOrderRoutes);
app.use("/api/v1/radiology-orders", radiologyOrderRoutes);
app.use("/api/v1/billing", billingRoutes);
app.use("/api/v1/lab-tests-catalog", labTestCatalogRoutes);
app.use("/api/v1/lab-delivery", labDeliveryRoutes);
app.use("/api/v1/pharmacy-orders", pharmacyOrderRoutes);
app.use("/api/v1/pharmacy-inventory", pharmacyInventoryRoutes);
app.use("/api/v1/local-customers", localCustomerRoutes);
app.use("/api/v1/procedures", procedureRoutes);
app.use("/api/v1/immunizations", immunizationRoutes);
app.use("/api/v1/vitals", vitalRoutes);
app.use("/api/v1/encounter", encounterRoutes);
app.use("/api/v1/user", userRoutes);

app.use("/api/v1/appointments", appointmentRoutes);
app.use("/api/v1/queue", visitQueueRoutes);
app.use("/api/v1/access-grants", accessGrantRoutes);
app.use("/api/v1/bridge", bridgeRoutes);
app.use("/api/v1/records/vision", visionRecordRoutes);
app.use("/api/v1/dependants", dependantRoutes);
app.use("/api/v1/waitlist", waitlistRoutes);
app.use("/api/v1/api-keys", apiKeyRoutes);
app.use("/api/v1/team", teamRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/rosters", rosterRoutes);

// Health check
app.get("/", (req, res) => res.send("Wellirecord staging is running..."));

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "wellirecord-api",
    // environment: process.env.NODE_ENV,
    commit: process.env.RENDER_GIT_COMMIT || null,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("ERROR:", err);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    code: err.code || "INTERNAL_SERVER_ERROR",
  });
});

// Start server
// const PORT = process.env.PORT || 3001;
// app.listen(PORT, () => {
//   console.log(`✅ WelliID Issuer Service listening on port ${PORT}`);
// });
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ WelliID Issuer Service listening on port ${PORT}`);
  seedDefaultTemplates().catch((err) =>
    console.error("Could not seed default notification templates:", err),
  );
  seedDefaultLabTestCatalog().catch((err) =>
    console.error("Could not seed default lab test catalog:", err),
  );
  startAppointmentReminderScheduler();
});
