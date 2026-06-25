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
    const usersColl = client
      .db(process.env.AUTH_DB_NAME || "b_13_assignment_10")
      .collection("user");
    usersColl
      .updateMany(
        { email: { $in: ["01754488189ib@gmail.com", "admin@fable.com"] } },
        { $set: { role: "admin", userRole: "admin" } },
      )
      .then(() => console.log("Admin account checks completed"))
      .catch((err) => console.error("Admin check failed", err));
  })
  .catch((err) => console.error("Database connection error:", err));

const database = client.db(process.env.AUTH_DB_NAME || "b_13_assignment_10");
const ebooksCollection = database.collection("ebooks");
const usersCollection = database.collection("user");
const sessionCollection = database.collection("session");
const transactionsCollection = database.collection("transactions");
const bookmarksCollection = database.collection("bookmarks");

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const session = await sessionCollection.findOne({ token: token });
  if (!session) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const user =
    (await usersCollection.findOne({ _id: session.userId })) ||
    (await usersCollection.findOne({ id: session.userId }));

  if (!user) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  if (user.status === "banned") {
    return res.status(403).send({ message: "Your account has been banned." });
  }

  req.user = user;
  next();
};

const verifyWriter = async (req, res, next) => {
  if (req.user?.role !== "writer" && req.user?.role !== "admin") {
    return res
      .status(403)
      .send({ message: "Forbidden access. Writer privileges required." });
  }
  next();
};

const verifyAdmin = async (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).send({
      message: "Forbidden access. Administrator privileges required.",
    });
  }
  next();
};

app.get("/", (req, res) => {
  res.send("Fable Platform Express Server Online");
});

app.listen(port, () => {
  console.log(`Fable Server listening on port ${port}`);
});

module.exports = app;
