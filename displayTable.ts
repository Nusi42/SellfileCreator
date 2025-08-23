import * as fs from 'fs';

// Define the structure of the data (adjust based on your JSON structure)
interface Rule {
    Keep: boolean;
    Use: boolean;
    ArtifactSet: number[];
    ArtifactType: number[];
    Rank: number;
    Rarity: number;
    MainStatID: number;
    MainStatF: number;
    LVLForCheck: number;
    Substats: Substat[];
}

interface Substat {
    ID: number;
    Value: number;
    IsFlat: boolean;
    Condition: string;
    NotAvailable: boolean;
}

// Function to read and parse the JSON file
function readFileAndDisplayTable(filePath: string): void {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(data.replace(/^\uFEFF/, '')); // Remove BOM if present

        if (jsonData?.Rules) {
            console.table(jsonData.Rules);
        } else {
            console.error("Unexpected file structure. 'Rules' key not found.");
        }
    } catch (error) {
        console.error("Error reading or parsing the file:", error);
    }
}

// Provide the file path
const filePath = './Sell File Rolled and Unrolled Gear 21 Aug 2024 v2 (2).hsf';

// Call the function
readFileAndDisplayTable(filePath);
