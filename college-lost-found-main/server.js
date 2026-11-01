const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const Item = require("./model/Item");

const app = express();

// ===============================
// MIDDLEWARE
// ===============================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// UPLOADS FOLDER
// ===============================
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log("Uploads folder created:", uploadDir);
}

// IMPORTANT:
// /uploads is NOT publicly accessible.

// ===============================
// MULTER CONFIGURATION
// ===============================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {
        const extension = path.extname(file.originalname).toLowerCase();

        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1E9) +
            extension;

        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {
        if (file.mimetype && file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed!"));
        }
    }
});

// ===============================
// FRONTEND ROUTES
// ===============================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "portal.html"));
});

app.get("/lost", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "LostItems.HTML"));
});

app.get("/found", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "FoundItems.HTML"));
});

// ===============================
// TEST API
// ===============================

app.get("/api/test", (req, res) => {
    res.json({
        message: "API route is working!",
        server: "online"
    });
});

// =====================================================
// MATCHING SYSTEM
// =====================================================

function cleanText(text) {
    if (!text) return "";

    return String(text)
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function textSimilarity(text1, text2) {
    const a = cleanText(text1)
        .split(" ")
        .filter(Boolean);

    const b = cleanText(text2)
        .split(" ")
        .filter(Boolean);

    if (a.length === 0 || b.length === 0) {
        return 0;
    }

    const setA = new Set(a);
    const setB = new Set(b);

    let commonWords = 0;

    for (const word of setA) {
        if (setB.has(word)) {
            commonWords++;
        }
    }

    const smallerLength = Math.min(
        setA.size,
        setB.size
    );

    if (smallerLength === 0) {
        return 0;
    }

    return commonWords / smallerLength;
}

function calculateMatchScore(lostItem, foundItem) {

    let score = 0;

    // -------------------------------
    // ITEM NAME - 25 POINTS
    // -------------------------------

    const nameSimilarity = textSimilarity(
        lostItem.itemName,
        foundItem.itemName
    );

    if (nameSimilarity >= 0.8) {
        score += 25;
    } else if (nameSimilarity >= 0.5) {
        score += 18;
    } else if (nameSimilarity >= 0.3) {
        score += 10;
    }

    // -------------------------------
    // DESCRIPTION - 30 POINTS
    // -------------------------------

    const descriptionSimilarity = textSimilarity(
        lostItem.description,
        foundItem.description
    );

    if (descriptionSimilarity >= 0.8) {
        score += 30;
    } else if (descriptionSimilarity >= 0.5) {
        score += 22;
    } else if (descriptionSimilarity >= 0.3) {
        score += 12;
    }

    // -------------------------------
    // LOCATION - 20 POINTS
    // -------------------------------

    const locationSimilarity = textSimilarity(
        lostItem.location,
        foundItem.location
    );

    if (locationSimilarity >= 0.8) {
        score += 20;
    } else if (locationSimilarity >= 0.5) {
        score += 14;
    } else if (locationSimilarity >= 0.3) {
        score += 8;
    }

    // -------------------------------
    // DATE - 15 POINTS
    // -------------------------------

    if (lostItem.date && foundItem.date) {

        const lostDate = new Date(lostItem.date);
        const foundDate = new Date(foundItem.date);

        if (!isNaN(lostDate) && !isNaN(foundDate)) {

            const difference = Math.abs(
                lostDate.getTime() -
                foundDate.getTime()
            );

            const days =
                difference /
                (1000 * 60 * 60 * 24);

            if (days <= 1) {
                score += 15;
            } else if (days <= 3) {
                score += 12;
            } else if (days <= 7) {
                score += 7;
            }
        }
    }

    // -------------------------------
    // CONTACT - 10 POINTS
    // -------------------------------

    const contactSimilarity = textSimilarity(
        lostItem.contact,
        foundItem.contact
    );

    if (contactSimilarity > 0) {
        score += 10;
    }

    return score;
}

// =====================================================
// FIND MATCH
// =====================================================

async function findMatch(newItem) {

    try {

        const oppositeType =
            newItem.type === "lost"
                ? "found"
                : "lost";

        const possibleItems = await Item.find({
            type: oppositeType,

            matchStatus: {
                $ne: "matched"
            }
        });

        let bestMatch = null;
        let highestScore = 0;

        for (const possibleItem of possibleItems) {

            const lostItem =
                newItem.type === "lost"
                    ? newItem
                    : possibleItem;

            const foundItem =
                newItem.type === "found"
                    ? newItem
                    : possibleItem;

            const score =
                calculateMatchScore(
                    lostItem,
                    foundItem
                );

            console.log(
                `Checking ${newItem._id} against ${possibleItem._id}: ${score}%`
            );

            if (score > highestScore) {

                highestScore = score;
                bestMatch = possibleItem;
            }
        }

        // MATCH THRESHOLD = 70%
        if (
            bestMatch &&
            highestScore >= 70
        ) {

            console.log("================================");
            console.log("MATCH FOUND!");
            console.log("New item:", newItem._id);
            console.log("Matched item:", bestMatch._id);
            console.log("Score:", highestScore);
            console.log("================================");

            newItem.matchStatus = "matched";
            newItem.matchScore = highestScore;
            newItem.matchedItem = bestMatch._id;

            await newItem.save();

            bestMatch.matchStatus = "matched";
            bestMatch.matchScore = highestScore;
            bestMatch.matchedItem = newItem._id;

            await bestMatch.save();

            return {
                matched: true,
                score: highestScore,
                matchedItem: bestMatch
            };
        }

        // No strong match
        newItem.matchStatus = "waiting";
        newItem.matchScore = highestScore || 0;

        await newItem.save();

        return {
            matched: false,
            score: highestScore || 0
        };

    } catch (error) {

        console.error(
            "MATCHING ERROR:",
            error
        );

        return {
            matched: false,
            score: 0,
            error: error.message
        };
    }
}

// =====================================================
// SUBMIT ITEM
// =====================================================

app.post(
    "/api/items",
    upload.single("photo"),
    async (req, res) => {

        try {

            console.log("--------------------------------");
            console.log("NEW ITEM SUBMISSION");
            console.log("BODY:", req.body);
            console.log("FILE:", req.file);

            // -------------------------------
            // VALIDATE TYPE
            // -------------------------------

            if (!req.body.type) {

                return res.status(400).json({
                    error: "Item type is required."
                });
            }

            if (
                req.body.type !== "lost" &&
                req.body.type !== "found"
            ) {

                return res.status(400).json({
                    error:
                        "Type must be lost or found."
                });
            }

            // -------------------------------
            // FOUND MUST HAVE PHOTO
            // -------------------------------

            if (
                req.body.type === "found" &&
                !req.file
            ) {

                return res.status(400).json({
                    error:
                        "Photo is required for found items."
                });
            }

            // -------------------------------
            // SAVE PHOTO FILENAME
            // -------------------------------

            let photoFilename = "";

            if (req.file) {

                photoFilename =
                    req.file.filename;

                console.log(
                    "IMAGE SAVED:",
                    req.file.filename
                );
            }

            // -------------------------------
            // CREATE ITEM
            // -------------------------------

            const item = new Item({

                type: req.body.type,

                itemName:
                    req.body.itemName,

                description:
                    req.body.description,

                location:
                    req.body.location,

                date:
                    req.body.date,

                contact:
                    req.body.contact,

                photo:
                    photoFilename,

                matchStatus:
                    "waiting",

                matchScore:
                    0,

                matchedItem:
                    null
            });

            const savedItem =
                await item.save();

            // -------------------------------
            // FIND MATCH
            // -------------------------------

            const matchResult =
                await findMatch(savedItem);

            // Get updated item
            const updatedItem =
                await Item.findById(
                    savedItem._id
                );

            // -------------------------------
            // RESPONSE
            // -------------------------------

            res.status(201).json({

                message:
                    matchResult.matched
                        ? "Item submitted and a possible match was found."
                        : "Item submitted. Waiting for a matching item.",

                matched:
                    matchResult.matched,

                matchScore:
                    matchResult.score,

                item:
                    updatedItem
            });

        } catch (error) {

            console.error(
                "POST /api/items ERROR:"
            );

            console.error(error);

            // Delete uploaded image if database save fails
            if (req.file) {

                const filePath =
                    path.join(
                        uploadDir,
                        req.file.filename
                    );

                if (
                    fs.existsSync(filePath)
                ) {

                    try {

                        fs.unlinkSync(
                            filePath
                        );

                    } catch (deleteError) {

                        console.error(
                            "Could not delete unused image:",
                            deleteError
                        );
                    }
                }
            }

            res.status(400).json({
                error: error.message
            });
        }
    }
);

// =====================================================
// GET ALL ITEMS
// =====================================================

app.get(
    "/api/items",
    async (req, res) => {

        try {

            const items =
                await Item.find()
                    .sort({
                        createdAt: -1
                    });

            res.json(items);

        } catch (error) {

            console.error(
                "GET /api/items ERROR:",
                error
            );

            res.status(500).json({
                error: error.message
            });
        }
    }
);

// =====================================================
// GET SINGLE ITEM
// =====================================================

app.get(
    "/api/items/:id",
    async (req, res) => {

        try {

            const item =
                await Item.findById(
                    req.params.id
                );

            if (!item) {

                return res.status(404).json({
                    error: "Item not found."
                });
            }

            res.json(item);

        } catch (error) {

            console.error(
                "GET SINGLE ITEM ERROR:",
                error
            );

            res.status(500).json({
                error: error.message
            });
        }
    }
);

// =====================================================
// PRIVATE IMAGE ROUTE
// =====================================================

app.get(
    "/api/items/:id/image",
    async (req, res) => {

        try {

            const item =
                await Item.findById(
                    req.params.id
                );

            if (!item) {

                return res.status(404).json({
                    error: "Item not found."
                });
            }

            if (!item.photo) {

                return res.status(404).json({
                    error:
                        "This item has no image."
                });
            }

            // Prevent path traversal
            const filename =
                path.basename(item.photo);

            const imagePath =
                path.join(
                    uploadDir,
                    filename
                );

            if (
                !fs.existsSync(imagePath)
            ) {

                console.error(
                    "IMAGE NOT FOUND:",
                    imagePath
                );

                return res.status(404).json({
                    error:
                        "Image file does not exist on server."
                });
            }

            res.sendFile(imagePath);

        } catch (error) {

            console.error(
                "PRIVATE IMAGE ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Unable to load image."
            });
        }
    }
);

