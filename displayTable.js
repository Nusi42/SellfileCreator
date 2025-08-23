"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
// Function to read and parse the JSON file
function readFileAndDisplayTable(filePath) {
    try {
        var data = fs.readFileSync(filePath, 'utf8');
        var jsonData = JSON.parse(data.replace(/^\uFEFF/, '')); // Remove BOM if present
        if (jsonData === null || jsonData === void 0 ? void 0 : jsonData.Rules) {
            console.table(jsonData.Rules);
        }
        else {
            console.error("Unexpected file structure. 'Rules' key not found.");
        }
    }
    catch (error) {
        console.error("Error reading or parsing the file:", error);
    }
}
// Provide the file path
var filePath = './Sell File Rolled and Unrolled Gear 21 Aug 2024 v2 (2).hsf';
// Call the function
readFileAndDisplayTable(filePath);
