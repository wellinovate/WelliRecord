import mongoose from "mongoose";

import dotenv from "dotenv";

dotenv.config();


const connectDB = async () => {
  try {
    // await mongoose.connect("mongodb+srv://enochpromiseva:Enoch2558@usdtp2p.ilws8ja.mongodb.net/?retryWrites=true&w=majority&appName=UsdtP2P");
    await mongoose. connect(process.env.DATABASE);
    console.log("DB connected...");
  } catch (error) { 
    console.log(error);
  } 
};

export default connectDB;
 