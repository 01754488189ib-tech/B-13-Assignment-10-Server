const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_DB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

client
  .connect()
  .then(() => {
    console.log("Successfully connected to MongoDB Cluster");
  })
  .catch((err) => console.error("Database connection error:", err));

app.get("/", (req, res) => {
  res.send("Fable Platform Express Server Online");
});

app.listen(port, () => {
  console.log(`Fable Server listening on port ${port}`);
});

module.exports = app;
