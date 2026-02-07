import mongoose from 'mongoose';
import dotenv from "dotenv";

dotenv.config();

const DB = process.env.DATABASE;

mongoose.connect(DB)
.then(() => {
    console.log('Connection to database established successfully');
})
.catch((error: any) => {
    console.log('Error connecting to database: ' + error.message);
});