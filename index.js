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

app.get("/api/top-writers", async (req, res) => {
  try {
    const topWritersAggr = await transactionsCollection
      .aggregate([
        { $match: { type: "purchase" } },
        {
          $group: {
            _id: "$writerEmail",
            salesCount: { $sum: 1 },
            revenue: { $sum: "$amount" },
          },
        },
        { $sort: { salesCount: -1 } },
        { $limit: 3 },
      ])
      .toArray();

    const emails = topWritersAggr.map((w) => w._id);
    const users = await usersCollection
      .find({ email: { $in: emails } })
      .toArray();

    const result = topWritersAggr.map((w, idx) => {
      const user = users.find((u) => u.email === w._id);
      const name = user ? user.name : w._id ? w._id.split("@")[0] : "Writer";
      const gradients = [
        "from-blue-600 to-indigo-600",
        "from-rose-500 to-orange-500",
        "from-amber-500 to-yellow-600",
      ];
      return {
        name,
        sales: w.salesCount,
        revenue: w.revenue,
        avatarInitial: name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2),
        gradient: gradients[idx % gradients.length],
      };
    });

    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Error loading top writers" });
  }
});

app.get("/api/ebooks", async (req, res) => {
  const query = {};

  if (req.query.search) {
    query.$or = [
      { title: { $regex: req.query.search, $options: "i" } },
      { writerName: { $regex: req.query.search, $options: "i" } },
    ];
  }

  if (req.query.genre && req.query.genre !== "All") {
    query.genre = req.query.genre;
  }

  if (req.query.status) {
    query.status = req.query.status;
  }

  if (req.query.minPrice || req.query.maxPrice) {
    query.price = {};
    if (req.query.minPrice) query.price.$gte = parseFloat(req.query.minPrice);
    if (req.query.maxPrice) query.price.$lte = parseFloat(req.query.maxPrice);
  }

  let sortOption = { createdAt: -1 };
  if (req.query.sort) {
    if (req.query.sort === "Price: Low to High") {
      sortOption = { price: 1 };
    } else if (req.query.sort === "Price: High to Low") {
      sortOption = { price: -1 };
    }
  }

  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(req.query.perPage) || 8;
  const skipItems = (page - 1) * perPage;

  try {
    const total = await ebooksCollection.countDocuments(query);
    const ebooks = await ebooksCollection
      .find(query)
      .sort(sortOption)
      .skip(skipItems)
      .limit(perPage)
      .toArray();

    res.send({ total, ebooks });
  } catch (err) {
    res
      .status(500)
      .send({ message: "Error fetching ebooks", error: err.message });
  }
});

app.get("/api/ebooks/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const ebook = await ebooksCollection.findOne(query);
    if (!ebook) {
      return res.status(404).send({ message: "Ebook not found" });
    }
    res.send(ebook);
  } catch (err) {
    res.status(500).send({ message: "Invalid ID parameters" });
  }
});

app.post("/api/ebooks", verifyToken, verifyWriter, async (req, res) => {
  const user = req.user;

  if (!user.verifiedWriter && user.role !== "admin") {
    return res.status(403).send({
      message:
        "Access Restricted. Complete your one-time verification fee to unlock publishing capabilities.",
    });
  }

  const ebookData = req.body;
  const newEbook = {
    ...ebookData,
    price: parseFloat(ebookData.price),
    writerId: user._id.toString(),
    writerName: user.name,
    status: "Available",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    const result = await ebooksCollection.insertOne(newEbook);
    res.status(201).send(result);
  } catch (err) {
    res.status(500).send({ message: "Could not create ebook entry" });
  }
});

app.patch("/api/ebooks/:id", verifyToken, verifyWriter, async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = req.body;
    const query = { _id: new ObjectId(id) };

    const ebook = await ebooksCollection.findOne(query);
    if (!ebook) {
      return res.status(404).send({ message: "Ebook not found" });
    }

    if (
      ebook.writerId !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).send({ message: "Unauthorized modification" });
    }

    const updatedDoc = {
      $set: {
        title: updateData.title || ebook.title,
        description: updateData.description || ebook.description,
        price: updateData.price ? parseFloat(updateData.price) : ebook.price,
        genre: updateData.genre || ebook.genre,
        status: updateData.status || ebook.status,
        coverImage: updateData.coverImage || ebook.coverImage,
        updatedAt: new Date(),
      },
    };

    const result = await ebooksCollection.updateOne(query, updatedDoc);
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Modification error" });
  }
});

app.delete("/api/ebooks/:id", verifyToken, verifyWriter, async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };

    const ebook = await ebooksCollection.findOne(query);
    if (!ebook) {
      return res.status(404).send({ message: "Ebook not found" });
    }

    if (
      ebook.writerId !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).send({ message: "Unauthorized modification" });
    }

    const result = await ebooksCollection.deleteOne(query);
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Deletion error" });
  }
});

app.listen(port, () => {
  console.log(`Fable Server listening on port ${port}`);
});

module.exports = app;
