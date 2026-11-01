const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["lost", "found"],
            required: true
        },

        itemName: {
            type: String,
            required: true
        },

        description: {
            type: String,
            required: true
        },

        location: {
            type: String,
            required: true
        },

        date: {
            type: Date,
            required: true
        },

        photo: {
            type: String,
            required: function () {
                return this.type === "found";
            },
            default: ""
        },

        contact: {
            type: String,
            required: true
        },

        // =========================
        // MATCHING SYSTEM
        // =========================

        matchStatus: {
            type: String,
            enum: ["waiting", "matched"],
            default: "waiting"
        },

        matchScore: {
            type: Number,
            default: 0
        },

        matchedItem: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Item",
            default: null
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Item", itemSchema);