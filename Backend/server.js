import dotenv from "dotenv";
import express from "express";
import connectDB from "./config/db.js";
import bodyParse from "body-parser";
import welliidRoutes from "./routes/welliidRoutes.js";
import userRouter from "./routes/userRouter.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import http from "http";
import morgan from "morgan";
// import uploadRoute from "./routes/upload.js";

dotenv.config();

const app = express();
// app.use(bodyParser.json());

connectDB();

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "https://wellirecords.vercel.app",
    "https://welli-record.vercel.app"
  ],
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  // Add this section 👇
  allowedHeaders: ["Content-Type", "Authorization", "x-requested-with"], 
};

// app use
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));
app.use(cors(corsOptions));
// app.use(bodyParse.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


// Routes
app.use("/app", welliidRoutes);
app.use("/api/v1/user", userRouter);

// Health check
app.get("/", (req, res) => res.send("WelliID Issuer Service is running..."));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ WelliID Issuer Service listening on port ${PORT}`);
});
