const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { ObjectId } = require('mongodb');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Multer
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// Cloudinary Config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// MongoDB
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
    }
});

let collectionPosts;

async function run() {
    try {
        await client.connect();
        const db = client.db('contra-server');
        collectionPosts = db.collection('posts');
        console.log("MongoDB Connected!");
    } catch (error) {
        console.error("MongoDB Error:", error);
    }
}
run().catch(console.dir);

// ==================== POST CREATE ROUTE ====================
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        // ১. ইমেজ আছে কিনা চেক করো
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No image uploaded"
            });
        }

        // ২. ফর্ম থেকে তথ্য নাও
        const { text, userName, userId, userEmail } = req.body;

        // ৩. ইউজার আইডি ও ইমেইল আছে কিনা চেক করো
        if (!userId || !userEmail) {
            return res.status(400).json({
                success: false,
                message: "User information is required"
            });
        }

        // ৪. ইমেজকে base64 এ কনভার্ট করো (Cloudinary এর জন্য)
        const base64Image = req.file.buffer.toString('base64');
        const dataUri = `data:${req.file.mimetype};base64,${base64Image}`;

        // ৫. Cloudinary তে আপলোড করো
        const uploadResult = await cloudinary.uploader.upload(dataUri, {
            folder: "contra-posts",     // তোমার ফোল্ডারের নাম
            resource_type: "auto"
        });

        // ৬. MongoDB এ সেভ করার জন্য ডাটা তৈরি করো
        const newPost = {
            text: text || "",                    // টেক্সট না থাকলে খালি রাখবে
            imageUrl: uploadResult.secure_url,   // ছবির লিংক
            publicId: uploadResult.public_id,    // পরে ডিলিট করার জন্য
            userName: userName || "Anonymous",
            userId: userId,
            userEmail: userEmail,
            likes: 0,
            likedBy: [],                         // লাইক সিস্টেমের জন্য
            createdAt: new Date()
        };

        // ৭. MongoDB এ সেভ করো
        const savedPost = await collectionPosts.insertOne(newPost);

        // ৮. সাকসেস রেসপন্স পাঠাও
        res.status(201).json({
            success: true,
            message: "Post created successfully!",
            postId: savedPost.insertedId,
            imageUrl: uploadResult.secure_url
        });

    } catch (error) {
        console.error("Upload Error:", error);   // ডেভেলপমেন্টে দেখার জন্য
        res.status(500).json({
            success: false,
            message: "Something went wrong while creating post"
        });
    }
});

// Like / Unlike Route
app.post('/api/posts/:postId/like', async (req, res) => {
    try {
        const { postId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, message: "User ID is required" });
        }

        const post = await collectionPosts.findOne({ _id: new ObjectId(postId) });

        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }

        const hasLiked = post.likedBy?.includes(userId) || false;

        if (hasLiked) {
            // Unlike
            await collectionPosts.updateOne(
                { _id: new ObjectId(postId) },
                {
                    $pull: { likedBy: userId },
                    $inc: { likes: -1 }
                }
            );
        } else {
            // Like
            await collectionPosts.updateOne(
                { _id: new ObjectId(postId) },
                {
                    $addToSet: { likedBy: userId },
                    $inc: { likes: 1 }
                }
            );
        }

        res.json({
            success: true,
            liked: !hasLiked
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/', (req, res) => res.send('Server Running with Like System'));

app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
});