// =====================================================
// TEMPORARY DELETE ALL TEST ITEMS
// =====================================================
// USE THIS ONLY ON LOCALHOST.
// DELETE THIS ROUTE AFTER CLEANING THE DATABASE.

app.delete(
    "/api/items/delete-all",
    async (req, res) => {

        try {

            console.log(
                "DELETE ALL ITEMS REQUESTED"
            );

            const items =
                await Item.find();

            // Delete uploaded images
            for (const item of items) {

                if (item.photo) {

                    const filename =
                        path.basename(
                            item.photo
                        );

                    const filePath =
                        path.join(
                            uploadDir,
                            filename
                        );

                    if (
                        fs.existsSync(
                            filePath
                        )
                    ) {

                        try {

                            fs.unlinkSync(
                                filePath
                            );

                            console.log(
                                "Deleted image:",
                                filename
                            );

                        } catch (error) {

                            console.error(
                                "Could not delete image:",
                                filename
                            );
                        }
                    }
                }
            }

            // Delete database records
            const result =
                await Item.deleteMany({});

            console.log(
                "Deleted items:",
                result.deletedCount
            );

            res.json({

                message:
                    "All items and uploaded images deleted successfully.",

                deletedItems:
                    result.deletedCount
            });

        } catch (error) {

            console.error(
                "DELETE ALL ERROR:",
                error
            );

            res.status(500).json({
                error: error.message
            });
        }
    }
);

// =====================================================
// MONGODB CONNECTION
// =====================================================

console.log(
    "MONGO_URI exists:",
    !!process.env.MONGO_URI
);

if (!process.env.MONGO_URI) {

    console.error(
        "ERROR: MONGO_URI is not defined."
    );

} else {

    mongoose
        .connect(process.env.MONGO_URI)

        .then(() => {

            console.log(
                "MongoDB connected successfully!"
            );

        })

        .catch(error => {

            console.error(
                "MongoDB connection failed:"
            );

            console.error(
                error.message
            );
        });
}

// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
    (err, req, res, next) => {

        console.error(
            "SERVER ERROR:"
        );

        console.error(err);

        res.status(500).json({

            error:
                err.message ||
                "Internal server error."
        });
    }
);

// =====================================================
// START SERVER
// =====================================================

const PORT =
    process.env.PORT || 5001;

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "================================"
        );

        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            `Private uploads folder: ${uploadDir}`
        );

        console.log(
            "Public /uploads route: DISABLED"
        );

        console.log(
            "Matching system: ENABLED"
        );

        console.log(
            "Match threshold: 70%"
        );

        console.log(
            "================================"
        );
    }
);